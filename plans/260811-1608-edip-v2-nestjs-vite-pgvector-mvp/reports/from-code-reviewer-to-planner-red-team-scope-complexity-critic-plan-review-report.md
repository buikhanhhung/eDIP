# Red-team review — Scope & Complexity Critic

> Reviewer: code-reviewer (hostile) · Date: 2026-08-11
> Plan: `plans/260811-1608-edip-v2-nestjs-vite-pgvector-mvp/`
> Posture: YAGNI enforcer. No scope cuts proposed — only places where the plan spends time that buys nothing, or where a cheaper implementation gets the same demo result.
> Evidence base: `$ECVBOT_BE`, `$ECVBOT_FE`, `$V1` (all cited `file:line` / measured LOC).

---

## Finding 1: Seed throws away v1's finished analysis, then phase 5 pays Claude to recompute it

- **Severity:** Critical
- **Location:** Phase 2, step 4 "Seed"; Phase 5, step 3 "Nối vào pipeline + backfill"; Phase 7, Risk table row 2
- **Flaw:** Phase 2 reads `$V1/data/documents.json` for `textContent` only, and explicitly states *"Chưa insert Entity/embedding ở phase này (phase 3/5 lo)"*. But that same JSON already carries the complete v1 analysis for all 9 documents: `type`, `typeConfidence`, `metadata{title,parties,documentDate,amount,currency,keywords,language}`, `summary`, `tags`, and **59 entities with confidence scores**. The plan then writes `scripts/backfill-entities.ts` (phase 5) whose job is to run `document-analysis.service` — i.e. 9 live Claude calls — to regenerate data it already had in hand in phase 2.
- **Failure scenario:** Two costs, one contradiction.
  1. ~15 min of script writing + 9 Claude round-trips + debugging LLM output, to reproduce values that a 10-line mapping in `seed.ts` would have inserted for free. Dashboard `byType` and `/graph` stay empty until phase 5 lands, so if the day runs out at phase 4 (the plan's own stated likely stopping point: *"Phase 2–4 (≈6h) đã là demo tử tế"*), the knowledge graph — the marquee feature — never has data at all.
  2. Phase 7's risk mitigation is factually false as written: *"Seed đã có sẵn text + embedding + entity → bước 3,4,5 chạy không cần gọi Bedrock."* Per phase 2 step 4 the seed has **neither** embedding nor entity. Demo steps 3/4/5 depend on two backfill scripts having been run, both of which call Bedrock. The "network-independent demo" safety net does not exist.
- **Evidence:**
  - `$V1/data/documents.json` — 9 records, keys `['text','textSource','ocrConfidence','storedPath','analysis','id','fileName','mimeType','sizeBytes','sha256','uploadedAt','ownerId','status']`; `analysis` keys `['type','typeConfidence','metadata','summary','tags','entities']`. Entity counts per document: 3, 7, 7, 7, 8, 7, 7, 3, 10 = **59 entities**, each with `kind`/`value`/`confidence`.
  - `$V1/docs/feature-status.md:180` — "Kết quả seed thật: contract 3 · policy 2 · invoice 2 · kyc 1 · report 1 — độ tin cậy 86–95%".
  - Plan `phase-02-skeleton-db-auth-seed.md:237` — "Chưa insert Entity/embedding ở phase này".
  - Plan `phase-05-entity-knowledge-graph.md:132` — "chạy `document-analysis.service` cho từng document".
  - Plan `phase-07-polish-demo-rehearsal.md:104` — the false "seed đã có sẵn ... entity" claim.
- **Suggested fix:** In phase 2 step 4, map `analysis` → `Document.{documentType,typeConfidence,title,summary,language,metadata}` and `analysis.entities` → `Entity`/`DocumentEntity` (compute `charStart/charEnd` with the same `textContent.indexOf(value)` phase 3 already specifies). Delete `scripts/backfill-entities.ts` entirely. Graph + dashboard become demo-ready at end of phase 2, zero Bedrock dependency, and phase 7's fallback claim becomes true. Note the type mapping: v1 kinds are `company|person|project|department|amount|date` — `department` (6 in corpus) has no slot in the plan's enum (`company|person|contract|invoice|project|date|amount`); map it or add it, do not silently drop 6 entities.

---

## Finding 2: "Copy vector-store, sửa đúng 2 chỗ" is wrong — the plan's own migration breaks every write path

- **Severity:** Critical
- **Location:** Phase 4, step 1 "Vector store (~20 phút)"; Phase 2, step 2 migration SQL
- **Flaw:** Phase 4 says copy `$ECVBOT_BE/src/infrastructure/vector-store/` and *"Sửa đúng 2 chỗ"* (the `search` signature and the `deleteBy*` methods), and copy `bedrock-embedding.service.ts` *"nguyên xi"*. Grep of the copied code against the plan's phase-2 migration finds at least **five** contract breaks, none of them in the two places named:
  1. Plan migration: `id TEXT PRIMARY KEY` with **no default**. ECVBot: `id SERIAL PRIMARY KEY`. The copied `insertBatch` never supplies `id` → every insert fails `null value in column "id"`.
  2. Copied `insertBatch` writes 8 columns: `kb_unit_id, knowledge_base_id, content, embedding, metadata, parent_content, chunking_strategy, chunk_index`. Plan's table has **no** `kb_unit_id`, `knowledge_base_id`, `chunking_strategy`, `chunk_index` → `column does not exist`.
  3. `EmbeddingChunk` type requires `kbUnitId: string; knowledgeBaseId: string` (non-optional) → every call site is a type error.
  4. `SearchResult.id: number` and `kbUnitId: string` — but phase 4 step 4 builds RAG citations by regexing `[chunk_id]` out of Claude's answer with `/\[([a-z0-9_-]+)\]/g` against a `TEXT` id. The id type is load-bearing for the Ask feature and is inconsistent between plan and copied code.
  5. `insertChunks` is not listed as one of the "2 chỗ" at all, yet it is the only write path.
- **Failure scenario:** The developer copies 150 lines expecting a 20-minute step, then hits a compile error, fixes types, hits a runtime SQL error on the first upload, fixes columns, hits a NOT NULL on `id`, goes back to the migration — which by then has already been applied and seeded, so it is a re-migrate + re-seed cycle. Realistic cost 45–60 min inside a 90-minute phase, discovered at the worst moment (phase 4 is where the Ask demo lives).
- **Evidence:**
  - `$ECVBOT_BE/prisma/migrations/20260415083500_restore_embedding_chunks_table/migration.sql:14` — `id SERIAL PRIMARY KEY`, plus `kb_unit_id`, `knowledge_base_id`, `chunking_strategy`, `chunk_index` columns.
  - `$ECVBOT_BE/src/infrastructure/vector-store/vector-store.service.ts:78-107` — `insertBatch` with the 8-column `INSERT`, no `id`.
  - `$ECVBOT_BE/src/infrastructure/vector-store/vector-store.types.ts:1-20` — `EmbeddingChunk.kbUnitId`/`knowledgeBaseId` required; `SearchResult.id: number`.
  - Plan `phase-02-skeleton-db-auth-seed.md:179-187` — `id TEXT PRIMARY KEY`, 7 columns.
  - Plan `phase-04-hybrid-search-rag-ask.md:59` — "Sửa đúng 2 chỗ".
  - Related: `$ECVBOT_BE/src/infrastructure/bedrock/bedrock-embedding.service.ts:13,41-49` hardcodes `EMBEDDING_DIMENSION = 1024` and **throws** on any other length. Phase 1's fallback (`phase-01:140`) proposes a 384-d local model — that fallback also requires editing the file phase 4 says to copy "nguyên xi". The fallback is not free.
- **Suggested fix:** Either (a) make the phase-2 migration match ECVBot's table exactly (`id SERIAL`, keep the extra nullable columns, add `document_id`) so the copy really is a copy; or (b) accept that `vector-store` is ~40 lines of new code (one `INSERT`, one `SELECT ... <=> ...`, one `DELETE`) and stop calling it a copy. Option (b) is smaller than the reconciliation work. Update phase 4's "2 chỗ" list to name `insertChunks`, `insertBatch`, `vector-store.types.ts`, and the id type decision.

---

## Finding 3: "Copy `src/infrastructure/bedrock/`" drags in a 1454-line feature module and LangChain, and is budgeted at zero minutes

- **Severity:** Critical
- **Location:** Phase 3, "Related Code Files" (`Copy từ $ECVBOT_BE: src/infrastructure/bedrock/`)
- **Flaw:** `BedrockModule` is not standalone. `bedrock.module.ts:1` imports `ProviderIntegrationsModule`, and `bedrock-llm.service.ts:9` constructor-injects `LlmModelParametersService` from `@features/provider-integrations`. That module registers two controllers and two **Prisma repositories** (`ModelConfigPrismaRepository`, `ProviderConfigPrismaRepository`) against tables that do not exist in the plan's schema, and `LlmModelParametersService` loads per-family YAML from disk at boot (`OnModuleInit`). `bedrock-llm.service.ts` also imports `@langchain/aws` and `@langchain/core/messages`. Phase 3's step list allocates **0 minutes** to any of this: the six steps total 130 min (20+25+25+30+10+20) against a stated 2h effort, and none of them is "copy + trim bedrock".
- **Failure scenario:** `pnpm build` fails on the first bedrock copy. The developer either (a) installs `@langchain/aws`, `@langchain/core`, `js-yaml`, adds 4 Prisma models and the YAML config files — an hour minimum for code the plan never calls; or (b) discovers mid-phase that `bedrock-llm.service.ts` must be rewritten as a plain `InvokeModelCommand`/`ConverseCommand` wrapper, which was never scheduled. Phase 3 is the phase carrying the plan's stated "đòn bẩy chính" (one Claude call = OCR+classify+extract+summarize); it is the worst place to lose an hour.
- **Evidence:**
  - `$ECVBOT_BE/src/infrastructure/bedrock/bedrock.module.ts:1,16` — `imports: [ProviderIntegrationsModule]`.
  - `$ECVBOT_BE/src/infrastructure/bedrock/bedrock-llm.service.ts:8-10` — imports `LlmModelParametersService`, `ChatBedrockConverse` from `@langchain/aws`, `@langchain/core/messages`.
  - `$ECVBOT_BE/src/features/provider-integrations/**` — 1454 non-test LOC, 2 controllers, 2 Prisma repositories (`provider-integrations.module.ts:2-14`).
  - `$ECVBOT_BE/src/infrastructure/bedrock/services/llm-model-parameters.service.ts:1-5` — `fs`/`path`/`js-yaml` config loading at `OnModuleInit`.
  - `$ECVBOT_BE/src/infrastructure/bedrock/` also contains `cohere-rerank.service.ts` (109 LOC) + types (42 LOC) the plan never uses; total dir 1191 LOC of which the plan needs `bedrock-embedding.service.ts` (119 LOC).
- **Suggested fix:** Copy exactly one file — `bedrock-embedding.service.ts` (119 LOC, deps: `@aws-sdk/client-bedrock-runtime`, `@nestjs/config` only) — and write the Claude call as a ~50-line `InvokeModelCommand` service. Phase 1 step 2 already requires writing `scripts/verify-bedrock.mjs` that makes exactly these three calls (text, vision, embed); promote that verified code into the service instead of throwing it away (`phase-07:86` currently says delete it). That converts a 1-hour trap into a 10-minute lift and makes phase 1's output load-bearing.

---

## Finding 4: RRF k=60 over 3 branches is tuned for a corpus 1000× larger than this one — and will demote the plan's own demo query

- **Severity:** High
- **Location:** Phase 4, step 3 "Search hybrid + RRF"; Architecture block
- **Flaw:** The plan justifies RRF as *"không cần tune trọng số — với 1 ngày, mọi thứ phải tune là thứ phải bỏ."* But `k=60` **is** a tuning constant, calibrated for TREC-scale ranked lists. The actual corpus is **13,198 characters total across 9 documents** — roughly **13 chunks** at the copied chunker's 1500-char default, not the "~200 chunk" the plan assumes. Consequences:
  - Branch A (vector, `top 20`) returns *the entire corpus* for every query. Branch B (`top 20`) and branch C (`top 10`) likewise return everything they match.
  - With k=60, rank 1 scores `1/61 = 0.01639`, rank 9 scores `1/69 = 0.01449` — a 13% spread. Meanwhile appearing in all three lists multiplies by 3. **A document ranked dead last in all three branches (0.0435) outranks a document ranked first in one branch (0.0164) by 2.6×.** Fusion becomes "how many branches matched", not "how relevant".
  - This is precisely the failure v1 engineered against and measured. v1 weights entity mentions ×2 and multiplies by a coverage factor specifically so that *"hợp đồng với Saigon Retail"* returns the Saigon Retail contract rather than any contract. The plan uses that exact string as its scripted demo query in two places.
  - Branch C is additionally a false-positive generator: `metadata::text ILIKE '%' || q || '%'` matches JSON **keys**, so any query containing `date`, `amount`, `title`, `parties`, or `keywords` matches every row, injecting a full-corpus list into the fusion.
- **Failure scenario:** During phase 7 rehearsal step 3, `hợp đồng với Saigon Retail` returns a generic contract or the policy document at rank 1. The presenter has 20 minutes of polish budget and no diagnostic (RRF scores are opaque by design), so it either ships broken or eats the rest of the day.
- **Evidence:**
  - Corpus measurement over `$V1/data/documents.json`: per-document char counts 1374, 1486, 1703, 959, 1348, 1026, 1646, 1776, 1880 → **13,198 total**, est. 13 chunks at 1500 chars.
  - Plan `phase-04:173` assumes "~200 chunk" — off by ~15×.
  - `$V1/src/lib/search/retrieval.ts:52` `EXPANSION_WEIGHT = 0.4`, `:60` `ENTITY_WEIGHT = 2`, `:199-204` `COVERAGE_FLOOR = 0.2` with the comment *"without this, 'hợp đồng với Saigon Retail' ranks any contract above the one naming Saigon Retail"*.
  - `$V1/docs/feature-status.md:158` — measured v1 result: *"`hợp đồng Saigon Retail` → 8 kết quả, thứ tự MSA Saigon Retail (7.95) > Tax Invoice (6.68) > hợp đồng khác (2.26)"*. v1 already demos this correctly, in 288 lines, with no DB.
  - Plan `phase-04:155` and `phase-07:45` both script that query for the demo.
- **Suggested fix:** Two lines of change, no new work: (1) set `K = 5` (or blend normalized scores directly — at 9 documents, `0.6*vector + 0.4*ts_rank` is both simpler and more discriminating than rank fusion); (2) delete branch C and instead append metadata to the tsv expression — `coalesce(title,'') || ' ' || coalesce(metadata::text,'') || ' ' || coalesce("textContent",'')` — which removes a query, removes an RRF list, removes the JSON-key false positives, and costs one line in the phase-2 migration. This is strictly less code than the plan currently has.

---

## Finding 5: The `search_tsv` generated column + `immutable_unaccent` wrapper + two GIN indexes are unused machinery on 9 rows

- **Severity:** High
- **Location:** Phase 2, step 2 (generated column, `immutable_unaccent`, `document_search_tsv_idx`, `document_title_trgm_idx`); Phase 4, step 1 (`ivfflat` index)
- **Flaw:** Four index/derived-column mechanisms are built for a 9-row table and a ~13-row chunk table:
  - `search_tsv` GENERATED STORED requires an `IMMUTABLE` wrapper around a `STABLE` dictionary function — a known hack the plan itself flags as a risk with a fallback (`phase-02:269`). It sits on the critical path of phase 2, the phase that already overruns its own budget (see Finding 7).
  - `document_search_tsv_idx` (GIN) and `document_title_trgm_idx` (GIN trigram) will never be chosen by the planner on 9 rows; seq scan wins.
  - `ivfflat ... WITH (lists = 100)` on ~13 vectors is not "might be odd" as `phase-04:173` frames it — it is **guaranteed wrong**. ivfflat needs training rows; with 13 rows and 100 lists, most lists are empty and the default `probes = 1` will return near-arbitrary or empty neighbour sets. The plan's mitigation ("nếu kết quả lạ, `DROP INDEX`") means the default configuration ships broken and relies on someone noticing during a live demo.
- **Failure scenario:** Best case, ~20 minutes of phase 2 spent making `immutable_unaccent` + generated column apply cleanly through Prisma (a raw-SQL column on a Prisma-managed table also causes drift on the next `prisma migrate dev`). Worst case, phase 4's vector branch silently returns wrong chunks because of `lists=100`, and the Ask citations point at the wrong document — indistinguishable from an embedding-quality problem, which is where debugging time will go.
- **Evidence:**
  - Plan `phase-02:196-213` (generated column + wrapper), `:202-203` (two GIN indexes), `phase-02:269` (its own escape hatch).
  - Plan `phase-04:189-190` / `phase-02:189-190` — `lists = 100`; `$ECVBOT_BE/prisma/migrations/20260415083500_.../migration.sql:36-40` comment: *"lists=100 suits up to ~100k rows"* — copied verbatim into a 13-row table.
  - Corpus size: 13,198 chars / 9 documents (measured above).
  - `$V1/src/lib/search/retrieval.ts:126-128` — v1's comment: index *"Rebuilt per request — the demo corpus is small enough that caching would add invalidation bugs for no measurable gain."* Same reasoning applies to every index here.
- **Suggested fix:** (a) Drop `CREATE INDEX ... ivfflat` from the phase-2 migration outright — add it back the day the corpus exceeds ~10k chunks. Nothing else changes; the `<=>` query works identically via seq scan and is faster at this size. (b) Replace the generated column + `immutable_unaccent` with a plain `searchText TEXT` column populated in application code by the *same* diacritic-folding function phase 5 already specifies (`normalizeEntityName`, `phase-05:66-74`) — one function reused, zero Postgres extension gymnastics, zero Prisma drift, and the query becomes `searchText ILIKE`. If `ts_rank`/`ts_headline` are wanted, compute `to_tsvector` inline in the phase-4 query; on 9 rows the cost is unmeasurable. Keep `unaccent`/`pg_trgm` extensions if desired, but off the phase-2 critical path.

---

## Finding 6: Copying `content-parser` (15 files, 1249 LOC, cheerio, 11 DI providers) to use one markdown-header chunker on a corpus with zero markdown headers

- **Severity:** High
- **Location:** Phase 3, step 5 "Chunk (~10 phút)"
- **Flaw:** The step says copy `$ECVBOT_BE/src/infrastructure/content-parser/` and use `document-structure`. That directory is 15 non-test files / **1249 LOC**; `content-parser.module.ts` is `@Global` and registers 11 providers including `GitbookParser` and `HtmlParser` (both pull `cheerio`), `PdfParser`, `TextSplitterService`, and `ChunkingStrategyFactory` — which imports `IBedrockEmbeddingService` and instantiates `SemanticStrategy` (162 LOC) requiring an embedding provider. Three of the four chunking strategies are never used.
  Worse, the one strategy that *is* used is the wrong tool: `DocumentStructureStrategy` splits on ATX markdown headers (`^#{1,6}\s`). **The seed corpus contains 0 markdown headers across all 9 documents** (measured), and vision/PDF-extracted text will not contain them either. So the strategy falls through to "one section → split on blank lines" — i.e. it degenerates to exactly the 20-line recursive splitter it was supposed to be better than.
- **Failure scenario:** 10 minutes budgeted; realistic outcome is `pnpm build` failing on missing `cheerio`, then a decision about whether to install a scraping library into a document-intelligence backend, then trimming the `@Global` module's provider list — 30–40 minutes — to obtain behaviour identical to `content.split(/\n\n+/)` with a 1500-char accumulator.
- **Evidence:**
  - `find src/infrastructure/content-parser -name "*.ts" ! -name "*.spec.ts" | xargs wc -l` → **1249 total** (15 files); with specs, 2787.
  - `$ECVBOT_BE/src/infrastructure/content-parser/content-parser.module.ts:13-27` — `@Global`, 11 providers.
  - `$ECVBOT_BE/src/infrastructure/content-parser/parsers/gitbook-parser.ts:2`, `parsers/html-parser.ts:2` — `import * as cheerio from 'cheerio'`.
  - `$ECVBOT_BE/src/infrastructure/content-parser/chunking-strategies/chunking-strategy.factory.ts:1,45-49` — depends on `IBedrockEmbeddingService` for `SEMANTIC`.
  - `$ECVBOT_BE/src/infrastructure/content-parser/chunking-strategies/document-structure.strategy.ts:5` — `HEADER_RE = /^(#{1,6})\s+(.+?)\s*$/`; :13-20 doc comment confirms markdown-only intent.
  - Header count across `$V1/data/documents.json`: **0** markdown headers in all 9 documents (`(text.match(/^#{1,6}\s/gm)||[]).length === 0` for every record).
- **Suggested fix:** Copy the single file `document-structure.strategy.ts` (133 LOC, only imports `@nestjs/common` + a local `chunking.types`) if you want ECVBot lineage in the diff, or write the 20-line paragraph accumulator directly. Do not copy the directory or register the module. Either way the chunk boundaries on this corpus are identical.

---

## Finding 7: The plan's own step estimates sum to 10.6h, not "~8.5h" — and the gap is entirely unbudgeted copy/trim work

- **Severity:** High
- **Location:** `plan.md` phase table ("Tổng ước tính ~8.5h"), vs. per-step minutes inside every phase file
- **Flaw:** Adding the per-step estimates the phase files themselves publish:

  | Phase | Sum of step minutes | Stated effort | Δ |
  |---|---:|---:|---:|
  | 1 | 30 (timebox) | 30 | 0 |
  | 2 | 35+25+25+20+35 = **140** | 120 | +20 |
  | 3 | 20+25+25+30+10+20 = **130** | 120 | +10 |
  | 4 | 20+15+25+25+20 = **105** | 90 | +15 |
  | 5 | 15+30+15+30 = **90** | 90 | 0 |
  | 6 | 20+20+20+10 = **70** | 60 | +10 |
  | 7 | 20+15+15+10+10 = **70** | "còn lại" | — |
  | **Total** | **635 min = 10.6h** | ~8.5h | **+2.1h** |

  And 635 min still excludes: copying/trimming `src/infrastructure/bedrock` (Finding 3), copying `src/shared/queue` + BullMQ wiring, copying `content-parser` (Finding 6), `pnpm install` on two repos, the `pgvector/pgvector:pg16` image pull, and `nest new` / `pnpm create vite` scaffolds. The frontend budget is the thinnest slice: **115 minutes total** (35 phase-2 + 20 phase-3 + 20 phase-4 + 30 phase-5 + 10 phase-6) to reproduce a UI whose v1 equivalent is **2081 lines of TSX** across 17 files — and v1's version had no TanStack Table, no cytoscape, no polling.
- **Failure scenario:** The plan's stated stopping-point logic ("Phase 2–4 ≈6h đã là demo tử tế") is based on the wrong number. At the published step estimates, phases 1–4 are 6.25h *before* the unbudgeted copy work; realistically 8h+. The day ends somewhere in phase 4 with search half-wired and no graph — the exact outcome the phase ordering was designed to prevent.
- **Evidence:**
  - Per-step minutes as cited in each phase file's step headings.
  - `plan.md:60` — "Tổng ước tính ~8.5h + overhead."
  - `$V1` UI LOC (the closest apples-to-apples benchmark, same features, same corpus): `graph-explorer.tsx` 287, `metadata-editor.tsx` 232, `search-workspace.tsx` 217, `page.tsx` (dashboard) 198, `library/page.tsx` 187, `upload-form.tsx` 174, `documents/[id]/page.tsx` 163, `badges.tsx` 139, `audit/page.tsx` 93, `login-form.tsx` 80 — 2081 total.
  - ECVBot's single cytoscape tab, which phase 5 budgets 30 min to reproduce: `$ECVBOT_FE/src/pages/knowledge-base/graph/tabs/visualize.tsx` — **445 lines**, including a WebGL-context cleanup workaround at `:249` ("react-cytoscapejs doesn't do this automatically").
- **Suggested fix:** Republish the headline as ~10.5h of step work plus unbudgeted copy/trim, and re-derive the "safe stopping point" from that number. Then apply Findings 1/3/5/6, which remove roughly 1.5–2h of work without touching feature scope: seed-imported entities (−15 min + 9 Claude calls), single-file bedrock copy (−40 min of trim), single-file chunker (−25 min), no ivfflat/generated column (−25 min), one fewer search branch (−15 min).

---

## Finding 8: Phase 5's "port from v1" claims do not survive grep — it is a rewrite budgeted as a copy

- **Severity:** Medium
- **Location:** Phase 5, "Related Code Files" and step 2 `PostgresGraphStore (~30 phút)`
- **Flaw:** Four verifiable claims, all wrong or unverified:
  1. *"`getEntityNeighbourhood` ... Đây là chức năng 'Focus its neighbourhood' của v1"* — v1's focus mode is **document-centric**, not entity-centric: `GraphFilters.focusDocumentId`, and the UI button sits in the document detail panel calling `onFocus(documentId)`. There is no entity-neighbourhood query in v1. This method is new code with no reference implementation.
  2. *"Mặc định `minShared=2` giữ nguyên từ v1"* — v1's **API** default is `minDocuments: 1`; only the UI defaults to 2. v1's `feature-status.md` calls the split deliberate. Copying "2" into the API changes documented behaviour and makes `GET /graph?minShared=1` (a phase-5 success criterion) the non-default path.
  3. *"Port ... test trong `src/lib/graph/__tests__/`"* — those 12 tests (203 LOC) are written against `DocumentRecord[]` fixtures with `doc.analysis.entities`. The v2 data model is Prisma join rows from a SQL `GROUP BY ... HAVING`. The fixtures cannot be ported without rewriting; the assertions about `degree`, `confidence` pruning, and `entityNodeId` normalisation target functions that will not exist.
  4. v1's `buildGraph` prunes *after* building candidates and computes node `degree` from surviving edges; the plan's SQL pre-filters with `HAVING count(DISTINCT documentId) >= $1`, so `degree`, `minConfidence`, and `entityKinds` filtering all land in different places. The 135-line function is not transplantable.
- **Failure scenario:** 30 minutes budgeted for "port + SQL"; the developer opens `build-graph.ts`, finds it operates on a different data model, and writes the node/edge builder from scratch plus a new entity-neighbourhood query — 50–70 minutes, in the phase most likely to be reached late in the day.
- **Evidence:**
  - `$V1/src/lib/graph/build-graph.ts:18` `focusDocumentId?: string`; `:72-79` focus implementation; `$V1/src/components/graph/graph-explorer.tsx:220-221` — the "Focus its neighbourhood" button passes a **documentId**; `$V1/src/app/api/graph/route.ts:23` `focusDocumentId: params.get("focus")`.
  - `$V1/src/lib/graph/build-graph.ts:25` `minDocuments = 1` (API default); `$V1/docs/feature-status.md:165` — *"API thì mặc định `minDocuments: 1` (giữ hết), chênh lệch này là cố ý"*.
  - `$V1/src/lib/graph/__tests__/build-graph.test.ts` — 203 LOC, `:124-131` focus test built from `DocumentRecord` fixtures.
  - `$V1/src/lib/graph/build-graph.ts:81-118` — degree-then-node construction that has no SQL analogue in the plan.
  - Plan `phase-05:55`, `:118`, `:126`.
- **Suggested fix:** Relabel step 2 as new code and re-estimate at 45–60 min, or drop `getEntityNeighbourhood` from `IGraphStore` v1 and implement the drawer's "related documents" list with the data `getGraph` already returns (the bipartite edge list already contains every document sharing an entity — the neighbourhood is a client-side filter over data already on the page, costing 5 lines in `node-drawer.tsx` instead of a 4th port method + a new SQL query + a new endpoint).

---

## Finding 9: Asking Claude for `charStart`/`charEnd` that the plan then throws away

- **Severity:** Medium
- **Location:** Phase 3, step 4 "Analyze — một lần gọi Claude"; `analysis.schema.ts`
- **Flaw:** `AnalysisSchema.entities[]` requires the model to emit `charStart` and `charEnd` per entity. Twelve lines later the same step states: *"Xác minh char offset ở server, không tin LLM: `textContent.indexOf(entity.text)`. Không tìm thấy → bỏ offset ... tìm thấy → **ghi đè offset của LLM bằng offset thật**."* The LLM-produced offsets are therefore discarded 100% of the time — in both branches. They are pure cost: extra output tokens per entity (v1's corpus averages 6.5 entities/document), extra latency, and — the real cost — two more fields the model can get wrong, feeding the retry loop the plan then needs (`safeParse` fail → retry with zod errors → second fail = `status='failed'`). Character-offset arithmetic over multibyte Vietnamese text is one of the least reliable things to ask an LLM for; these two fields are plausibly the single largest contributor to schema-validation failures in the whole pipeline.
  Same pattern, smaller: `DocumentEntity.confidence` is declared in the phase-2 schema and never written by any step in phases 3–6.
- **Failure scenario:** A document fails analysis twice, lands `status='failed'`, and the developer spends phase-3 debugging time on offset hallucinations for values that were never going to be used. During the demo, the "AI phân tích thất bại" red badge appears on a document that was perfectly analysable.
- **Evidence:**
  - Plan `phase-03:116-118` (schema fields) vs `phase-03:133` (server override) — same step, self-cancelling.
  - Plan `phase-03:129-131` — retry loop whose failure probability the discarded fields directly increase.
  - `$V1/data/documents.json` — v1's entities carry `kind`/`value`/`confidence` and **no offsets**, and v1 still shipped the graph; offsets are computed downstream, not extracted.
  - Plan `phase-02:150` — `confidence Float?` on `DocumentEntity`, never assigned anywhere in phases 3–6.
- **Suggested fix:** Delete `charStart`/`charEnd` from `AnalysisSchema` (2 lines). Keep the `indexOf` verification exactly as specified — it is the actual mechanism and it is correct. Phase 6's highlight is unaffected because it reads `DocumentEntity.charStart/charEnd`, which the server computes either way. Either populate `DocumentEntity.confidence` from the analysis (v1 supplies it — see Finding 1) or drop the column.

---

## Cross-cutting notes (not separate findings)

- **Two backfill scripts, unclear ownership.** `phase-04:85` creates `scripts/backfill-embeddings.ts`, `phase-05:132` creates `scripts/backfill-entities.ts`, and `phase-05:134` says merge them *"nếu tiện"*. Applying Finding 1 deletes the entity script entirely and the question disappears. `phase-07:70`'s README setup sequence only mentions `backfill-embeddings.ts`, which would leave the graph empty for anyone following the README.
- **`src/common/` copy is under-specified.** 50 files / 2218 LOC (1490 non-test). External packages pulled in beyond the plan's stated stack: `nestjs-cls`, `cache-manager`, `@nestjs/cache-manager`, `nestjs-zod`, `lodash`, `uuid`, `express`. More importantly it carries a **second, DB-backed authorization model** (`guards/roles.guard.ts` 62 LOC, `models/shared-role.model.ts`, `models/shared-permission.model.ts`, `port/shared-role.port.ts`, `repositories/shared-role.repository.ts` 58 LOC, `decorators/roles.decorator.ts`) that directly competes with the v1 `PERMISSIONS`/`can()` RBAC phase 2 step 3 ports in. The plan's exclusion list (`phase-02:66`) names only `api-key.guard.ts` and `repositories/`. Name the full delete list before starting, or the "build after each copy" loop becomes the whole 35 minutes.
- **`$ECVBOT_FE/src/lib/axios.ts` (86 LOC) is a clean copy** — it reads a JWT from cookies (`:21-23`), no Amplify coupling in the interceptor path, so that one phase-2 copy claim holds.

---

Status: DONE_WITH_CONCERNS
Summary: Nine findings, three Critical. The plan's largest costs are self-inflicted: it re-derives with Claude the analysis and 59 entities that v1's `documents.json` already contains, treats three ECVBot directories as free copies when each is a contract change against code with incompatible schemas and module dependencies, and builds TREC-scale search machinery (RRF k=60, ivfflat lists=100, generated tsvector + GIN) for a 13,198-character corpus where it degrades ranking rather than improving it.
Concerns/Blockers: Published effort (~8.5h) is 2.1h below the sum of the plan's own step estimates, and that sum excludes all copy/trim work — so the "phases 2–4 ≈6h is already a decent demo" stopping-point logic rests on the wrong number. Findings 1, 3, 5, 6 remove ~1.5–2h without cutting a single feature; recommend applying those before starting rather than discovering them at hour six.
