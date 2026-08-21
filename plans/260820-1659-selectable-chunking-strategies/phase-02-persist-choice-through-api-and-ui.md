---
phase: 2
title: "Persist Choice Through Api And Ui"
status: done
priority: P1
dependencies: [1]
effort: "2h"
---

# Phase 2: Persist Choice Through Api And Ui

## Overview

Nối đường ống end-to-end: dropdown trên trang Tải lên → multipart field → `Document.chunkingStrategy` → consumer đọc ra và dùng. Kết thúc phase, chỉ có 1 chiến lược để chọn — dropdown **tự ẩn** khi chưa đủ 2 lựa chọn, nên không có UI vô nghĩa nào được ship.

Đây là phase làm tính năng "có thật" với người dùng. Ba phase sau chỉ thêm lựa chọn vào danh sách.

## Requirements

**Functional**
- `POST /documents` nhận field `chunkingStrategy` (tuỳ chọn) trong multipart
- Giá trị không thuộc 4 id → **400**, không âm thầm dùng mặc định
- Thiếu field → mặc định `RECURSIVE_CHARACTER`
- Lưu lên `Document.chunkingStrategy`; consumer đọc từ đó
- Upload nhiều tệp: frontend gửi cùng một giá trị cho mọi tệp trong lô
- Drive import truyền mặc định

**Non-functional**
- 1 migration, cột nullable → không phá các dòng hiện có
- Không thêm endpoint mới để liệt kê chiến lược; frontend dùng constant như `TYPE_LABELS`/`STATUS_LABELS` sẵn có

## Architecture

`ingestion.controller.ts` hiện dùng `@UploadedFile()` với `FileInterceptor('file')`. Multipart cho phép field text đi kèm file, lấy qua `@Body()`. Validate bằng zod theo đúng cách `ask.controller.ts` đang làm (`createZodDto`).

`ingestion.service.upload()` hiện có chữ ký `(file, ownerId, source = 'upload')`. Thêm tham số thứ 4 `chunkingStrategy` mặc định `'RECURSIVE_CHARACTER'` — **đặt sau `source`** để `drive-import.consumer.ts` (đang truyền 3 tham số) không phải sửa và tự nhận mặc định.

Frontend: `document-types.ts` thêm `CHUNKING_LABELS: Record<string,string>` theo đúng khuôn `TYPE_LABELS` đã có. Phase này 1 entry; phase 3-5 mỗi phase thêm 1. `upload-page.tsx` ẩn `Select` khi `Object.keys(CHUNKING_LABELS).length < 2`.

**Nhãn giữ nguyên tên kỹ thuật** (`RECURSIVE_CHARACTER`, `PARENT_CHILD_MARKDOWN`, `DOCUMENT_STRUCTURE`, `SEMANTIC`) — quyết định của người dùng ở Validation Session 1. Đổi lại: nhãn trên UI khớp đúng giá trị trong DB và log, nên tra cứu về sau không phải dịch ngược.

**Thứ tự `FormData` có ý nghĩa.** `upload-page.tsx:105` hiện append `file` đầu tiên. Field chiến lược phải được append **trước** `file` — đây là UNVERIFIED duy nhất còn lại sau verification pass, và test ở bước 1 là thứ chứng minh field đến được controller.

## Related Code Files

**Modify**
- `nestjs-backend/prisma/schema.prisma` — `Document` thêm `chunkingStrategy String?`
- `nestjs-backend/src/features/ingestion/ingestion.controller.ts` — zod DTO + `@Body()`
- `nestjs-backend/src/features/ingestion/ingestion.service.ts` — tham số thứ 4, ghi vào `document.create`
- `nestjs-backend/src/features/ingestion/ingest.consumer.ts` — đọc `document.chunkingStrategy`, thoái lui mặc định khi null
- `frontend/src/features/documents/document-types.ts` — `CHUNKING_LABELS`
- `frontend/src/features/upload/upload-page.tsx` — `Select` + gửi field
- `nestjs-backend/scripts/backfill-embeddings.ts` — **mới thêm sau review phase 1**. Script chọn *mọi* tài liệu `completed` rồi `replaceChunks` (purge-then-insert). Từ phase này trở đi mỗi tài liệu có lựa chọn riêng, nên script phải đọc `document.chunkingStrategy` thay vì dùng `DEFAULT_CHUNKING_STRATEGY`, kèm `select` thêm field đó

**Create**
- `nestjs-backend/prisma/migrations/<ts>_add_document_chunking_strategy/migration.sql`
- `nestjs-backend/src/features/ingestion/ingestion.controller.spec.ts` hoặc bổ sung spec cho service

## Implementation Steps

**Tests trước**

1. Spec cho validate: `chunkingStrategy: 'KHONG_TON_TAI'` → 400 nêu các giá trị hợp lệ
2. Spec: thiếu field → `Document.chunkingStrategy === 'RECURSIVE_CHARACTER'`
3. Spec: giá trị hợp lệ → lưu đúng giá trị đó
4. `pnpm test` → 3 test mới **đỏ**

**Rồi mới code**

5. `schema.prisma`: thêm cột. **KHÔNG dùng `prisma migrate dev`** — nó đòi drop cột `search_tsv` (generated column, Prisma không diễn đạt được) và sẽ tắt full-text search. Viết `migration.sql` bằng tay rồi `prisma migrate deploy`, đúng như `20260812210000_document_source`
6. Validate trong controller — **không dùng zod DTO**: pipe zod toàn cục ném 422 còn endpoint này cần 400. Kiểm tra tường minh, danh sách lấy từ `IMPLEMENTED_CHUNKING_STRATEGIES` để một chỗ là nguồn duy nhất
7. `ingestion.service.upload()` nhận tham số thứ 4, ghi vào `document.create`
8. `ingest.consumer.ts`: `document.chunkingStrategy ?? 'RECURSIVE_CHARACTER'` truyền cho service
9. Frontend: `CHUNKING_LABELS` 1 entry; `Select` ẩn khi < 2 entry; `submit()` gắn field vào `FormData` mỗi tệp
10. `pnpm test` + `npx tsc --noEmit` + `pnpm build` (frontend)

## Success Criteria

- [x] Test validate pass — 6 test cho parser + 5 test cho controller
- [x] Migration chạy được; các dòng cũ có `chunkingStrategy = NULL` (33/33). **Hoàn tác: chưa chạy thử**, xem ghi nhận bên dưới
- [x] Upload không gửi field → `Document.chunking_strategy = 'RECURSIVE_CHARACTER'`, chunk cũng vậy (kiểm live qua HTTP)
- [x] Gửi giá trị rác → 400, **không** tạo `Document` nào (spec chứng minh `upload()` không được gọi; live cũng 400)
- [x] Import từ Drive → không sửa `drive-import.consumer.ts`; tham số thứ 4 đặt sau `source` nên nó nhận mặc định. Spec khoá hành vi 3-tham-số. **Chưa chạy import thật** (cần OAuth)
- [x] Trang Tải lên **không hiện** dropdown — `CHUNKING_OPTIONS.length > 1` là false với 1 entry
- [x] `pnpm test` 209 xanh, `npx tsc --noEmit` sạch, frontend `pnpm build` + oxlint sạch

## Đã triển khai — 21/08/2026

**`prisma migrate dev` gần như xoá full-text search.** Nó báo sắp **drop cột `search_tsv`** (33 giá trị non-null, có index GIN) vì đó là generated column mà `schema.prisma` không diễn đạt được. Chỉ dừng lại vì shell không interactive. Đã viết migration **bằng tay** rồi `prisma migrate deploy` — đúng tiền lệ đã ghi trong `20260812210000_document_source/migration.sql`. Xác nhận sau đó `search_tsv` còn đủ 33/33 dòng.

Khác với phase file, đều là cố ý:

| Việc | Vì sao |
|---|---|
| Validate bằng **kiểm tra tường minh → 400**, không dùng zod DTO | Pipe zod toàn cục (`custom-zod-validation.pipe.ts`) ném **422**, mà hai lời từ chối khác của đúng endpoint này (không có file, đuôi tệp không cho phép) là 400 — và phase file yêu cầu 400. Một endpoint trả lời "sai đầu vào" theo hai mã là tệ hơn việc bỏ khuôn DTO ở một chỗ |
| API chỉ nhận chiến lược **đã có implementation** — `SEMANTIC` bị 400 cho tới phase 5 | Theo rủi ro đã ghi sau review phase 1. Nhận cả 4 id nghĩa là nhận tệp, xếp job, rồi fail trên tài liệu thật của người dùng |
| `parseChunkingStrategy` một hàm, ba chỗ gọi, trả về union | Controller cần **từ chối**, worker và script backfill cần **thoái lui** — cùng một phép kiểm tư cách thành viên. Tách ra là nhân đôi nó |
| Registry chuyển thành const cấp module + export `IMPLEMENTED_CHUNKING_STRATEGIES` | Controller cần danh sách lúc nạp module, không qua DI. Xem ràng buộc mới ghi ở phase 5 |
| Ghi log khi cột chứa giá trị không đọc được | Review chỉ ra `?? DEFAULT` chỉ chạy khi cột **có giá trị mà không parse được** — và không ai ghi lại. Trong script backfill giá đắt hơn: nó purge rồi ghi lại mọi tài liệu, nên một lần hạ cấp âm thầm là lệch **vĩnh viễn** giữa `Document` và chunk của nó |
| `IMPLEMENTED_CHUNKING_STRATEGIES` derive từ `Object.entries().filter()` chứ không `Object.keys()` | `Object.keys` tính cả khoá có giá trị `undefined`, còn `supports()` kiểm `!== undefined`. Một entry kiểu `SEMANTIC: flag ? impl : undefined` sẽ vào danh sách, qua được cổng 400, rồi ném trong `split()`. Spec giờ so **hai đường với nhau**, không so từng đường với đáp án cứng |

**Ghi nhận trung thực:**

- **Chưa chạy thử rollback migration.** Cột nullable, không default, không index, không FK. Nhưng comment rollback ban đầu **sai và nguy hiểm**: chỉ `DROP COLUMN` mà vẫn để `chunkingStrategy` trong `schema.prisma` thì **mọi** truy vấn `Document` lỗi P2022, không riêng đường nạp. Đã sửa comment thành 4 bước (drop → bỏ field → `generate` → `migrate resolve --rolled-back`). Đánh giá của reviewer: không cần test live, vì nửa rủi ro nằm ở lệch client/schema mà test psql không chạm tới
- `GET /documents/:id` **giờ trả thêm** `chunkingStrategy` — `documents.service.findOne` dùng `include` và spread mọi field trừ `storagePath`. Cộng thêm, không phá client, nhưng là đổi hình dạng response nên ghi lại ở đây
- Thứ tự validate đổi: request vừa sai chiến lược vừa sai đuôi tệp giờ báo lỗi **chiến lược** (controller) thay vì lỗi đuôi tệp (service). Không phá hợp đồng, chỉ đổi thông điệp
- Comment về thứ tự `FormData` ban đầu **nêu sai cơ chế**: multer parse xong toàn bộ body trước khi handler chạy, nên `@Body()` thấy field bất kể thứ tự. Vẫn giữ field trước file (đúng thói quen, không tốn gì) nhưng lý do đã viết lại cho đúng
- Nhật ký audit `document.upload` **không** ghi chiến lược đã chọn (interceptor chỉ lấy `q` từ body). Truy được từ chính `Document`, nên để nguyên
- Khối `Select` **chưa từng render** (`CHUNKING_OPTIONS.length > 1` là false). Typecheck và lint sạch, nhưng chưa chạy — lần render đầu tiên sẽ là ở phase 3, kiểm bằng mắt lúc đó. Ghi thêm: `Select` trong `ui/input.tsx` không có `disabled:opacity-50` như `Input`, nên `disabled={busy}` chặn tương tác mà không có dấu hiệu thị giác

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| `FileInterceptor` + `@Body()` không lấy được field text | Kiểm bằng test trước khi sửa UI; nếu multer không đưa field vào body thì đổi sang `@Body('chunkingStrategy')` hoặc query param |
| Thêm tham số vào `upload()` phá chỗ gọi khác | Đã kiểm: chỉ 2 chỗ gọi — controller và `drive-import.consumer.ts`. Đặt tham số sau `source` với mặc định nên Drive không cần sửa |
| Dropdown 1 lựa chọn nhìn vô nghĩa | Ẩn khi < 2 entry — một dòng, và giữ phase này tự nhất quán |
| Zod enum lệch với registry | Import trực tiếp `CHUNKING_STRATEGIES` từ `chunking.types.ts`, không viết lại danh sách |
| API nhận 4 giá trị nhưng registry mới đăng ký 1 → chọn `SEMANTIC` ở phase này làm job **failed** | Validate theo `chunking.supports()` chứ không theo `CHUNKING_STRATEGIES` trần, hoặc để dropdown chỉ hiện khoá đã đăng ký. Phát hiện ở review phase 1 |
| `pnpm backfill:embeddings` xoá lựa chọn của người dùng | Script purge-then-insert toàn bộ tài liệu `completed`. Nếu vẫn ghi `DEFAULT_CHUNKING_STRATEGY`, một lần chạy sẽ đè `chunking_strategy` của mọi tài liệu về `RECURSIVE_CHARACTER` — và sau phase 3 còn xoá luôn `parent_content`. Sửa trong phase này: đọc chiến lược từ chính `Document` |
