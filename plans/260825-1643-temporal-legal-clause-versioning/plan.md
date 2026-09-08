---
title: "Hiệu lực văn bản theo thời gian — điều khoản có phiên bản"
description: "Trả lời được 'ngày X quy định thế nào' bằng cách cho điều khoản một địa chỉ và các phiên bản có khoảng hiệu lực. Xử lý sửa đổi lúc nạp, không phải lúc hỏi."
status: pending
priority: P2
branch: "master"
tags: [legal, versioning, as-of, ingestion, search]
blockedBy: []
blocks: []
created: "2026-08-25T09:45:00.000Z"
createdBy: "cook"
source: brainstorm
brainstorm: "../reports/implementation-walkthrough-260825-1455-versioned-clause-model-for-legal-documents-report.md"
---

# Hiệu lực văn bản theo thời gian

## Bài toán

Hỏi *"quy định cho vay góp vốn hiện nay thế nào"* — câu trả lời phụ thuộc chuỗi ba thông tư sửa nhau: TT 39/2016 ← bổ sung bởi TT 06/2023 ← ngưng hiệu lực bởi TT 10/2023. Kết quả: khoản 8.9 *có tồn tại* nhưng *không được áp dụng*.

RAG hiện tại của eDIP trả lời sai vì nạp cả ba thông tư rồi để mô hình tự ghép, và không có khái niệm "tại ngày nào".

## Nguyên tắc xuyên suốt

> **Xử lý sửa đổi khi *nạp*, không phải khi *hỏi*.**

Văn bản sửa đổi là **migration script**. Bảng điều khoản là **trạng thái database**. Không ai chạy migration lúc truy vấn, và cũng không bắt LLM làm điều đó.

## Quyết định đã chốt

| Quyết định | Nội dung |
|---|---|
| **Thứ tự** | Cấp tài liệu **trước** cấp điều khoản. GĐ 1 xong là dùng được cho cả kho hiện tại |
| **Chọn ngày** | **Bóc từ câu hỏi bằng LLM**, mặc định hôm nay. Không dùng ô chọn ở màn hỏi đáp *(xem 15.3 của báo cáo)* |
| **Chặn duy nhất** | Ngày as-of **luôn hiện trên câu trả lời** |
| Bảng, phụ lục, ảnh scan | **Hoãn** — vướng ở tầng trích xuất, +16–23h *(xem 18.7)* |
| Đồ thị | **Hoãn**, gộp vào GĐ 5 — nó không nằm trên đường đúng/sai của câu trả lời |
| Cây mục lục riêng | **Bỏ** — Silaw không có; cấp bậc nằm trong `path` và `kind` |
| Bảng quan hệ văn bản | **Bỏ** — mỗi hàng `provisions` đã mang `source_doc` |

## Phases

| Phase | Name | Giờ | Status |
|-------|------|:-:|--------|
| 0 | [Measure Before Building](./phase-00-measure-before-building.md) | 8 *(không code)* | Pending |
| 1 | [Document Level Versioning](./phase-01-document-level-versioning.md) | 6–8 | Pending |
| 2 | [Clause Extraction](./phase-02-clause-extraction.md) | 10–16 | Pending |
| 3 | [Clause Versions And As Of](./phase-03-clause-versions-and-as-of.md) | 8–10 | Pending |
| 3b | [Date From Question](./phase-03b-date-from-question.md) | 4–6 | Pending |
| 4 | [Amendment Operations](./phase-04-amendment-operations.md) | 12–16 | Pending |
| 5 | [Compliance Radar](./phase-05-compliance-radar.md) | 14–18 | Pending |
| | **Tổng** | **54–74h** ≈ 7–9 ngày | |

## Dependencies

```
0 ──→ 1 ──→ 2 ──→ 3 ──→ 3b
                   └──→ 4 ──→ 5
```

**GĐ 0 chặn mọi thứ.** Nó quyết định hướng của GĐ 2 và có thể **xoá hẳn GĐ 4**.

## Ba điểm dừng an toàn

| Dừng sau | Có gì dùng được |
|---|---|
| **GĐ 1** *(8h)* | Phiên bản tài liệu cho **cả 33 tài liệu hiện có**. Không cần parser, không cần AI |
| **GĐ 3b** *(~40h)* | Hỏi theo ngày bằng câu chữ tự nhiên, đầy đủ. Chưa cần đồ thị |
| **GĐ 5** *(~74h)* | Đủ như Silaw |

**Khuyến nghị: dừng ở GĐ 1 và dùng thật một tuần** trước khi làm tiếp. Nó kiểm chứng giả định lớn nhất — người dùng có thật cần trục thời gian không — với 8 giờ thay vì 74.

## Ngoài phạm vi

- Bảng, phụ lục, ảnh scan vào tầng điều khoản *(vướng `ExtractionResult` là chuỗi phẳng)*
- Nâng `MAX_VISION_PAGES` *(đang chặn 5 trang — vấn đề độc lập)*
- Bảng cây mục lục dùng chung cho tài liệu thường
- Đối chiếu ngữ nghĩa *(mức 3)* — chỉ làm mức cứng và mức lệch thời gian
- Thu thập văn bản pháp quy *(việc dữ liệu, không phải code — nhưng tốn nhất)*

## Tiêu chí nghiệm thu toàn plan

- [ ] Hỏi *"tháng 3/2024 quy định cho vay góp vốn thế nào"* → trả lời theo đúng bản hiệu lực tại 03/2024, **và hiện ngày đó trên câu trả lời**
- [ ] Cùng câu hỏi không kèm ngày → trả lời theo bản mới nhất
- [ ] Khoản đang bị ngưng → trả lời *"đang bị ngưng"*, **không** quay về bản cũ, **không** nói "không tìm thấy"
- [ ] Trích dẫn tới `Điều 8 khoản 9`, bấm vào mở đúng khoản tại ngày as-of
- [ ] **33 tài liệu hiện có vẫn ra trong tìm kiếm y như trước** — không mất một tài liệu nào
- [ ] Nạp TT 06/2023 → chỉ 3 khoản bị nhúng lại, không nhúng lại cả thông tư
- [ ] Lệnh sửa đổi máy không chắc → vào trạng thái cần duyệt, không tự áp
- [ ] Test hiện tại *(294)* vẫn pass

## Rủi ro toàn plan

| Rủi ro | Mức | Xử lý |
|---|:-:|---|
| **Chưa có kho văn bản pháp quy** | **Cao nhất** | Việc thu thập tốn công hơn toàn bộ 74h code. GĐ 0 làm rõ quy mô |
| Đọc lệnh sửa đổi sai | Cao | GĐ 0 đo trước. Người duyệt bắt buộc ở cả hai hướng |
| Trách nhiệm pháp lý | Cao | Giữ hành vi từ chối khi thiếu căn cứ *(`ask.service.ts:109`)*. Luôn hiện ngày as-of |
| **Điều kiện `IS NULL` bị quên** | Cao | 33 tài liệu cũ biến mất khỏi tìm kiếm — không lỗi, không log. Có test chặn ở GĐ 3 |
| Đánh số lại tham số raw SQL | Vừa | Đúng lỗi đã cắn ở plan chunking. `vector-store.service.spec.ts` đã canh |
| LLM bóc sai ngày | Vừa | Ngày as-of hiện trên câu trả lời là chặn duy nhất |
| `migrate dev` drop `search_tsv` | Vừa | **Viết migration bằng tay** — đã gặp 2 lần |

## Câu chưa trả lời được

1. **NHNN có công bố văn bản hợp nhất dạng máy đọc được không?** → quyết định có xoá được GĐ 4 *(12–16h)*
2. **Tỷ lệ đọc đúng của hướng agent vs hướng luật trên corpus thật?** → quyết định hướng GĐ 2
3. **`clause_milestones` là bảng thật hay view suy từ `provisions`?** → quyết định GĐ 3 cần 1 hay 2 bảng
4. **Người dùng cần trục thời gian, hay chỉ cần bản mới nhất?** → GĐ 1 trả lời với 8h
5. **Tỉ lệ câu hỏi về ngày quá khứ là bao nhiêu?** → nếu chiếm đa số thì ô chọn ngày nên là chính, đảo ngược quyết định ở 15.3
