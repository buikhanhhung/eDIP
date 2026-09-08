---
phase: 1
title: "Document Level Versioning"
status: pending
priority: P1
dependencies: [0]
effort: "6-8h"
---

# Phase 1: Phiên bản cấp tài liệu

## Overview

**5 cột trên bảng `documents`. Không bảng mới, không parser, không AI.**

Xong là dùng được thật cho **cả 33 tài liệu hiện có**, kể cả PDF scan không cấu trúc. Đây là điểm dừng an toàn nhất của cả plan, và là cách rẻ nhất để kiểm chứng giả định lớn nhất.

## Requirements

**Functional**
- Nhóm các tệp là **phiên bản của cùng một văn bản logic**: *Quy chế lao động 2024* → *bản 2026*
- Mỗi tài liệu có khoảng hiệu lực và trạng thái
- Đánh dấu tài liệu là **văn bản quy định** *(nhà nước / nội bộ)* hay tài liệu thường
- Thư viện lọc được theo trạng thái hiệu lực
- Hỏi đáp trả lời theo **bản đang hiệu lực** khi có nhiều bản

**Non-functional**
- **33 tài liệu hiện có không đổi hành vi** — 5 cột đều nullable
- Không thêm dependency
- 294 test hiện tại pass

## Architecture

**Năm cột trên `documents`:**

```prisma
model Document {
  /// Cùng một văn bản logic. Hai tệp cùng series là hai phiên bản của một thứ.
  seriesId      String?   @map("series_id")
  effectiveFrom DateTime? @map("effective_from")
  effectiveTo   DateTime? @map("effective_to")
  docStatus     DocStatus? @map("doc_status")   // active | superseded | expired
  /// Trống = tài liệu thường, không vào tầng hiệu lực.
  docScope      DocScope? @map("doc_scope")     // state | internal

  @@index([seriesId, effectiveFrom])
}
```

**`docScope` là công tắc của cả tính năng.** Trống → tài liệu hoạt động y như hôm nay. Đây là quyết định của **người upload**, không phải máy đoán — vì báo cáo cũng có `1.`, `2.`, `3.` mà hình dạng chữ không nói lên mục đích.

**`seriesId` do người dùng gán**, không tự suy. Suy từ tên tệp là cách tạo lỗi âm thầm: *"Quy chế lao động 2024.docx"* và *"Quy che lao dong (ban moi).docx"* là cùng series mà máy không biết.

**Không dùng cascade.** Xoá một phiên bản không được kéo theo phiên bản khác — chúng là tài liệu độc lập, chỉ chung `seriesId`.

## Related Code Files

**Modify**
- `nestjs-backend/prisma/schema.prisma` — 5 cột + 2 enum + index
- `nestjs-backend/prisma/migrations/<ts>_add_document_versioning/migration.sql` — **viết tay**
- `nestjs-backend/src/features/documents/documents.service.ts` — `buildWhere()` *(dòng ~63)* thêm lọc theo `docStatus`, `docScope`, `seriesId`
- `nestjs-backend/src/features/documents/documents.controller.ts` — query param mới
- `nestjs-backend/src/features/ingestion/ingestion.service.ts` — nhận `docScope` khi upload
- `nestjs-backend/src/features/ingestion/ingestion.controller.ts` — đọc field từ multipart
- `frontend/src/features/upload/upload-page.tsx` — chọn `docScope` lúc upload
- `frontend/src/features/library/library-page.tsx` — filter theo trạng thái, cột phiên bản
- `frontend/src/features/documents/document-detail-page.tsx` — hiện phiên bản, gán series, đặt ngày

## Implementation Steps

**Tests trước**

1. Spec: `buildWhere` lọc đúng theo `docStatus` · theo `docScope` · theo `seriesId`
2. Spec: `docScope` không truyền → tài liệu vẫn tạo được, cột để `NULL`
3. Spec: `docScope` giá trị rác → bị từ chối **trước** khi ghi tệp xuống đĩa
4. Spec: hai tài liệu cùng `seriesId`, một `active` một `superseded` → truy vấn "bản hiện hành" trả về đúng một bản
5. Spec: `effectiveFrom` > `effectiveTo` → bị từ chối
6. `pnpm test` → đỏ

**Rồi mới code**

7. `schema.prisma`: 5 cột + enum `DocStatus`, `DocScope` + index
8. Migration **viết tay** rồi `prisma migrate deploy`. **KHÔNG** `migrate dev` — nó đòi drop `search_tsv`, tiền lệ ở `20260812210000_document_source`
9. `buildWhere()` thêm ba bộ lọc
10. `ingestion.service.ts` nhận và kiểm `docScope` trước `storage.save()`
11. Frontend: chọn scope lúc upload; Thư viện thêm filter + cột; trang chi tiết cho gán series và đặt ngày
12. `pnpm test` + `npx tsc --noEmit` + frontend `tsc -b` + build
13. **Chạy thật**: nạp hai bản của một quy chế, gán cùng series, đặt ngày, kiểm Thư viện và hỏi đáp

## Success Criteria

- [ ] 5 nhóm test trên pass
- [ ] Migration chạy được; **33 dòng hiện có có cả 5 cột = NULL**; `search_tsv` vẫn đủ 33/33
- [ ] Upload không kèm `docScope` → vẫn nạp bình thường, cột `NULL`
- [ ] `docScope` rác → 400/422, **không** có tệp mới trong `storage/`
- [ ] Hai bản cùng series → Thư viện hiện rõ bản nào đang hiệu lực
- [ ] Hỏi đáp về nội dung có ở cả hai bản → trả lời theo **bản hiện hành**
- [ ] **Tìm kiếm 33 tài liệu cũ ra kết quả y như trước** *(so trước/sau bằng cùng một truy vấn)*
- [ ] 294 test cũ + test mới pass, tsc/lint/build sạch

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| `migrate dev` drop `search_tsv` | Viết tay + `migrate deploy`. Đã gặp 2 lần |
| 33 tài liệu cũ bị ảnh hưởng | 5 cột **nullable**, mọi bộ lọc mới đều bỏ qua `NULL`. Tiêu chí nghiệm thu so trước/sau |
| Tự suy `seriesId` từ tên tệp | **Không làm.** Người dùng gán tay. Suy sai là gộp hai văn bản khác nhau thành một chuỗi phiên bản |
| `docScope` rác làm tệp đã ghi đĩa rồi mới lỗi | Kiểm **trước** `storage.save()`; bước 3 viết test chứng minh thứ tự |
| Người dùng không hiểu `docScope` là gì | Nhãn trên UI phải nói bằng việc, không bằng thuật ngữ: *"Đây là văn bản quy định cần theo dõi hiệu lực"* |

## Sau phase này — dừng lại một tuần

Đây là chỗ **khuyến nghị dừng** trước khi làm GĐ 2.

Câu cần trả lời trong tuần đó:

| Câu | Nếu "không" thì |
|---|---|
| Người dùng có gán `docScope` không? | Không ai gán → cả tầng hiệu lực không có ai dùng, dừng plan |
| Có ai hỏi về ngày quá khứ không? | Không → cấp điều khoản không cần thiết, dừng ở đây |
| Bao nhiêu % câu hỏi về ngày quá khứ? | Nếu chiếm đa số → ô chọn ngày nên là chính, đảo ngược quyết định 15.3 của báo cáo |

8 giờ để trả lời ba câu này, thay vì 74 giờ rồi mới biết.
