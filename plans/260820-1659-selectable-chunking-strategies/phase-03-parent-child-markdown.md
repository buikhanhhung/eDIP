---
phase: 3
title: "Parent Child Markdown"
status: pending
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

- [ ] Phép thử ESM xanh **trước khi** viết strategy
- [ ] `vector-store.service.spec.ts` tồn tại và pass — `INSERT` giờ có test bảo vệ
- [ ] Upload `.md` có heading → `SELECT count(*) FROM embedding_chunks WHERE parent_content IS NOT NULL` > 0
- [ ] Hỏi AI về tài liệu đó → đoạn trích trả về là **đoạn cha** (dài hơn con), qua `COALESCE` đã có
- [ ] Mọi child của một section có cùng `parentContent`
- [ ] Dropdown 2 lựa chọn
- [ ] 185 test cũ + test mới pass

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| Pure-ESM vỡ trong Jest CommonJS | Bước 0 là phép thử 3 dòng, chặn cả phase nếu đỏ. Hai đường lùi đã nêu sẵn |
| Sửa raw SQL mà không ai chứng kiến | Bước 4-5 viết spec **trước** — lý do chính phase này chọn TDD |
| Thêm 3 dependency cho một chiến lược | Đúng cái giá của "port i chang". Nạp lười nên không ảnh hưởng đường khởi động |
| Thứ tự param `$1..$7` lệch sau khi thêm 2 cột | Spec round-trip bắt được ngay; thêm cột vào giữa nên phải đổi số của các param sau — kiểm kỹ |
| Cha quá dài vượt cửa sổ ngữ cảnh | `CONTEXT_CHUNKS = 8` trong `ask.service.ts` không đổi; cha dài hơn con nên prompt to hơn — theo dõi, chưa xử lý ở phase này |
| 0 tài liệu seed có ATX heading | Fixture test phải tự chuẩn bị; `db seed` không kiểm được đường này |
