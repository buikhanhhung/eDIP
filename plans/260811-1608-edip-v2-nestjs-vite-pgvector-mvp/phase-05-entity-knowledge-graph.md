---
phase: 5
title: "Entity & Knowledge Graph"
status: pending
priority: P1
dependencies: [2]
effort: "1.25h"
---

# Phase 5: Entity & Knowledge Graph

> **Sửa sau red-team.** Phase này giờ **chỉ phụ thuộc phase 2**, không phải 3 — entity đã được seed từ `$V1/data/documents.json` ở phase 2, nên graph có dữ liệu ngay. Bỏ `backfill-entities.ts`. Bỏ `getEntityNeighbourhood`. Thêm `DISTINCT`. Ước tính 1.5h → 1.25h.

## Overview

Dựng API graph sau `GraphStorePort` và vẽ bằng cytoscape. Entity đã có sẵn trong DB từ phase 2 (59 entity, 33 sau chuẩn hoá, 12 được chia sẻ bởi ≥2 tài liệu, `ecloudvalley vietnam` có mặt ở cả 9).

Vì phase này không còn phụ thuộc phase 3/4, nó có thể chạy **ngay sau phase 2** nếu Bedrock gặp trục trặc. Đó là van xả quan trọng nhất trong plan.

## Requirements

- Functional: `GET /graph?minShared=2` trả `{ nodes, edges }` dùng trực tiếp cho cytoscape, **không cạnh trùng**.
- Functional: click node document → detail; click node entity → danh sách document liên quan.
- Functional: `@RequirePermission('view')` — không phải route công khai.
- Non-functional: mọi truy cập graph qua `GraphStorePort`, không SQL trong controller/FE.

## Architecture

```
features/graph/
  graph.di-token.ts            GRAPH_STORE
  graph.port.ts                interface IGraphStore
  graph.module.ts              { provide: GRAPH_STORE, useClass: PostgresGraphStore }
  infras/postgres-graph.store.ts
  graph.controller.ts
```

```ts
export interface IGraphStore {
  upsertDocumentEntities(documentId: string, entities: ExtractedEntity[]): Promise<void>;
  getGraph(opts: { minShared: number }): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
  deleteByDocument(documentId: string): Promise<void>;
}
```

`getEntityNeighbourhood` **đã bỏ**. Bản đầu mô tả nó là port của tính năng "Focus its neighbourhood" ở v1 — kiểm lại thì v1 focus theo **document** (`focusDocumentId`, nút truyền documentId), không theo entity. Không có bản tham chiếu nào để port. Và không cần: `getGraph` trả danh sách cạnh hai phía đã chứa đủ mọi document chia sẻ entity, nên "neighbourhood" là bộ lọc **5 dòng ở client** trên dữ liệu đã nằm sẵn trong trang. Bỏ một endpoint, một query, một vòng round-trip.

Ngày 2: thêm `infras/falkor-graph.store.ts` implement cùng interface, đổi 1 dòng trong `graph.module.ts`.

## Related Code Files

- Create: `$ROOT/nestjs-backend/src/features/graph/**`
- Create: `$ROOT/frontend/src/pages/graph.tsx`
- Create: `$ROOT/frontend/src/components/graph/{graph-canvas.tsx,node-drawer.tsx}`
- Reuse từ phase 2: `src/common/rbac/`, `entity-normalizer.ts` (đã viết ở seed)
- Modify: `$ROOT/nestjs-backend/src/features/ingestion/ingest.consumer.ts` (thêm step graph cho document upload mới)
- Copy từ `$ECVBOT_FE`: cách khởi tạo `react-cytoscapejs` + `cytoscape`
- Tham khảo `$V1/src/lib/graph/build-graph.ts` — **đọc để hiểu ý tưởng, không port trực tiếp**

### Không port được (đã kiểm)

12 test graph của v1 (203 LOC) dựng trên fixture `DocumentRecord` với `doc.analysis.entities`; v2 nhận row join từ `GROUP BY ... HAVING`. Output của v1 cũng là hình dạng xyflow, không phải `{data:{...}}` của cytoscape. Viết test mới nếu có thời gian, đừng cố chuyển.

## Implementation Steps

### 1. `normalizeEntityName` — đã viết ở phase 2 (~0 phút)

```ts
export function normalizeEntityName(raw: string): string {
  return raw
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\b(ltd|jsc|co|corp|inc|company|cong ty|tnhh|cp)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

Kết quả đã đo trên corpus thật: 59 entity → **33 sau chuẩn hoá**, 12 được ≥2 document chia sẻ. Các `kind` xuất hiện: `company`, `person`, `project`, `date`, `amount`, **`department`**.

Khoá unique là `@@unique([type, normalizedName])` (phase 2), không phải unique trên riêng `normalizedName` — nếu không, entity gặp lần đầu chiếm `type` vĩnh viễn vì `upsert` dùng `update: {}`.

### 2. `PostgresGraphStore` (~30 phút)

**upsert** — như bản đầu, dùng khoá composite mới.

**getGraph(minShared)** — `DISTINCT` là bắt buộc:

```sql
WITH shared AS (
  SELECT "entityId", count(DISTINCT "documentId") AS doc_count
  FROM "DocumentEntity" GROUP BY "entityId"
  HAVING count(DISTINCT "documentId") >= $1
)
SELECT DISTINCT           -- ← không có nó là trắng màn hình /graph
  de."documentId", de."entityId", e."displayName", e.type, s.doc_count
FROM "DocumentEntity" de
JOIN shared s ON s."entityId" = de."entityId"
JOIN "Entity" e ON e.id = de."entityId"
JOIN "Document" d ON d.id = de."documentId"
WHERE d.status = 'completed';
```

Lý do cụ thể: khoá chính của `DocumentEntity` là `[documentId, entityId, mentionText]`, cho phép **nhiều row cho cùng cặp document–entity**. Chính ví dụ dedup trong plan (`Ecloudvalley Vietnam Ltd` và `ECLOUDVALLEY VIETNAM` cùng một tài liệu) tạo 2 row → 2 cạnh cùng id → cytoscape ném `Can not create second element with ID`, **trắng màn hình `/graph` đúng bước 4 của demo**.

Lọc `d.status='completed'` để document `failed` của seed không thành node.

Format trả về đúng cytoscape để FE không phải map:
```json
{ "nodes": [{ "data": { "id": "...", "label": "...", "kind": "document|entity", "type": "..." } }],
  "edges": [{ "data": { "id": "d1__e7", "source": "d1", "target": "e7" } }] }
```

Mặc định `minShared=2` cho **UI**. Ghi cho đúng: API của v1 mặc định `minDocuments=1`, con số 2 là mặc định phía giao diện — v1 tách hai cái này có chủ đích. Đừng viết "giữ nguyên mặc định của v1" ở tầng API.

Lọc loại mặc định: chỉ `company`, `person`, `project`, `contract`, `invoice`, `department`. `date` và `amount` là metadata, không phải node đáng nối.

### 3. Nối vào pipeline (~10 phút)

`ingest.consumer.ts` step cuối: `graphStore.upsertDocumentEntities(documentId, analysis.entities)` — chỉ cho tài liệu **upload mới**. 9 document seed đã có entity từ phase 2.

Không còn `backfill-entities.ts`.

### 4. FE graph (~35 phút)

`react-cytoscapejs`, layout `cose`:

```ts
const stylesheet = [
  { selector: 'node[kind="document"]', style: { shape: 'round-rectangle', 'background-color': '#2563eb', label: 'data(label)' } },
  { selector: 'node[kind="entity"]',   style: { shape: 'ellipse',          'background-color': '#f59e0b', label: 'data(label)' } },
  { selector: 'edge', style: { width: 1, 'line-color': '#cbd5e1', 'curve-style': 'bezier' } },
];
```

- Slider `minShared` (1–4), mặc định 2 → gọi lại API
- Filter theo entity type — lọc ở client
- Click node → drawer: document thì title/type/summary + nút mở detail; entity thì danh sách document liên quan
- "Focus neighbourhood": lọc client-side trên dữ liệu đã có, không gọi API

Tham chiếu cho phần khởi tạo: `$ECVBOT_FE` có một tab cytoscape 445 dòng, kèm workaround dọn WebGL lúc unmount. Đọc chỗ đó trước khi tự viết vòng đời component — 35 phút chỉ đủ nếu không vấp lại đúng cái bug ấy.

Không thêm plugin layout (`cytoscape-fcose`...). ~45 node, `cose` đủ.

## Success Criteria

**Phase này đạt đủ, không cần credential** — đúng như thiết kế van xả.

- [x] Ngay sau `db seed`: `count(*) FROM "Entity"` = **33** (≥30)
- [x] `Ecloudvalley Vietnam Ltd` gộp đúng — xuất hiện trên graph với `documentCount = 9`, tức cả 9 tài liệu
- [x] Entity `department` tồn tại trong DB (6 row)
- [x] `GET /graph?minShared=2` → 9 document node, 12 entity node, 38 cạnh
- [x] **Không cạnh nào trùng `data.id`** — `new Set(ids).size === ids.length` đúng ở cả minShared 1/2/3
- [x] `/graph` render thật trong trình duyệt: 3 canvas, 21 nút · 38 liên kết, không lỗi `Can not create second element with ID`
- [x] `minShared=1` (18 entity) > `minShared=2` (12) > `minShared=3` (8)
- [x] Document `failed` không xuất hiện trên graph
- [x] `GET /graph` không token → **403**
- [x] Không SQL nào ngoài `infras/postgres-graph.store.ts`
- [x] Xoá 1 document → link của nó biến mất (kiểm: `DELETE /documents/:id` → 0 row `DocumentEntity` còn lại, file trên đĩa cũng bị xoá)
- [ ] Click node entity → drawer liệt kê đúng document — *code xong, chưa click thử trong trình duyệt*

## Bổ sung 11/08 — quan hệ có kiểu theo cơ chế ECVBot

**Quyết định của người dùng:** làm knowledge graph theo cách ECVBot, sau khi đối chiếu hai cơ chế.

Bổ sung này **không thay** graph đồng xuất hiện; nó là lớp thêm. Cạnh document↔entity giữ nguyên nên highlight, seed và phần demo chạy được khi chưa có credential đều không bị đụng.

### Đường ghi mới

```
mỗi chunk:
  1. NER          → 1 lời gọi tool-use → [{name, type, description, confidence}]
  2. Verify+rels  → 1 lời gọi nữa, cầm output bước 1 → sửa/bỏ/thêm entity,
                    rồi nêu quan hệ kèm CÂU VĂN làm bằng chứng
  3. Dedup 3 tầng → khớp khoá chính xác → láng giềng vector cùng type
                    vượt ngưỡng → tạo mới
  4. Ghi          → Entity (+description, +aliases, +name_embedding),
                    EntityRelation (+evidence, +evidenceStart/End)
```

Chi phí: **2 lời gọi LLM mỗi chunk**, cộng một lượt embedding tên. Tính trên chi phí biên, và trả lại mỗi lần chạy lại extraction.

### Khác ECVBot ở ba chỗ, có lý do

| Điểm | ECVBot | Ở đây | Lý do |
|---|---|---|---|
| Offset | hỏi model trả `start`/`end` | **không hỏi**, đo bằng `indexOf` | Số học offset trên tiếng Việt nhiều byte là chỗ model yếu nhất, và offset sai thì bôi đậm nhầm câu mà trông vẫn hợp lý. Đây là luật đã có sẵn của codebase này |
| Ngưỡng similarity | rescale `(2-d)/2` | cosine thật `1-d` | Để con số ngưỡng trong `entity-dedup.ts` đúng nghĩa là cosine, không phải một thang đã bị nén |
| Đổi tên khi gộp | — | **không đổi** `displayName` | Gộp không được đổi tên node dưới chân người đang dùng nó; tên mới vào `aliases` để thấy được cái gì đã bị hút vào, và tách ra được nếu gộp sai |

### Đã kiểm (chưa cần credential)

- [x] `migrate deploy` sạch; `EntityRelation` có unique `(documentId, source, target, type)` → chạy lại extraction thay chứ không nhân đôi cạnh
- [x] `Entity` có thêm `description`, `aliases`, `name_embedding vector(1024)`
- [x] `GET /graph?relations=true` → 200, payload phân biệt `kind: mentions | relates`, id cạnh vẫn duy nhất
- [x] `GET /graph/entities/:id/relations` → 200, trả `[]` khi chưa có quan hệ nào
- [x] Seed chạy lại đúng như cũ: 33 entity / 59 link / 55 offset — lớp mới không phá đường cũ
- [x] 79/79 test pass, gồm 8 case cho quyết định dedup (gộp cùng type, chặn tên ngắn, dưới ngưỡng, không láng giềng)
- [ ] Trích quan hệ thật từ tài liệu — **chặn: cần credential**. Chưa có một dòng `EntityRelation` nào được sinh ra bởi model
- [ ] Ngưỡng `DEFAULT_DEDUP_THRESHOLD = 0.92` — **đặt theo phỏng đoán, chưa hiệu chỉnh trên dữ liệu thật**. Phải đo lại khi có credential

## Deviation Log (11/08)

| Điểm | Kế hoạch | Thực tế | Lý do |
|---|---|---|---|
| Nối vào pipeline | `ingest.consumer` gọi `upsertDocumentEntities` | đã nối ở phase 3, nay đi qua `GRAPH_STORE` | Consumer từng gọi thẳng `entity-linker`. Cho nó đi qua port giữ đúng luật "không SQL ngoài store" và để adapter FalkorDB thay được |
| `react-cytoscapejs` | dùng | dùng `cytoscape` trực tiếp | Instance sở hữu canvas + vòng lặp animation nên phải `destroy()` lúc unmount. Làm thẳng trong một `useEffect` ít code hơn wrapper cộng workaround của nó |
| `deleteByDocument` | xoá hết | thêm tham số `types?` | Phase 6 sửa metadata cần dựng lại **chỉ** liên kết công ty; xoá sạch sẽ mất cả person/department mà người sửa không đụng tới |
| Chuẩn hoá tên | NFD + bỏ dấu | dùng chung `foldForMatching` | `đ` sống sót qua NFD → `Đông` và `dong` thành 2 node khác nhau. Xem phase 4 Deviation Log |

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| Cạnh trùng làm trắng màn hình | `DISTINCT` ở §2 + assert trong success criteria. Đây là lỗi đã suýt lọt |
| Chuẩn hoá gộp nhầm 2 công ty khác nhau | Chỉ bỏ hậu tố pháp nhân, không bỏ từ nội dung. Đã đo: 59 → 33, nhìn mắt bảng `Entity` sau seed |
| Graph rối lúc demo | `minShared=2` mặc định ở UI. Đừng mở về 1 cho "hoành tráng" |
| `react-cytoscapejs` + React 18 lỗi vòng đời | Đọc cách ECVBot xử lý cleanup WebGL trước khi tự viết |
| 35 phút không đủ cho FE | Cắt theo thứ tự: filter type → slider → chỉ giữ canvas + drawer. Canvas render được là đã đạt bước 4 demo |
