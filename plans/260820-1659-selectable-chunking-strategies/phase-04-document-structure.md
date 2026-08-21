---
phase: 4
title: "Document Structure"
status: pending
priority: P2
dependencies: [3]
effort: "1.5h"
---

# Phase 4: Document Structure

<!-- Updated: Validation Session 1 - đổi từ NUMBERED_SECTION (cắt theo mục có số kiểu 1. MỤC ĐÍCH) sang port y nguyên DOCUMENT_STRUCTURE của ECVBot theo quyết định của người dùng -->

## Overview

Port nguyên logic `DOCUMENT_STRUCTURE` của ECVBot: cắt theo **ATX header markdown** (`#`..`######`), mỗi section một chunk, section quá dài thì cắt tiếp theo dòng trống và **chèn lại header vào từng sub-chunk**.

Nguồn để port: `ECVBot/nestjs-backend/src/infrastructure/content-parser/chunking-strategies/document-structure.strategy.ts`

## Ghi nhận trung thực về dữ liệu

Quét 9 tài liệu corpus seed: **0 tài liệu có ATX header**; 6 dùng `1. TIÊU ĐỀ` (text thuần, không phải markdown), 1 dùng `Điều N.`. Nghĩa là chiến lược này **không chạy lên gì trong dữ liệu mẫu** — nó chỉ có tác dụng với tệp `.md` người dùng tự upload.

Đây là ghi chép, không phải lý lẽ đòi đổi hướng. Người dùng đã chốt bám ECVBot; mục này chỉ để người triển khai biết fixture test phải tự chuẩn bị, và `pnpm prisma db seed` sẽ không kiểm được đường này.

## Requirements

**Functional** — bám đúng ECVBot
- `HEADER_RE = /^(#{1,6})\s+(.+?)\s*$/`
- `DEFAULT_MAX_CHUNK_SIZE = 1500`
- Config `maxChunkSize`, `preserveHeaders` (mặc định `true`)
- Chuẩn hoá `\r\n` → `\n` trước khi xử lý
- **Nhận biết code fence**: dòng bắt đầu bằng ` ``` ` đảo trạng thái `inCode`; header nằm trong khối code **không** được coi là header
- Section vừa cỡ → 1 chunk, header được chèn lại đầu chunk khi `preserveHeaders`
- Section quá cỡ → cắt theo `\n\n+`, **header chèn lại vào mọi sub-chunk**
- Một đoạn văn đơn vẫn quá cỡ → **cắt cứng** theo `maxChunkSize`
- Metadata mỗi chunk: `chunkingStrategy`, `sectionHeader`, `level`, `isSubChunk`, và `subChunkIndex` khi là sub-chunk
- Không dùng `parentContent` — chiến lược này phẳng

**Non-functional**
- Không thêm dependency nào (chỉ regex + xử lý chuỗi)
- Văn bản không có ATX header → toàn bộ nội dung thành **một section không header**, đúng như ECVBot (`current = { header: '', level: 0 }` rồi `flush()`), **không** thoái lui sang chiến lược khác

## Architecture

```
extractSections(text):
  duyệt từng dòng
    ``` → đảo inCode, dòng vẫn vào body
    khớp HEADER_RE và !inCode → flush section cũ, mở section mới
    còn lại → đẩy vào bodyLines
  flush() cuối
```

Khác biệt với phase 3: phase 3 phân cấp và dùng `parent_content`; phase này **phẳng** và dùng `metadata` để mang thông tin section. Cả hai đều bám ATX — đó là hệ quả của việc port đúng ECVBot.

## Related Code Files

**Create**
- `nestjs-backend/src/infrastructure/chunking/document-structure.strategy.ts`
- `nestjs-backend/src/infrastructure/chunking/document-structure.strategy.spec.ts`

**Modify**
- `nestjs-backend/src/infrastructure/chunking/chunking.service.ts` — đăng ký khoá thứ 3
- `frontend/src/features/documents/document-types.ts` — thêm `DOCUMENT_STRUCTURE` vào `CHUNKING_LABELS`

Không chạm `vector-store` (phase 3 đã thêm `metadata` vào `INSERT`), không migration.

## Implementation Steps

**Tests trước** — đối chiếu `ECVBot/.../document-structure.strategy.spec.ts` để lấy ca test tương đương

1. Chuỗi rỗng và chỉ khoảng trắng → `[]`
2. `# A` + body + `## B` + body → 2 chunk, mỗi chunk mở đầu bằng header của nó
3. Header trong khối ` ``` ` → **không** cắt ở đó
4. Section dài hơn `maxChunkSize` → nhiều sub-chunk, **mỗi sub-chunk đều có header**, `isSubChunk = true`, `subChunkIndex` tăng dần
5. Một đoạn văn đơn dài hơn `maxChunkSize` → bị cắt cứng, không mất chữ
6. `preserveHeaders: false` → chunk không có dòng header
7. Văn bản không có ATX → 1 chunk, `sectionHeader = ''`, `level = 0`
8. Metadata có đủ `sectionHeader`, `level`, `isSubChunk`
9. `parentContent` undefined ở mọi chunk
10. `pnpm test` → đỏ

**Rồi mới code**

11. Port `document-structure.strategy.ts` — giữ nguyên tên hằng, cấu trúc `extractSections`/`buildChunk`, và thứ tự nhánh xử lý của ECVBot. Chỉ đổi phần khớp interface `Chunk` của eDIP
12. Đăng ký vào registry
13. Frontend thêm entry
14. `pnpm test` + typecheck + frontend build

## Success Criteria

- [ ] 9 ca test trên pass, đặc biệt ca code fence và ca cắt cứng
- [ ] Upload một `.md` nhiều header với chiến lược này → số chunk khớp số section, kiểm bằng SQL
- [ ] `metadata` trong `embedding_chunks` chứa `sectionHeader` và `level` đúng
- [ ] Sub-chunk của section dài đều mang lại header
- [ ] `parent_content` NULL cho mọi chunk của chiến lược này
- [ ] Dropdown 3 lựa chọn
- [ ] 185 test cũ + test mới pass

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| 0 tài liệu seed có ATX → không có fixture sẵn | Dùng tệp `.md` người dùng tự có (ví dụ file chính sách tiếng Thái). Ghi rõ `db seed` không kiểm được đường này |
| 6/9 tài liệu corpus đánh số `1.` không được phục vụ | Đúng theo quyết định bám ECVBot. Chúng rơi vào section không header → 1 chunk lớn, rồi cắt theo dòng trống. Không sai, chỉ là không tận dụng cấu trúc |
| Trùng chức năng với phase 3 (cả hai bám ATX) | Khác ở đầu ra: phase 3 phân cấp + `parent_content`; phase này phẳng + `metadata`. Là hệ quả của port đúng, không phải trùng lặp do thiết kế |
| Cắt cứng làm đứt từ tiếng Việt giữa chunk | ECVBot cắt cứng như vậy; port y nguyên. Ghi lại là hành vi đã biết, không tự ý sửa khác nguồn |
