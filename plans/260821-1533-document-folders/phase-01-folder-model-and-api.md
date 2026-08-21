---
phase: 1
title: "Folder Model And Api"
status: pending
priority: P1
dependencies: []
effort: "2-2.5h"
---

# Phase 1: Folder Model And Api

## Overview

Bảng `Folder`, cột `Document.folderId`, và CRUD folder. Kết thúc phase, API chạy được nhưng **chưa ai thấy trên UI** — 33 tài liệu sẵn có nằm ở "Chưa phân loại".

## Requirements

**Functional**
- `Folder`: `id`, `name`, `description?`, `createdAt`, `updatedAt`
- `Document.folderId String?` + index — **nullable** vì 33 dòng sẵn có không thuộc folder nào
- `GET /folders` → danh sách kèm **số tài liệu** mỗi folder
- `POST /folders` → tạo, tên bắt buộc, trim, không rỗng
- `PATCH /folders/:id` → đổi tên / mô tả
- `DELETE /folders/:id` → xoá folder **và mọi tài liệu trong nó** (xem Architecture)
- `GET /documents?folderId=...` → lọc theo folder; `folderId=none` → tài liệu chưa phân loại

**Non-functional**
- 1 migration **viết tay**, cột nullable → không phá dòng hiện có
- 294 test hiện tại pass, không sửa test nào để chúng pass

## Architecture

**Xoá folder không dùng DB cascade.** `documents.service.ts:265` `remove()` làm ba việc:

```
graph.deleteDocument(id)      → node FalkorDB
prisma.document.delete()      → dòng DB (embedding_chunks cascade theo)
storage.remove(storagePath)   → tệp trên đĩa
```

`onDelete: Cascade` chỉ xử lý dòng DB, nên sẽ để lại **tệp mồ côi** và **node rác**. Vì vậy quan hệ khai là `onDelete: SetNull` ở tầng schema (an toàn khi có sự cố), còn việc xoá tài liệu là **tường minh trong service**: lặp `documents.remove()` từng tài liệu rồi mới xoá folder.

Đặt `folderService.remove()` gọi sang `DocumentsService.remove()` — không nhân bản logic xoá, vì bản nhân bản là bản sẽ quên `storage.remove()`.

**Không đặt unique index trên `name`** ở bản đầu: hai folder cùng tên vẫn phân biệt bằng id, và thêm unique sau là một migration nữa. Nếu người dùng muốn duy nhất thì thêm **ở phase này** rẻ hơn thêm sau.

## Related Code Files

**Create**
- `nestjs-backend/prisma/migrations/<ts>_add_folders/migration.sql`
- `nestjs-backend/src/features/folders/folders.module.ts`
- `nestjs-backend/src/features/folders/folders.controller.ts`
- `nestjs-backend/src/features/folders/folders.service.ts`
- `nestjs-backend/src/features/folders/folders.service.spec.ts`

**Modify**
- `nestjs-backend/prisma/schema.prisma` — model `Folder` + `Document.folderId`
- `nestjs-backend/src/features/documents/documents.service.ts` — `buildWhere()` dòng 63 thêm `folderId`; export `remove()` cho folder service dùng
- `nestjs-backend/src/features/documents/documents.controller.ts` — query param `folderId`
- `nestjs-backend/src/app.module.ts` — đăng ký `FoldersModule`

## Implementation Steps

**Tests trước**

1. `folders.service.spec.ts`: tạo folder → tên được trim; tên rỗng/chỉ khoảng trắng → lỗi
2. Spec: danh sách trả về **số tài liệu đúng** cho folder rỗng và folder có tài liệu
3. Spec: xoá folder có 2 tài liệu → `documents.remove()` được gọi **đúng 2 lần** với đúng id, rồi folder mới bị xoá. Đây là test chặn cạm bẫy cascade
4. Spec cho `buildWhere`: `folderId` lọc đúng; `folderId=none` → `folderId: null`
5. `pnpm test` → đỏ

**Rồi mới code**

6. `schema.prisma`: model `Folder` + `Document.folderId String? @map("folder_id")` + `@@index([folderId])`
7. Migration **viết tay** rồi `prisma migrate deploy`. **KHÔNG** `migrate dev` — nó đòi drop `search_tsv` (generated column), tiền lệ ở `20260812210000_document_source`
8. `folders.service.ts` + controller + module; `remove()` lặp qua `DocumentsService.remove()`
9. `buildWhere()` thêm `folderId`; controller thêm query param
10. `pnpm test` + `npx tsc --noEmit`

## Success Criteria

- [ ] 4 nhóm test trên pass, đặc biệt test xoá folder gọi `documents.remove()` từng tài liệu
- [ ] Migration chạy được; 33 dòng sẵn có có `folder_id = NULL`; `search_tsv` vẫn đủ 33/33
- [ ] `GET /folders` trả số tài liệu đúng
- [ ] `GET /documents?folderId=none` trả đúng 33 tài liệu cũ
- [ ] Tên rỗng → 400/422 (theo khuôn validate của controller đó)
- [ ] `pnpm test` → 294 + test mới, `npx tsc --noEmit` sạch

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| `migrate dev` drop `search_tsv` | Viết tay + `migrate deploy`. Đã gặp 2 lần |
| Xoá folder để lại tệp mồ côi / node graph | Bước 3 viết test **trước**: `documents.remove()` phải được gọi từng tài liệu |
| Nhân bản logic xoá trong folder service | Gọi thẳng `DocumentsService.remove()`, không copy. Bản copy là bản quên `storage.remove()` |
| `buildWhere` là điểm chặn dùng chung cho cả list và export | Test cả hai đường; export ở `documents.controller.ts:49` dùng cùng hàm |
