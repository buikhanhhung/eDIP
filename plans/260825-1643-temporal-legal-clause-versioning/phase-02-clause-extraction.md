---
phase: 2
title: "Clause Extraction"
status: pending
priority: P1
dependencies: [1]
effort: "10-16h"
---

# Phase 2: Tách điều khoản

> ⚠️ **Phase này chỉ chi tiết được sau GĐ 0.** Số liệu đo ở GĐ 0 quyết định đi hướng agent hay hướng luật, và hai hướng khác nhau về gần như mọi thứ — số giờ, file phải tạo, cách kiểm.

## Overview

Thêm **một bước** vào `ingest.consumer.ts`, sau khi trích text:

```
trích text → [MỚI] tách điều khoản → chunking → nhúng
```

Đầu ra: danh sách `(path, kind, number, title, text)` cho mỗi văn bản có `docScope`.

## Hai hướng — chọn theo GĐ 0

### Hướng A — Agent LLM

Một lượt gọi trên Markdown, trả JSON danh sách điều khoản. Ưu: chịu được văn phong lạ, ít code. Nhược: không kiểm được bằng máy, tốn token mỗi tài liệu.

### Hướng B — Ngăn xếp + bảng dấu hiệu

```
cấp 1:  ^Điều\s+(\d+)\.       cấp 2:  ^(\d+)\.\s       cấp 3:  ^([a-zđ])\)\s
```

Cấp bậc suy từ **loại dấu hiệu**, không từ giá trị số. Đổi loại tài liệu = đổi bảng, thuật toán không đổi.

**Ba phép kiểm bằng máy** — thứ hướng A không có:

| Kiểm | Bắt được |
|---|---|
| Số tăng liên tục trong cùng cha | `1,2,3,5` → OCR mất số 4 |
| Không nhảy cấp | `Điều 8` → thẳng `a)` |
| Ghép text các mục ≈ text gốc | Đoạn bị nuốt |

Chỗ trượt kiểm → `needsReview`, chỉ chỗ đó, không phải cả tài liệu.

## Bẫy phải nhớ

**Dòng không phải marker vẫn phải giữ.** Trong:

```
Điều 8. Những nhu cầu vốn không được cho vay
Tổ chức tín dụng không được cho vay đối với các nhu cầu vốn:     ← KHÔNG phải marker
1. Để thực hiện các hoạt động đầu tư kinh doanh...
```

Thiếu dòng giữa thì `1. Để thực hiện đầu tư...` **mất nghĩa hoàn toàn** — không biết được hay không được. Dòng không phải marker luôn gán vào **mục đang mở**, và khi trả lời phải đưa kèm *(đúng ca `PARENT_CHILD` giải)*.

## Chunking — sửa 2 chiến lược đã có, không viết mới

| Chiến lược | Thay đổi |
|---|---|
| `DOCUMENT_STRUCTURE` | Đọc ranh giới từ điều khoản thay vì tự dò heading. Khoản dài thì cắt tiếp như đang làm |
| `PARENT_CHILD_MARKDOWN` | Giải ca *khoản quá ngắn*: nhúng khoản, trả về cả Điều |
| `RECURSIVE_CHARACTER` | Giữ nguyên, đường lùi |
| `SEMANTIC` | **Không dùng** cho văn bản có `docScope` — ranh giới đúng là ranh giới **pháp lý**, không phải ngữ nghĩa |

Dialog chọn chiến lược cần biết `docScope` để khoá `SEMANTIC` lại.

## Files (dự kiến)

**Create** — `src/features/ingestion/services/clause-parser/` với một file cho mỗi bộ đọc *(hướng B)*, hoặc một file agent *(hướng A)*

**Modify** — `ingest.consumer.ts` · `chunking/document-structure.strategy.ts` · `chunking/parent-child-markdown.strategy.ts` · `frontend/.../chunking-strategy-dialog.tsx`

## Success Criteria

- [ ] Văn bản có `docScope` → tách ra điều khoản có `path` đúng, đo trên bộ 20–30 văn bản của GĐ 0
- [ ] Dòng dẫn của `Điều` không bị mất
- [ ] Bảng, phụ lục, ảnh **không** vào tầng điều khoản ở vòng này *(hoãn — xem plan.md)*
- [ ] Tài liệu không có `docScope` → chunking y như hôm nay
- [ ] `SEMANTIC` bị khoá với văn bản có `docScope`
- [ ] Chỗ trượt kiểm → `needsReview`, không âm thầm bỏ qua
