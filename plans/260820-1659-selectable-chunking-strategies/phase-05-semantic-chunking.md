---
phase: 5
title: "Semantic Chunking"
status: done
priority: P3
dependencies: [4]
effort: "2.5h"
---

# Phase 5: Semantic Chunking

## Overview

Chiến lược cuối, và là chiến lược duy nhất **tốn quota**: embed từng câu rồi cắt ở chỗ ý nghĩa nhảy — khi cosine similarity giữa hai câu liền kề tụt dưới ngưỡng.

Đặt cuối vì đắt nhất, rủi ro nhất, và là mục dễ bị cắt nếu hết thời gian. Bốn phase trước đã ra sản phẩm dùng được mà không cần phase này.

## Requirements

**Functional**
- Tách văn bản thành câu, embed từng câu, gộp câu liền kề thành chunk tới khi similarity tụt dưới ngưỡng
- Lỗi embedding (rate limit, mạng, provider) → **thoái lui `RECURSIVE_CHARACTER`**, ghi log warn, tài liệu vẫn `completed`
- Văn bản dưới ngưỡng số câu (đề xuất < 5) → thoái lui, không tốn quota cho tệp bé
- Ghi `TokenUsage` cho lượt embedding này để dashboard không báo thiếu chi phí

**Non-functional**
- Không bao giờ làm fail cả job nạp
- Tôn trọng `GEMINI_MIN_REQUEST_INTERVAL_MS` đã có — không tự gọi song song vượt nhịp

## Architecture

Đây là chiến lược duy nhất cần dependency, và là lý do `ChunkingStrategy` mang chữ ký `async` từ phase 1.

```
text → tách câu → embed[] → similarity(i, i+1) → cắt ở đáy cục bộ → chunks
```

`chunking.service.ts` inject `IEmbeddingService` qua `EMBEDDING_SERVICE` token (đúng cách `ask.service.ts` và `ingest.consumer.ts` đang làm). Chiến lược nhận service qua tham số chứ không tự import — giữ 3 chiến lược kia thuần.

**Chi phí thật, cần nói rõ trong nhãn UI:** một tài liệu 200 câu = 200 lần embed, so với 1 lần cho `RECURSIVE_CHARACTER`. Người dùng đang ở Gemini free tier và **đã từng gặp rate limit** (`GEMINI_MIN_REQUEST_INTERVAL_MS` tồn tại chính vì lý do đó). Nên embed theo **lô** qua `generateEmbeddings(sentences, 'search_document')` — nó nhận mảng, một lượt gọi cho nhiều câu — chứ không gọi từng câu một.

**Ngưỡng cắt:** đề xuất khởi điểm 0.75, hằng số trong file kèm comment nêu rõ đây là số chưa hiệu chỉnh trên corpus thật. Không đưa ra UI.

## Ràng buộc mới từ phase 2

`IMPLEMENTED_CHUNKING_STRATEGIES` được **tính lúc import** từ const `STRATEGIES` cấp module trong `chunking.service.ts`, và `chunking-strategy-input.ts` (nên cả controller) import nó để validate.

Khi `SEMANTIC` cần `IEmbeddingService` tiêm vào, entry của nó **không còn là giá trị cấp module được nữa**. Nghĩa là **danh sách id đã có implementation** và **map từ id sang implementation** có vòng đời khác nhau, và chỉ danh sách cần với tới được từ controller. Tách hai thứ đó ra, đừng để controller phải đi qua DI chỉ để biết một mảng string.

## Related Code Files

**Create**
- `nestjs-backend/src/infrastructure/chunking/semantic.strategy.ts`
- `nestjs-backend/src/infrastructure/chunking/semantic.strategy.spec.ts`

**Modify**
- `nestjs-backend/src/infrastructure/chunking/chunking.service.ts` — inject `EMBEDDING_SERVICE`, đăng ký khoá thứ 4
- `nestjs-backend/src/infrastructure/chunking/chunking.module.ts` — import `AiModule` để có embedding token
- `frontend/src/features/documents/document-types.ts` — entry thứ 4 (`SEMANTIC`)
- `frontend/src/features/upload/upload-page.tsx` — dòng cảnh báo chi phí dưới `Select`

## Implementation Steps

**Tests trước — mock embedding, không gọi provider thật**

1. Mock trả vector sao cho câu 1-3 giống nhau, câu 4-6 khác hẳn → đúng 2 chunk, cắt giữa câu 3 và 4
2. Mock **ném lỗi** → kết quả bằng `RECURSIVE_CHARACTER`, không ném ra ngoài
3. Văn bản 3 câu (< ngưỡng) → thoái lui, mock embedding **không được gọi** (assert số lần gọi = 0)
4. Mock trả về số vector **lệch** số câu → thoái lui thay vì crash
5. Assert `generateEmbeddings` được gọi **một lần với mảng**, không phải N lần
6. `pnpm test` → đỏ

**Rồi mới code**

7. Tách câu: theo `.`/`!`/`?` + khoảng trắng, có xử lý số thập phân (`1.850.000`) và viết tắt
8. `semantic.strategy.ts` nhận `(text, embeddings)` → chunk
9. `chunking.service.ts` inject token, truyền vào chiến lược
10. `chunking.module.ts` import `AiModule`
11. Frontend: entry 4 nhãn `SEMANTIC`, thêm dòng cảnh báo chi phí dưới `Select`
12. `pnpm test` + typecheck + frontend build
13. **Thử thật một lần** với Gemini: upload tệp ~200 câu, xem log có rate limit không, xem `TokenUsage` có ghi

## Success Criteria

- [x] Test mock pass — **35 test** (21 cho strategy + bộ tách câu, 14 cho module ngưỡng), gồm cả hai ca thoái lui và ca assert gọi theo lô
- [x] Mock lỗi → tài liệu vẫn đi tiếp, không ném ra ngoài; kết quả **bằng đúng** `splitText`
- [x] Tệp ngắn → **không tốn lượt embedding nào** (assert số lần gọi = 0)
- [x] Dropdown 4 lựa chọn với nhãn `SEMANTIC`; cảnh báo chi phí nằm riêng dưới `Select`
- [x] 185 test cũ + toàn bộ test mới pass → **294**, tsc/eslint sạch, frontend build sạch
- [x] Wiring DI kiểm bằng boot thật: `ChunkingModule` → `AiModule` → `EMBEDDING_SERVICE`, **0 quota**
- [x] `TokenUsage` có dòng cho lượt embedding — **đã có sẵn ở tầng provider, không viết code**
- [x] Chạy thật với Gemini — **hai lần**: một với ngưỡng hằng (15 chunk vụn), một với ngưỡng thích ứng
- [x] **Chạy thật với ngưỡng thích ứng: xong** — xem bảng bên dưới

## Đã triển khai — 21/08/2026

### Hai giả định của phase file đã được giải quyết ở tầng dưới

| Phase file nói | Thực tế |
|---|---|
| "Ghi `TokenUsage` cho lượt embedding này" | `gemini-embedding.service.ts:62` **đã** `meter.record({ purpose: 'embedding', inputChars })` **bên trong vòng lặp lô**, trước khi đọc vector. Viết thêm là đếm hai lần và còn sai theo từng lô. **Không viết dòng nào** |
| "embed theo lô — một lượt gọi cho nhiều câu" | Đúng, và hơn thế: hàm đó **tự chia lô 96** rồi gọi provider **tuần tự**. Nên 200 câu = 3 lượt gọi. Nó cũng tự throw khi số vector lệch, nên nhánh thoái lui của tôi là lớp phòng thứ hai |

### Ràng buộc DI đã ghi ở phase 2 tự tan

TypeScript cho phép hàm **ít tham số hơn** gán vào type **nhiều tham số hơn**. Nên chỉ cần mở rộng `ChunkingStrategy` thành `(text, embeddings?)`: ba strategy cũ khai một tham số, **không sửa một dòng**, registry vẫn là const cấp module. `ChunkingService` inject `EMBEDDING_SERVICE` và truyền xuống mọi strategy; chỉ `SEMANTIC` đọc. Thêm tham số constructor làm `new ChunkingService()` **lỗi biên dịch** ở 3 chỗ spec — ồn ào ở typecheck, đúng như review phase 1 dự đoán.

### Ngưỡng: hằng số bị thay bằng tìm kiếm thích ứng

Đây là **thay đổi lớn nhất so với phase file**, và nó đến từ đo đạc chứ không từ suy luận.

Phase file (dòng 42) chốt hằng `0.75`. Tôi làm đúng thế, chạy thật, rồi đo phân bố similarity **thật** của Gemini trên 16 câu hợp đồng tiếng Việt:

| | |
|---|---|
| min / median / max | **0.568 / 0.686 / 0.836** |
| Tại chỗ đổi chủ đề thật (thanh toán → bảo hành) | **0.587** |
| Số ranh giới bị cắt với ngưỡng 0.75 | **12 / 15** |

Hằng 0.75 cắt gần như mọi chỗ → 30 câu ra 15 chunk cỡ 64–128 ký tự, tức thoái hoá thành "cắt mỗi 2 câu". Và sâu hơn: chỗ đổi chủ đề thật (0.587) **cao hơn** một cặp cùng chủ đề (0.568), nên **không hằng số nào** tách được — chỉ hình dạng phân bố của từng tài liệu mới tách được. Đó chính là lý do ECVBot dùng `binarySearchThreshold` chứ không dùng hằng.

**Port nguyên xi cũng chưa chạy.** Luật của ECVBot loại thẳng ngưỡng nào sinh nhóm dưới sàn. Với câu ~64 ký tự và sàn 200, **mọi** ứng viên bị loại → search trả "không cắt" → tài liệu 5.120 ký tự thành **một** chunk.

**Và bản sửa đầu tiên của tôi cũng chưa chạy** — review bắt được: tôi thêm phép gộp nhóm ngắn vào nhóm liền kề, nhưng gộp **có sàn mà không có trần**, nên các nhóm ngắn dồn hết vào một nhóm không gì đóng lại. Đo được: 1000 câu → **1 chunk 64.000 ký tự**. Đúng lỗi tôi tưởng đã sửa, chỉ dịch chỗ.

Bản hiện tại: `groupSizes` là **một hàm duy nhất** cho cả phần chấm điểm và phần cắt thật, có **cả sàn và trần** — nhóm dưới sàn phải gộp tiếp, nhóm đủ sàn chỉ gộp khi còn chỗ trước `targetChars`.

| Câu | Ký tự | Chunk | Chunk lớn nhất |
|---|---|:-:|:-:|
| 10 | 640 | 1 | 640 (đúng: nhỏ hơn target) |
| 50 | 3.200 | 4 | 960 |
| 200 | 12.800 | 14 | 960 |
| 1.000 | 64.000 | **67** | **960** ← trước là 1 chunk 64.000 |

Và sau khi sửa trần, tìm kiếm **thật sự hơn** median (kiểm lại đúng điều review yêu cầu: đo *sau* khi sửa mới quyết giữ vòng lặp): 16 câu penalty 976 → **24**; 320 câu 2520 → **1520**. Khoảng tìm kiếm cũng đổi từ `median ± std` sang **chính các giá trị similarity quan sát được**, vì `median ± std` loại mất ngưỡng tối ưu trên mọi phân bố đã đo.

### Các quyết định khác

| Việc | Vì sao |
|---|---|
| Đo bằng **ký tự**, không phải token ước lượng | Cả module đo bằng ký tự và `splitText` mặc định 1000. Lệch khỏi ECVBot (`ceil(len/4)`) có chủ ý |
| `semanticChunks(text, embeddings?, options?)` là test seam | Cùng khuôn `documentStructureChunks` ở phase 4. Cần thật: với target 1000 thì fixture 320 ký tự **đúng khi không bị cắt**, nên không thể kiểm phần cắt |
| Metadata ghi `fellBackTo` + `fallbackReason` | Cột `chunking_strategy` vẫn là `SEMANTIC` (lựa chọn của người upload), nên không ghi thì tài liệu bị cắt theo đoạn văn **không phân biệt được** với tài liệu cắt thật |
| `MAX_SENTENCES = 1500` (thêm sau review) | Chỉ có sàn thì không đủ: provider gọi **tuần tự** theo lô 96, nên 8.000 câu = 84 lượt gọi và ~65 MB float giữ trong bộ nhớ trước khi ghi chunk nào; 429 ở lô cuối làm mất hết phần đã bị tính tiền |
| Kích thước tính theo **chuỗi sẽ được lưu** | `buildChunk` nối bằng một dấu cách, nên `sizes` cộng thêm 1 cho mỗi khoảng nối. Trước đó sàn/trần áp lên chuỗi khác với chuỗi vào cột |
| Bỏ `cast as never` trong spec | `{ generateEmbeddings: jest.fn() }` khớp `IEmbeddingService` **về cấu trúc**, nên không cần cast nào |

### Ghi nhận trung thực

- **Test của tôi lại mắc đúng lỗi cũ, lần thứ tư trong plan này.** Test tên *"cuts into chunks near the target instead of into fragments"* chỉ chặn **trên** cho số chunk và chặn **dưới** cho kích thước — cả hai đều thoả mãn bởi **một chunk 5.120 ký tự**. Review chứng minh bằng mutation: ép `chooseThreshold` trả 0 thì test vẫn xanh. Và test *"produces more chunks as the document grows"* chỉ xanh nhờ các separator `0.4` **tôi tự cắm vào fixture**, tức nó đo đường may của chính fixture. Đã viết lại: chặn **cả hai phía** cho số chunk, chặn **trên** cho kích thước, và resample từ phân bố đo được **không** cắm separator. Kiểm chứng mutation: bỏ trần → **5 test đỏ**; ép không cắt → **3 test đỏ**
- Bộ tách câu **không có test bảo toàn văn bản** ở đúng chỗ có thể mất chữ. Review fuzz 200.000 đầu vào và xác nhận implementation không mất chữ, nhưng xoá dòng đẩy `pending` thì **cả 26 test vẫn xanh**. Đã thêm test; mutation giờ đỏ
- **Đã chạy thật với ngưỡng thích ứng** sau khi sửa C1 (review yêu cầu đúng thứ tự này). Tệp 45 câu / 2.920 ký tự, ba chủ đề rõ rệt (thanh toán · bảo hành · chấm dứt):

| chunk | ký tự | câu | ngưỡng chọn ra | mở đầu bằng |
|:-:|:-:|:-:|:-:|---|
| 0 | 988 | 15 | 0.691 | "Bên A có nghĩa vụ thanh toán…" |
| 1 | 951 | 15 | 0.691 | "Thời hạn bảo hành thiết bị…" |
| 2 | 979 | 15 | 0.691 | "Hợp đồng chấm dứt…" |

  Ba chunk trùng **chính xác** ba khối chủ đề trong tệp, mỗi khối đúng 15 câu, cả ba đều 951–988 ký tự so với target 1.000. Không thoái lui, không rate limit, `parent_content` NULL. So sánh: cùng đường ống với ngưỡng hằng 0.75 cho **15 chunk cỡ 64–128 ký tự** trên tệp 1.940 ký tự.

  `TokenUsage` xác nhận ghi đúng mà không có code accounting nào: **3 dòng `embedding` / 5.811 ký tự**, cùng 6 dòng `entities` (2 lượt gọi × 3 chunk).

  Corpus đã dọn về đúng 33 tài liệu / 104 chunk `recursive` sau cả hai lần thử.
- Chunk của `SEMANTIC` **không phải chuỗi con nguyên văn** của `textContent`: bộ tách câu trim từng câu và `buildChunk` nối bằng một dấu cách, nên ngắt đoạn bị chuẩn hoá. Hai strategy kia giữ nguyên văn bản gốc. Hiện không ai đọc offset chunk nên không vỡ gì, nhưng sẽ thành vấn đề nếu có tính năng highlight theo vị trí
- `MIN_CHUNK_CHARS = 200` là **số kế thừa từ ECVBot**, chưa hiệu chỉnh trên corpus này. 200 hay 1000 là quyết định về độ mịn khi truy hồi, không phải quyết định code

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| Rate limit Gemini free tier | Embed theo lô một lượt gọi; thoái lui khi lỗi; opt-in nên chỉ tốn khi người dùng chủ động chọn |
| Tách câu sai với tiếng Việt (`1.850.000 VND`) | Test riêng cho ca số thập phân; regex không cắt khi hai bên dấu chấm đều là số |
| Ngưỡng 0.75 chọn bừa | Ghi thẳng trong comment rằng chưa hiệu chỉnh. Không có bộ đo (đã chốt), nên đây là hằng số cần xem lại nếu thấy chunk quá vụn hoặc quá to |
| Chunk quá vụn làm phình số chunk | Đặt số câu tối thiểu mỗi chunk (đề xuất 2) và số chunk tối đa |
| ~~`chunking.module.ts` import `AiModule` gây phụ thuộc vòng~~ | **Đã loại ở Validation Session 1**: `ai.module.ts` chỉ import Bedrock/Gemini/OpenAI, không import `ChunkingModule`. Không có vòng |

## Nhãn và cảnh báo chi phí

Nhãn trên dropdown là **`SEMANTIC`** — tên kỹ thuật, theo quyết định ở Validation Session 1.

Nhưng một tên kỹ thuật không nói được rằng nó chậm và tốn quota. Nên lời cảnh báo **tách ra khỏi nhãn**: một dòng chữ nhỏ dưới `Select` nói rõ chỉ riêng `SEMANTIC` tốn thêm lượt gọi embedding. Giữ được cả hai — nhãn khớp giá trị trong DB, mà người chọn vẫn biết cái giá.
