# Phát triển Chunking Selectable — Phase 1–3: Registry → API+UI → Parent-Child Markdown

**Date**: 2026-08-21 11:56
**Severity**: Medium (4 sự cố phát hiện, cố ý để lại khoảng xác minh)
**Component**: Chunking strategy selection, vector-store persistence, ESM module loading
**Status**: Resolved (phases 1–3 complete; phases 4–5 deferred)

---

## What Happened

Thực hiện ba phase đầu của kế hoạch 5 phase về chiến lược chunking có thể lựa chọn lúc upload. Tổng cộng 10 commit trên `master`. Bộ test tăng từ 185 sang 234 (tất cả xanh); `tsc --noEmit` và `eslint` sạch; frontend build thành công.

**Phase 1** — Flat registry thay cho hàm `splitText` duy nhất, đăng ký `RECURSIVE_CHARACTER` chạy y nguyên logic cũ. Độ cô lập hoàn toàn; hành vi ngoài không đổi. Cộng thêm: đưa `scripts/` vào cổng kiểm type+lint, phát hiện ngay `await` vô nghĩa ở `reset-corpus.ts:45`.

**Phase 2** — Cột `Document.chunkingStrategy` (nullable), route multipart `chunkingStrategy` field qua `POST /documents`, validate 400 cho giá trị không thuộc nhóm chiến lược **đã có implementation** — nên `SEMANTIC` cũng bị 400 cho tới phase 5, thay vì nhận tệp rồi để job fail. Dropdown ẩn lúc chỉ có 1 lựa chọn.

**Phase 3** — Port `PARENT_CHILD_MARKDOWN` từ ECVBot (remark-parse + unified + mdast-util-to-string), cắt đoạn con 500/100 từ thân section, tổ tiên là breadcrumb + thân. Câu `INSERT` mở rộng 5 → 7 cột để ghi `parent_content` và `metadata`. Lọc trùng ngữ cảnh `/ask` (`distinctByContent`). Mô tả chiến lược hiển thị dưới dropdown.

---

## The Brutal Truth

Bốn vết xẹo sâu được bắt **sau khi** code xanh, hoặc bị phát hiện qua audit:

1. **Test tự-tham-chiếu lặp lại ở hai phase.** Phase 1 viết 5 test tương đương bằng cách chạy lại chính implementation — nó chứng minh *wiring* nhưng không phát hiện nếu `splitText` đổi output. Đã chứng minh bằng mutation: đổi `overlap` 100→50 thì **chỉ** test ghim giá trị mong đợi mới đỏ, cả 5 test tương đương + 5 test của `splitText` gốc đều xanh. Kiểu lỗi này **lặp lại ngay ở phase 3** ở `vector-store.service.spec.ts`: spec kiểm danh sách cột + mảng tham số nhưng **không** kiểm chuỗi `VALUES ($1,$2,...)` — nên `VALUES ($1,$2,$4,$3,...)` (buộc chiến lược vào cột cha) vẫn pass cả 4 test. Phát hiện qua mutation lần thứ hai, đã sửa và thêm assertion.

2. **Thoái lui âm thầm với `?? DEFAULT_CHUNKING_STRATEGY`.** Nó chỉ chạy khi cột có giá trị mà không parse được — **không ghi log**. Tệ nhất ở `scripts/backfill-embeddings.ts`: script purge-then-insert toàn bộ tài liệu `completed`, nên một lần hạ cấp âm thầm là **lệch vĩnh viễn** giữa row `Document` và chunk của nó. Loại lỗi im lặng này bị bắt **hai lần** khác: sau phase 1 phát hiện script cũ ghi `'recursive'` khi upload mới ghi `'RECURSIVE_CHARACTER'` → khiến ba giá trị cùng tồn tại; sau phase 3 nhận ra backfill sẽ xoá luôn `parent_content` và rewrite đoàn parent-child thành chunk phẳng.

3. **`prisma migrate dev` gần như xoá full-text search.** Nó báo sắp drop cột `search_tsv` (generated column, 33 non-null, có index GIN) vì `schema.prisma` không diễn đạt được nó. Chỉ dừng vì shell non-interactive. Migration phải viết bằng tay rồi `prisma migrate deploy` (tiền lệ đã có `20260812210000_document_source/migration.sql`). Xác nhận sau: `search_tsv` vẫn đủ 33/33 dòng.

4. **Giả định ESM sai một cách bạo lực.** Plan phỏng đoán ECVBot chạy được ESM trong Jest không cấu hình gì nên eDIP cũng chạy — đã ghi UNVERIFIED ở plan nhưng rơi quên verify. Thực tế: Jest có module registry riêng, nạp `unified` như CommonJS và ném `SyntaxError: Unexpected token 'export'`. Hỗ trợ `require(esm)` của Node 22 không giúp. Phải dùng `transformIgnorePatterns` allowlist cho micromark/remark, viết để khớp **cả** layout `.pnpm/<tên>@<ver>/` lẫn `node_modules/<tên>` phẳng — nếu chỉ một thì sẽ âm thầm ngừng tác dụng khi đổi package manager. Reviewer kiểm toàn bộ closure: 42 package, 34 ESM-only. Rủi ro còn: minor version của remark kéo package mới sẽ làm test đỏ cho tới khi thêm tên vào allowlist — **đỏ ồn ào**, không sai âm thầm.

---

## Technical Details

**Test mutant đại loại này:**
```bash
# Phase 1: đổi overlap 100 → 50 ở splitText
# ✓ 5 test tương đương vẫn xanh (vì chúng tính expected qua splitText)
# ✓ 5 test gốc của splitText vẫn xanh (so với text-splitter cũ)
# ✗ 2 test ghim giá trị → đỏ (chứng minh mutation được bắt)
```

**ESM trong Jest:**
```typescript
// Phase 3 bước 0 — phép thử 3 dòng
const { unified } = await import('unified');
const result = unified().use(remarkParse).parse('# A');
expect(result.children).toHaveLength(1); // đỏ ngay
```

**Silent fallback — sequence nguy hiểm:**
```
Phase 2 end → upload ghi 'RECURSIVE_CHARACTER'
Phase 2 end → backfill vẫn ghi 'recursive' (bỏ sót script)
  ⇒ Đã fix: đọc từ Document.chunkingStrategy thay vì DEFAULT
Phase 3 end → backfill purge-then-insert, không truyền parentContent
  ⇒ Đã fix: truyền parentContent + metadata qua cả script
```

**Baseline trước phase vs sau phase 3:**
```
BEFORE: Document 33 | embedding_chunks 104 | parent_content non-null 0 | strategies khác nhau 1
AFTER:  Document 33 | embedding_chunks 104 | parent_content non-null >0 | strategies khác nhau >1
```

**Node version requirement tăng:** `engines.node >= 22.12` vì `dist/` biên dịch `await import()` → `require('unified')`, chỉ chạy được nhờ require(esm) support. Test vẫn xanh trên Node 20 (jest transpile), nhưng runtime sẽ ném `ERR_REQUIRE_ESM`.

---

## What We Tried

| Sự cố | Cố gắng 1 | Kết quả 1 | Cố gắng 2 | Kết quả 2 |
|---|---|---|---|---|
| Test tự-tham-chiếu phase 1 | Viết spec tương đương đầu vào | Pass (nhưng rỗng) | Ghim giá trị mong đợi + mutation | ✓ Bắt được mutation |
| Test tự-tham-chiếu phase 3 | Kiểm cột + tham số | Pass (nhưng sai) | Thêm assertion `VALUES (...)` | ✓ Mutation đỏ ngay |
| Script fix không áp dụng | Python in "fixed" | Xem không có warn | Thêm assert pattern match | ✓ Bắt được 2 mismatch |
| Remark ESM vỡ Jest | Giảm scope → regex ATX | ✗ Vẫn phải parse | `transformIgnorePatterns` allowlist | ✓ Xanh, 42/42 dep phủ |
| Prisma migrate dev drop `search_tsv` | Manual rollback plan | (Coi sơ qua) | Viết đầy đủ 4 bước rollback | ✓ Plan ghi được |

---

## Root Cause Analysis

| Lỗi | Nguyên nhân căn bản |
|---|---|
| Test tự-tham-chiếu | Lộn xộn giữa "test tương đương" và "test ghim". Tương đương chỉ chứng minh refactor, không phát hiện behavior change |
| Silent fallback | `??` operator mà không ghi log. Thoái lui là hợp lý nhưng phải bị quán sát |
| Prisma drop tsv | Nợ kỹ thuật: cột generated không diễn đạt được trong `schema.prisma`. Schema lệch vs DB thực |
| ESM sai | Giả định "nếu A chạy được trên B thì C cũng chạy được trên B" mà B là cấu hình khác nhau (jest vs webpack vs node). Chưa verify trước implement |

---

## Lessons Learned

1. **Kiểm mutation trước merge, đặc biệt test equivalence.** Nếu chỉ compare code path, hãy ghim giá trị expected cứng. Cập nhật test = cập nhật expected.

2. **Ghi log ở fallback path.** Một lần thoái lui im lặng là một lần dữ liệu lệch. `??` hay `||` phải đi kèm `logger.warn()`.

3. **Verify UNVERIFIED trước khi code.** Nếu phase file viết "UNVERIFIED", làm ngay bước kiểm trước khi viết line code chính. Không ngó lơ vì "người khác cùng trường hợp làm được".

4. **Script bảo trì phải là first-class citizen.** Không ghi sửa code app mà bỏ sót script. Kiểm `git grep --untracked` toàn bộ repo, không chỉ `src/`.

5. **Generated column là nợ kỹ thuật.**  Prisma không biết, Migration phải tay viết, risk của divergence cao. Tài liệu hoá rõ.

6. **Cấu hình jest/webpack/node là ba môi trường khác nhau.** ESM chạy ở một nơi không có nghĩa nó chạy nơi khác. Thử ngay lúc thiết kế, không lúc implement.

---

## Next Steps

| Việc | Owner | Timeline | Mức độ |
|---|---|---|---|
| Phase 4 (DOCUMENT_STRUCTURE, cắt ATX) | [tạm hoãn] | [không chốt] | [optional - low corpus match] |
| Phase 5 (SEMANTIC) | [tạm hoãn] | [không chốt] | [optional - chi phí cao] |
| Xác nhận dropdown render bằng mắt lúc có 2 chiến lược | next browser check | ASAP | cosmetic |
| Test rollback migration (psql, không Jest) | next sprint | [khi cần] | low risk, good to have |
| Verify xung quanh full-text search (schema vs DB) | next sprint | [long-term] | tech debt |
| Google Drive import live test (cần OAuth) | [blocked] | [tây ba] | functional |

Dropout sau phase 3 là **cố ý theo quyết định**: corpus chỉ 4/32 tài liệu có ATX heading, nên phase 4 phục vụ 12% dữ liệu còn chi phí ~2× (88 lượt call thay vì 40). Cân nhắc kỹ xem có đáng implement khi người dùng không có nhu cầu rõ.

---

## Unverified At Handoff

Dưới đây **chưa chạy hoặc chỉ typecheck:**

- Dropdown `Select` hiện lần đầu ở phase 3 nhưng chưa xem bằng mắt (render test/browser)
- Migration rollback chưa chạy live (psql); chỉ verify plan, không execute
- Google Drive import: spec chỉ chốt 3-tham-số caller, không real OAuth
- `extractForDocument(..., contents)` chưa chạy runtime (FalkorDB disconnected lúc kiểm phase 1, đường thoái lui chạy thay vào)

---

## Measured Outcomes

**Corpus degeneration — Parent-Child Markdown:** Chỉ 4/32 tài liệu có ATX heading. Phần còn lại collapse thành một section duy nhất: mỗi child lưu **cả tài liệu** làm cha. Đo: một tệp 8.887 ký tự → 23 child, 192KB cha (15–21× lượng byte). **Đã ghi chú trên UI**, không đổi hành vi per dự định.

**Ingest cost tăng:** Child cắt bằng `splitText` 500/100 (không recursive) nên child lớn nhất 3.697 ký tự so với mục tiêu 500. Chunk count tăng gấp đôi (~40 → ~88 call per doc). `entity-extraction` gọi LLM 2 lần/chunk nên tổng tăng gấp đôi. Graph extraction lỗi bị nuốt, nên biểu hiện sẽ là **graph rỗng im lặng**, không phát hiện.

**Edit script không áp dụng âm thầm:** Một sửa regex print "fixed" mà không assert pattern match. Probe phát hiện. Đã thêm assert, và assert đó lập tức bắt thêm một mismatch cùng sai escape JSON.

---

**Status**: DONE_WITH_CONCERNS

**Summary**: Hoàn thành 3 phase, test tăng 185→234 (xanh). Bốn sự cố sâu bị phát hiện sau code xanh (test tự-tham-chiếu, thoái lui im lặng, ESM sai, Prisma drop cột), cố ý để lại khoảng xác minh (dropdown chưa render, rollback chưa test, import chưa live).

**Concerns/Blockers**:
- Dropout sau phase 3 là cố ý (corpus match thấp); cân nhắc phase 4–5 kỹ
- ESM allowlist có rủi ro breakage khi remark minor bump
- Node 22.12+ yêu cầu mới; Node 20 sẽ fail lúc chunk markdown runtime (test vẫn xanh)
