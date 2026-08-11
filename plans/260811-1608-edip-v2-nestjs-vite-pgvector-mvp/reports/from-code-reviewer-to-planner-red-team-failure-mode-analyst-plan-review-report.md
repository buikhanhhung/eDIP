# Red-Team Plan Review — Failure Mode Analyst

Plan: `plans/260811-1608-edip-v2-nestjs-vite-pgvector-mvp/`
Reviewer role: Flow Tracer / Failure Mode Analyst (hostile)
Date: 2026-08-11
Evidence base: `$ECVBOT_BE`, `$ECVBOT_FE`, `$V1` (eDIP-v2 is empty; all citations from reference repos)

---

## Finding 1: `embedding_chunks` DDL and the copied `insertBatch` cannot both be right — every chunk INSERT fails

- **Severity:** Critical
- **Location:** Phase 2, "2. Prisma schema + migration"; Phase 4, "1. Vector store (~20 phút)"

**Flaw.** Phase 2 says the raw SQL is "copy nguyên từ `$ECVBOT_BE/prisma/migrations/20260415083500_restore_embedding_chunks_table/migration.sql`, đổi khoá phạm vi", but the SQL actually written in the plan is a different table. Phase 4 then says to copy `vector-store.service.ts` and "Sửa đúng 2 chỗ" (search signature, delete method). That is false: `insertBatch` is incompatible with the plan's table on four counts.

Reference table (`migration.sql:14-24`):
```sql
id                SERIAL PRIMARY KEY,
kb_unit_id        TEXT NOT NULL,
knowledge_base_id TEXT NOT NULL,
...
chunking_strategy VARCHAR(50),
chunk_index       INTEGER,
```
Plan table (phase-02 lines 179-187): `id TEXT PRIMARY KEY` **with no DEFAULT**, no `chunking_strategy`, no `chunk_index`, `document_id` instead of the two scope keys.

Copied insert (`vector-store.service.ts:98-102`):
```
INSERT INTO embedding_chunks (kb_unit_id, knowledge_base_id, content, embedding, metadata, parent_content, chunking_strategy, chunk_index)
```

**Failure scenario.** First real chunk write in phase 3/4 throws `column "kb_unit_id" of relation "embedding_chunks" does not exist`; after renaming the scope key it throws on `chunking_strategy`; after dropping those it throws `null value in column "id" violates not-null constraint` because the reference relies on `SERIAL` and the plan chose `TEXT` with no generator and never says who mints the id. This lands at the start of phase 4 with 4.5h left and, because phase 3 step 5 also writes chunks, it retroactively breaks phase 3's persist step too.

**Evidence.**
- `$ECVBOT_BE/prisma/migrations/20260415083500_restore_embedding_chunks_table/migration.sql:14-24`
- `$ECVBOT_BE/src/infrastructure/vector-store/vector-store.service.ts:76-103`
- `$ECVBOT_BE/prisma/schema/embedding-chunk.prisma:12` (`id Int @id @default(autoincrement())`)
- Plan quote, phase-04 line 59: "Copy `$ECVBOT_BE/src/infrastructure/vector-store/`. Sửa đúng 2 chỗ"

**Suggested fix.** Either keep `id SERIAL PRIMARY KEY` (and stop calling `insertBatch` a 2-line change), or write `id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text`. Enumerate the full column diff in phase 2 and state explicitly that `insertBatch`'s column list and `$n` offsets must be rewritten (8 params → 5).

---

## Finding 2: Nothing in the pipeline is idempotent — retries and backfills silently duplicate chunks

- **Severity:** High
- **Location:** Phase 3, "2. Queue + consumer" and "5. Chunk"; Phase 4, "2. Thêm step embed"; Phase 5, "3. Nối vào pipeline + backfill"

**Flaw.** The reference codebase treats purge-then-reinsert as a stated invariant. The plan copies the insert half and drops the purge half.

`$ECVBOT_BE/src/engine/orchestration/kb-process-unit.workflow.ts:82-83`:
> "On retry the whole op re-runs; this is safe because `vectorStore.deleteByUnit` + `insertChunks` is a purge-then-reinsert (idempotent)."

and `:349-350` shows the actual pairing. `kb-process-gitbook-batch.workflow.ts:200` says the opposite case out loud: "maxRetryAttempts=0 per page: insertChunks is append-only".

The plan renames `deleteByUnit` → `deleteByDocument(documentId)` (phase-04 line 62) and then **never calls it** in the ingest consumer, in `backfill-embeddings.ts`, or in the merged backfill.

Second half of the same problem: `$ECVBOT_BE/src/shared/queue/queue.module.ts:9-21` registers queues with **no `defaultJobOptions`** — all retry/backoff config lives at each call site (`kb-process-unit.workflow.ts:633-636`, `kb-extraction-orchestrator.service.ts:121`, `extract-kb.consumer.ts:120-123`). Phase 3 step 1 writes `queue.add('ingest', { documentId })` with no options, so BullMQ defaults to `attempts: 1` — no retry at all — while plan.md's risk table and phase-03 talk as if retry exists.

**Failure scenario.** Two variants, both realistic on demo day:
1. Backfill script (phase 4/5, plan explicitly suggests merging them) dies on document 5 of 9 because Claude returned bad JSON twice. Operator re-runs it. Documents 1–4 now have two copies of every chunk. RRF fusion (phase-04 line 125, "gộp chunk-level về document-level bằng điểm cao nhất") masks it in search, but `/ask` retrieves top-8 chunks and now feeds Claude four duplicate passages, halving effective context and producing duplicate citations pointing at the same document.
2. If someone *does* add `attempts: 3` to match the ECVBot pattern, an `analyze`-stage throttle retries the whole job, re-running `chunk` → duplicate chunks per attempt. Entities survive this (composite PK upsert at phase-05 lines 95-99) but chunks do not.

Also unspecified: the merged backfill's failure isolation. The plan gives no per-document try/catch and no resume marker, so a mid-loop failure leaves the corpus half-embedded and half-entitied with no way to tell which.

**Evidence.** Citations above, plus plan quote phase-05 line 134: "Gộp backfill entity với backfill embedding của phase 4 vào **một** script nếu tiện — cùng vòng lặp qua 9 document."

**Suggested fix.** State in phase 3 step 5: `deleteByDocument(documentId)` immediately before every chunk insert, and the same at the top of each backfill iteration. Specify `attempts` explicitly in `queue.add` (1 or 3 — but say which, and if 3, the purge is mandatory). Wrap each document in the backfill in try/catch and log+continue.

---

## Finding 3: The auth design contradicts itself — copied guard returns 401, plan demands 403, copied axios turns 401 into a redirect loop

- **Severity:** High
- **Location:** Phase 2, "3. Auth + RBAC" and Success Criteria; Phase 7, "1. Rehearsal"

**Flaw.** Three copied pieces disagree, and the plan asserts the outcome without tracing the path.

Traced path for an anonymous `GET /audit`:
1. `APP_GUARD` → `AuthenticationGuard.canActivate` (`authentication.guard.ts:31`)
2. `getAuthTypeValue` finds no `@Auth` decorator → defaults to `{ authTypes: [AuthType.Bearer], condition: And }` (`authentication.guard.ts:44-48`)
3. `handleAndCondition` → `AccessTokenGuard` throws → rethrown as `UnauthorizedException` / `ERR_UNAUTHORIZED` (`authentication.guard.ts:71-90`)
4. **RbacGuard never runs.** Response is 401.

Plan phase-02 line 221 states: "Không có token → coi là `viewer` (không 401)". Plan phase-02 success criterion line 265: "`GET /audit` không token → **403** (không phải 401, không phải 200)". Plan phase-02 line 80 simultaneously lists `APP_GUARD Authentication` in `app.module`. These cannot all hold.

Compounding, phase-02 line 66 says to copy `src/common/` but "**bỏ** `api-key.guard.ts`". `authentication.guard.ts` imports it at line 14, injects it at line 22, and maps it at line 26 — deleting the file breaks compilation and DI of the very guard being registered.

Compounding again on the FE: `$ECVBOT_FE/src/lib/axios.ts:47-52` force-logs-out and sets `window.location.href = "/login"` on any non-`/auth/` 401.

**Failure scenario.** Phase 7 rehearsal step "đăng xuất → vào `/library` với tư cách khách → nav mất Upload/Search/Audit" (phase-07 line 50). Guest lands on `/library` → TanStack Query fires `GET /documents` → 401 → axios interceptor redirects to `/login` → guest can never see the anonymous-viewer behaviour the plan calls "đúng hành vi v1". The curl check in the same line expects 403 and gets 401. Both are named acceptance criteria in `plan.md` line 88.

**Evidence.** `$ECVBOT_BE/src/common/guards/authentication.guard.ts:14,22,26,44-48,68,71-90`; `$ECVBOT_BE/src/app.module.ts:160-163`; `$ECVBOT_FE/src/lib/axios.ts:47-52`; `$V1/src/lib/roles.ts:17-21` (matrix itself is correct as ported).

**Suggested fix.** Pick one model and write it down. Recommended: keep the global guard but define an `@Auth(AuthType.None)` (or `@Public()`) escape hatch on the read endpoints, and have `RbacGuard` resolve absent identity to `viewer` so it can throw 403. Either keep `api-key.guard.ts` or delete `ApiKeyGuard` from `AuthenticationGuard`'s map and constructor in the same step. Add an axios rule: do not auto-logout on 401 for read endpoints.

---

## Finding 4: The phase-1 fallback is named but not designed, and it is irreversible after phase 2

- **Severity:** High
- **Location:** Phase 1, "Risk Assessment" (`AccessDeniedException` row); `plan.md` "Quyết định kiến trúc cứng"

**Flaw.** The gate's whole value is that failing it changes the plan. But the fallback branch is one table cell and touches nothing downstream.

What the fallback actually requires, none of which appears in any phase's Related Code Files:
- `$V1/src/lib/ai/heuristics.ts:8-11` — the rule-based analyzer ("Deterministic and offline — this is what makes the demo reproducible without an LLM key"). Phase 3's port list (line 54) includes only `extraction/{index,plain-text,pdf,docx,allowlist}.ts`.
- `$V1/src/lib/extraction/ocr.ts:3` — tesseract.js worker with `vie`+`eng` traineddata. The plan deliberately replaced OCR with Claude vision (phase-03 line 91-93). With Bedrock down there is **no** text path at all for scanned PDFs or images, and phase-03's success criterion "Upload ảnh chụp có chữ Việt → `textSource='vision'`" is unreachable.
- `/ask` has no v1 equivalent. `$V1/src/lib/ai/index.ts:10-16` picks `mockProvider` when no key exists — that is analyze-only. Phase 4's entire RAG feature and `plan.md` acceptance line 91 have no fallback.

**Failure scenario (the ordering trap).** Phase 1 timeboxes at 30 minutes and instructs: fall back to a 384d local model and "**phải đổi migration sang `vector(384)` trước khi chạy phase 2**". Suppose IAM model access is granted at 14:00, after phase 2 ran. The `vector(1024)` column and the `search_tsv` generated column are in the same already-applied init migration. Editing that file makes `prisma migrate deploy` fail on checksum mismatch; the only stated-nowhere recovery is `docker compose down -v` + re-migrate + re-seed + re-backfill — which discards the seeded corpus, the uploaded demo files on disk under `STORAGE_DIR`, and every audit row. `plan.md` line 77 correctly flags "Embedding dimension 1024 — đổi là phải migrate lại toàn bộ" but no phase owns the procedure.

**Evidence.** Citations above; plan quote phase-01 line 140; `plan.md` lines 77 and 100.

**Suggested fix.** Add to phase 1: (a) an explicit fallback work-breakdown listing `heuristics.ts` + `ocr.ts` ports and stating that `/ask` is cut, not degraded; (b) a one-way-door note that the dimension decision is final once phase 2's migration is applied, with the documented recovery being `down -v` + full re-seed; (c) move the embedding dimension into a separate second migration so it can be re-issued without touching the init migration checksum.

---

## Finding 5: Prisma 7 setup is under-specified — no `prisma.config.ts`, and the "vector is unsupported" premise is wrong

- **Severity:** High
- **Location:** Phase 2, "2. Prisma schema + migration" and Success Criteria

**Flaw A — missing config file.** The reference project on the exact version the plan pins (`@prisma/client@7.5.0`, `prisma@7.5.0`) does not use `package.json#prisma.seed` as its source of truth; it uses `prisma.config.ts`:
```ts
import 'dotenv/config';
export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema'),
  migrations: { path: ..., seed: 'ts-node ./prisma/seed.ts' },
  datasource: { url: process.env.DATABASE_URL! },
});
```
Note `import 'dotenv/config'` — Prisma 7 no longer auto-loads `.env`. The plan writes `.env` in phase 1 (lines 113-122) and then asserts `pnpm prisma migrate deploy` and `pnpm prisma db seed` pass (phase-02 lines 257, 259) without ever creating `prisma.config.ts`.

**Flaw B — false premise.** Phase-02 line 172 states: "`embedding_chunks` **không** khai trong Prisma (Prisma chưa hỗ trợ type `vector`)". The reference disproves this: `prisma/schema/embedding-chunk.prisma` models the same table with `embedding Unsupported("vector(1024)")?` and `@@map("embedding_chunks")`, keeping raw SQL only for writes and vector search. Keeping the table (and the raw `search_tsv` column and `immutable_unaccent`) entirely outside Prisma's model means Prisma sees them as drift.

**Failure scenario.** A. `pnpm prisma migrate deploy` fails at phase 2's very first gate with "Environment variable not found: DATABASE_URL", burning gate time on tooling rather than schema. B. Later in the day someone adds a field (e.g. phase 6 needs nothing, but phase 4/5 iteration commonly does) and runs `prisma migrate dev`. Prisma diffs the DB against `schema.prisma`, sees an unmodelled table plus an unmodelled generated column, and emits `DROP TABLE embedding_chunks` / `DROP COLUMN search_tsv` in the new migration. Applied without reading, that wipes every embedding and the FTS index mid-afternoon.

**Evidence.** `$ECVBOT_BE/prisma.config.ts:1-14`; `$ECVBOT_BE/prisma/schema/embedding-chunk.prisma:11-28`; `$ECVBOT_BE/prisma/schema/base.prisma:1-13` (note `previewFeatures = ["postgresqlExtensions"]` and `extensions = [pgvector(map: "vector")]`, neither present in the plan's schema sketch); `$ECVBOT_BE/package.json:64-65,124`.

**Suggested fix.** Add `prisma.config.ts` (with `import 'dotenv/config'`) to phase 2's Create list. Add the `Unsupported("vector(1024)")` model + `@@map` so Prisma owns typed reads and stops treating the table as drift. Add `previewFeatures`/`extensions` to the datasource block. Add an explicit rule for the day: `migrate deploy` only, never `migrate dev`, and if `migrate dev` is used, read the generated SQL before applying.

---

## Finding 6: `/ask` retrieval does not exist as specified, and its only real branch may return zero rows silently

- **Severity:** High
- **Location:** Phase 4, "3. Search hybrid + RRF" and "4. Ask / RAG"

**Flaw A — the chunk-level pipeline is not built.** Phase-04 line 132 says Ask should "retrieve top-8 chunk (dùng chính pipeline search, cấp chunk)". But the pipeline defined in step 3 is document-level: branch B queries `FROM "Document"`, branch C queries `FROM "Document"`, and line 125 explicitly says "Gộp chunk-level (nhánh A) về document-level ... rồi RRF trên 3 danh sách documentId". Chunk identity is discarded before fusion. There is no chunk-level lexical or metadata branch anywhere in the plan. So Ask's retrieval degenerates to branch A alone — pure vector — despite the architecture diagram implying hybrid.

**Flaw B — branch A can be silently dead.** Phase 2 creates the ivfflat index in the init migration, on an empty table:
```sql
CREATE INDEX embedding_chunks_embedding_idx
  ON embedding_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```
Rows only arrive in phase 4's backfill, hours later. pgvector builds ivfflat centroids from the data present at index-build time; built empty, the index has no usable lists and ANN queries can return zero or near-zero rows even though the data is there. The reference migration has the same shape but was applied to a database that already contained chunks (`migration.sql:1-12` describes restoring an existing populated table).

**Failure scenario.** Phase 4's success criteria pass anyway: `POST /search { q: 'hợp đồng' }` and `{ q: 'hop dong' }` both succeed via the lexical branch, so the fold-dấu test is green. But `POST /ask` returns "Không tìm thấy thông tin này trong kho tài liệu" for *every* question, including the demo's `tóm tắt chính sách bảo mật`. The team then debugs the prompt, the citation regex, and Claude — because the plan's own criterion for a working search is already green. The plan's risk row ("nếu kết quả lạ, `DROP INDEX`") is reactive and requires noticing, and the two acceptance criteria are designed so the failure looks like correct behaviour.

**Evidence.** Plan phase-04 lines 32-38 (architecture), 89-111 (document-level SQL), 125, 132; phase-02 lines 189-190; `$ECVBOT_BE/prisma/migrations/20260415083500_restore_embedding_chunks_table/migration.sql:1-12,38-40`.

**Suggested fix.** Drop the ivfflat index from the init migration entirely — at ~200 chunks a sequential scan is faster and always correct; create it (if ever) after backfill. Rewrite phase 4 step 4 to specify the actual chunk retrieval query (vector top-8 over `embedding_chunks` plus a chunk-level `content ILIKE`/tsvector fallback), and add a success criterion that asserts a non-empty chunk set *before* the LLM call.

---

## Finding 7: `Promise.all` makes search all-or-nothing, and no query filters by status

- **Severity:** Medium
- **Location:** Phase 4, "3. Search hybrid + RRF"; Phase 2, "4. Seed"

**Flaw A.** Phase-04 line 89: "`search.service.ts` chạy 3 query song song (`Promise.all`)". Branch A calls Bedrock (`generateEmbeddings`). `Promise.all` rejects on the first rejection, so a single throttle, timeout, or expired-credential error on the embedding call takes down the entire `/search` endpoint — including the two branches that only touch Postgres and would have returned a perfectly good answer. During a live demo on hotel wifi this converts a degraded result into a 500 and an error banner.

**Flaw B.** None of the three SQL branches filters on `Document.status`. Phase 2 step 4 deliberately seeds one document as `status='failed'` for the dashboard's red tile, and phase 3's requirement is that failed documents "vẫn hiện trong library". Consequence: a `failed` document (and any document sitting in `processing` with partial `textContent`) is a first-class search hit, a first-class graph node, and — once its chunks exist without embeddings — a candidate for Ask. The plan never defines what `status` means for retrieval.

**Failure scenario.** Demo step 3: searching `hợp đồng` returns the deliberately-broken seeded document alongside real ones, and the reviewer clicks it. Or: a document that failed mid-pipeline (chunks written in step 5, embed threw in phase 4's step) shows up in lexical search with a red badge while its chunks sit in `embedding_chunks` with `embedding = NULL` — matching phase-04's `WHERE ec.embedding IS NOT NULL` guard for vector but nothing else.

**Evidence.** Plan phase-04 lines 89-111 (no `status` predicate in any of the three queries); phase-02 line 237; phase-03 line 23 and line 154; `$ECVBOT_BE/src/infrastructure/vector-store/vector-store.service.ts:44-50` (reference also has no status concept — it scopes by tenant join instead, which the plan removes).

**Suggested fix.** Use `Promise.allSettled` and degrade to whichever branches returned; log the failed branch. Add `WHERE status = 'completed'` to branches B and C and to the graph query, and state the rule once in phase 4: only `completed` documents are retrievable.

---

## Finding 8: Seeded corpus does not carry what phases 5 and 6 need, and phase 7's "no Bedrock needed" claim depends on Bedrock

- **Severity:** Medium
- **Location:** Phase 2, "4. Seed"; Phase 5, "1. Chuẩn hoá tên entity" and "3. backfill"; Phase 6, "3. Highlight"; Phase 7, Risk Assessment

**Flaw — three shape mismatches the plan never maps.**

`$V1/data/documents.json` (9 records, all `status: completed`, all `mimeType: text/markdown`) nests everything under `analysis`: `{type, typeConfidence, metadata, summary, tags, entities}`, where `metadata` uses `documentDate`/`currency` and each entity is `{kind, value, confidence}`.

1. **Seed drops the analysis.** Phase-02 line 235 says only: "insert 9 Document với `status=completed`, `textContent` đã có, `textSource='native'`". No mention of `documentType`, `summary`, `title`, `metadata`. But phase 2's own success criterion (line 262) and `plan.md` line 93 require the dashboard to count "theo loại". With `documentType` null on all nine seeded rows, the "by type" tile is empty at the end of phase 2 — the phase the plan advertises as "đã demo được".
2. **Entity taxonomy mismatch.** v1's entity kinds are `company · person · project · department · amount · date` (`$V1/docs/feature-status.md:167`, with `department 6` of 31 entities at `:169`). The plan's zod enum (phase-03 lines 115-116) is `company|person|contract|invoice|project|date|amount` — no `department`, plus two kinds v1 never produced. Reusing v1's stored entities requires a mapping the plan does not define; passing them through the zod schema drops six of them.
3. **No offsets in the seed corpus.** v1 entities carry `{kind, value, confidence}` and nothing else. Phase-06 line 83 asserts "Offset đã có sẵn trong `DocumentEntity.charStart/charEnd` từ phase 3 (đã xác minh bằng `indexOf` ở server, nên **chắc chắn đúng**)". For the nine seeded documents — which *are* the demo corpus for steps 3, 4 and 5 — offsets only exist if `backfill-entities.ts` re-runs Claude analysis, which phase-05 line 132 does specify. That makes phase-07 line 104's reassurance ("Seed đã có sẵn text + embedding + entity → bước 3,4,5 chạy không cần gọi Bedrock") true only at demo time and false at build time: constructing that state requires ~9 Claude calls plus embeddings, and is unavailable under the phase-1 fallback (Finding 4).

**Secondary — global unique on normalized name.** `Entity.normalizedName @unique` is global across types, and the upsert uses `update: {}` (phase-05 lines 90-94). The first document that mentions "Ecloudvalley Vietnam" fixes its `type` forever. If the first extraction labelled it `project` and later ones say `company`, the plan's own graph filter ("Lọc mặc định chỉ hiện `company`, `person`, `project`, `contract`, `invoice`") silently hides or mis-colours it, and there is no way to correct it short of SQL.

**Minor, same family.** Phase-01 line 69 tells the operator to "screenshot 1 trang PDF trong `$V1/data/uploads/`" for the vision test — that directory contains only nine `.md` files. The real fixtures (`born-digital.pdf`, `scanned-contract.pdf`, `vietnamese-scan.jpg`, `contract.docx`, `corrupt.pdf`) live at `$V1/seed/fixtures/`, which the plan mentions only as a bare `seed/` in phase 2's read list. Phase 7's rehearsal step 1 ("upload 3–5 file: 1 PDF text, 1 ảnh scan, 1 docx") never names them either.

**Evidence.** `$V1/data/documents.json` (9 records; keys `analysis, fileName, id, mimeType, ocrConfidence, ownerId, sha256, sizeBytes, status, storedPath, text, textSource, uploadedAt`); `$V1/docs/feature-status.md:167,169,190`; `$V1/seed/fixtures/`; plan phase-02 line 235, phase-03 lines 114-119, phase-05 lines 87-100, phase-06 line 83, phase-07 line 104.

**Suggested fix.** Spell out the seed field mapping (`analysis.type → documentType`, `analysis.metadata.documentDate → metadata.date`, `analysis.entities[].kind → type` with `department` added to the enum or mapped to `company`). Name `$V1/seed/fixtures/*` explicitly in phase 1 step 2 and phase 7 step 1. Change the entity unique key to `(type, normalizedName)` or accept first-seen type in writing.

---

## Finding 9: Upload trust boundary is described as something the ported code is not, and v1's stored-XSS control is dropped

- **Severity:** Medium
- **Location:** Phase 3, "1. Storage + upload endpoint"; Phase 6 (`document.download` audit) / Phase 2 RBAC matrix

**Flaw.** Phase-03 line 65 states: "Allowlist mime: port từ `$V1/src/lib/extraction/allowlist.ts` — từ chối trước khi ghi đĩa, **không dựa vào phần mở rộng tên file**". The file it names does exactly the opposite:

```ts
export function extensionOf(fileName: string): string { ... parts.pop().toLowerCase() }
export function allowedTypeFor(fileName: string): AllowedType | null {
  return ALLOWLIST[extensionOf(fileName)] ?? null;
}
```
(`$V1/src/lib/extraction/allowlist.ts:44-51`). The allowlist is 100% filename-extension-driven; the `mime` field is *derived from* the extension precisely because the browser-supplied `file.type` is untrusted (`allowlist.ts:16-19`). Porting it verbatim gives extension-based gating, which is fine — but the plan's stated guarantee is false, and anyone auditing the demo will find that `evil.exe` renamed to `evil.pdf` passes the gate (it then fails harmlessly in `unpdf`, but the claim is still wrong).

Second, `ALLOWLIST` includes `html`, `xml`, `log`, `tif`, `tiff` (`allowlist.ts:22-42`) — v1 admits them and neutralises them on the way out:
```ts
const NEUTRALISED_EXTENSIONS = new Set(["html", "xml", "svg"]);
export function downloadMimeFor(fileName: string) { ... "text/plain; charset=utf-8" ... }
```
with the reasoning at `allowlist.ts:61-69`: "An uploaded .html file served inline from this origin is stored XSS ... The blob route also sends `attachment` and `nosniff`; this is the third layer."

The plan ports the allowlist but ports **none** of the three layers. It keeps a `download` permission (`$V1/src/lib/roles.ts:18-19`, ported per phase-02 line 223) and a `document.download` audit action (phase-06 line 63), so a download endpoint exists — with no `Content-Disposition: attachment`, no `X-Content-Type-Options: nosniff`, and no neutralised content type specified anywhere. Phase 3's supported-type list (line 22) also silently omits `html`/`xml`/`tif`, so the plan's prose and the file it ports disagree about what is even accepted.

**Failure scenario.** Admin uploads `report.html` (accepted, `tier: native`, extracts fine). Any logged-in user with `download` hits the blob endpoint; the file is served with `text/html` from the app origin and executes as the viewer. Session cookies are httpOnly, which stops reading the token but not using it — authenticated writes as the victim. Low likelihood in a one-day internal demo, but it is a control that already exists in the code being ported and is being discarded by omission.

**Evidence.** `$V1/src/lib/extraction/allowlist.ts:16-19, 22-42, 44-51, 61-76`; `$V1/src/lib/extraction/index.ts:24-25`; `$V1/src/lib/roles.ts:18-19`; plan phase-03 lines 22, 65; plan phase-06 line 63.

**Suggested fix.** Correct the claim to "allowlist theo phần mở rộng, mime dẫn xuất từ extension chứ không tin `file.type` của client". Either trim `html`/`xml` out of the ported `ALLOWLIST` for v2, or port `downloadMimeFor` + `NEUTRALISED_EXTENSIONS` and specify `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff` on the download endpoint in phase 6.

---

## Cross-cutting observations (not separate findings)

- **In-process consumer + native rasterization.** Phase-03 line 73 puts the consumer in the API process. `$V1/src/lib/extraction/pdf-raster.ts:15-32` renders at `scale: 2` via `@napi-rs/canvas` in a synchronous per-page loop. ECVBot's own consumers set `concurrency: 5` (`extract-unit.consumer.ts:39-42`) but run in a context that tolerates it; the plan sets no concurrency, so BullMQ defaults to 1. That bounds the damage, but a 5-page A4 raster still blocks the libuv pool while the FE polls `/documents/:id/status` every 1.5s — the badge will appear frozen. Worth one sentence in phase 3 stating `concurrency: 1` deliberately and warning that the status endpoint may lag during rasterization.
- **Migration block ordering.** Phase-02 writes the `ALTER TABLE ... GENERATED ALWAYS AS (to_tsvector('simple', unaccent(...)))` block (lines 195-204) *before* defining `immutable_unaccent` (lines 208-212), and the ALTER text still calls bare `unaccent`. Copied in file order it fails with "generation expression is not immutable". The prose corrects it; the SQL does not. Reorder the blocks and fix the ALTER text.
- **DELETE ordering.** Phase-06 line 79 says cascade delete plus disk removal without specifying order. Unlink first (tolerating ENOENT) then delete the row, or the DB commit succeeds and a Windows file lock leaves an orphan file with no row pointing at it.
- **API prefix drift.** `$ECVBOT_FE/src/lib/axios.ts:6` defaults to `/api/v1`. The plan documents endpoints as `/documents`, `/search`, `/graph` (no prefix) but phase-07 line 50 curls `POST /api/search`. Pick one and state it once.
- **Response envelope.** `$ECVBOT_BE/src/common/interceptors/response.interceptor.ts:15-25` wraps everything in `{success, data, timestamp, path}`; `$ECVBOT_FE/src/lib/axios.ts:32-41` unwraps it. Copying both (phase-02 lines 50-51) keeps the contract consistent, but every API shape written in phases 3–6 (`202 { id, status }`, `{answer, citations}`, `{nodes, edges}` "dùng được trực tiếp cho cytoscape") is the unwrapped form. Note this explicitly so nobody debugs `data.data` at hour 7.

---

## Recommended actions, in order

1. Fix Finding 1 and Finding 5 in the plan text before phase 2 starts — both are gate-blocking and cost minutes on paper versus an hour at the keyboard.
2. Fix Finding 3 (auth model) before writing `app.module.ts`; it is cheap now and touches guards, FE axios, and two acceptance criteria later.
3. Add the purge-then-reinsert rule and explicit `attempts` (Finding 2) into phase 3 step 5, phase 4 step 2, and the backfill script spec.
4. Delete the ivfflat index from the init migration and write the chunk-level retrieval query for Ask (Finding 6).
5. Write the seed field mapping and name `$V1/seed/fixtures/*` (Finding 8) — this is the difference between "dashboard has numbers" and "dashboard has nulls" at the end of phase 2.
6. Add `allSettled` + `status='completed'` to phase 4 (Finding 7).
7. Expand the phase-1 fallback into a real branch with named files, or state honestly that Bedrock failure means demoing `$V1` (Finding 4). A fallback nobody has scoped is not a fallback.
8. Correct the allowlist claim and decide on the download-hardening layers (Finding 9).

## Unresolved questions

- Who mints `embedding_chunks.id` if it stays `TEXT`? (Finding 1)
- Is the anonymous-viewer behaviour actually required for the demo, or can everything be 401-behind-login? Answering "no" removes most of Finding 3.
- Does the `download` endpoint exist in scope at all? The RBAC matrix and the audit action say yes; no phase specifies it.
- Under the phase-1 fallback, is `/ask` cut or faked? The plan implies neither.
