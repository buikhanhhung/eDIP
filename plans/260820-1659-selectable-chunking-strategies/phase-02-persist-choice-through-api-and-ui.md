---
phase: 2
title: "Persist Choice Through Api And Ui"
status: pending
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

5. `schema.prisma`: thêm cột. `pnpm prisma migrate dev --name add_document_chunking_strategy`
6. Zod schema trong controller: `z.enum(CHUNKING_STRATEGIES).optional()` — **import từ `chunking.types.ts`** để một chỗ là nguồn duy nhất
7. `ingestion.service.upload()` nhận tham số thứ 4, ghi vào `document.create`
8. `ingest.consumer.ts`: `document.chunkingStrategy ?? 'RECURSIVE_CHARACTER'` truyền cho service
9. Frontend: `CHUNKING_LABELS` 1 entry; `Select` ẩn khi < 2 entry; `submit()` gắn field vào `FormData` mỗi tệp
10. `pnpm test` + `npx tsc --noEmit` + `pnpm build` (frontend)

## Success Criteria

- [ ] 3 test validate pass
- [ ] Migration chạy được và **hoàn tác được** (`migrate resolve` hoặc rollback tay); các dòng cũ có `chunkingStrategy = NULL`
- [ ] Upload không gửi field → chunk mang `RECURSIVE_CHARACTER`
- [ ] Gửi giá trị rác → 400, **không** tạo `Document` nào
- [ ] Import từ Drive → vẫn chạy, `chunking_strategy = 'RECURSIVE_CHARACTER'` (không sửa `drive-import.consumer.ts`)
- [ ] Trang Tải lên **không hiện** dropdown (mới 1 lựa chọn)
- [ ] `pnpm test` toàn xanh, frontend build sạch

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| `FileInterceptor` + `@Body()` không lấy được field text | Kiểm bằng test trước khi sửa UI; nếu multer không đưa field vào body thì đổi sang `@Body('chunkingStrategy')` hoặc query param |
| Thêm tham số vào `upload()` phá chỗ gọi khác | Đã kiểm: chỉ 2 chỗ gọi — controller và `drive-import.consumer.ts`. Đặt tham số sau `source` với mặc định nên Drive không cần sửa |
| Dropdown 1 lựa chọn nhìn vô nghĩa | Ẩn khi < 2 entry — một dòng, và giữ phase này tự nhất quán |
| Zod enum lệch với registry | Import trực tiếp `CHUNKING_STRATEGIES` từ `chunking.types.ts`, không viết lại danh sách |
| API nhận 4 giá trị nhưng registry mới đăng ký 1 → chọn `SEMANTIC` ở phase này làm job **failed** | Validate theo `chunking.supports()` chứ không theo `CHUNKING_STRATEGIES` trần, hoặc để dropdown chỉ hiện khoá đã đăng ký. Phát hiện ở review phase 1 |
| `pnpm backfill:embeddings` xoá lựa chọn của người dùng | Script purge-then-insert toàn bộ tài liệu `completed`. Nếu vẫn ghi `DEFAULT_CHUNKING_STRATEGY`, một lần chạy sẽ đè `chunking_strategy` của mọi tài liệu về `RECURSIVE_CHARACTER` — và sau phase 3 còn xoá luôn `parent_content`. Sửa trong phase này: đọc chiến lược từ chính `Document` |
