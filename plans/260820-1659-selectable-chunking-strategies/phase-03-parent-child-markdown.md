---
phase: 3
title: "Parent Child Markdown"
status: done
priority: P1
dependencies: [2]
effort: "3.5h"
---

# Phase 3: Parent Child Markdown

<!-- Updated: Validation Session 1 - đổi từ cắt regex ATX sang port y nguyên ECVBot: remark-parse + unified + mdast, breadcrumb parentContent, child 500/100; INSERT thêm cả metadata; thêm bước spike ESM-trong-Jest -->

## Overview

Port nguyên `PARENT_CHILD_MARKDOWN` của ECVBot: đi **AST mdast** qua `remark-parse`, gom section theo heading, dựng `parentContent` là **breadcrumb tổ tiên**, rồi cắt thân section thành **child nhỏ** — mọi child chia sẻ cùng một `parentContent`.

Đây là phase hồi sinh cột `parent_content` mà `vector-store.service.ts` đã đọc suốt qua `COALESCE(ec.parent_content, ec.content)` ở 2 truy vấn nhưng câu `INSERT` chưa bao giờ ghi.

Nguồn để port: `ECVBot/nestjs-backend/src/infrastructure/content-parser/chunking-strategies/parent-child-markdown.strategy.ts`

## Requirements

**Functional** — bám đúng ECVBot
- Parse bằng `remark-parse` + `unified`, lấy text node bằng `mdast-util-to-string`
- `DEFAULT_CHILD_SIZE = 500`, `DEFAULT_CHILD_OVERLAP = 100`, cho phép ghi đè qua config
- Chuẩn hoá `\r\n` → `\n`
- `parentContent` = breadcrumb tổ tiên của section (chuỗi heading cha) + thân section
- Child cắt từ thân section, **mọi child cùng một `parentContent`**
- Rỗng / chỉ khoảng trắng → `[]`
- `unified` và `remark-parse` là **pure-ESM** → nạp lười qua dynamic `import()` trong `ensureParser()`, đúng như ECVBot

**Non-functional**
- Thêm 3 dependency: `unified@^11`, `remark-parse@^11`, `mdast-util-to-string@^4` (khớp phiên bản ECVBot đang dùng)
- `INSERT` của vector-store phải ghi được **cả `parent_content` và `metadata`**

## Architecture

Child là thứ **được embed** (ngắn → vector nhọn). Parent là thứ **được trả về** cho model (dài → đủ ngữ cảnh). Đó chính là lý do `COALESCE(parent_content, content)` được viết sẵn từ trước.

```
markdown → remark-parse → mdast
  đi heading → section { breadcrumb tổ tiên, thân }
  parentContent = breadcrumb + thân
  child = splitText(thân, 500, 100)
  mỗi child: { content: child, parentContent }
```

**Hai cột phải thêm vào `INSERT`, không phải một.** Câu hiện tại:

```sql
INSERT INTO embedding_chunks (document_id, content, chunking_strategy, chunk_index, embedding)
```

Bảng đã có sẵn `parent_content` **và** `metadata` — cả hai chưa từng được ghi. Phase này thêm cả hai, vì phase 4 sẽ cần `metadata`.

**Rủi ro ESM-trong-Jest.** eDIP build CommonJS (`"module": "commonjs"`). Dynamic `import()` của package pure-ESM có thể bị hạ cấp thành `require()` và vỡ. ECVBot test strategy thật **không mock parser** và jest của họ **không cấu hình gì cho ESM** — nên với Node 22 nó chạy được. Nhưng đó là cấu hình của họ. **Bước 1 của phase này là phép thử 3 dòng** để biết ngay, trước khi xây gì.

## Related Code Files

**Create**
- `nestjs-backend/src/infrastructure/chunking/parent-child-markdown.strategy.ts`
- `nestjs-backend/src/infrastructure/chunking/parent-child-markdown.strategy.spec.ts`
- `nestjs-backend/src/infrastructure/vector-store/vector-store.service.spec.ts` — **spec đầu tiên cho file này**

**Modify**
- `nestjs-backend/package.json` — 3 dependency mới
- `nestjs-backend/src/infrastructure/vector-store/vector-store.service.ts` — `INSERT` thêm `parent_content` + `metadata`; `ChunkRecord` thêm 2 field
- `nestjs-backend/src/infrastructure/chunking/chunking.service.ts` — đăng ký khoá thứ 2
- `nestjs-backend/src/features/ingestion/ingest.consumer.ts` — truyền `parentContent` và `metadata` vào `replaceChunks`
- `frontend/src/features/documents/document-types.ts` — thêm entry (dropdown hiện ra, 2 lựa chọn)
- `nestjs-backend/scripts/backfill-embeddings.ts` — chỗ gọi `replaceChunks` **thứ hai**; kiểm lại sau khi `ChunkRecord` thêm field (field tuỳ chọn nên không vỡ compile, nhưng phải xác nhận)

## Implementation Steps

**Bước 0 — phép thử ESM, làm trước mọi thứ**

1. `pnpm add unified@^11 remark-parse@^11 mdast-util-to-string@^4`
2. Viết một spec tạm 3 dòng: `const { unified } = await import('unified')`, parse `'# A'`, assert có node. Chạy `pnpm test`
3. **Nếu đỏ** → dừng, chọn một trong hai: cấu hình `transformIgnorePatterns` cho jest, hoặc thay bằng cắt regex ATX. **Không đi tiếp khi bước này chưa xanh** — cả phase phụ thuộc vào nó

**Tests trước — vector-store trước tiên vì nó chưa từng có spec**

4. `vector-store.service.spec.ts`: `replaceChunks` với `parentContent` + `metadata` → đọc lại thấy đúng cả hai cột
5. Cùng spec: cả hai undefined → cột NULL, và truy vấn `COALESCE` trả về `content`
6. `parent-child-markdown.strategy.spec.ts` — đối chiếu spec của ECVBot:
   - rỗng / chỉ khoảng trắng → `[]`
   - `# A` + `## B` → cắt theo cả H1 và H2
   - mọi child của cùng section chia sẻ **đúng một** `parentContent`
   - `content.length < parentContent.length` cho mọi chunk
   - `parentContent` chứa breadcrumb tổ tiên (heading cha xuất hiện trong parent của section con)
   - markdown không có heading → hành vi giống ECVBot (không tự ý đổi khác nguồn)
7. `pnpm test` → đỏ

**Rồi mới code**

8. `ChunkRecord` thêm `parentContent?: string` và `metadata?: unknown`
9. `INSERT` thành 7 cột, `metadata` truyền dạng JSON
10. Port `parent-child-markdown.strategy.ts`: giữ `ensureParser()` nạp lười, giữ tên hằng và cấu trúc `extractSections` của ECVBot
11. Đăng ký registry
12. `ingest.consumer.ts` truyền `parentContent` và `metadata`. **Embedding vẫn chỉ embed `c.content`** — không đổi
13. Frontend thêm entry
14. `pnpm test` + typecheck + frontend build

## Success Criteria

- [x] Phép thử ESM xanh **trước khi** viết strategy — nhưng **đỏ ở lần đầu**, xem ghi nhận bên dưới
- [x] `vector-store.service.spec.ts` tồn tại và pass — `INSERT` giờ có test bảo vệ
- [x] Upload `.md` có heading → 4/4 chunk có `parent_content`, mỗi cha dài hơn con
- [x] Hỏi AI về tài liệu đó → citation trả về **đúng đoạn cha**, có cả breadcrumb `[H1] > [H2]`
- [x] Mọi child của một section có cùng `parentContent`
- [x] Dropdown 2 lựa chọn — **chưa xem bằng mắt**, xem ghi nhận
- [x] 185 test cũ + test mới pass (234 sau khi sửa theo review)

## Đã triển khai — 21/08/2026

**Phép thử ESM đỏ ở lần đầu.** Giả định của plan — "ECVBot chạy được với jest không cấu hình ESM nên eDIP cũng chạy" — được đánh dấu UNVERIFIED, và **nó sai**. Jest có module registry riêng, nạp `unified` như CommonJS và ném `SyntaxError: Unexpected token 'export'`; hỗ trợ `require(esm)` của Node 22 không giúp gì vì jest không đi qua loader của Node. Đã dùng đường lùi (a) mà chính phase file nêu sẵn: thêm `transformIgnorePatterns` cho nhánh ESM của remark/micromark, viết để khớp **cả** layout `.pnpm/<tên>@<ver>/` lẫn `node_modules/<tên>` phẳng — nếu chỉ khớp pnpm thì khi đổi package manager nó sẽ âm thầm ngừng tác dụng.

Reviewer đã tự truy toàn bộ closure của 3 dependency mới: 42 package, 34 ESM-only, allowlist phủ **hết** ở cả hai layout. Rủi ro còn lại: đây là allowlist theo tên trên cây phụ thuộc của người khác, nên một bản minor của micromark/remark kéo thêm package mới sẽ làm test đỏ cho tới khi thêm tên. Chấp nhận được vì **đỏ ồn ào**, không phải sai âm thầm — công thức xử lý: gặp `Unexpected token 'export'` thì thêm tên package vào danh sách trong `package.json` và `test/jest-e2e.json` (hai chỗ, đã đồng bộ).

| Việc | Vì sao |
|---|---|
| Child cắt bằng `splitText(body, 500, 100)` của eDIP, không phải recursive splitter của ECVBot | Theo plan. Hệ quả thật: `splitText` cắt theo dòng trống và **để nguyên đoạn dài**, nên một section là một đoạn liền sẽ ra **một** child to. Đo trên corpus thật: child lớn nhất 3.697 ký tự so với mục tiêu 500 |
| Bỏ `chunkIndex` và `config` của ECVBot | eDIP gán `chunkIndex` lúc ghi theo vị trí trong mảng; chữ ký `ChunkingStrategy` không có đường truyền config, nên 500/100 là hằng |
| Cache parser ở cấp module, không phải field của instance | Strategy là hàm, không phải provider. Reviewer xác nhận an toàn: hai lần gọi đầu đồng thời đều nhận parser dựng đủ, jest cô lập registry theo từng file test |
| `vector-store.service.spec.ts` **stub Prisma**, không chạm DB | Cả 29 suite của repo này chạy không cần hạ tầng; bắt `pnpm test` cần Postgres là thay đổi lớn hơn ý định của phase. Mock quyết định trọn vẹn phần **câu lệnh và thứ tự tham số** — đúng lỗi mà phase lo. Vòng round-trip kiểm bằng DB thật ở cuối phase |
| Truyền `parentContent` + `metadata` qua cả `scripts/backfill-embeddings.ts` | Phase file chỉ yêu cầu *kiểm tra không vỡ compile*. Nhưng nếu không truyền, một lần `pnpm backfill:embeddings` sẽ ghi lại tài liệu parent-child thành chunk phẳng — cùng loại lỗi hạ cấp âm thầm đã bắt được sau phase 1 |
| Bỏ `parentContent` khi nó **trùng nguyên văn** `content` | Review tìm ra hai đường tới trạng thái đó: setext heading (`Tiêu đề` + `=====`, regex chỉ bóc ATX) và section không có heading vừa gọn trong một child. Khi đó `COALESCE` trả về đúng chuỗi cũ, mà cột lưu hai lần |
| Regex bóc heading cho phép **thiếu** ký tự xuống dòng | Heading cuối tài liệu không có `\n`, nên body không bao giờ rỗng và `# Tiêu đề cuối` bị phát ra thành chunk chứa chính tiêu đề nó. ECVBot có đúng lỗi này |
| Thêm `engines.node >= 22.12` | `dist` biên dịch `await import()` thành `require('unified')`. Chỉ chạy được nhờ Node 22.12+ (require(esm)). Trên Node 20 thì cùng `dist` đó ném `ERR_REQUIRE_ESM` ở lần chunk markdown đầu tiên — và **không test nào bắt được**, vì jest transpile dependency nên test vẫn xanh |
| Lọc trùng ngữ cảnh `/ask` (`distinctByContent`) | Sinh ra từ chính phase này: mọi child của một section trả về **cùng một** cha, mà sibling thì xếp hạng cạnh nhau, nên top-8 thường là 8 bản của một đoạn. Đo được tệ nhất ~67KB cho một câu hỏi. Lọc ở chỗ fuse chứ không sau khi cắt, để chỗ trống nhường cho đoạn **khác** thay vì co ngữ cảnh lại |
| Thêm dòng chú thích dưới `Select` | 4/32 tài liệu có ATX heading; PDF/DOCX/scan không bao giờ có. Nhãn vẫn là tên kỹ thuật theo quyết định cũ, lời giải thích đặt riêng bên dưới — đúng khuôn mà phase 5 dự định cho cảnh báo chi phí của `SEMANTIC` |

**Ghi nhận trung thực:**

- **Test của chính tôi có lỗi cùng loại đã bị bắt ở phase 1.** `vector-store.service.spec.ts` kiểm danh sách cột và mảng tham số, nhưng **không** kiểm chuỗi `VALUES ($1, $2, ...)`. Nghĩa là `VALUES ($1, $2, $4, $3, ...)` — buộc chiến lược vào `parent_content` — vẫn pass cả 4 test. Đã thêm assertion và **kiểm chứng bằng mutation**: đảo `$3`/`$4` thì test đỏ
- Một lần sửa regex **âm thầm không áp dụng**: script python in "fixed" mà không assert chuỗi cần thay có khớp. Chỉ có probe phát hiện. Đã thêm assert vào các lần sửa sau, và assert đó lập tức bắt thêm một chuỗi không khớp cùng một escape JSON sai
- Chiến lược này **thoái hoá trên corpus thật**: chỉ 4/32 tài liệu có ATX heading, nên phần còn lại thành một section duy nhất và mỗi child lưu **cả tài liệu** làm cha. Đo được 15–21× lượng byte cha; một tệp 8.887 ký tự ra 23 child và 192KB cha. Đã ghi chú trên UI, **không** đổi hành vi
- **Chi phí nạp tăng ~2×** với chiến lược này: child 500 ký tự làm số chunk tăng gấp đôi (README 20 → 44), mà `entity-extraction` gọi LLM **2 lần mỗi chunk**. Tài liệu từng tốn ~40 lượt gọi giờ tốn ~88. Lỗi graph bị nuốt theo thiết kế, nên biểu hiện sẽ là **graph rỗng im lặng**, không phải lỗi
- Dropdown **chưa được xem bằng mắt**. Trước phase này khối `Select` chưa từng render lần nào. Nó typecheck, lint và build sạch, reviewer đã đọc và xác nhận không có đường index thiếu bảo vệ — nhưng đó không phải là đã render
- Còn hai điểm nhỏ giữ nguyên theo đúng nguồn ECVBot: `metadata.chunkingStrategy` trùng với cột `chunking_strategy`; nhánh `sections.length === 0` là code chết (nhánh preamble đã phủ). Cả hai đều có y nguyên trong ECVBot
- YAML frontmatter trong `.md` bị đọc như nội dung: `---\ntitle: t\n---` ra 2 chunk rác (remark đọc `title: t` + `---` thành setext H2). Chưa xử lý

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| Pure-ESM vỡ trong Jest CommonJS | Bước 0 là phép thử 3 dòng, chặn cả phase nếu đỏ. Hai đường lùi đã nêu sẵn |
| Sửa raw SQL mà không ai chứng kiến | Bước 4-5 viết spec **trước** — lý do chính phase này chọn TDD |
| Thêm 3 dependency cho một chiến lược | Đúng cái giá của "port i chang". Nạp lười nên không ảnh hưởng đường khởi động |
| Thứ tự param `$1..$7` lệch sau khi thêm 2 cột | Spec round-trip bắt được ngay; thêm cột vào giữa nên phải đổi số của các param sau — kiểm kỹ |
| Cha quá dài vượt cửa sổ ngữ cảnh | `CONTEXT_CHUNKS = 8` trong `ask.service.ts` không đổi; cha dài hơn con nên prompt to hơn — theo dõi, chưa xử lý ở phase này |
| 0 tài liệu seed có ATX heading | Fixture test phải tự chuẩn bị; `db seed` không kiểm được đường này |
