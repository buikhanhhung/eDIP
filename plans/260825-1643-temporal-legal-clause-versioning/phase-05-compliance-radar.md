---
phase: 5
title: "Compliance Radar"
status: pending
priority: P3
dependencies: [4]
effort: "14-18h"
---

# Phase 5: Quét đối chiếu và đồ thị

> Phase cuối, và là phase **hoãn được lâu nhất**. Chi tiết viết sau khi GĐ 3 chạy thật.

## Overview

Hai việc gộp làm một, vì đồ thị chỉ thật sự cần cho phần đối chiếu:

1. **Quét đối chiếu** — quy chế nội bộ có còn khớp văn bản nhà nước không
2. **Đồ thị văn bản** — để duyệt ngược quan hệ và hiển thị

## Vì sao đồ thị nằm ở đây, không ở phase sớm

**Đồ thị không biết cái nào mới nhất.** Nó không giữ nội dung, không giữ khoảng hiệu lực, không giữ trạng thái. Nếu bảng `provisions` đã ghi *"bị ngưng bởi TT 10/2023"* thì trả lời **không cần đồ thị** — đọc một hàng là xong.

Đồ thị chỉ cần cho hai việc, và cả hai đều ở phase này:

- **Phân tích tác động ngược**: *"TT 39 đổi thì quy chế nội bộ nào bị ảnh hưởng"* — duyệt ngược cạnh căn cứ
- **Hiển thị** sơ đồ chuỗi sửa đổi

Cạnh đồ thị **chiếu ra từ bảng `provisions`** *(mỗi hàng đã mang `source_doc`)*, không cần bảng quan hệ riêng.

## Ba mức phát hiện

| Mức | Cách | Cần LLM? | Độ tin |
|---|---|:-:|:-:|
| **1. Cứng** | Quy chế nội bộ căn cứ vào điều khoản nay `expired`/`suspended` | ❌ một câu JOIN | Chắc chắn |
| **2. Lệch thời gian** | Điều khoản bị sửa **sau** ngày ban hành quy chế | ❌ so ngày | Chắc chắn |
| 3. Ngữ nghĩa | Nội dung nội bộ mâu thuẫn nhà nước hiện hành | ✅ | Thấp |

**Vòng này chỉ làm mức 1 và 2.** Chúng suy ra từ dữ liệu, không có chỗ cho LLM bịa — và đó chính là thứ Silaw khoe: *"Quy trình tín dụng nội bộ lệch với TT 39/2016"*.

Mức 3 là phần nghe hay nhất khi demo và sai nhiều nhất khi dùng thật. Để vòng sau.

## Bảng mới

`doc_references` — *"Quy chế nội bộ căn cứ TT 39"* là **trích dẫn**, không phải thay đổi, nên không nằm được trong bảng mốc. Cần để duyệt ngược.

## Tách thành hệ con — học theo Silaw

| Endpoint | Việc |
|---|---|
| `radar/config` | Cấu hình quét, **lưu lại được** |
| `radar/scan` | Chạy một lượt quét |
| `radar/scans` | Lịch sử báo cáo, mỗi báo cáo có mã |

Quyền **xem báo cáo** tách khỏi quyền **sửa cấu hình** — Silaw có `radar_view` và `radar_config` riêng.

## Nhân đây sửa bug đang có

**FalkorDB thiếu `error` handler** — một socket rớt giết cả API. Đã xảy ra hai lần khi test tay. Trái với chính comment trong `falkordb.service.ts` nói rằng graph hỏng không được làm sập API *(vì graph là tính năng phụ, còn login/library/search thì không)*.

Sửa mất khoảng 30 phút, nhưng **nên làm ngay, không đợi phase này** — nó đang làm sập API thật.

## Success Criteria

- [ ] Quy chế nội bộ căn cứ khoản đã `suspended` → hiện trong báo cáo, mức "cứng"
- [ ] Điều khoản bị sửa sau ngày ban hành quy chế → mức "lệch thời gian"
- [ ] Báo cáo xuất được, có mã, có lịch sử
- [ ] Quyền xem báo cáo tách khỏi quyền sửa cấu hình
- [ ] Đồ thị hiện chuỗi TT 39 ← TT 06 ← TT 10
- [ ] Duyệt ngược: chọn TT 39 → ra danh sách quy chế nội bộ bị ảnh hưởng
- [ ] **FalkorDB rớt socket không làm sập API**
