# Mổ xẻ video eDGR → khung xương + ánh xạ nội dung eDIP

Nguồn: `PROJECTS/EDIP/video/edgr-video-v2_2026-04-17_17-17-27.mp4` — 108 giây, 1920×1080@60, h264+AAC
Phân tích: Gemini 2.5-flash (`gemini-3.1-pro` và `2.5-pro` đều không khả dụng ở free tier)
Bản đầy đủ: `scratchpad/edgr-teardown-raw.md` (223 dòng)

---

## 1. Khung xương 9 nhịp

| # | Nhịp | Thời lượng | % | Việc nó làm |
|---|---|---|---|---|
| 1 | Hook & Problem | 0:00–0:21.2 | 21.2s | **19.6%** | Ném số gây sốc, nêu nỗi đau |
| 2 | Product Reveal | 0:21.2–0:29.4 | 8.2s | 7.6% | Lộ diện sản phẩm trên nền tối |
| 3 | Credibility | 0:29.4–0:43.9 | 14.5s | 13.4% | Uy tín công ty mẹ |
| 4 | Platform Overview | 0:43.9–0:54.1 | 10.2s | 9.4% | 3 mockup UI nghiêng, toàn cảnh |
| 5 | Feature 01 | 0:54.1–1:07.4 | 13.3s | 12.3% | Tính năng 1 + UI minh hoạ |
| 6 | Feature 02 | 1:07.4–1:21.1 | 13.7s | 12.7% | Tính năng 2 + biểu đồ dữ liệu |
| 7 | Feature 03 | 1:21.1–1:31.7 | 10.6s | 9.8% | Tính năng 3 + 2 UI song song |
| 8 | Results | 1:31.7–1:42.5 | 10.8s | 10.0% | 4 thẻ số liệu |
| 9 | Brand & CTA | 1:42.5–1:48.0 | 5.5s | 5.1% | Logo + tagline + domain |

**Tỷ lệ đáng học**: gần **20% cho phần nêu vấn đề** trước khi lộ sản phẩm. Ba tính năng chiếm 34.8%. Kết rất gọn, chỉ 5.5s.

---

## 2. ⭐ Phát hiện quyết định: eDGR KHÔNG quay demo

Toàn bộ giao diện trong video là **mockup trình duyệt đặt nghiêng, có phối cảnh và đổ bóng**, với các phần tử được animate bên trong — không có một đoạn screen-recording nào. Camera **đứng yên gần như tuyệt đối**; chuyển động nằm ở các phần tử trong khung.

→ Khớp chính xác với yêu cầu "bật app quay UI nhưng không quay demo chức năng". Việc cần làm là **chụp ảnh tĩnh** các màn eDIP rồi dựng thành mockup nghiêng, không phải quay video thao tác.

---

## 3. Ngôn ngữ hình ảnh

| | |
|---|---|
| Nền | Kem/trắng ngà `#F9F7F0` + lưới mờ rất nhạt |
| Chữ chính | Xám than `#2B2B2B` |
| Nhấn ấm | Cam `#FF8800` — logo, số liệu, từ khoá |
| Nhấn phụ | Đỏ-cam `#E54040` — nhãn mục ("FEATURE 01") |
| Tích cực | Xanh lá `#4CAF50` — dùng rất tiết chế |
| Nền product reveal | Xám đậm + mạng lưới điểm-đường động |
| Chữ thân | Sans-serif (kiểu Lato/Open Sans), nhiều độ đậm |
| Chữ logo | **Serif** (kiểu Playfair Display) — tương phản có chủ ý với sans |
| Chuyển động | Dứt khoát, trượt/pop/fade, tăng-giảm tốc nhanh |
| Chuyển cảnh | **Gần như toàn bộ là cut thẳng** — chỉ 3 chỗ fade |

## 4. Âm thanh

Nhạc corporate lạc quan, ~100–110 BPM, synth pad + piano staccato + pizzicato + gõ nhẹ. Gemini đánh giá là **nhạc thư viện do người sản xuất**, không phải AI sinh. Đường năng lượng: dịu ở phần vấn đề → hụt xuống rồi dâng lên ở product reveal → giữ đều qua các tính năng → dâng khải hoàn ở phần kết quả → đỉnh rồi fade.

SFX dày và có quy luật: *whoosh* cho chữ lớn, *pop/thud* cho thẻ và mockup trượt vào, *click* nhỏ cho từng dòng chữ phụ, *chime* cho logo và cho thanh biểu đồ chạy.

## 5. Giọng đọc

Nam, rõ, chuyên nghiệp, tốc độ vừa, **giọng Đông Nam Á rất trung tính**. Tổng ~**200 từ / 108 giây**.

---

## 6. Ánh xạ sang eDIP

Ba món dùng lại được **nguyên vẹn** vì cùng công ty:

- **Nhịp 3 (Credibility)** — 600+ cloud experts · 10 countries · 1,800+ enterprise clients · founded 2013 · "Asia Pacific's Leading Cloud Company". Copy y nguyên, đổi 0 chữ.
- **Toàn bộ bảng màu và typography.**
- **Cấu trúc SFX và đường năng lượng nhạc.**

Ánh xạ nội dung đề xuất:

| Nhịp eDGR | Nội dung eDIP thay vào | Nguồn |
|---|---|---|
| 1. Hook | Nhân viên mất 2 giờ/ngày tìm tài liệu · xử lý 1 tài liệu mất 15 phút | BOX §3 |
| 2. Reveal | eDIP — Document Intelligence Platform | — |
| 3. Credibility | **giữ nguyên eDGR** | eDGR |
| 4. Overview | 3 mockup: Library · Document Detail · Knowledge Graph | chụp từ app |
| 5. Feature 01 | Nạp & hiểu tài liệu — OCR đa ngôn ngữ, phân loại tự động | BOX §1 |
| 6. Feature 02 | Hỏi đáp có trích dẫn nguồn | BOX §1 |
| 7. Feature 03 | Bảo mật & tuân thủ — RBAC, mã hoá, audit log | BOX §1 |
| 8. Results | 15 phút→2 phút · 7× thông lượng · −60–70% nhập liệu · 2 giờ/ngày | BOX §3 |
| 9. CTA | eDIP + tagline + liên hệ | cần chốt |

**Về "Powered by AWS Bedrock"**: eDGR nói đúng câu này ở 01:16. Nên eDIP nêu Bedrock là nhất quán với video anh em, không lệch.

**Về rủi ro số liệu** (nêu ở báo cáo Bước 1): eDGR cũng dùng 4 thẻ số cứng (70% time saved, 3x capacity, $84K savings, +50% reply rate). Có tiền lệ trong chính ECV → khuyến nghị theo cùng cách, chọn 4 con số dễ tin nhất và tránh phần quy ra tiền chưa có căn cứ.

---

## Câu hỏi còn treo

1. Tagline cho eDIP? eDGR dùng *"The Future of Outbound Sales"* + `eDGR.io`.
2. CTA cuối: domain, email, hay logo suông?
3. Ba tính năng chọn như bảng trên có đúng ý không?
4. Nhạc: eDGR dùng nhạc thư viện người làm. Ta có HeyGen (thư viện) hoặc Lyria (AI sinh) — chọn HeyGen sẽ gần eDGR hơn.
