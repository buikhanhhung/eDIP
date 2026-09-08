---
phase: 0
title: "Measure Before Building"
status: pending
priority: P1
dependencies: []
effort: "8h (không code)"
---

# Phase 0: Đo trước khi xây

## Overview

Hai việc đo, **không viết dòng code nào**. Mỗi việc có thể cắt bớt cả ngày làm, nên làm trước tất cả.

Đây là phase duy nhất có thể **xoá hẳn một phase khác**.

## Việc 1 — Kiểm "văn bản hợp nhất" của NHNN (4h)

### Cần trả lời

| Câu | Vì sao quan trọng |
|---|---|
| NHNN có công bố **văn bản hợp nhất** không? | Đó là bản đã ghép sẵn mọi sửa đổi |
| Ở dạng gì — PDF, DOC, HTML, hay API? | Quyết định có tải về hàng loạt được không |
| Có bao nhiêu văn bản trong lĩnh vực cần? | Quy mô thu thập |
| Bản hợp nhất có ghi **ngày hiệu lực từng khoản** không? | Nếu có thì bỏ luôn cả việc suy hiệu lực |

### Cách làm

1. Vào `vbpl.vn/nganhangnhanuoc` và cổng NHNN, tìm mục văn bản hợp nhất
2. Tải 3–5 bản hợp nhất thật, mở ra xem cấu trúc
3. Đối chiếu một bản hợp nhất với văn bản gốc + văn bản sửa đổi tương ứng — xem nó đã ghép đủ chưa
4. Ghi lại: định dạng, có đánh dấu phần nào bị sửa không, có ngày hiệu lực không

### Kết quả có thể

| Nếu | Hệ quả |
|---|---|
| **Có bản hợp nhất dùng được** | **Xoá GĐ 4** *(12–16h)* — không cần đọc lệnh sửa đổi nữa, chỉ cần trục thời gian |
| Có nhưng thiếu ngày hiệu lực từng khoản | Vẫn cần GĐ 4 nhưng nhẹ hơn — chỉ suy ngày, không suy nội dung |
| Không có, hoặc chỉ có PDF scan | Làm đủ GĐ 4 |

## Việc 2 — Đo hai hướng lấy `path` và lệnh sửa đổi (4h)

### Chuẩn bị

Lấy **20–30 thông tư thật**, trong đó ít nhất 10 là **thông tư sửa đổi** *(tiêu đề có "Sửa đổi, bổ sung" hoặc "Ngưng hiệu lực")*.

Tự tay ghi ra đáp án đúng cho mỗi văn bản: danh sách điều khoản, và với văn bản sửa đổi thì danh sách lệnh *(thao tác, văn bản đích, khoản đích, ngày hiệu lực)*.

### Hai hướng cần đo

**Hướng A — Agent:** một lượt gọi LLM trên text, yêu cầu trả JSON gồm điều khoản và lệnh.

**Hướng B — Luật:** ngăn xếp + bảng dấu hiệu cho `path`; đọc cây của văn bản sửa đổi cho lệnh.

```
cấp 1:  ^Điều\s+(\d+)\.
cấp 2:  ^(\d+)\.\s
cấp 3:  ^([a-zđ])\)\s
```

### Đo gì

| Chỉ số | Cách tính |
|---|---|
| **Tỷ lệ `path` đúng** | Số điều khoản tách đúng / tổng số điều khoản thật |
| **Tỷ lệ lệnh đúng** | Số lệnh đúng cả 4 thành phần / tổng số lệnh thật |
| Tỷ lệ bỏ sót | Điều khoản/lệnh có thật mà không tách ra được |
| Tỷ lệ bịa | Điều khoản/lệnh tách ra mà không có thật |
| *(Hướng A)* Chi phí + độ trễ | Token và giây cho mỗi văn bản |

### Ngưỡng quyết định

| Kết quả | Chọn |
|---|---|
| Hướng B ≥ 90% trên `path` | **Hướng B** — rẻ, xác định, kiểm được bằng máy |
| Hướng B 70–90%, hướng A cao hơn rõ | **Hướng A**, hoặc B trước + A cho phần trượt |
| **Cả hai < 80% trên lệnh sửa đổi** | Việc duyệt tay nặng hơn lợi ích → **xem lại cả hướng tiếp cận**. Ưu tiên việc 1 |

### Vì sao phải đo, không suy

Silaw **từng có** hai bước xác định *(`parse_structure`, `extract_change_events`)* rồi **bỏ**, thay bằng một bước agent. Không rõ vì cách xác định thất bại hay chỉ gộp cho gọn.

Suy từ việc người khác bỏ bước nào là suy đoán. Đo trên dữ liệu của mình là dữ kiện.

## Success Criteria

- [ ] Trả lời được: NHNN có văn bản hợp nhất dùng được hay không, kèm 3–5 mẫu đã xem
- [ ] Có bảng số: tỷ lệ `path` đúng và tỷ lệ lệnh đúng cho **cả hai** hướng, trên ≥ 20 văn bản
- [ ] Chốt được hướng cho GĐ 2, có số liệu kèm theo
- [ ] Chốt được GĐ 4 có cần làm hay không
- [ ] Ghi kết quả vào `plans/reports/` để GĐ 2 và 4 tham chiếu

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| Không tìm đủ 20–30 thông tư | Giảm còn 10, nhưng phải có ít nhất 5 văn bản sửa đổi — đó là ca khó |
| Đáp án tự ghi bị sai | Ghi trước khi chạy hai hướng, không sửa sau khi thấy kết quả |
| Chọn văn bản toàn dạng dễ | Cố tình lấy vài bản PDF scan và vài bản đánh số lộn xộn |
| Đo xong vẫn không rõ | Ngưỡng đã định trước ở bảng trên — không đổi ngưỡng sau khi thấy số |
