---
phase: 3
title: "Folder Management Ui"
status: pending
priority: P2
dependencies: [2]
effort: "3-3.5h"
---

# Phase 3: Folder Management Ui

## Overview

Làm folder dễ dùng: danh sách có số đếm, tạo/đổi tên/xoá, chuyển tài liệu giữa các folder, và nhóm "Chưa phân loại" cho 33 tài liệu cũ.

Phase này cũng là chỗ **quyết cách xoá folder nhiều tệp** — đồng bộ có giới hạn hay đẩy queue.

## Requirements

**Functional**
- `/folders`: danh sách folder, mỗi dòng có tên, mô tả, **số tài liệu**, ngày tạo
- Trạng thái rỗng dẫn thẳng tới "Tạo folder đầu tiên" — vì từ phase 2, không có folder thì không upload được
- Tạo / đổi tên folder qua dialog (dùng lại khuôn `chunking-strategy-dialog.tsx`)
- Xoá folder: hộp xác nhận **nêu đúng số tài liệu sẽ mất**, và nói rõ là không hoàn tác được
- "Chưa phân loại" là mục ảo (`folderId = null`) — xem được, **không** xoá được, **không** upload vào được
- Chuyển tài liệu sang folder khác từ trang chi tiết tài liệu
- Số đếm phải khớp thật sau khi upload, xoá, chuyển

**Non-functional**
- Không thêm dependency; dialog đã có, `Select` đã có
- Xoá folder không được làm timeout request

## Architecture

**Xoá folder lặp qua `documents.remove()`** (đã chốt ở phase 1). Với 90 tệp là 90 lượt xoá graph + 90 lượt xoá tệp, nên phải quyết:

| Cách | Đánh giá |
|---|---|
| Đồng bộ, có giới hạn (ví dụ ≤ 20 tài liệu) | Đơn giản nhất, phản hồi ngay. Trên giới hạn thì từ chối và bảo người dùng xoá bớt — thô nhưng thật thà |
| Đẩy queue như Drive import | Không timeout, nhưng cần trạng thái "đang xoá" trên UI và xử lý nửa đường. Tiền lệ có sẵn: `QUEUE_NAMES.DRIVE_IMPORT` |

Chốt ở đầu phase, khi đã biết UI cần phản hồi gì. Nghiêng về **đồng bộ có giới hạn** cho vòng đầu: ít phần chuyển động hơn, và một folder 90 tệp là ca hiếm ở quy mô hiện tại (33 tài liệu toàn hệ).

**"Chưa phân loại" không phải một hàng trong bảng.** Nó là `folderId = null`, nên mọi chỗ hiển thị phải xử lý riêng: không cho xoá, không cho upload vào, và không đếm nó như một folder trong tổng số folder.

## Related Code Files

**Create**
- `frontend/src/features/folders/folders-page.tsx`
- `frontend/src/features/folders/folder-form-dialog.tsx` — tạo/đổi tên
- `frontend/src/features/folders/delete-folder-dialog.tsx` — xác nhận nêu số tài liệu

**Modify**
- `frontend/src/app.tsx` — route `/folders`
- `frontend/src/features/documents/document-detail-page.tsx` — hiện folder hiện tại + chuyển folder
- `frontend/src/features/library/library-page.tsx` — cột hoặc filter folder
- `nestjs-backend/src/features/folders/folders.service.ts` — giới hạn/queue khi xoá
- `nestjs-backend/src/features/documents/documents.controller.ts` — endpoint chuyển folder (hoặc mở rộng `PATCH documents/:id/metadata`)

## Implementation Steps

**Tests trước**

1. Spec: xoá folder vượt giới hạn → bị từ chối kèm số tài liệu, **không** xoá gì cả (nếu chọn đường đồng bộ có giới hạn)
2. Spec: chuyển tài liệu sang folder khác → `folderId` đổi, số đếm hai folder đổi theo
3. Spec: chuyển sang `folderId` không tồn tại → bị từ chối
4. Spec: không cho gán `folderId = null` qua API chuyển folder (muốn bỏ khỏi folder thì xoá tài liệu, vì upload đã bắt buộc folder)
5. `pnpm test` → đỏ

**Rồi mới code**

6. `folders.service.ts`: giới hạn xoá
7. Endpoint chuyển folder
8. `folders-page.tsx` + hai dialog
9. Trang chi tiết tài liệu: hiện và chuyển folder
10. Thư viện: cột/filter folder
11. `pnpm test` + typecheck + build; **xem bằng mắt** toàn bộ luồng

## Success Criteria

- [ ] 4 nhóm test trên pass
- [ ] Danh sách folder có số đếm **khớp** sau khi upload / xoá / chuyển
- [ ] Trạng thái rỗng dẫn tới tạo folder đầu tiên
- [ ] Hộp xác nhận xoá nêu **đúng số** tài liệu sẽ mất
- [ ] Sau khi xoá folder: không còn tệp mồ côi trong `storage/`, không còn node trong FalkorDB, không còn dòng trong `embedding_chunks`
- [ ] "Chưa phân loại" xem được nhưng không xoá được và không upload vào được
- [ ] Chuyển tài liệu giữa hai folder chạy, và Thư viện phản ánh ngay
- [ ] 294 test cũ + test mới pass, frontend build sạch
- [ ] **Xem bằng mắt** cả luồng: tạo → upload → chuyển → xoá

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| Xoá folder mất tài liệu ngoài ý muốn | Quyết định của người dùng, không có undo. Hộp xác nhận nêu đúng số tài liệu và nói rõ không hoàn tác |
| Xoá folder lớn timeout | Giới hạn đồng bộ cho vòng đầu; queue là đường lùi đã có tiền lệ |
| Xoá nửa đường: vài tài liệu mất, folder còn | Nếu đi đường đồng bộ, xoá tài liệu trước rồi mới xoá folder — folder còn lại là dấu hiệu nhìn thấy được, tốt hơn folder mất mà tài liệu còn treo |
| Số đếm lệch sau khi chuyển/xoá | Số đếm truy vấn từ DB, **không** giữ ở client; invalidate query sau mỗi thay đổi như `upload-page.tsx` đang làm |
| "Chưa phân loại" bị đối xử như folder thật | Test riêng: không xoá được, không upload vào được |
| Dialog thứ ba, thứ tư trong cùng codebase | Dùng lại khuôn `chunking-strategy-dialog.tsx` (đã có backdrop, Escape, focus). Nếu tới dialog thứ ba thì tách phần vỏ ra thành component dùng chung — lúc đó mới tách, không phải bây giờ |
