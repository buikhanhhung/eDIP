# Bước 4 — Thu ảnh giao diện eDIP

Ảnh: `PROJECTS/EDIP/video/assets/ui/*.png` · **3840×2160** (1920×1080 @2×)

---

## 1. Đã chụp

| File | Màn | Dùng cho | Trạng thái |
|---|---|---|---|
| `01-dashboard.png` | Overview | Beat 4 panel | ✅ tốt — KPI, biểu đồ đường, 2 donut phân loại |
| `02-library.png` | Library (lọc Contract) | Beat 4 panel | ⚠️ chỉ 3 dòng sau khi xoá |
| `03-document-detail.png` | VietBank SOW | Beat 4 + Feature 01 | ✅ xuất sắc |
| `04-knowledge-graph.png` | Graph | Beat 4 + Feature 03 | ✅ 36 thực thể, sạch |
| `05-upload.png` | Upload | Feature 01 | chưa soi kỹ |
| `06-ask.png` | Ask AI | Feature 02 | ✅ có SOURCES, ⚠️ tiếng Việt |

## 2. Dọn dữ liệu

Xoá **8 tài liệu dính danh tính** qua API `DELETE /documents/:id` (200 cả 8), không dùng SQL trực tiếp nên đồ thị FalkorDB và file lưu trữ được dọn theo:

`CV - Bùi Khánh Hưng.pdf` · `Bui-Khanh-Hung-TopCV.vn-*.pdf` · `Bảng Điểm - Bùi Khánh Hưng.pdf` · `VSTEP.pdf` · `ECV Internship Application Form.docx` · `Team Contract.docx` ×2 · `hinh-anh-gai-xinh-cuoi-dep-14.jpg`

Còn **30 tài liệu**, chunk 133 → 91 (đều có embedding).

**Không seed lại được 8 file này** — chúng do người dùng tự tải lên, `db seed` chỉ dựng lại 10 tài liệu demo gốc.

Rác kỹ thuật còn lại theo yêu cầu (meme, batch-test, cheat-sheet, ảnh lặt vặt) → **màn Library phải luôn ở chế độ lọc**, không bao giờ để All types.

## 3. Đồ thị sau khi dọn

36 thực thể · 32 quan hệ. Trung tâm *Ecloudvalley Vietnam*; quanh đó VietBank Corp, Saigon Retail JSC, Hanoi Logistics Ltd, Project Meridian/Atlas/Vanguard, mã ECV-MSA-2026-014, ECV-HD-2026-027, INV-2026-0412, các phòng ban. Ba tên người còn lại (*Ms. Le Thi Hoa, Ms. Nguyen Thi Lan, Pham Thu Ha*) là nhân vật hư cấu trong hợp đồng demo.

Trước khi dọn, lọc theo số tài liệu (≥2) **không** loại được cụm sinh viên vì họ xuất hiện ở nhiều tài liệu; lọc theo loại quan hệ không tác động được vào React state. Chỉ xoá mới giải quyết được.

## 4. ⚠️ Ask AI luôn trả lời tiếng Việt

`src/features/ask/ask.service.ts:103-115` — system prompt viết hoàn toàn bằng tiếng Việt:

```
'Bạn chỉ được trả lời dựa trên các đoạn trích được cung cấp.'
content: `<context>...</context>\n\nCâu hỏi: ${question}`
```

Model trả lời theo ngôn ngữ prompt. **Thiết kế có chủ ý, không phải lỗi.** Kiểm A/B: hỏi tiếng Anh → vẫn trả lời tiếng Việt (2/2 lần).

Video thuyết minh tiếng Anh nhưng màn hình hiện đáp án tiếng Việt → cần user quyết, xem mục 6.

## 5. 🐛 Lỗi trích dẫn (ghi nhận, không sửa)

`ask.service.ts:119` — regex `/\[([a-f0-9]{4}-\d+)\]/g` đòi mỗi id một cặp ngoặc.
Model đôi khi sinh `[addd-1, addd-2]` gộp hai id → regex trượt → `unsourced = true` → UI cảnh báo sai *"This answer cites no source"* dù retrieval hoàn toàn đúng.

Quan sát: 1/3 lượt hỏi bị dính. Sửa nằm ngoài phạm vi làm video.

## 6. Hai quyết định — đã chốt và thực hiện

**a) Tiếng Anh toàn bộ.** Sửa `ask.service.ts` — system prompt chuyển sang tiếng Anh, thêm chỉ thị luôn trả lời bằng tiếng Anh kể cả khi tài liệu hoặc câu hỏi bằng ngôn ngữ khác. `NO_ANSWER` vốn đã là tiếng Anh nên thay đổi này làm file nhất quán.

Kèm theo, thêm một dòng chống lỗi ở mục 5: *"Put every id in its own brackets — write [a1b2-1][a1b2-2], never [a1b2-1, a1b2-2]."*

Kiểm chứng qua `POST /ask`:
```
"The fixed fee for the HealthFirst electronic health record migration is
 USD 96,000 [527d-1]. The two parties are Ecloudvalley Vietnam Ltd (Party A)
 and HealthFirst Medical Group (Party B) [527d-1]."
citations: 1 · unsourced: False
```

**b) Library "nhiều nhiều".** Thay vì lọc, đã **tạo và nạp 10 tài liệu demo doanh nghiệp tiếng Anh** bám các ngành hồ sơ BOX nhắm tới:

| Loại | File |
|---|---|
| contract ×4 | healthfirst-ehr-migration (Healthcare) · pacific-insurance-msa (Insurance) · metro-manufacturing-sla (Manufacturing) · nordic-logistics-framework (Logistics) |
| invoice ×2 | healthfirst-2026-05 · pacific-insurance-2026-04 |
| policy ×3 | information-security · vendor-risk-management · data-classification-standard |
| report ×1 | h1-2026-platform-adoption |

Thực thể đều nối vào Ecloudvalley Vietnam Ltd nên đồ thị liền mạch.
Nguồn sinh: `scratchpad/make_demo_docs.py`. Nạp qua `POST /documents` (202 cả 10), xử lý xong sau 220 giây.

## 7. Trạng thái cuối

| | Trước | Sau |
|---|---|---|
| Tài liệu | 38 (lẫn cá nhân) | **40** — 39 completed, 1 failed |
| Trang 1 Library | lẫn meme, CV | **10 dòng đều là hồ sơ doanh nghiệp tiếng Anh** |
| Cần lọc? | có | **không** — All types / All statuses vẫn sạch |
| Đồ thị | 36 thực thể rời rạc | **53 thực thể · 54 quan hệ**, một cụm liên thông |
| Ask AI | đáp tiếng Việt | **đáp tiếng Anh, có SOURCES** |

Beat 4 giữ nguyên bộ ba kịch bản v1: **Library · Document Detail · Knowledge Graph**. Không cần sửa VO.

## Còn treo

1. Chưa soi kỹ `05-upload.png`.
2. Nhãn quan hệ trong đồ thị vẫn là tiếng Việt (`BEN_A_CUA_HOP_DONG`, `DAI_DIEN_CHO`) — chỉ lộ khi zoom sâu vào cạnh.
3. Panel "Quick tips" ở màn Ask còn hai dòng tiếng Việt — crop bỏ khi dựng.
4. Dashboard hiện `Failed 1` (từ `corrupt.pdf`) — cân nhắc crop bỏ.
5. Docker + backend + frontend **vẫn đang chạy**; phải tắt hết trước khi render để giải phóng RAM.
6. Thay đổi `ask.service.ts` chưa commit — user quyết giữ hay hoàn tác.
