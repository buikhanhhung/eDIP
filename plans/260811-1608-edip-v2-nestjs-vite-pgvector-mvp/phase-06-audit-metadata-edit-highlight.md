---
phase: 6
title: "Audit Metadata Edit Highlight"
status: pending
priority: P2
dependencies: [4, 5]
effort: "1.25h"
---

# Phase 6: Audit Metadata Edit Highlight

> **Sửa sau red-team.** Highlight giờ chạy được **ngay từ dữ liệu seed** — phase 2 đã tính `charStart`/`charEnd` bằng `indexOf` cho 59 entity. Bản đầu để offset phụ thuộc phase 3/5, nên nếu 2 phase đó chưa xong thì highlight không có gì để vẽ. Thêm ghi chú thứ tự xoá DB/đĩa.

## Overview

Ba việc còn thiếu để đủ **6 bước demo flow** trong đề: audit log, sửa metadata khi AI sai, và highlight đoạn nguồn của từng field trích được.

Highlight là thứ biến "AI nói vậy" thành "AI chỉ được chỗ nó lấy" — rẻ (offset đã có sẵn từ seed phase 2) và ăn điểm nhất khi demo.

## Requirements

- Functional: mọi hành động (upload/view/edit/delete/search/ask) ghi audit; `GET /audit` chỉ admin.
- Functional: `PATCH /documents/:id/metadata` — admin sửa được, có attribution (`metadataEditedById` + `metadataEditedAt`).
- Functional: click field metadata trên detail → highlight đúng đoạn trong `textContent`.
- Non-functional: ghi audit **không** làm fail request chính nếu lỗi.

## Architecture

```
common/interceptors/audit.interceptor.ts   ← ghi audit theo decorator @Audit('action')
features/audit/                            ← controller + service, chỉ đọc
features/documents/                        ← PATCH metadata + re-derive entity
frontend/components/documents/
  metadata-panel.tsx                       ← edit inline
  text-preview.tsx                         ← render <mark> theo charStart/charEnd
```

## Related Code Files

- Create: `$ROOT/nestjs-backend/src/common/decorators/audit.decorator.ts`
- Create: `$ROOT/nestjs-backend/src/common/interceptors/audit.interceptor.ts`
- Create: `$ROOT/nestjs-backend/src/features/audit/{audit.module.ts,audit.controller.ts,audit.service.ts}`
- Modify: `$ROOT/nestjs-backend/src/features/documents/documents.controller.ts` (`PATCH /:id/metadata`, `DELETE /:id`)
- Create: `$ROOT/frontend/src/pages/audit.tsx`
- Create: `$ROOT/frontend/src/components/documents/{metadata-panel.tsx,text-preview.tsx}`
- Port từ `$V1`: hành vi "re-derive entity sau khi user sửa metadata" (xem `$V1/docs/feature-status.md` mục sửa metadata)

## Implementation Steps

### 1. Audit log (~20 phút)

Decorator + interceptor, không rải `auditService.log()` khắp nơi:

```ts
@Audit('document.upload')
@RequirePermission('upload')
@Post()
upload(...) { ... }
```

Interceptor lấy `actorId` từ request, `targetId` từ response (`.id`) hoặc param, ghi sau khi handler thành công.

**Ghi audit bọc try/catch, nuốt lỗi.** Log hỏng không được làm hỏng upload.

Ghi cho: `document.upload`, `document.view`, `document.edit-metadata`, `document.delete`, `document.download`, `search.query`, `ask.query`.

`meta` (jsonb) lưu thêm ngữ cảnh: với search/ask lưu `{ q }` — demo cho thấy ai hỏi gì.

`GET /audit` — `@RequirePermission('audit')` → chỉ admin. Phân trang đơn giản `?take=50&skip=0`, sắp `createdAt DESC`.

### 2. Sửa metadata (~20 phút)

`PATCH /documents/:id/metadata`:
- `@RequirePermission('edit-metadata')` → chỉ admin
- Body zod: `{ title?, documentType?, parties?, date?, amount?, keywords? }`
- Ghi `metadataEditedById` + `metadataEditedAt`
- **Re-derive entity từ nội dung user vừa sửa** (hành vi v1): xoá `DocumentEntity` của document, upsert lại từ `parties` mới → graph cập nhật theo. Người sửa sai của AI thì graph phải theo người, không theo AI.

Set `typeConfidence = 1.0` khi user sửa `documentType` — người sửa là chắc chắn.

`DELETE /documents/:id` — `@RequirePermission('delete')`, xoá cascade (`embedding_chunks`, `DocumentEntity` đều `onDelete: Cascade`) + xoá file trên đĩa.

**Thứ tự: DB trước, đĩa sau.** Xoá đĩa trước rồi DB fail → row trỏ tới file không tồn tại, mọi lần đọc sau đó ném lỗi. Xoá DB trước rồi đĩa fail → thừa một file mồ côi, vô hại. Bọc bước xoá đĩa trong try/catch, log warning, **không** ném lỗi ngược ra response.

### 3. Highlight đoạn nguồn (~20 phút)

Offset đã có sẵn trong `DocumentEntity.charStart/charEnd` — **tính ở seed phase 2** bằng `indexOf` trên đúng chuỗi `textContent` lưu DB, và tính lại cùng cách cho tài liệu upload mới ở phase 3. Nghĩa là highlight chạy được kể cả khi phase 3 và 5 chưa hoàn tất.

`GET /documents/:id` trả kèm `entities: [{ type, mentionText, charStart, charEnd }]`.

`text-preview.tsx`:
```ts
// sắp offset tăng dần, không chồng lấn, cắt chuỗi rồi bọc <mark>
// KHÔNG dùng regex replace trên text — sẽ highlight nhầm mọi lần xuất hiện
```

Tương tác: hover field trong metadata panel → `<mark>` tương ứng đổi màu + `scrollIntoView`. Màu theo `entity.type` (company/person/date/amount).

Field nào không có offset → không highlight, không báo lỗi. Đây là suy giảm mềm, không phải bug.

### 4. FE `/audit` (~10 phút)

Bảng đơn giản: thời gian · actor email · action · target (link sang document nếu có) · meta. Chỉ hiện trong nav khi role là admin — nhưng chặn thật ở API.

## Success Criteria

**Phase này đạt đủ, không cần credential.**

- [x] Search → row `search.query` với `meta.q` đúng câu đã gõ; Ask → row `ask.query`
- [x] `GET /audit` bằng `user` → **403**; bằng `admin` → danh sách kèm actor email + role
- [x] `PATCH /documents/:id/metadata` bằng `user` → **403**; `DELETE` bằng `user` → **403**
- [x] Sửa `parties` trên MSA → `metadataEditedAt` set, `typeConfidence` lên 1, và **liên kết công ty dựng lại đúng**: `Ecloudvalley Vietnam Ltd` rời khỏi tài liệu, `Bên thứ ba mới` vào — trong khi person/date/amount/project **giữ nguyên**
- [x] `DELETE /documents/:id` → document biến khỏi library và graph, `DocumentEntity` cascade về 0, file trên đĩa bị xoá
- [x] Detail page render 7 `<mark>` theo offset của seed — highlight chạy **không cần** phase 3/4
- [ ] Upload 1 file → row `document.upload` — *audit đã gắn `@Audit`, nhưng upload chỉ chạy trọn khi có credential*
- [ ] Hover field `parties` → highlight đúng mention — *code xong, chưa hover thử trong trình duyệt*
- [ ] Cố tình làm audit lỗi → request chính vẫn thành công — *đã bọc `.catch()` và không `await`; chưa dựng kịch bản lỗi để chứng minh*

## Deviation Log (11/08)

| Điểm | Kế hoạch | Thực tế | Lý do |
|---|---|---|---|
| Re-derive entity sau khi sửa metadata | xoá **toàn bộ** `DocumentEntity` của document rồi upsert lại từ `parties` | chỉ thay liên kết loại `company` | Xoá sạch sẽ mất person, department, project, date, amount — những thứ người sửa `parties` không hề đụng tới. Ý định của v1 là "graph theo người, không theo AI", không phải "sửa một trường thì mất mọi trường" |
| Ghi audit | service gọi rải rác | decorator `@Audit` + một interceptor toàn cục | Tên hành động nằm cạnh quyền của chính route đó; route không thể ghi nửa vời khi return sớm |
| `meta` của audit | `{ q }` cho search/ask | `{ q }` cắt 500 ký tự, chỉ khi body có trường `q` | Body upload là cả tệp; không có gì bảo vệ nếu cứ ghi nguyên body |

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| Highlight lệch do offset tính trên text đã normalize | Offset xác minh bằng `indexOf` trên **đúng** chuỗi `textContent` lưu DB (phase 2 cho seed, phase 3 cho upload mới). Không normalize lại khi render |
| Regex replace highlight nhầm mọi lần xuất hiện | Cắt chuỗi theo offset, không dùng replace. Ghi rõ trong code |
| Audit interceptor làm chậm mọi request | Ghi async, không `await` trong đường trả về; nuốt lỗi |
| Re-derive entity xoá nhầm entity của document khác | Chỉ xoá `DocumentEntity` theo `documentId`; `Entity` mồ côi để lại, vô hại |
| Phase này bị cắt vì hết giờ | Ưu tiên trong phase: **audit log → sửa metadata → highlight**. Highlight là thứ đẹp nhất nhưng bỏ được |
