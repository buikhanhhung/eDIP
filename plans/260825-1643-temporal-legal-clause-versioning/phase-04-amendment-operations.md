---
phase: 4
title: "Amendment Operations"
status: pending
priority: P2
dependencies: [3]
effort: "12-16h"
---

# Phase 4: Đọc và áp lệnh sửa đổi

> ⚠️ **Phase này có thể bị XOÁ HẲN sau GĐ 0.** Nếu NHNN công bố văn bản hợp nhất dùng được thì không cần đọc lệnh sửa đổi nữa — nạp thẳng bản đã ghép sẵn. Tiết kiệm 12–16h, và bỏ luôn phần rủi ro nhất của cả plan.
>
> Chi tiết đầy đủ chỉ viết sau khi GĐ 0 chốt hướng.

## Overview

```
văn bản sửa đổi → đọc ra lệnh → kiểm bằng máy
                → lệnh không chắc → NGƯỜI duyệt
                → áp lệnh (đóng hàng cũ, chèn hàng mới)
                → nhúng lại ĐÚNG phần đổi
```

## Phát hiện then chốt

> **Mục lục của văn bản sửa đổi *chính là* danh sách lệnh.**

GĐ 2 đã làm gần hết việc — dùng lại y nguyên bộ tách điều khoản, không viết bộ thứ hai. Mỗi mục con của `Điều 1` là một lệnh.

## Hai loại lệnh

| Có nội dung mới | Không có nội dung |
|---|---|
| `replace`, `add` | `suspend`, `revoke`, `resume` |
| Phải bóc text **trong ngoặc kép** | Chỉ cần biết nhắm vào đâu — **dễ hơn** |

Ngoặc kép là mỏ neo đáng tin nhất *(quy ước soạn thảo VN)*, và cho một phép kiểm miễn phí: nội dung phải **mở đầu bằng chính số khoản**.

## Năm phép kiểm bằng máy

| Kiểm | Bắt được |
|---|---|
| `replace` → khoản đích **phải tồn tại** | Sai số điều/khoản |
| `add` → khoản đích **phải chưa tồn tại** | Nhầm thao tác |
| Nội dung mới mở đầu bằng số khớp đích | Lệch ghép nội dung với mục tiêu |
| Số lệnh = số mục con của `Điều 1` | Bỏ sót lệnh |
| **Sau khi áp**: `Điều 8` có khoản `1..10` liên tục | Áp sai chỗ, tạo lỗ |

Phép cuối hay nhất: kiểm **sau khi** áp, bắt kết quả vô lý mà từng lệnh riêng lẻ trông vẫn hợp lệ.

## Lưu lệnh, không chỉ lưu kết quả

Hai chuyện xảy ra thật:

- **Văn bản đến không đúng thứ tự** — nạp TT 10 *(ngưng)* trước TT 06 *(bổ sung)*. Áp theo thứ tự nạp là sai
- **Phát hiện đọc sai sau ba tháng** — chỉ lưu kết quả thì không sửa được, vì không biết kết quả từ đâu ra

Có nhật ký lệnh thì sắp lại theo ngày hiệu lực và dựng lại bảng — giống migration của database. Kèm lợi ích: luôn trả lời được *"vì sao bảng ghi thế này"*.

## Năm ca sẽ vấp

| Ca | Xử lý |
|---|---|
| OCR mất dấu ngoặc kép | Không biết nội dung kết thúc đâu → đẩy duyệt |
| Một thông tư sửa **nhiều** thông tư | Đọc văn bản đích theo **từng Điều**, không lấy một lần cho cả văn bản |
| Sửa cấp câu chữ *("thay cụm từ X bằng Y")* | Tạo bản mới của **cả khoản**, không lưu diff → luôn duyệt |
| *"Bãi bỏ các Điều 5, 6, 7 và khoản 3 Điều 8"* | Một câu sinh **nhiều** lệnh |
| Văn bản đích chưa có trong kho | Lệnh ở trạng thái **chờ**, tự áp khi nạp văn bản kia |

## Màn duyệt

Hiện **cũ / mới cạnh nhau**, người bấm xác nhận từng lệnh trượt kiểm. Người **không phải đọc cả văn bản** — chỉ nhìn những lệnh máy không chắc.

## Success Criteria

- [ ] Nạp TT 06/2023 → sinh đúng 3 lệnh `add` cho khoản 8.8, 8.9, 8.10
- [ ] Nạp TT 10/2023 → sinh lệnh `suspend`, khoản 8.9 đổi trạng thái
- [ ] **Chỉ 3 khoản bị nhúng lại**, không nhúng lại cả thông tư
- [ ] Lệnh trượt kiểm → trạng thái cần duyệt, **không tự áp**
- [ ] Nạp lộn thứ tự → kết quả vẫn đúng sau khi áp theo ngày hiệu lực
- [ ] Sửa một lệnh đọc sai rồi dựng lại → bảng về đúng trạng thái
- [ ] Văn bản đích chưa có trong kho → lệnh chờ, không lỗi
