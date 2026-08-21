---
phase: 4
title: "Document Structure"
status: done
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

- [x] 13 test pass (9 ca phase file yêu cầu + 4), đặc biệt ca **code fence** và ca **cắt cứng không mất chữ**
- [x] `metadata` chứa `sectionHeader`, `level`, `isSubChunk`, `subChunkIndex` đúng
- [x] Sub-chunk của section dài đều mang lại header — kiểm cả trên fixture và trên markdown thật của repo
- [x] `parentContent` undefined ở mọi chunk của chiến lược này
- [x] Dropdown 3 lựa chọn — ở mức code; **chưa xem bằng mắt** (bạn tự kiểm)
- [x] 185 test cũ + test mới pass → **247**, `tsc --noEmit` và eslint sạch, frontend build sạch
- [ ] **Upload `.md` thật rồi kiểm bằng SQL: CHƯA CHẠY** — xem ghi nhận bên dưới

## Đã triển khai — 21/08/2026

Port `DOCUMENT_STRUCTURE` y nguyên ECVBot: `HEADER_RE`, `DEFAULT_MAX_CHUNK_SIZE = 1500`, `preserveHeaders`, nhận biết code fence bằng cờ `inCode`, cắt theo `\n\n+` khi quá cỡ, cắt cứng theo độ dài khi một đoạn văn đơn vẫn quá cỡ, header chèn lại vào **mọi** sub-chunk.

| Việc | Vì sao |
|---|---|
| Export `documentStructureChunks(text, options)` + strategy đăng ký gọi nó với mặc định | Chữ ký `ChunkingStrategy` của eDIP không có đường truyền config, mà `maxChunkSize`/`preserveHeaders` cần test trực tiếp. Cùng cách phase 3 xử lý hằng 500/100, nhưng ở đây options có thật nên phơi ra |
| Giữ section **chỉ có header** thành một chunk chứa đúng dòng tiêu đề | ECVBot làm vậy: `full = ('# Rỗng\n\n' + '').trim()` = `'# Rỗng'`, khác rỗng nên vẫn phát ra. Tôi **không** tự sửa vì quyết định là port y nguyên — nhưng đã ghim vào test để ngày ai muốn bỏ thì đó là thay đổi có chủ ý. Một dòng guard là xong |

**Phát hiện từ dữ liệu thật, fixture không bắt được:**

Chạy strategy trên chính markdown của repo thay vì fixture:

| Tệp | Ký tự | Dòng trông như ATX | Section | Chunk | Sub-chunk | Có `parentContent` |
|---|---|---|---|---|---|---|
| `README.md` | 6.074 | 19 | 9 | 9 | 0 | 0 |
| `docs/setup.md` | 10.530 | 21 | 16 | 17 | 2 | 0 |

- **Nhận biết code fence chạy đúng trên dữ liệu thật**: README có 19 dòng khớp regex ATX nhưng chỉ ra 9 section — 10 dòng còn lại là `#` bên trong khối code, và strategy đã bỏ qua đúng.
- **`maxChunkSize` là giới hạn mềm, không phải cứng.** `docs/setup.md` sinh một chunk **1.519 ký tự** với `maxChunkSize = 1500`. Phần vượt đúng **19 ký tự = độ dài header được chèn lại**: giới hạn áp cho phần *thân*, còn header cộng thêm lên trên. Đây là hành vi của ECVBot (`(headerStr + p.slice(i, i + maxChunkSize)).trim()`), port y nguyên. Đã **ghim vào test** vì fixture gọn gàng không bao giờ chạm ngưỡng đó, mà con số này quan trọng với người tính cửa sổ prompt.

**Ghi nhận trung thực — tiêu chí live chưa chạy:**

Máy hết RAM nên không kiểm được end-to-end. Số đo lúc thử: **0,99 GB trống / 7,71 GB**; `nest start` chết OOM (exit 134) ngay bước biên dịch; `docker ps` không trả lời trong 120 giây; trước đó agent-browser mở Chromium (9 tiến trình, ~734 MB) đẩy RAM trống xuống **0,1 GB** và treo hẳn. Đang tranh bộ nhớ: 13 tiến trình Chrome của người dùng, Docker Desktop 3 container, vite, backend.

Rủi ro còn lại **thấp**, vì phase này không mở đường mới nào:

- không migration, không cột mới, không dependency mới
- đường ghi `metadata` **đã được chứng minh end-to-end ở phase 3**: đã truy vấn `metadata->>'sectionHeader'` và `metadata->>'level'` từ DB thật và ra đúng giá trị
- `parent_content` NULL cho chiến lược phẳng đã có spec vector-store bảo vệ, và 104 dòng `recursive` sẵn có đều NULL

Thứ **chưa** được chứng minh: số chunk trong DB khớp số section trên một lần upload thật, và dropdown 3 lựa chọn hiển thị đúng.

## Sửa theo review — 21/08/2026

Review tìm ra một lỗi **treo tiến trình** và một đường làm **chết job nạp**, cả hai tôi không thấy.

| Finding | Xử lý |
|---|---|
| **C1 — `maxChunkSize <= 0` là vòng lặp vô hạn, cạn heap** | `at += maxChunkSize` không tiến khi bằng 0, mà `??` không chặn `0`. Reviewer chạy thật: heap lên 2 GB rồi chết. Sửa: `Math.max(1, ...)`. **Lệch khỏi ECVBot có chủ ý** — ECVBot có đúng lỗ này và ở đó còn với tới được từ config của caller |
| **H1 — chunk rỗng / trơ header tới được provider embedding** | `.trim()` trên miếng cắt rơi vào vệt khoảng trắng dài → `content: ''` (provider trả 400) hoặc chunk chỉ có tiêu đề, mà `replaceChunks` **đã commit rows trước đó** nên job chết ở `step('embed')` với chunk đã lưu và embedding null. Sửa: bỏ miếng cắt không có chữ; miếng còn lại **byte-identical** |
| **H2 — test "losing no characters" của tôi nói quá** | `'x'.repeat(250)` không có khoảng trắng nên `.trim()` không bao giờ chạy. Với payload có khoảng trắng thì **mất 2 ký tự** thật. Đổi sang payload chữ luân phiên, assert đúng `[100, 100, 50]` và từng slice; thêm test riêng ghi nhận đường này **có** mất khoảng trắng |
| Mutation score 9/15 — 5 lỗ hổng thật | Thêm test cho: cắt theo dòng trống (không phải mọi newline), `#khongcachtrong`, 7 dấu thăng, nhánh `whole.length === 0`, `subChunkIndex` reset theo từng section, và **dispatch qua registry** (trước đó không test nào đi qua `service.split`, nên registry nối sai hàm vẫn xanh cả 258 test) |
| **Md4 — spec ledger phụ thuộc thứ tự khai báo registry** | So sánh dạng tập đã sắp xếp. Đổi chỗ hai entry trong `STRATEGIES` giờ không làm đỏ test vì lý do không đáng |
| **Md1 — comment của tôi nói sai** | Tôi viết "no regex can tell the difference" về code fence, nhưng module bên cạnh dùng mdast và làm được. Viết lại trung thực, liệt kê đúng bốn chỗ hai chiến lược **thật sự bất đồng**: `Title\n====`, `## Heading ##`, fence `~~~`, code thụt 4 dấu cách |
| Divergence tôi không khai | Bỏ guard `!content` nên `null` sẽ throw thay vì trả `[]`. Đúng quy ước hai strategy kia, và `split()` async nên throw thành rejection. Giữ nguyên, ghi lại |

**Kiểm chứng bằng mutation, không chỉ nói suông:** đảo `\n\n+` → `\n+` và `HEADER_RE` `\s+` → `\s*` — cả hai giờ **đỏ** đúng test mới. (Hai lần đầu tôi thử, sed không khớp nên mutation chưa hề áp; phải in `repr` mới phát hiện, rồi dựng pattern bằng `chr(92)` để tránh tầng xử lý backslash của shell.)

## Quyết định của người dùng: gộp tiêu đề mồ côi

Review đo được: trên dạng văn bản **chính** của dự án — `# Chương N` theo ngay sau là các `## Điều` — có **25% chunk là chunk chỉ chứa dòng tiêu đề** (4/16), trong khi `PARENT_CHILD_MARKDOWN` trên cùng đầu vào ra **0**. Hai chiến lược markdown trả lời trái ngược nhau, mà một trong hai còn mang comment nói đã sửa đúng ca này.

Người dùng chọn **gộp**, không giữ cũng không bỏ. Đây là **thiết kế mới, không còn là port**: tiêu đề có thân rỗng được giữ lại trong `pendingHeaders` rồi dán vào section có nội dung tiếp theo.

Đo lại sau khi sửa, cùng đầu vào 4 chương × 3 điều:

| | Trước | Sau |
|---|:-:|:-:|
| Chunk | 16 | **12** (khớp `PARENT_CHILD_MARKDOWN`) |
| Chunk chỉ có tiêu đề | 4 (25%) | **0** |
| Chunk mở đầu bằng `# Chương N` | 0 | 4 — ngữ cảnh chương không mất |

Ca biên đã khoá bằng test: nhiều tiêu đề rỗng liên tiếp thì cộng dồn theo thứ tự (`# A` + `## B` + `### C` + thân → một chunk); tiêu đề rỗng ở **cuối** tài liệu thì bị bỏ vì không còn gì để gộp vào; `preserveHeaders: false` thì không có gì để gộp nên vô tác dụng. `metadata.sectionHeader` vẫn là section của chính chunk (`Điều 1`, level 2), không phải chương — tiêu đề chương chỉ nằm trong text.

Hệ quả cần biết: `headerText` giờ có thể dài hơn một dòng, nên biên vượt giới hạn ở trên (`maxChunkSize` + độ dài header) cũng rộng theo.

**Test cuối phase 4: 258 pass, 30 suite**, tsc/eslint/prettier sạch, frontend build sạch.

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| 0 tài liệu seed có ATX → không có fixture sẵn | Dùng tệp `.md` người dùng tự có (ví dụ file chính sách tiếng Thái). Ghi rõ `db seed` không kiểm được đường này |
| 6/9 tài liệu corpus đánh số `1.` không được phục vụ | Đúng theo quyết định bám ECVBot. Chúng rơi vào section không header → 1 chunk lớn, rồi cắt theo dòng trống. Không sai, chỉ là không tận dụng cấu trúc |
| Trùng chức năng với phase 3 (cả hai bám ATX) | Khác ở đầu ra: phase 3 phân cấp + `parent_content`; phase này phẳng + `metadata`. Là hệ quả của port đúng, không phải trùng lặp do thiết kế |
| Cắt cứng làm đứt từ tiếng Việt giữa chunk | ECVBot cắt cứng như vậy; port y nguyên. Ghi lại là hành vi đã biết, không tự ý sửa khác nguồn |
