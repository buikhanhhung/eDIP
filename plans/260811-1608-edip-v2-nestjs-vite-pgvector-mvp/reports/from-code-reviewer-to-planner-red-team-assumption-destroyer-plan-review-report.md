# Red-Team Plan Review — Assumption Destroyer (Scope Auditor tier)

Plan: `plans/260811-1608-edip-v2-nestjs-vite-pgvector-mvp/`
Reviewer perspective: skeptic — unstated dependencies, false "will work" claims, missing error paths, integration assumptions.
Evidence base: `$ECVBOT_BE`, `$ECVBOT_FE`, `$V1` (eDIP-v2 is empty).

---

## Finding 1: Prisma 7 needs `prisma.config.ts`; the plan never creates one

- **Severity:** Critical
- **Location:** Phase 2, step 2 "Prisma schema + migration" and Success Criteria lines 257–259
- **Flaw:** The plan installs `prisma@7` and writes a bare `prisma/schema.prisma` containing only `enum`/`model` blocks — no `generator`, no `datasource`, no `url`. It then expects `pnpm prisma migrate deploy` and `pnpm prisma db seed` to work. In Prisma 7 the datasource URL and the seed command live in `prisma.config.ts`, not in `schema.prisma` / `package.json`.
- **Failure scenario:** First command of the first code-writing phase. `prisma migrate deploy` aborts (`no datasource url` / no generator). `prisma db seed` is a no-op because v7 reads `migrations.seed` from `prisma.config.ts`, not `package.json#prisma.seed`. Also, hand-authoring `prisma/migrations/*_init/migration.sql` without `prisma/migrations/migration_lock.toml` makes `migrate deploy` refuse to run.
- **Evidence:**
  - `$ECVBOT_BE/prisma.config.ts:1-14` — the reference project's working setup: `schema: prisma/schema`, `migrations.path`, `migrations.seed: 'ts-node ./prisma/seed.ts'`, `datasource.url: process.env.DATABASE_URL!`.
  - `$ECVBOT_BE/prisma/schema/base.prisma:11-14` — `datasource db { provider = "postgresql"; extensions = [...] }` — **no `url`**. The URL only exists in `prisma.config.ts`.
  - `$ECVBOT_BE/prisma/schema/base.prisma:1-4` — generator is pinned to `prisma-client-js` with `previewFeatures = ["postgresqlExtensions"]`. A fresh v7 scaffold defaults to the new `prisma-client` generator with output `../generated/prisma`, whose import path is *not* `@prisma/client` — which is what `prisma.service.ts:3` imports.
  - Plan quote (phase-02:88): "Cài: `@prisma/client@7 prisma@7 @prisma/adapter-pg pg`" — and nothing else.
- **Suggested fix:** Add an explicit step: copy `$ECVBOT_BE/prisma.config.ts` (retarget paths), pin `generator client { provider = "prisma-client-js" }`, and create `migration_lock.toml`. Add "prisma init succeeds end-to-end" to phase 1's gate so this fails in the 30-minute window, not at hour 2.

---

## Finding 2: "Copy `src/common/` + `APP_GUARD Authentication`" collapses; ECVBot's auth chain is unusable in eDIP-v2

- **Severity:** Critical
- **Location:** Phase 2, step 1 (`app.module.ts` snippet, `providers: [... APP_GUARD Authentication]`) and step 3 "Auth + RBAC (~25 phút)"
- **Flaw:** The plan simultaneously (a) deletes `api-key.guard.ts`, (b) installs `AuthenticationGuard` as `APP_GUARD`, and (c) requires "no token → treated as `viewer`, not 401". All three are mutually exclusive with the copied code.
- **Failure scenario:** Chain of hard failures, in order:
  1. `AuthenticationGuard` constructor-injects `ApiKeyGuard`, which the plan deletes → module cannot resolve → Nest bootstrap crash.
  2. `AuthenticationGuard` defaults to `authTypes: [Bearer]` + `ConditionGuard.And`, so a request with no `Authorization` header throws `ERR_MISSING_ACCESS_TOKEN` **401**. Plan's success criterion "`GET /audit` không token → **403** (không phải 401)" cannot hold.
  3. `AccessTokenGuard` injects `SHARED_TOKEN_SERVICE` → `TokenService` → `RefreshTokenRepository` → `prisma.refreshToken` — a model that does not exist in the plan's schema. It also injects `CACHE_MANAGER` (requires `CacheModule`, absent from the plan's `app.module.ts`).
  4. `AccessTokenGuard` rejects any user whose `user.status !== 'ACTIVE'`. The plan's `User` model has **no `status` column** → `undefined !== 'ACTIVE'` → every authenticated request returns 401. This one passes `pnpm build` and only shows up at runtime.
  5. `TokenService` reads `JWT_REFRESH_TOKEN_SECRET` (required, min 32 chars in `env.config.ts`), which phase 1's `.env` does not define.
- **Evidence:**
  - `$ECVBOT_BE/src/common/guards/authentication.guard.ts:14,22,44-47`
  - `$ECVBOT_BE/src/common/guards/access-token.guard.ts:32-34,52-61,73-78`
  - `$ECVBOT_BE/src/common/repositories/shared-refresh-token.repository.ts:17,23`
  - `$ECVBOT_BE/src/common/constants/auth.constant.ts` (`UserStatus.ACTIVE`)
  - `$ECVBOT_BE/src/config/env.config.ts:29-33` (`JWT_REFRESH_TOKEN_SECRET` required)
  - Plan quote (phase-02:66, 80, 221, 261): "**bỏ** `api-key.guard.ts`" / "`APP_GUARD Authentication`" / "Không có token → coi là `viewer` (không 401)".
- **Impact on the trim policy:** the plan's stated recovery ("gặp import chết → xoá file đó, không sửa", phase-02:268) deletes `api-key.guard.ts` → then `authentication.guard.ts` → then `access-token.guard.ts` → then `token.service.ts`/`shared-token.port.ts`/`shared-refresh-token.repository.ts`/`di-token.ts`. **Nothing auth-related survives the trim.** The 25-minute "Auth + RBAC" estimate is therefore for writing auth from scratch (login, bcrypt, JwtStrategy, RbacGuard, decorator, anonymous-as-viewer semantics), not for porting `roles.ts`.
- **Suggested fix:** Stop describing auth as a copy. Copy only `src/common/{dtos,pipes,filters,exceptions}` + `src/shared/database` + `src/shared/logger`. State explicitly that `guards/`, `services/`, `repositories/`, `port/`, `constants/auth.constant.ts` are **not** copied, and budget auth as greenfield (~45 min).

---

## Finding 3: `src/infrastructure/bedrock/` cannot be copied, and it has **no vision capability** — phase 3's headline feature has zero reusable code

- **Severity:** Critical
- **Location:** Phase 3, "Related Code Files" (`Copy từ $ECVBOT_BE: src/infrastructure/bedrock/`) and step 4 "Analyze — một lần gọi Claude (~30 phút)"
- **Flaw:** Two independent false assumptions. (a) The bedrock folder is not standalone. (b) The plan's core differentiator — "1 lời gọi đưa cả ảnh, yêu cầu trả `text` + toàn bộ schema" — is not supported by any interface in the copied code.
- **Failure scenario:**
  - `bedrock.module.ts:1,16` imports `ProviderIntegrationsModule` from `@features/provider-integrations`; `bedrock-llm.service.ts:9,39` constructor-injects `LlmModelParametersService` from that same feature. Copying `src/infrastructure/bedrock/` therefore drags in a whole feature module plus `@langchain/aws@1.3.9` (which ECVBot ships **with a pnpm patch**, `package.json:150`), `@langchain/core`, and `cohere-rerank.service.ts`. Under the plan's "delete on dead import" policy, deleting `bedrock.module.ts` and `bedrock-llm.service.ts` leaves only the embedding service.
  - `bedrock.port.ts` (whole file) defines `chat`, `chatStream`, `buildChatModel`, `invokeWithToolUse` — **no image/document content block anywhere**. `grep -n "image\|base64\|bytes"` across `bedrock.types.ts`, `bedrock.port.ts`, `bedrock-llm.service.ts` returns **zero matches**. The vision call must be written from scratch against `ConverseCommand`/`InvokeModelCommand`, including base64 image blocks, media-type mapping, and per-page batching.
  - Simultaneously, the plan reinvents structured output (fence-strip → `JSON.parse` → `safeParse` → retry-with-zod-error) while ECVBot already has `invokeWithToolUse` with a schema-pinned `toolChoice`, documented as "verified empirically against `global.anthropic.claude-haiku-4-5`" (`bedrock.port.ts`), used by `entity-extraction.service.ts:510,528,592`. The plan chose the fragile path over the verified one.
- **Evidence:** `$ECVBOT_BE/src/infrastructure/bedrock/bedrock.module.ts:1,16`; `bedrock-llm.service.ts:9,39`; `bedrock.port.ts:1,17-52`; `$ECVBOT_BE/package.json:48-50,150`; `$ECVBOT_BE/src/features/kb/services/entity-extraction.service.ts:97,510,592`. Plan quote (phase-03:53,135): "Copy từ `$ECVBOT_BE`: `src/infrastructure/bedrock/`" / "Với input `vision`: gộp luôn — 1 lời gọi đưa cả ảnh".
- **Suggested fix:** Narrow the copy to `bedrock-embedding.service.ts` + `bedrock.di-token.ts` + a hand-written 20-line module. Add an explicit "write `BedrockVisionService` (new code, ~30 min)" step. Prefer `invokeWithToolUse`-style forced tool use over fence-stripping — port that one method (~60 lines) instead of inventing retry-with-zod-error.

---

## Finding 4: The chunk→embed path does not exist as described; the `embedding_chunks` DDL is not a copy and will reject every insert

- **Severity:** High
- **Location:** Phase 2 step 2 (embedding_chunks SQL); Phase 3 step 5 "Chunk (~10 phút)"; Phase 4 step 1 "Sửa đúng 2 chỗ" and step 2
- **Flaw:** Four compounding mismatches between the plan's schema, the copied service, and the copied chunker.
- **Failure scenario:**
  1. **Primary key.** Plan declares `id TEXT PRIMARY KEY` with no default. ECVBot's real table is `id SERIAL PRIMARY KEY` and its `insertBatch` never supplies `id`. First insert → `null value in column "id" violates not-null constraint`.
  2. **Missing columns.** `insertBatch` writes 8 columns including `chunking_strategy` and `chunk_index`; the plan's table has neither → `column "chunking_strategy" does not exist`.
  3. **Contract inversion.** Phase 3 says "Lưu chunk vào `embedding_chunks` với `embedding = NULL`", phase 4 says "`UPDATE embedding_chunks SET embedding = ...`". The copied service offers neither: `insertBatch` unconditionally serialises `c.embedding.join(',')` into a `$N::vector` param, and there is no update method. So "sửa đúng 2 chỗ" is really: rewrite `insertChunks`, add `updateEmbeddings`, rewrite `search`, rewrite both delete methods, and change `SearchResult.id` from `number` to `string`.
  4. **Chunker/corpus mismatch.** `DocumentStructureStrategy` splits on ATX markdown headers (`HEADER_RE = /^(#{1,6})\s+(.+?)\s*$/`). `grep -c "^#"` over all nine files in `$V1/data/uploads/*.md` returns **0 for every file** — the corpus uses `1. MỤC ĐÍCH`-style numbered headings. Every seed document collapses to a single section and is hard-cut at 1500 chars on blank lines, so RAG citations land mid-clause. Copying `content-parser/` wholesale also pulls `cheerio`, `pdf-parse`, and `semantic.strategy.ts`'s import of `@infrastructure/bedrock/bedrock.port`.
- **Evidence:** `$ECVBOT_BE/src/infrastructure/vector-store/vector-store.service.ts:84-103` (8-column insert), `:34-56` (search), `vector-store.types.ts:13` (`id: number`); `$ECVBOT_BE/prisma/migrations/20260415083500_restore_embedding_chunks_table/migration.sql` (`id SERIAL`, `chunking_strategy`, `chunk_index`); `$ECVBOT_BE/prisma/schema/embedding-chunk.prisma:12` (`id Int @default(autoincrement())`); `$ECVBOT_BE/src/infrastructure/content-parser/chunking-strategies/document-structure.strategy.ts:5,102-131`. Plan quote (phase-02:172, phase-04:59-62).
- **Suggested fix:** Keep `id SERIAL`. Add `chunking_strategy VARCHAR(50)` and `chunk_index INTEGER` so the copied insert works unchanged. Drop the insert-NULL-then-update dance — embed inside the same job step, or add an explicit `updateEmbeddings(ids, vectors)` method to the port. Switch the chunker to `RecursiveCharacterStrategy`, or state that the corpus must be re-authored with `#` headers.

---

## Finding 5: The phase-1 gate does not exercise the code that ships

- **Severity:** High
- **Location:** Phase 1, steps 1–2 ("verify-bedrock.mjs", T1/T2/T3) and step 5 (".env")
- **Flaw:** The gate is a bespoke script plus the AWS CLI. Neither proves the shipping service can authenticate or that the chosen model accepts the shipping request body. The plan calls this a "cổng chặn" and then proceeds on the strength of it.
- **Failure scenario:**
  - **Credentials.** `BedrockEmbeddingService` passes `credentials: undefined` unless both `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set, falling back to the SDK default chain. Phase 1's `.env` (lines 113–122) defines **neither**, and does not define `AWS_PROFILE` either. Step 1's `aws sts get-caller-identity` typically resolves through a named profile / SSO cache that the Node process will not pick up. Green gate at 00:30, `CredentialsProviderError` at hour 5 in phase 4.
  - **Request-body compatibility.** `invokeCohereBatch` always sends `output_dimension: 1024`. The in-code comment concedes this is honoured by **embed-v4** and merely assumed harmless on v3; ECVBot's default is `global.cohere.embed-v4:0`, so the v3 path is unexercised in the reference repo. The plan's first-choice model is `cohere.embed-multilingual-v3`. If Bedrock rejects the extra field, phase 4 fails on a path phase 1 declared green — because `verify-bedrock.mjs` sends a hand-written body, not this one.
  - `MAX_TRUNCATE_LENGTH = 2047` silently truncates every text before embedding; combined with Finding 4's 1500-char hard cuts this is survivable, but the backfill script ("đọc `Document.textContent` → chunk → embed") must chunk first, which the plan states but does not enforce.
- **Evidence:** `$ECVBOT_BE/src/infrastructure/bedrock/bedrock-embedding.service.ts:24-33,100-107,11`; `$ECVBOT_BE/src/config/env.config.ts:47-58`. Plan quote (phase-01:61, 113-122): "Viết `$ROOT/scripts/verify-bedrock.mjs`".
- **Suggested fix:** Make T3 instantiate the *actual* `BedrockEmbeddingService` (or at minimum reuse its exact request body) and read credentials the same way. Add `AWS_PROFILE` (or explicit keys) to the phase-1 `.env` template and assert the Node SDK resolves them, not just the CLI.

---

## Finding 6: The PDF vision path has a silent-failure landmine the plan omits, and its threshold claim about v1 is false

- **Severity:** High
- **Location:** Phase 3, step 3 "Trích text 4 tầng (~25 phút)"
- **Flaw:** (a) The port list omits `pdfjs-init.ts` and `global-singleton.ts`, which v1 documents as load-bearing for initialisation order. (b) The plan asserts its 200-char threshold is v1's verified value; v1 uses 100 plus a page-majority rule.
- **Failure scenario:**
  - **(a)** v1's flow is `ensurePdfjs()` → `extractText()` → maybe `renderPages()`. If `extractText` runs first without `ensurePdfjs`, unpdf latches onto its bundled serverless build, which has no canvas. `renderPageAsImage` then "either throws or yields **blank pages**", and — quoting v1's own comment — "Blank pages then OCR to empty text with a plausible confidence, so the failure looks like a bad scan rather than an initialisation order bug." Under the plan this becomes: scanned PDF → blank PNG → Claude vision reads nothing → analysis returns generic values → `status='completed'`. No error, no failed badge, wrong data on stage. This is exactly the failure the plan's `failed`-status handling cannot catch. Phase 3's "Related Code Files" lists only `{index,plain-text,pdf,docx,allowlist}.ts` — `pdf-raster.ts` and `pdfjs-init.ts` are named nowhere in that list even though step 3 ports the former.
  - **(b)** Plan: "PDF text < 200 ký tự/trang … Ngưỡng 200 ký tự/trang chính là logic `--skip-text` của OCRmyPDF **và của v1** — giữ nguyên, **đã kiểm chứng**." v1's constant is `MIN_CHARS_PER_PAGE = 100`, counted on non-whitespace characters, and the decision is `meaningful.length >= ceil(pages * 0.5)`, not per-page. Doubling the threshold and dropping the majority rule pushes sparse born-digital PDFs (title pages, signature pages) onto the expensive vision path, burning the very quota and minutes the plan is trying to protect.
- **Evidence:** `$V1/src/lib/extraction/pdfjs-init.ts:6-20,33-45`; `$V1/src/lib/extraction/pdf.ts:14,17,28-29,34-37`; `$V1/src/lib/extraction/pdf-raster.ts:16-31`; `$V1/package.json:18,26` (`@napi-rs/canvas`, `pdfjs-dist@6`).
- **Suggested fix:** Add `pdfjs-init.ts` + `global-singleton.ts` to the port list and note the ordering invariant in the phase text. Add a hard assertion: rendered page buffer length > 0 and extracted vision text length > 0, else `status='failed'` — never `completed` with empty text. Correct the threshold to 100 + 50% majority, or state plainly that 200 is a new, unverified choice.

---

## Finding 7: The FTS design defeats `ts_headline`, and the migration as written does not run

- **Severity:** High
- **Location:** Phase 2 step 2 (generated column + `immutable_unaccent`); Phase 4 step 3 (lexical branch)
- **Flaw:** The wrapper function itself is correct, but two things around it are not.
- **Failure scenario:**
  1. **Migration as written fails.** The SQL block at phase-02:196-204 literally contains `to_tsvector('simple', unaccent(coalesce(...)))`, and the `immutable_unaccent` wrapper plus the instruction "rồi dùng `immutable_unaccent(...)`" appear *after* it at lines 206-213. Whoever executes the phase top-to-bottom hits `ERROR: generation expression is not immutable`. The wrapper must precede the `ALTER TABLE`, and the `ALTER TABLE` must already reference it.
  2. **Snippets will not highlight.** `search_tsv` is built from **unaccented** text; the query is `plainto_tsquery('simple', immutable_unaccent($q))` — also unaccented. That match works. But `ts_headline('simple', "textContent", query, ...)` runs against the **raw accented** `textContent`. `ts_headline` re-tokenises its own input; an unaccented tsquery term (`hop`, `dong`) will not match the accented tokens (`hợp`, `đồng`), so `ts_headline` finds no lexemes and returns the leading `MinWords` of the document. Every search result on stage shows the same opening sentence instead of the matched passage — and phase 4's own success criteria and phase 7's step 3 both put snippet quality in front of the audience. The plan's risk table anticipates only a dictionary/highlight-styling issue ("snippet vẫn đúng đoạn"), which is precisely the assumption that breaks.
- **Evidence:** Plan phase-02:196-213; phase-04:97-104, 175. No equivalent pattern exists in `$ECVBOT_BE` to copy from — ECVBot uses `pg_search`/BM25 (`prisma/migrations/20260526153043_add_pg_search_extension`, `20260530164041_add_bm25_index_on_embedding_chunks`) and `kb-search-keyword-sql-builder.ts`, so `immutable_unaccent` here is unverified invention, not a port.
- **Suggested fix:** Reorder the SQL. For snippets, either store an unaccented shadow column and headline against that, or drop `ts_headline` and cut the snippet in TypeScript around the first match position — 10 lines, zero Postgres risk. Add a concrete success criterion: "snippet for query `hop dong` contains the matched phrase, not the document's first sentence."

---

## Finding 8: Graph model produces duplicate edges, collides entity types, and the seed corpus does not carry the offsets phase 6 depends on

- **Severity:** Medium
- **Location:** Phase 5, step 1 (`normalizeEntityName`, `Entity.normalizedName @unique`) and step 2 (`getGraph` SQL); Phase 6, step 3 (highlight)
- **Flaw:** Three distinct assumptions, all testable against v1's real data.
- **Failure scenario:**
  - **Duplicate cytoscape edges.** `@@id([documentId, entityId, mentionText])` allows N rows per `(document, entity)` pair — one per surface form. `getGraph`'s SQL selects `de."documentId", de."entityId"` with **no `DISTINCT`**. If a document mentions both `Ecloudvalley Vietnam Ltd` and `ECLOUDVALLEY VIETNAM` — which is the exact example the plan uses as its dedup success criterion — two rows come back, two edges are built, and if the edge id is derived from `(source, target)` cytoscape throws `Can not create second element with ID`. The `/graph` page white-screens during demo step 4.
  - **Type-free unique key.** `Entity.normalizedName @unique` has no `type` component, and the upsert uses `update: {}`. The first insert wins the type forever. In this corpus `saigon retail` is emitted as `company`; if any later analysis emits it as `project`, the node silently keeps the wrong colour and the wrong type filter.
  - **Enum gap.** Simulating the plan's `normalizeEntityName` over `$V1/data/documents.json` yields entity kinds `company, date, department, amount, person, project` — **`department` is not in the plan's zod enum** (`['company','person','contract','invoice','project','date','amount']`). `finance` is one of the twelve entities shared by ≥2 documents. Any attempt to reuse v1's stored analysis fails `safeParse`; re-running Claude may or may not reproduce these edges.
  - **Highlight has no data for seeded docs.** v1's stored entities are `{kind, value, confidence}` — **no `charStart`/`charEnd`**. Phase 6's highlight therefore only works for documents re-analysed through the new pipeline. Phase 7's reassurance "Seed đã có sẵn text + embedding + entity → bước 3,4,5 chạy không cần gọi Bedrock" is only true *after* phase 5's backfill has already spent 9 Claude calls; if phase 5 is cut for time, phase 6's highlight demo has nothing to render.
- **Evidence:** `$V1/data/documents.json` — 9 records, all `status: "completed"`, all `mimeType: "text/markdown"`, all `textSource: "native"`; `analysis.entities[]` shape `{kind, value, confidence}` (e.g. `{"kind":"company","value":"Ecloudvalley Vietnam Ltd","confidence":0.92}`). Normalizer simulation: 33 normalized entities, 12 shared by ≥2 docs, `ecloudvalley vietnam` present in all 9. `$V1/src/lib/graph/build-graph.ts:26` — v1's actual default is `minDocuments = 1`, not 2 as the plan claims ("Mặc định `minShared=2` giữ nguyên từ v1", phase-05:118); the default is set by callers, so "v1 đã chứng minh" is unsupported by the file the plan cites. `build-graph.ts:21,62-70` returns v1/xyflow-shaped `{nodes, edges}`, so the "đã có test" in `src/lib/graph/__tests__/` does not transfer to the cytoscape `{data:{...}}` shape phase 5 specifies.
- **Suggested fix:** Add `DISTINCT` (or aggregate to one edge per doc-entity pair) in `getGraph`. Make the unique key `@@unique([type, normalizedName])`. Add `department` to the enum or map it to `other`. State explicitly that seeded documents have no offsets until backfill runs, and make the backfill a phase-3 deliverable rather than a phase-5 one so highlight survives a phase-5 cut.

---

## Finding 9: Phase 2's 2h budget is not defensible, and the FE copy list is stale in the reference repo

- **Severity:** High
- **Location:** Phase 2, step 5 "Frontend skeleton (~35 phút)"; plan.md line 60 ("Tổng ước tính ~8.5h")
- **Flaw:** The 35-minute FE estimate assumes copied config drops into a fresh Vite scaffold. It does not — and Findings 1 and 2 already add ~40 minutes of unbudgeted work to the same phase.
- **Failure scenario:**
  - `$ECVBOT_FE/vite.config.ts` copied verbatim into a fresh scaffold fails at startup: it imports `vite-plugin-svgr`, declares a `test` block requiring `happy-dom` and `./src/test-setup.ts`, and pins `server.port: 5500` with `allowedHosts: ["bot.vibe","ps","bot.kb2a.vn"]`.
  - `$ECVBOT_FE/components.json` points at `"config": "tailwind.config.js"` while the repo actually ships `tailwind.config.ts` — the reference is already internally inconsistent, so `npx shadcn add` in the new project will misbehave.
  - ECVBot FE is React 18 + Vite 5 + **Tailwind 3.4** + `react-router-dom@6` + `cva` + `tailwind-merge` + `tailwindcss-animate`. A `pnpm create vite --template react-ts` run today scaffolds a newer Vite with no Tailwind, and current shadcn defaults target Tailwind 4. Copying `src/components/ui/` (52 files) across that boundary is a config-debugging session, not a copy.
  - Net phase 2 content: nest scaffold, common trim (Finding 2: auth written from scratch), Prisma 7 config + hand-written migration with vector/FTS/trigram DDL (Findings 1, 7), a seed script that must remap v1's field names (`text`→`textContent`, `fileName`→`filename`, `storedPath`→`storagePath`, `analysis.metadata.documentDate`→`metadata.date`), **and** a full FE skeleton with three routes. 2h is off by roughly 2x. Phase 2 is the phase that produces the first demonstrable artifact, so this is not a tail-end overrun.
- **Evidence:** `$ECVBOT_FE/vite.config.ts:1-10,17-20`; `$ECVBOT_FE/components.json` (`"config": "tailwind.config.js"` vs on-disk `tailwind.config.ts`); `$ECVBOT_FE/package.json:71,77,83,93,95,131,133`; `$ECVBOT_FE/src/components/ui/` = 52 files; `$V1/data/documents.json` field names.
- **Suggested fix:** Re-budget phase 2 at 3.5–4h, or split the FE skeleton into its own phase that can be cut. Pin the FE stack to ECVBot's exact versions (React 18 / Vite 5 / Tailwind 3) in the phase text so the scaffold is created *to match* the copy rather than fought afterwards. Copy only the ~8 ui components actually listed, not the folder. Write `vite.config.ts` fresh (12 lines) instead of copying.

---

## Secondary observations (not counted, no action required)

- **Open Question is self-answerable.** plan.md line 109 blocks on "Corpus 9 doc của `$V1` có được copy nguyên không (mẫu KYC chứa số đăng ký + thông tin người ký)?" The KYC record is plainly synthetic (`Record reference: ECV-KYC-2026-009`, `VietBank Corp`, `88 Ly Thuong Kiet`) — a fixture generated for v1's demo. This question can be closed by reading the file rather than left to gate phase 2.
- **`pg` is not a direct dependency of `$ECVBOT_BE`** (only `@prisma/adapter-pg`), so phase 2's install line adds an untested package. Harmless, but the "it already runs with this version" justification does not cover it. `prisma.service.ts` itself is genuinely clean and portable — that single claim holds.
- **Parallel reimplementation:** phase 4 writes a new `rrf.ts` while `$ECVBOT_BE/src/features/kb/services/kb-search-rrf-fusion.ts` already implements RRF with `RRF_K = 60`, documented empty-lane semantics, deterministic tie-break, and a spec file. Worth citing as prior art even if the eDIP version stays simpler.
- **Allowlist claim is inverted.** Phase 3 step 1 says the ported allowlist rejects "**không dựa vào phần mở rộng tên file**". `$V1/src/lib/extraction/allowlist.ts:44-52` resolves purely by extension (`ALLOWLIST[extensionOf(fileName)]`) — deliberately, because it derives the stored mime rather than trusting `file.type`. Porting it does not give content-based validation. The plan also drops `NEUTRALISED_EXTENSIONS`/`downloadMimeFor` (allowlist.ts:60-75) while introducing a `download` permission and `document.download` audit action; if `html`/`xml`/`svg` come along with the port, so must the neutralisation.

---

Status: DONE_WITH_CONCERNS
Summary: Nine evidence-backed defects; three are Critical and all three land in phases 1–3, meaning the plan's earliest, highest-value phases are the ones most likely to stall — Prisma 7 configuration is missing entirely, ECVBot's auth chain cannot be copied under the plan's own constraints, and the Bedrock folder has no vision capability despite vision being phase 3's headline.
Concerns/Blockers: Phase 2's 2h budget is roughly half of what its contents require even before the Critical findings are addressed; the plan's "hạ tầng copy từ ECVBot" premise holds for `prisma.service.ts`, `queue.module.ts`, and `bedrock-embedding.service.ts` but not for `common/`, `bedrock/` (module + LLM), `vector-store/`, or the FE config.
