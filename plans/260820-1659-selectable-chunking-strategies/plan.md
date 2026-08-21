---
title: "Chọn chiến lược chunking khi upload"
description: "Người dùng chọn 1 trong 4 chiến lược chunking lúc upload; registry phẳng thay cho một hàm splitText duy nhất; hồi sinh cột parent_content đang bị đọc mà chưa ai ghi."
status: in-progress
priority: P2
branch: "master"
tags: [chunking, ingestion, tdd]
blockedBy: []
blocks: []
created: "2026-08-20T10:50:11.210Z"
createdBy: "ck:plan"
source: skill
---

# Chọn chiến lược chunking khi upload

## Overview

Hiện `ingest.consumer.ts:91` gọi `splitText()` và ghi cứng hằng `CHUNKING_STRATEGY = 'recursive'` vào mọi chunk. Việc này mở đường cho người dùng chọn 1 trong 4 chiến lược lúc upload, theo danh sách của ECVBot.

Nền đã có sẵn hơn mong đợi: bảng `embedding_chunks` **đã có** cột `chunking_strategy`, `parent_content`, `chunk_index` — cùng tên bảng như ECVBot. Và `vector-store.service.ts` **đã đọc** `COALESCE(ec.parent_content, ec.content)` ở 2 truy vấn, nhưng câu `INSERT` chỉ ghi 5 cột, không có `parent_content`. Tức parent-child chunking mới làm nửa vời: đường đọc chạy không.

Chốt từ brainstorm: [báo cáo](../reports/from-brainstorm-to-plan-260820-1659-selectable-chunking-strategies-report.md)

- Người dùng chọn **lúc upload**, không tự nhận diện
- **Chỉ tài liệu mới** — không re-chunk các tài liệu đã nạp
- **Không cần bộ đo** so sánh chiến lược
- **Đủ 4 chiến lược** như ECVBot
- **Một chiến lược cho cả lô** upload nhiều tệp
- Tài liệu từ Google Drive dùng mặc định `RECURSIVE_CHARACTER`

## Kiến trúc

**Registry phẳng, không phải factory.** ECVBot làm việc này bằng strategy-pattern factory: 13 file, 2088 LOC. `text-splitter.ts` của eDIP là 40 dòng, và chính comment trong đó lấy số LOC của ECVBot làm lý do từ chối. Lấy **danh sách chiến lược**, không lấy tầng trừu tượng.

```
infrastructure/chunking/
  chunking.types.ts          4 id + Chunk { content, parentContent?, metadata? }
  recursive-character.strategy.ts    ← logic splitText hiện tại, nguyên văn
  parent-child-markdown.strategy.ts  ← port y nguyên ECVBot (remark-parse + unified)
  document-structure.strategy.ts     ← port y nguyên ECVBot
  semantic.strategy.ts
  chunking.service.ts        tra registry; inject IEmbeddingService cho SEMANTIC
```

**SEMANTIC làm đổi hình dạng module.** Ba chiến lược kia là hàm thuần đồng bộ. SEMANTIC phải embed từng câu để tìm ranh giới chủ đề → cần `IEmbeddingService`, phải `async`, có thể lỗi. Nên `chunking.service.ts` là NestJS service, và cả 4 chiến lược mang chữ ký `async` chỉ vì cái thứ tư.

## Vì sao TDD

Vùng sửa **không được test bảo vệ đầy đủ**:

| File | Spec | Ghi chú |
|---|---|---|
| `infrastructure/chunking/text-splitter.spec.ts` | **có, 5 test** | khoá được hành vi chunking hiện tại |
| `infrastructure/vector-store/vector-store.service.ts` | **không có** | mà đây là chỗ phải sửa câu `INSERT` raw SQL |
| `features/ingestion/ingest.consumer.ts` | **không có** | trung tâm pipeline nạp |

Câu `INSERT` phải thêm cột nhưng không test nào chứng kiến. Mỗi phase viết test trước, và mọi phase đều phải giữ **185 test hiện tại pass**.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Registry And Default Strategy](./phase-01-registry-and-default-strategy.md) | **Done** |
| 2 | [Persist Choice Through Api And Ui](./phase-02-persist-choice-through-api-and-ui.md) | Pending |
| 3 | [Parent Child Markdown](./phase-03-parent-child-markdown.md) | Pending |
| 4 | [Document Structure](./phase-04-document-structure.md) | Pending |
| 5 | [Semantic Chunking](./phase-05-semantic-chunking.md) | Pending |

## Dependencies

```
1 → 2 → 3 → 4 → 5
```

Tuyến tính. Phase 1 là lưới an toàn (không đổi hành vi). Phase 2 làm đường ống end-to-end. Phase 3-5 mỗi phase thêm đúng một chiến lược vào dropdown.

**Dừng ở đâu cũng ra sản phẩm dùng được:**

| Dừng sau | Còn lại gì |
|---|---|
| Phase 1 | Không có gì thay đổi với người dùng; code đã tách sạch để mở rộng |
| Phase 2 | Dropdown chạy, một lựa chọn — đường ống hoàn chỉnh |
| Phase 3 | **Giá trị lớn nhất** — parent-child hồi sinh `parent_content`, câu trả lời có đủ ngữ cảnh hơn |
| Phase 4 | Thêm `DOCUMENT_STRUCTURE` — cắt ATX phẳng, dùng cột `metadata` |
| Phase 5 | Đủ 4 như ECVBot |

Không có quan hệ chặn với plan khác. Plan `260811-1608-edip-v2-...-mvp` có cả 7 phase ghi **Done** trong bảng (frontmatter `status: pending` là bị cũ, không phải đang dở) — phase 3 của nó dựng pipeline nạp mà plan này sửa lên, nhưng đó là việc đã xong.

## Ngoài phạm vi

- Re-chunk tài liệu đã nạp
- Bộ đo so sánh chất lượng giữa các chiến lược
- Chọn riêng chiến lược cho từng tệp trong một lô
- Dropdown ở trang Nguồn (Drive dùng mặc định)
- Folder giới hạn phạm vi search · search config — **vòng sau**, đã ghi nhận trong báo cáo brainstorm

## Tiêu chí nghiệm thu toàn plan

- [ ] Upload với chiến lược X → mọi chunk của tài liệu đó có `chunking_strategy = X`
- [ ] Chọn parent-child → `parent_content` khác null, câu trả lời trích **đoạn cha**
- [ ] Không chọn gì → hành vi y như trước, **185 test vẫn pass**
- [ ] SEMANTIC lỗi embedding → thoái lui về đoạn văn, **không** làm hỏng cả lần nạp
- [ ] Tài liệu từ Drive → `chunking_strategy = 'RECURSIVE_CHARACTER'`

## Rủi ro toàn plan

| Rủi ro | Xử lý |
|---|---|
| Câu `INSERT` raw SQL không có test nào bảo vệ | Phase 3 viết spec cho `vector-store` **trước** khi thêm cột |
| SEMANTIC đụng rate limit Gemini free tier | opt-in; thoái lui về đoạn văn khi lỗi thay vì fail job |
| Đổi chữ ký `splitText` làm lệch `generateEmbeddings` | Phase 1 có test tương đương byte-for-byte trước khi rewire |
| Kho thành hỗn hợp, không so sánh được | chấp nhận theo quyết định "không cần đo"; `chunking_strategy` vẫn lưu nên truy vết được |
| Người upload không hiểu 4 lựa chọn | mặc định là `RECURSIVE_CHARACTER`; nhãn giữ tên kỹ thuật theo quyết định, nên lời cảnh báo chi phí đặt riêng dưới `Select` chứ không nhét vào nhãn |

## Câu chưa trả lời

Không còn. Hai câu treo từ brainstorm đều đã chốt ở Validation Session 1 bên dưới.

## Validation Log

### Session 1 — 20/08/2026

#### Verification Results

- Claims checked: 16
- Verified: 14 | Failed: 0 | Unverified: 2
- Tier: Full (5 phase → cả 4 role)

| Khảng định | Kết quả | Bằng chứng |
|---|---|---|
| `upload()` đúng 2 chỗ gọi | VERIFIED | `drive-import.consumer.ts:54`, `ingestion.controller.ts:30` |
| `replaceChunks()` 1 chỗ gọi | VERIFIED | `ingest.consumer.ts:86` |
| `splitText()` gọi tại consumer | VERIFIED | `ingest.consumer.ts:83` |
| `ingest.consumer.ts:91` là dòng ghi `chunkingStrategy` | VERIFIED | đúng dòng |
| `text-splitter.spec.ts` có 5 test | VERIFIED | đếm `it(` |
| `vector-store.service.ts` không có spec | VERIFIED | 22 spec, không có file này |
| `embedding_chunks` có `parent_content`, `chunking_strategy`, `chunk_index`, `metadata` | VERIFIED | `schema.prisma` |
| Câu `INSERT` chỉ ghi 5 cột | VERIFIED | `vector-store.service.ts:47` |
| `COALESCE(parent_content, content)` ở 2 truy vấn | VERIFIED | dòng 92 và 118 |
| `AiModule` **không** import `ChunkingModule` | VERIFIED | `ai.module.ts` chỉ import Bedrock/Gemini/OpenAI → **rủi ro phụ thuộc vòng ở phase 5 được loại bỏ** |
| Mẫu `@Inject(EMBEDDING_SERVICE)` | VERIFIED | 3 chỗ dùng |
| `Select` export từ `ui/input.tsx` | VERIFIED | dòng 26 |
| Mẫu `TYPE_LABELS` / `STATUS_LABELS` | VERIFIED | `document-types.ts:80,114` |
| eDIP **chưa có** `unified` / `remark-parse` / `mdast-util-to-string` | VERIFIED | `package.json` |
| `@Body()` nhận được field text cùng `FileInterceptor`? | **UNVERIFIED** | hành vi runtime; phòng bằng append field trước file + test phase 2 |
| Pure-ESM `import()` chạy được trong Jest của eDIP? | **UNVERIFIED** | ECVBot chạy được với jest không cấu hình ESM, nhưng cấu hình eDIP chưa thử → bước 0 của phase 3 là phép thử chặn |

#### Dữ liệu corpus đã quét

9 tài liệu seed: **6** dùng `1. TIÊU ĐỀ` (text thuần, không phải markdown), **1** dùng `Điều N.`, **0** dùng `CHƯƠNG` / `A.` / `a)` / `N)`, **0** có ATX header.

#### Câu hỏi và quyết định

| Câu hỏi | Quyết định |
|---|---|
| Corpus seed không có ATX — có giữ parent-child ở phase 3? | **Giữ nguyên phase 3** |
| Nhãn dropdown tiếng Việt hay tên kỹ thuật? | **Giữ tên kỹ thuật** |
| Phase 4 cắt theo gì? | **Bám ECVBot, port logic y nguyên** → `DOCUMENT_STRUCTURE` cắt ATX, thay cho `NUMBERED_SECTION` cắt mục có số |
| Xử lý UNVERIFIED về multipart? | **Append field trước file + test chứng minh** |

Lo ngại đã nêu và người dùng vẫn giữ quyết định: `DOCUMENT_STRUCTURE` cắt ATX nghĩa là **6/9 tài liệu corpus đánh số không được phục vụ**, và phase 4 không chạy được trên dữ liệu mẫu. Ghi lại, không bàn lại.

#### Thay đổi lan sang phase file

| Phase | Thay đổi |
|---|---|
| 1 | `Chunk` thêm `metadata?`; danh sách id đổi `NUMBERED_SECTION` → `DOCUMENT_STRUCTURE` |
| 2 | Nhãn = tên kỹ thuật; thêm ràng buộc append field **trước** file |
| 3 | Viết lại: `remark-parse` + `unified` + `mdast-util-to-string` (3 dependency mới), child **500/100**, `parentContent` = breadcrumb tổ tiên, `INSERT` thêm **2** cột, thêm **bước 0 phép thử ESM**. Effort 2.5h → 3.5h |
| 4 | Đổi tên file và nội dung: port `DOCUMENT_STRUCTURE` (ATX, nhận biết code fence, `maxChunkSize 1500`, header chèn lại mọi sub-chunk, metadata `sectionHeader`/`level`/`isSubChunk`) |
| 5 | Xoá rủi ro phụ thuộc vòng `AiModule` — đã verify là không có |

#### Whole-Plan Consistency Sweep

Đã đọc lại `plan.md` và cả 5 phase file sau khi lan thay đổi.

- `NUMBERED_SECTION` chỉ còn trong marker `Updated` của phase 4 — đúng, đó là ghi chú lịch sử
- Đoạn biện luận cho việc đổi tên chiến lược trong `plan.md` đã **xoá** — quyết định đó bị đảo
- Câu `INSERT` giờ nhất quán là **2 cột** ở cả `plan.md` và phase 3
- Interface `Chunk` nhất quán giữa phase 1, 3 và 4
- Bảng phase và link file khớp tên mới `phase-04-document-structure.md`

**Mâu thuẫn chưa giải: không có.**

### Session 2 — 21/08/2026 (đính chính trước khi triển khai)

Một khảng định ở Session 1 **sai**: `replaceChunks()` không phải 1 chỗ gọi mà là **2**.

| | |
|---|---|
| Ghi ở Session 1 | `replaceChunks()` 1 chỗ gọi — VERIFIED |
| Thực tế | **2 chỗ**: `src/features/ingestion/ingest.consumer.ts:86` và `scripts/backfill-embeddings.ts:50` |
| Nguyên nhân | Verification pass grep phạm vi `src/`, không quét `scripts/` |

`scripts/backfill-embeddings.ts` là **chỗ tiêu thụ thứ ba** của đường chunking — nó import `CHUNKING_STRATEGY` và `splitText` (dòng 6), gọi `splitText` (42), `replaceChunks` (50), ghi `chunkingStrategy` (55).

**Hệ quả nếu bỏ sót:** sau phase 1, `pnpm backfill:embeddings` vẫn ghi `'recursive'` trong khi upload mới ghi `'RECURSIVE_CHARACTER'` → ba giá trị cùng tồn tại trong DB. Script vẫn chạy, test vẫn xanh, chỉ có dự liệu lệch — loại lỗi khó thấy nhất.

Đã thêm vào `Related Code Files` của phase 1 và phase 3, kèm một dòng rủi ro ở phase 1.

Cũng xác nhận lại: `upload()` vẫn **đúng 2 chỗ gọi** — `scripts/` không gọi nó, nên kết luận của phase 2 (Drive không cần sửa) vẫn đúng.

### Baseline đo trước khi triển khai — 21/08/2026

```
Document                            33
embedding_chunks                   104
  có embedding                     104
  có parent_content                  0   ← xác nhận đường đọc COALESCE đang chạy không
  số chunking_strategy khác nhau      1   ← tất cả đều 'recursive'
```

Con số tài liệu đã được bỏ khỏi phần thân plan (trước ghi 23, thực tế 33 và còn tăng) — giữ số cứng trong plan chỉ khiến nó sai dần. Baseline này có mốc thời gian nên đứng được.

Sau phase 3, `có parent_content` phải > 0. Sau phase 2, `số chunking_strategy khác nhau` phải > 1.
