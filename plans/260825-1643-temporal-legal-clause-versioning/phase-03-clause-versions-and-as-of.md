---
phase: 3
title: "Clause Versions And As Of"
status: pending
priority: P1
dependencies: [2]
effort: "8-10h"
---

# Phase 3: Phiên bản điều khoản và hỏi theo ngày

## Overview

**2 bảng mới + 1 cột.** Đây là lõi của cả plan — sau phase này hệ thống trả lời được *"ngày X điều khoản này quy định gì"*.

## Bảng

```
provisions
  doc_code           "39/2016/TT-NHNN"   ┐ ĐỊA CHỈ LOGIC
  path               "8.9"               ┘
  version_id                             ← phiên bản thứ mấy
  kind               dieu | khoan | diem | section
  number, title
  text                                   ← nội dung của bản này
  effective_from     01/09/2023          ┐ KHOẢNG HIỆU LỰC
  effective_to       NULL                ┘ NULL = còn hiệu lực
  status             active | suspended | expired
  source_doc         "06/2023/TT-NHNN"   ← văn bản tạo ra bản này

  UNIQUE (doc_code, path, version_id)
  INDEX  (effective_from, effective_to)

clause_milestones                        ← lịch sử để hiển thị; có thể là VIEW
  doc_code, path
  event              issue | amend | suspend | current
  source_doc, date, effective_date, note

embedding_chunks
  + provision_id     ← nullable. Bản lề của lọc theo ngày
```

**Hàng là bất biến.** Sửa đổi = đóng khoảng hàng cũ + chèn hàng mới. Không `UPDATE` nội dung — vì hợp đồng ký năm 2022 phải xét theo quy định năm 2022.

## Truy vấn as-of

Một vị từ, thêm vào `vector-store.service.ts:108` và `:135`:

```sql
LEFT JOIN provisions p ON p.id = ec.provision_id
WHERE ...
  AND (
    ec.provision_id IS NULL                          -- tài liệu thường: LUÔN qua
    OR ( $N::date >= p.effective_from
         AND (p.effective_to IS NULL OR $N::date < p.effective_to)
         AND p.status <> 'expired' )
  )
```

## Ba bẫy — cả ba đều âm thầm

| Bẫy | Hậu quả nếu quên |
|---|---|
| **Thiếu `ec.provision_id IS NULL`** | **33 tài liệu hiện có biến mất khỏi mọi kết quả tìm kiếm.** Không lỗi, không log |
| **Không đánh số lại tham số** | Đúng lỗi đã cắn ở phase 3 của plan chunking. `vector-store.service.spec.ts` đã canh |
| **Không loại chunk của văn bản sửa đổi** | AI trả lời bằng câu lệnh *"sửa khoản 8 như sau"* thay vì bằng quy định |

## Ba trạng thái khi trả lời

| Trạng thái | Trả lời |
|---|---|
| `active` | Đưa nội dung |
| `suspended` | *"Đang bị ngưng"* — **không** quay về bản cũ, **không** nói "không tìm thấy" |
| `expired` | *"Đã hết hiệu lực"* + chỉ sang bản thay thế |

Ca giữa dễ sai nhất và phổ biến nhất trong thực tế ngân hàng: TT 06/2023 **thêm** khoản 8.9 rồi TT 10/2023 **ngưng** đúng khoản đó cùng ngày.

## Files

**Modify** — `prisma/schema.prisma` + migration **viết tay** · `vector-store.service.ts` *(2 câu raw SQL)* · `search-options.ts` *(thêm `asOf`)* · `search.service.ts` · `ask.service.ts` · frontend hiện `Điều 8 khoản 9` trong trích dẫn

## Success Criteria

- [ ] Hỏi kèm ngày → trả về đúng bản hiệu lực tại ngày đó
- [ ] Khoản `suspended` → trả lời đúng ba trạng thái ở trên
- [ ] **33 tài liệu cũ ra kết quả y như trước** — so trước/sau bằng cùng truy vấn
- [ ] Giá trị `asOf` ngoài biên bị kẹp, không trả lỗi
- [ ] Trích dẫn hiện `Điều 8 khoản 9`, bấm vào mở đúng khoản tại ngày as-of
- [ ] Chunk của văn bản sửa đổi không lọt vào truy hồi mặc định
