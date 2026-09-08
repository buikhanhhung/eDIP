# Video giới thiệu eDIP — hoàn thành

**Bản giao**: `PROJECTS/EDIP/video/edip-promo/renders/eDIP-promo-1080p.mp4`
1920×1080 · 30fps · 108.000s · 8.8 MB · H.264 + AAC · −16.2 LUFS

---

## 1. Cấu trúc — 9 nhịp sao theo eDGR

| # | Nhịp | Thời lượng | Nội dung eDIP |
|---|---|---|---|
| 1 | Hook & Problem | 21.2s | 2 giờ/ngày · 15 phút/tài liệu · 60–70% thủ công |
| 2 | Product Reveal | 8.2s | Nền tối, logo serif trên ô cam, *Stop searching. Start knowing.* |
| 3 | Credibility | 14.5s | **Giữ nguyên eDGR** — 600+ experts · 10 countries · 1,800+ clients · 2013 |
| 4 | Platform Overview | 10.2s | 3 mockup nghiêng: Library · Document Intelligence · Knowledge Graph |
| 5 | Feature 01 | 13.3s | Ingest & Understand — OCR đa ngôn ngữ, phân loại tự động |
| 6 | Feature 02 | 13.7s | Answers you can trust — hỏi đáp có trích dẫn, huy hiệu AWS Bedrock |
| 7 | Feature 03 | 10.6s | Knowledge graph — thực thể và quan hệ |
| 8 | Results | 10.8s | 4 thẻ: 15min→2 · 7× · ≤70% · 2 giờ/ngày |
| 9 | Brand & CTA | 5.5s | Logo + *The Future of Document Intelligence* + edip.io |

## 2. Tài sản

| | |
|---|---|
| Giọng đọc | ElevenLabs **Daniel** (Steady Broadcaster), 25 câu rời, 1.219 ký tự |
| Nhạc nền | HeyGen `Astral Generated Music: 42c7d4cd`, dựng lại thành bed 108.000s |
| Ảnh giao diện | 6 màn eDIP thật, chụp 3840×2160 → thu về 1920px |
| Nhận diện | `ecv-logo.png`, bảng màu eDGR |

**Bảng màu** (lấy từ teardown eDGR): nền `#F9F7F0` + lưới mờ · chữ `#2B2B2B` · nhấn `#FF8800` · nhãn mục `#E54040` · nền reveal `#2B2B2B`

## 3. Ba lần sửa nhờ đo được, không nhờ đoán

**a) 13/25 câu đè lên nhau.** Lời đọc v1 dài 106.9s trong video 108s — kín đặc, không có chỗ thở. Rút gọn 11 câu → **88.5s (82%), còn 19.5s cho nhạc**. Cũng phát hiện mốc từng câu Gemini bóc từ eDGR chỉ là xấp xỉ; chuyển sang bám 9 ranh giới chuyển cảnh (lấy từ shot list, đáng tin hơn) rồi rải câu theo thời lượng đo thật.

**b) Render đứng máy ở frame 68/300.** Ảnh 3840×2160 hiển thị trong khung 820px — Chrome giải mã 8,3 triệu điểm ảnh mỗi frame. Thu về 1920px là chạy trọn. Đây là lý do phải render thử 10 giây trước.

**c) Nhạc có arc ngược.** Track gốc tắt dần từ giây 80 (−25 → −34.5 dB), trong khi video cần dâng ở nhịp Results rồi đỉnh ở logo. Dựng lại: giữ 0–80s, nối đoạn 30–60s cho phần cuối, crossfade 2s. Kết quả: −19.7 → −16 → **−15.3 đỉnh** → −19.2 fade.

## 4. Chi phí

| | Đã dùng | Định mức |
|---|---|---|
| ElevenLabs | 1.531 ký tự | 10.000/tháng |
| Gemini | ~2 lượt | 1.500/ngày |
| HeyGen | 1 track | OAuth free |
| **Tiền mặt** | **0đ** | |

Render 2 phút 20 trên máy 7,7 GB RAM. Engine tự nhận máy yếu, ghim 1 worker, tái dùng 2.105/3.240 frame tĩnh.

## 5. Thay đổi mã nguồn eDIP

`nestjs-backend/src/features/ask/ask.service.ts` — prompt tiếng Việt → tiếng Anh, thêm chỉ thị luôn đáp tiếng Anh, thêm dòng ép mỗi id trích dẫn nằm trong ngoặc riêng.

**Chưa commit.** Đây là thay đổi hành vi thật của sản phẩm, không phải mẹo cho video.

Cũng đã xoá 8 tài liệu dính danh tính khỏi DB (CV, bảng điểm, chứng chỉ, đơn thực tập, ảnh không phù hợp) và nạp 10 hồ sơ demo doanh nghiệp tiếng Anh. **8 file đã xoá không seed lại được.**

## Còn thiếu

1. **Hiệu ứng âm thanh chưa có.** eDGR dùng *whoosh* cho chữ lớn, *thud* cho thẻ trượt vào, *click* cho từng dòng phụ, *chime* cho logo. Thư viện đi kèm có ~19 file. Thêm được nhưng cần gắn cue cho từng phần tử.
2. **Domain `edip.io` chưa xác nhận có tồn tại** — hiện ở giây 106.
3. Nhãn quan hệ trong đồ thị vẫn tiếng Việt (`BEN_A_CUA_HOP_DONG`) — chỉ lộ nếu zoom sâu.
4. Điều khoản gói free ElevenLabs với mục đích thương mại — cần bạn kiểm tra.
