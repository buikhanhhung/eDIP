---
phase: 3b
title: "Date From Question"
status: pending
priority: P2
dependencies: [3]
effort: "4-6h"
---

# Phase 3b: Bóc ngày từ câu hỏi

## Overview

Người dùng gõ *"tháng 3/2024 quy định cho vay thế nào"* → hệ thống tự dùng ngày 03/2024. **Không cần ô chọn ngày ở màn hỏi đáp.**

Đây là chỗ eDIP làm khác Silaw. Silaw dùng ô chọn ngày, và ngày đó **dính lại qua nhiều câu hỏi** — xem mục 15.3 của báo cáo brainstorm.

## Hành vi

```
Mặc định            →  asOf = hôm nay  (bản mới nhất)
Câu hỏi có ngày     →  dùng ngày đó ngay, không hỏi lại
Câu hỏi không ngày  →  giữ mặc định
```

## Luồng

```
Câu hỏi
  │
  ├─ Lọc trước bằng regex: có dấu hiệu thời gian?
  │   ngày · tháng · năm · trước · sau · hiện nay · bốn chữ số
  │
  ├── KHÔNG ──→ dùng hôm nay, KHÔNG gọi LLM     ← phần lớn câu hỏi
  │
  └── CÓ ─────→ gọi LLM bóc ngày
                 → { asOf, phrase, needsLookup }
```

Lọc trước **vì độ trễ**, không vì chi phí: thêm một lượt gọi tuần tự là thêm khoảng 0,5–1 giây cho mọi câu hỏi, kể cả câu không có ngày nào.

## Bốn quy tắc bắt buộc

| Quy tắc | Vì sao |
|---|---|
| Không có ngày → trả `null` | **Không được bịa.** `null` nghĩa là dùng mặc định |
| **Ngày đã dùng luôn hiện trên câu trả lời** | **Chặn duy nhất.** LLM bóc sai thì người dùng thấy ngay |
| Kiểm hợp lệ trước khi dùng | Ngày phải có thật, nằm trong khoảng dữ liệu kho có |
| **Bỏ qua số hiệu văn bản** | `39/2016` trong *"Thông tư 39/2016"* **không phải** ngày |

Quy tắc thứ hai thay cho bước xác nhận: không thêm cú bấm nào, nhưng nếu LLM đọc *"Thông tư 39/2016"* thành năm 2016 thì nhãn *"Hiệu lực tại 31/12/2016"* hiện ngay trên câu trả lời và người dùng nhận ra.

## Ba mức diễn đạt

| Người dùng gõ | Xử lý |
|---|---|
| `01/03/2024` · `tháng 3/2024` · `năm 2022` · `hiện nay` | LLM trả ngày ngay |
| *"trước khi TT 06 có hiệu lực"* | LLM trả `needsLookup` + tên văn bản → **tra DB** lấy ngày hiệu lực, trừ một ngày |
| *"lúc ký hợp đồng này"* | Trả `null`, rơi về mặc định |

Mức hai đáng làm vì **cả hai bước đều xác định được**: LLM chỉ nhận diện tên văn bản, còn ngày thì lấy từ bảng — không có chỗ để bịa.

## Ô chọn ngày

Chỉ ở **màn xem nội dung văn bản** — nơi người dùng đang *duyệt* văn bản tại một thời điểm, không có câu hỏi nào để bóc ngày ra. Màn hỏi đáp không cần.

## Success Criteria

- [ ] *"tháng 3/2024 quy định thế nào"* → trả lời theo 03/2024
- [ ] Câu hỏi không có ngày → **không gọi LLM**, dùng hôm nay
- [ ] *"Thông tư 39/2016 nói gì"* → **không** bị hiểu thành năm 2016
- [ ] Ngày as-of hiện trên **mọi** câu trả lời
- [ ] Ngày ngoài khoảng dữ liệu → cảnh báo, không trả lời im lặng
- [ ] *"trước khi TT 06 có hiệu lực"* → tra DB ra 31/08/2023

## Điều sẽ đảo ngược phase này

Nếu sau GĐ 1 thấy **phần lớn** câu hỏi thật là về ngày quá khứ *(rà soát hợp đồng cũ)* thì ô chọn ngày nên là chính, vì đặt một lần rồi hỏi hàng loạt tiện hơn gõ ngày vào từng câu. Lúc đó phase này thu lại thành một ô chọn đơn giản, 2h thay vì 6h.
