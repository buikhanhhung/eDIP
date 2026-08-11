---
phase: 4
title: "Hybrid Search & RAG Ask"
status: pending
priority: P1
dependencies: [3]
effort: "1.5h"
---

# Phase 4: Hybrid Search & RAG Ask

> **Sửa sau red-team.** Bốn thay đổi thiết kế: vector-store là code mới (~50 dòng) chứ không phải copy; RRF `k=5` và bỏ nhánh thứ ba; bỏ `ts_headline`; Ask có retrieval cấp chunk riêng. Lý do ở từng mục.

## Overview

Embed chunk vào pgvector, search 2 nhánh hợp nhất bằng RRF, Ask có citation thật.

Con số quyết định mọi thiết kế ở đây: corpus là **13.198 ký tự / 9 tài liệu ≈ 13 chunk**. Bản đầu giả định ~200 chunk và chọn tham số theo quy mô đó. Sai 15 lần, và ở quy mô thật thì các tham số ấy làm ranking *tệ đi* chứ không tốt lên.

## Requirements

- Functional: `POST /search { q }` → document xếp hạng, mỗi kết quả có `snippet` + `score`.
- Functional: query không dấu tìm được tài liệu có dấu.
- Functional: `POST /ask { q }` → `{ answer, citations: [{documentId, title, chunkId, snippet}] }`.
- Functional: không có nguồn hợp lệ → "không tìm thấy trong kho tài liệu", **không bịa**.
- Functional: chỉ tài liệu `status='completed'` được vào kết quả.
- Non-functional: một nhánh lỗi không làm sập cả endpoint.

## Architecture

```
POST /search
  ├─ A. vector  : embed(q) → pgvector <=> cosine, top 10   (chunk → gộp về document)
  └─ B. lexical : search_tsv @@ plainto_tsquery('simple', immutable_unaccent(q)), top 10
       RRF k=5 → top 10 document

POST /ask
  retrieve top-8 CHUNK (vector + lexical trên chunk content, RRF)
    → prompt Claude, cite [nonce-N]
    → lọc id không thuộc tập đưa vào → map về document
```

**Đã bỏ nhánh C (metadata ILIKE).** Hai lý do: `metadata::text ILIKE '%...%'` khớp cả **key** JSON, nên bất kỳ query nào chứa `date`/`amount`/`title`/`parties`/`keywords` sẽ khớp mọi row. Và `metadata::text` đã được gộp vào biểu thức `search_tsv` ở phase 2, nên nhánh B đã bao phủ. Bớt 1 query, bớt 1 danh sách RRF, bớt một nguồn dương tính giả — ít code hơn, không nhiều hơn.

**RRF `k=5`, không phải 60.** `k=60` là hằng số hiệu chỉnh cho quy mô TREC. Trên 13 chunk, nhánh A `top 10` trả về gần như toàn bộ corpus mọi truy vấn, và ở `k=60` khoảng cách rank 1 → rank 9 chỉ là 13% (0.01639 vs 0.01449) trong khi việc có mặt ở 2 danh sách nhân đôi điểm. Kết quả: fusion biến thành "khớp mấy nhánh" chứ không phải "khớp tốt tới đâu" — tài liệu đứng bét ở mọi nhánh vượt tài liệu đứng nhất ở một nhánh. Câu truy vấn demo `hợp đồng với Saigon Retail` là nạn nhân điển hình; v1 phải thêm hẳn `ENTITY_WEIGHT=2` + `COVERAGE_FLOOR` để xử lý đúng ca này, với comment ghi rõ: *"không có nó, 'hợp đồng với Saigon Retail' xếp mọi hợp đồng lên trên cái thực sự nhắc Saigon Retail"*. `k=5` khôi phục độ dốc.

## Related Code Files

- Create: `$ROOT/nestjs-backend/src/infrastructure/vector-store/{vector-store.service.ts,vector-store.port.ts,vector-store.types.ts,vector-store.module.ts,vector-store.di-token.ts}` — **viết mới**
- Create: `$ROOT/nestjs-backend/src/features/search/{search.module.ts,search.controller.ts,search.service.ts,rrf.ts,snippet.ts}`
- Create: `$ROOT/nestjs-backend/src/features/ask/{ask.module.ts,ask.controller.ts,ask.service.ts}`
- Create: `$ROOT/nestjs-backend/scripts/backfill-embeddings.ts`
- Modify: `$ROOT/nestjs-backend/src/features/ingestion/ingest.consumer.ts` (thêm step embed)
- Create: `$ROOT/frontend/src/pages/search.tsx`
- Tham khảo: `$ECVBOT_BE/src/infrastructure/vector-store/vector-store.service.ts` (hình dạng SQL), `$ECVBOT_BE/src/features/kb/services/kb-search-rrf-fusion.ts` (RRF có spec), `$V1/src/lib/search/retrieval.ts` (bài học ranking)

## Implementation Steps

### 1. Vector store — viết mới, đừng gọi là copy (~25 phút)

Bản đầu ghi "copy rồi sửa đúng 2 chỗ". Đối chiếu thật với `$ECVBOT_BE` cho ra **5 điểm gãy**, không nằm ở 2 chỗ đã nêu:

| # | Vấn đề |
|---|---|
| 1 | `insertBatch` không bao giờ truyền `id`; bảng gốc là `SERIAL` (phase 2 đã sửa DDL cho khớp) |
| 2 | `insertBatch` ghi `kb_unit_id`, `knowledge_base_id` — không có ở eDIP |
| 3 | `EmbeddingChunk` type có `kbUnitId`/`knowledgeBaseId` **bắt buộc** |
| 4 | `SearchResult.id` là `number`, còn regex citation của phase này cần chuỗi |
| 5 | `insertChunks` — đường ghi duy nhất — không hề nằm trong "2 chỗ" |

Cộng thêm: pipeline cần ghi chunk **trước** (embedding NULL) rồi mới fill vector, mà service gốc luôn serialise `c.embedding.join(',')` và không có hàm update.

Kết luận: nó là ~50 dòng code mới. Nhận đúng bản chất thì nhanh hơn là sửa dần một bản copy.

```ts
export interface IVectorStore {
  insertChunks(chunks: ChunkInput[]): Promise<void>;      // embedding có thể null
  updateEmbeddings(rows: { id: number; embedding: number[] }[]): Promise<void>;
  search(queryEmbedding: number[], topK: number): Promise<ChunkHit[]>;
  deleteByDocument(documentId: string): Promise<void>;
}
```

Query search — giữ hình dạng SQL của ECVBot (đã kiểm chứng, dùng positional bind, không có SQL injection), bỏ join multi-tenant, thêm lọc trạng thái:

```sql
SELECT ec.id, ec.document_id AS "documentId",
       COALESCE(ec.parent_content, ec.content) AS content,
       (2 - (ec.embedding <=> $1::vector)) / 2 AS similarity
FROM embedding_chunks ec
JOIN "Document" d ON d.id = ec.document_id
WHERE ec.embedding IS NOT NULL AND d.status = 'completed'
ORDER BY ec.embedding <=> $1::vector
LIMIT $2;
```

`d.status = 'completed'` là bắt buộc: phase 2 cố ý seed 1 document `failed`, và không lọc thì nó là kết quả hạng nhất.

Không có index `ivfflat` (phase 2 đã bỏ). Trên 13 vector, seq scan vừa nhanh hơn vừa **đúng** — `lists=100` chia 13 vector vào 100 danh sách, `probes=1` mặc định quét 1 danh sách, nên phần lớn truy vấn trả về tập rỗng hoặc ngẫu nhiên.

### 2. Embed: pipeline + backfill (~15 phút)

Trong `ingest.consumer.ts`, sau chunk:
```
insertChunks(embedding=null) → generateEmbeddings(texts,{inputType:'search_document'}) → updateEmbeddings()
```

`scripts/backfill-embeddings.ts` cho 9 document seed: đọc `textContent` → `deleteByDocument` → chunk → insert → embed → update. **`deleteByDocument` trước** làm script idempotent; chạy lại sau khi lỗi giữa chừng không nhân đôi chunk của phần đã xong.

Chỉ còn **một** script backfill. Bản đầu có hai và để ngỏ việc gộp; entity giờ đã nằm trong seed của phase 2, nên `backfill-entities.ts` không tồn tại nữa.

### 3. Search + RRF (~25 phút)

Hai nhánh chạy `Promise.allSettled` — **không phải `Promise.all`**. Nhánh vector gọi Bedrock; một lần throttle không được phép 500 cả endpoint trong khi nhánh Postgres vẫn trả lời được. Nhánh lỗi → log + coi như danh sách rỗng.

```ts
const K = 5;
export function rrf(lists: string[][]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists)
    list.forEach((id, i) => scores.set(id, (scores.get(id) ?? 0) + 1 / (K + i + 1)));
  return scores;
}
```

Nhánh lexical:
```sql
SELECT id, title, ts_rank(search_tsv, query) AS rank
FROM "Document", plainto_tsquery('simple', immutable_unaccent($1)) query
WHERE search_tsv @@ query AND status = 'completed'
ORDER BY rank DESC LIMIT 10;
```

Gộp hit cấp chunk (nhánh A) về document bằng điểm cao nhất, rồi RRF trên 2 danh sách documentId.

**Snippet: cắt trong TypeScript, bỏ `ts_headline`.** Bản đầu dùng `ts_headline('simple', "textContent", query, ...)`. Nó không chạy được, và kiểu hỏng rất kín: `search_tsv` dựng từ text **đã bỏ dấu** và query cũng bỏ dấu — khớp tốt. Nhưng `ts_headline` chạy trên `textContent` **còn nguyên dấu** và tự tokenise lại input của nó, nên token `hop`/`dong` không bao giờ khớp `hợp`/`đồng`. Kết quả: nó trả về `MinWords` từ đầu tài liệu, và **mọi kết quả tìm kiếm hiện cùng một câu mở đầu**. Phần risk của bản đầu chỉ dự đoán vấn đề styling ("snippet vẫn đúng đoạn") — đúng cái giả định bị phá.

10 dòng, không rủi ro Postgres:
```ts
// snippet.ts — bỏ dấu cả hai phía, tìm vị trí khớp đầu tiên,
// cắt ±120 ký tự quanh nó TRÊN CHUỖI GỐC còn dấu, trả kèm [start,end] để FE tự bôi đậm
```
Trả offset thay vì HTML. FE bôi đậm bằng cắt chuỗi + `<mark>`, **không** `dangerouslySetInnerHTML` — nội dung tài liệu là dữ liệu do người ngoài kiểm soát, và token JWT nằm ở nơi JS đọc được.

### 4. Ask / RAG (~25 phút)

Bản đầu ghi Ask "dùng chính pipeline search, cấp chunk". Không đúng: §3 gộp về cấp document và nhánh lexical query `FROM "Document"`. Không có nhánh lexical cấp chunk nào tồn tại — Ask sẽ là vector thuần. Định nghĩa riêng, rõ ràng:

```
retrieve cho Ask:
  A. vectorStore.search(embed(q), 8)
  B. SELECT id, content FROM embedding_chunks ec JOIN "Document" d ...
     WHERE to_tsvector('simple', immutable_unaccent(ec.content))
           @@ plainto_tsquery('simple', immutable_unaccent($1))
       AND d.status='completed' LIMIT 8
  → RRF k=5 → top 8 chunk
```

Prompt:
```
Bạn chỉ được trả lời dựa trên các đoạn trích dưới đây.
Mỗi đoạn có id. Khi dùng đoạn nào, chèn [id đó] ngay sau câu.
Nếu các đoạn không đủ, nói đúng câu:
"Không tìm thấy thông tin này trong kho tài liệu."
---
[a3f9-1] <nội dung>
[a3f9-2] <nội dung>
```

**Id citation phải mang nonce ngẫu nhiên mỗi request** (`a3f9` ở trên). Không có nonce, một tài liệu chứa sẵn chuỗi `[chunk_1]` sẽ giả mạo được citation trỏ tới một id **có thật** — bộ lọc "id phải thuộc tập đã đưa vào" sẽ cho qua, và cờ `unsourced` không bao giờ bật. Nonce khiến id không đoán trước được. Chi phí: một dòng.

Parse `/\[([a-z0-9]{4}-\d+)\]/g` → lọc theo tập đã đưa vào → map về document.

`citations` rỗng **và** answer không phải câu "không tìm thấy" → log warning, trả kèm `unsourced: true`, FE hiện cảnh báo.

Rate-limit `/ask` và `/search`: `@Throttle` — chúng gọi Bedrock, và quota là tài nguyên chung với cả pipeline.

### 5. FE `/search` (~20 phút)

Hai tab dùng chung ô nhập.
- **Search**: title + type badge + snippet (bôi đậm bằng offset) + score
- **Ask**: câu trả lời + khối citation bấm được → `/documents/:id`

Query gợi ý sẵn: `hợp đồng với Saigon Retail`, `hop dong` (không dấu), `document nào liên quan compliance`.

## Success Criteria

- [ ] `backfill-embeddings.ts` xong → `SELECT count(*) FROM embedding_chunks WHERE embedding IS NOT NULL` > 0
- [ ] Chạy backfill **hai lần** → số chunk không đổi
- [ ] `POST /search { q: 'hợp đồng' }` → trả document contract
- [ ] `POST /search { q: 'hop dong' }` → **cùng** document đó
- [ ] Hai truy vấn khác nhau cho ra **snippet khác nhau** (chứng minh không rơi về câu mở đầu)
- [ ] `hợp đồng với Saigon Retail` → tài liệu MSA Saigon Retail ở **rank 1**, không phải hợp đồng bất kỳ
- [ ] Document `failed` **không** xuất hiện trong bất kỳ kết quả search nào
- [ ] `POST /search` bằng token `viewer` → **403**
- [ ] `POST /ask { q: 'tóm tắt chính sách bảo mật' }` → answer + ≥1 citation trỏ document có thật
- [ ] `POST /ask { q: 'giá cổ phiếu Apple hôm nay' }` → "Không tìm thấy...", citations rỗng
- [ ] Upload tài liệu chứa chuỗi `[a3f9-1]` rồi hỏi → citation giả **không** lọt (nonce đổi mỗi request)
- [ ] Tắt mạng ra Bedrock → `/search` vẫn trả kết quả từ nhánh lexical, **không** 500

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| `immutable_unaccent` chưa tồn tại | Kiểm đầu phase: `SELECT immutable_unaccent('hợp đồng')` |
| Viết vector-store mới lâu hơn copy | ~50 dòng, hình dạng SQL đã có sẵn để nhìn. Sửa dần bản copy mới là đường dài |
| `k=5` vẫn chưa đúng cho corpus này | Đo bằng chính truy vấn demo. Không đạt → bỏ RRF, dùng điểm chuẩn hoá cộng trọng số như v1 |
| Cohere throttle khi backfill | `bedrock-embedding.service.ts` đã chia batch 96. Giữ nguyên |
| Ask trả rỗng dù có dữ liệu | Kiểm `embedding IS NOT NULL` trước; đây là lỗi backfill, không phải lỗi prompt |
