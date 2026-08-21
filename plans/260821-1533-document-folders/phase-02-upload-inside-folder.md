---
phase: 2
title: "Upload Inside Folder"
status: pending
priority: P1
dependencies: [1]
effort: "2-2.5h"
---

# Phase 2: Upload Inside Folder

## Overview

Upload **chỉ diễn ra bên trong một folder**. Trang Upload cấp cao nhất bị bỏ; đường vào là folder. Cả tệp local lẫn import Drive đều gán `folderId`.

Đây là phase làm tính năng "có thật" với người dùng.

## Requirements

**Functional**
- `POST /documents` nhận `folderId` trong multipart; **thiếu hoặc không tồn tại → từ chối**, không âm thầm dùng "chưa phân loại"
- `POST /connectors/google/import` nhận `folderId`; mọi tệp trong lô mang folder đó
- Route `/folders/:id` — chi tiết folder: danh sách tài liệu của folder + khu vực upload ngay trong đó
- Bỏ route `/upload` và mục "Upload" trên sidebar; thêm mục "Folders"
- Thư viện lọc theo folder, bộ lọc **sống trong URL** như các bộ lọc hiện có

**Non-functional**
- Không thêm dependency
- Khuôn đã có: `chunkingStrategy` vừa đi đúng đường này (multipart field + `DriveImportJobData` + tham số `upload()`)

## Architecture

`ingestion.service.upload()` hiện có chữ ký `(file, ownerId, source, chunkingStrategy)`. Thêm `folderId` làm **tham số thứ 5**, và **bắt buộc** — không mặc định, vì mặc định là cách để một tệp lặng lẽ rơi ra ngoài mọi folder.

Kiểm tra folder tồn tại trước khi ghi: một `folderId` rác phải bị từ chối **trước khi** tệp được lưu xuống đĩa, giống cách `allowedTypeFor()` chặn đuôi tệp ở `ingestion.service.ts:42`.

Drive import: `DriveImportJobData` thêm `folderId`. Mỗi tệp là một job riêng nên folder phải đi theo từng job — đúng lý do `chunkingStrategy` cũng nằm trong job data.

**Dialog chọn folder không cần thiết.** Vì upload diễn ra *trong* folder, `folderId` đến từ route (`/folders/:id`), không phải từ một hộp chọn. Riêng Drive import nằm ở trang Nguồn nên vẫn cần chọn folder — dùng lại `ChunkingStrategyDialog` làm khuôn, hoặc thêm bước chọn folder vào chính dialog đó.

## Related Code Files

**Modify — backend**
- `nestjs-backend/src/features/ingestion/ingestion.service.ts` — tham số thứ 5 `folderId`, kiểm tồn tại, ghi vào `document.create`
- `nestjs-backend/src/features/ingestion/ingestion.controller.ts` — `@Body('folderId')`, từ chối khi thiếu
- `nestjs-backend/src/features/connectors/connectors.controller.ts` — `importSchema` thêm `folderId`
- `nestjs-backend/src/features/connectors/drive-import.consumer.ts` — `DriveImportJobData` thêm `folderId`, truyền vào `upload()`

**Modify — frontend**
- `frontend/src/app.tsx` — bỏ route `/upload`, thêm `/folders` và `/folders/:id`
- `frontend/src/components/app-shell.tsx` — sidebar: bỏ "Upload", thêm "Folders"
- `frontend/src/features/upload/upload-page.tsx` — chuyển thành thành phần dùng trong trang folder, `folderId` từ route
- `frontend/src/features/connectors/sources-page.tsx` — chọn folder trước khi mở Drive picker
- `frontend/src/features/library/library-page.tsx` — filter folder trong URL

**Create**
- `frontend/src/features/folders/folder-detail-page.tsx`

## Implementation Steps

**Tests trước**

1. Spec: `upload()` thiếu `folderId` → lỗi, **không** tạo `Document`, **không** ghi tệp xuống đĩa
2. Spec: `folderId` không tồn tại → lỗi, và kiểm nó xảy ra **trước** `storage.save()`
3. Spec: `folderId` hợp lệ → `document.create` ghi đúng giá trị
4. Spec: job Drive mang `folderId` và consumer truyền nó làm tham số thứ 5
5. `pnpm test` → đỏ

**Rồi mới code**

6. `ingestion.service.ts`: tham số thứ 5, kiểm tồn tại trước `storage.save()`
7. `ingestion.controller.ts`: đọc và từ chối khi thiếu
8. Drive: schema + job data + consumer
9. Frontend: route, sidebar, trang chi tiết folder, filter Thư viện
10. `pnpm test` + `npx tsc --noEmit` + `tsc -b` + `pnpm build` (frontend)

## Success Criteria

- [ ] 4 nhóm test trên pass
- [ ] Upload trong folder → `folder_id` đúng trong DB
- [ ] Upload không kèm `folderId` → bị từ chối, **không** có tệp mới trong `storage/`
- [ ] `folderId` rác → bị từ chối trước khi ghi đĩa
- [ ] Import Drive vào folder → **mọi** tệp trong lô mang folder đó
- [ ] Sidebar không còn "Upload"; không còn link chết tới `/upload`
- [ ] Thư viện lọc theo folder được, và URL mang bộ lọc đó
- [ ] 294 test cũ + test mới pass, frontend build sạch

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| `folderId` rác làm tệp đã ghi đĩa rồi mới lỗi | Kiểm tồn tại **trước** `storage.save()`; bước 2 viết test chứng minh thứ tự |
| Thêm tham số thứ 5 phá chỗ gọi khác | Chỉ 2 chỗ gọi `upload()`: controller và `drive-import.consumer.ts`. Cả hai sửa trong phase này — **không** đặt mặc định, vì mặc định là đường để tệp rơi ra ngoài folder |
| Bỏ `/upload` để lại link chết | Sidebar sửa cùng phase; kiểm bằng mắt sau khi build |
| Người mới chưa có folder nào thì không upload được | Trạng thái rỗng của `/folders` phải dẫn thẳng tới "Tạo folder đầu tiên" — làm ở phase 3, nên phase 2 tạm thời cần ít nhất một folder tạo bằng API |
| Kéo-thả tệp vào trang folder | `folderId` từ route nên không cần hỏi gì — đơn giản hơn luồng dialog của chunking |
