---
title: "eDIP-v2 — Document Intelligence Platform trên NestJS + Vite + Postgres/pgvector"
description: "Xây eDIP-v2 trong 1 ngày: tái sử dụng hạ tầng ECVBot + nghiệp vụ eDIP v1. Phase sắp theo giá trị demo giảm dần."
status: pending
priority: P1
branch: ""
tags: [edip, nestjs, vite, pgvector, bedrock, rag, knowledge-graph]
blockedBy: []
blocks: []
created: "2026-08-11T09:34:36.641Z"
createdBy: "ck:plan"
source: skill
---

# eDIP-v2 — Document Intelligence Platform trên NestJS + Vite + Postgres/pgvector

## Overview

Xây lại eDIP trên stack production của ECV: **NestJS 11 + Prisma 7 + Postgres/pgvector + BullMQ/Redis + Bedrock** (backend) và **React 18 + Vite + shadcn + TanStack + cytoscape** (frontend).

**Deadline: 1 ngày. Không cắt scope** — phase sắp theo giá trị demo giảm dần, dừng ở mốc nào cũng có bản trình được.

Nguyên tắc xuyên suốt: **hạ tầng copy từ ECVBot, nghiệp vụ port từ eDIP v1.** Không viết lại thứ nào đã chạy được.

Thiết kế đầy đủ: [brainstorm report](../reports/brainstorm-solution-design-260811-1608-edip-v2-nestjs-vite-pgvector-architecture-report.md)

## Nguồn tái sử dụng

| Ký hiệu | Đường dẫn tuyệt đối |
|---|---|
| `$ECVBOT_BE` | `C:\Users\GIGABYTE\Documents\KHTN\Internship_ECV_2026\PROJECTS\ECVBot\nestjs-backend` |
| `$ECVBOT_FE` | `C:\Users\GIGABYTE\Documents\KHTN\Internship_ECV_2026\PROJECTS\ECVBot\frontend` |
| `$V1` | `C:\Users\GIGABYTE\Documents\KHTN\Internship_ECV_2026\PROJECTS\EDIP\eDIP` |
| `$ROOT` | `C:\Users\GIGABYTE\Documents\KHTN\Internship_ECV_2026\PROJECTS\EDIP\eDIP-v2` |

**Không sửa `$V1` và `$ECVBOT_*`** — chỉ đọc/copy. `$V1` là bản demo dự phòng, phải giữ chạy được.

## Layout đích

```
eDIP-v2/
  docker-compose.dev.yml       postgres(pgvector) + redis
  nestjs-backend/
  frontend/
  plans/
```

## Phases

| Phase | Name | Giờ | Demo được gì | Status |
|-------|------|----:|---|--------|
| 1 | [Bedrock & Docker Gate](./phase-01-bedrock-docker-gate.md) | 0.75 | *Cổng chặn — hỏng ở đây là đổi kế hoạch* | **Done** |
| 2 | [Skeleton DB Auth Seed](./phase-02-skeleton-db-auth-seed.md) | 3.5 | Đăng nhập 3 role, library + dashboard theo loại, **entity đã sẵn sàng** | **Done** |
| 3 | [Upload & Ingest Pipeline](./phase-03-upload-ingest-pipeline.md) | 2.5 | Upload → processing → completed + metadata tự sinh | **Code xong, chờ credential** |
| 4 | [Hybrid Search & RAG Ask](./phase-04-hybrid-search-rag-ask.md) | 1.5 | Hỏi tiếng Việt, trả lời kèm nguồn | **Code xong, chờ credential** |
| 5 | [Entity & Knowledge Graph](./phase-05-entity-knowledge-graph.md) | 1.25 | Knowledge graph click được | **Done** |
| 6 | [Audit Metadata Edit Highlight](./phase-06-audit-metadata-edit-highlight.md) | 1.25 | Đủ 6 bước demo flow trong đề | **Done** |
| 7 | [Polish & Demo Rehearsal](./phase-07-polish-demo-rehearsal.md) | còn lại | Chạy trọn demo flow không vấp | Chờ credential |

**Tổng ~10.75h.** Con số cũ (8.5h) sai — red-team cộng lại các bước trong chính phase file ra 10.6h, và bản đó còn chưa tính copy/trim. Đây là số đã sửa và đã tính.

**Deadline 1 ngày không đủ cho toàn bộ.** Điều đó không đổi kế hoạch (người dùng đã chọn "tới đâu thì tới"), nhưng đổi *cách sắp*: phase 2 giờ nạp sẵn `documentType`, metadata, summary và 59 entity kèm offset từ corpus v1, nên dashboard-theo-loại, `/graph` và highlight **có dữ liệu ngay sau phase 2** thay vì phải đợi phase 3/5. Nếu ngày kết thúc trong phase 4 — kịch bản nhiều khả năng nhất — vẫn còn graph để demo.

## Dependencies

```
1 → 2 ─┬→ 3 → 4 ─┐
       └────→ 5 ─┴→ 6 → 7
```

**Phase 5 chỉ phụ thuộc phase 2**, không phải 3 — entity đã nằm trong seed. Đây là van xả quan trọng nhất: nếu Bedrock trục trặc và phase 3/4 kẹt, nhảy thẳng sang phase 5, `/graph` vẫn chạy đầy đủ.

Cross-plan: không có plan nào khác trong `$ROOT/plans/`. Plan của `$V1` (`260805-1652-edip-mvp`, `260810-1303-real-ocr-sqlite-auth`) thuộc project khác, **không** blocking — nhưng `$V1` phải giữ nguyên trạng thái chạy được.

## Quyết định kiến trúc cứng

| Hạng mục | Chốt | Không được đổi giữa chừng |
|---|---|---|
| Embedding dimension | **1024** | ✅ Cứng — đổi là phải migrate lại toàn bộ |
| Embedding model | Cohere Embed Multilingual v3 (fallback Titan v2, cũng 1024d) | |
| LLM | Claude qua Bedrock (vision + analyze + Q&A) | |
| Graph store | Postgres sau `GraphStorePort` | Adapter FalkorDB là việc ngày 2 |
| Storage | Local disk volume | Không S3 hôm nay |
| Queue | BullMQ + Redis, `attempts: 3` + backoff | Timebox 30 phút, quá thì `EventEmitter2` |
| Layout | 2 thư mục rời, không workspace | |
| `embedding_chunks.id` | **`SERIAL`**, kèm `chunking_strategy` + `chunk_index` | ✅ Cứng — phải khớp code ghi |
| Seed | Nạp **đầy đủ** `analysis` của v1: type, metadata, summary, 59 entity + offset | ✅ Cứng — đây là lưới an toàn của demo |
| Auth | **Viết mới**, không copy chuỗi guard của ECVBot | Xem phase 2 §3 |
| `prisma.config.ts` | Bắt buộc, generator pin `prisma-client-js` | Prisma 7 không tự nạp `.env` |
| Index vector | **Không** tạo `ivfflat` | 13 vector — `lists=100` cho kết quả sai |
| RRF | `k=5`, **2 nhánh** (bỏ metadata ILIKE) | `k=60` là hằng số quy mô TREC |
| Snippet | Cắt trong TypeScript, **không** `ts_headline` | Xem phase 4 §3 |

## Acceptance Criteria (toàn plan)

- [x] `docker compose up` → Postgres(pgvector) + Redis lên; `pnpm prisma migrate deploy` pass
- [x] Đăng nhập 3 role; `viewer` bị **API** từ chối upload/search/ask/audit với **403** (không phải 401, không chỉ ẩn UI)
- [x] Không token → **403** ở mọi route ngoài `/auth/login` và `/auth/me` (mọi route đều có `@RequirePermission`; không có chế độ đọc vô danh)
- [x] Ngay sau `db seed`: dashboard "theo loại" khác 0, `Entity` ≥30 row, `DocumentEntity` có offset — **trước khi** chạm Bedrock
- [ ] Upload 1 PDF scan → `uploaded → processing → completed`, có `documentType` + metadata + summary
- [ ] Truy vấn `hop dong` (không dấu) trả về tài liệu `hợp đồng`
- [ ] Ask trả lời kèm ≥1 citation trỏ về document có thật; không có nguồn → trả "không tìm thấy", không bịa
- [ ] `/graph` hiện ≥2 document nối qua entity chung; click node mở được detail
- [ ] Dashboard đếm đúng tổng / theo loại / theo status, có ≥1 doc `failed`
- [ ] Audit log ghi upload/view/edit/delete/search/ask

## Rủi ro toàn plan

| Rủi ro | Xác suất | Xử lý |
|---|---|---|
| IAM chưa bật model access Bedrock | **Cao** | Phase 1 là cổng chặn. Hỏng → port rule-based provider của `$V1/src/lib/ai/`, demo vẫn chạy |
| Copy ECVBot kéo DI hỏng (Restate/Falkor/S3/Lambda/Cls) | Trung bình | Trim theo `app.module.ts`: xoá import trước, xoá file sau, `pnpm build` sau mỗi lần xoá |
| BullMQ worker im lặng | Trung bình | Log mỗi step + `GET /documents/:id/status`; timebox 30 phút → `EventEmitter2` |
| Claude trả JSON sai schema | Trung bình | Zod parse + retry 1 lần kèm lỗi |
| Tràn deadline | **Cao** | Phase sắp theo giá trị giảm dần; **giữ `$V1` chạy được làm dự phòng** |

## Open Questions

- Region Bedrock nào đang có quyền? Cohere Embed Multilingual v3 có ở region đó không? (Không → Titan Text Embeddings V2, vẫn 1024d, không đổi migration.)
- Tổ chức có cho dùng khoá AWS tĩnh trong `.env` không? Nếu bắt buộc SSO/profile thì phải sửa `BedrockEmbeddingService` sang `fromIni()` — xem phase 1 §5.
- Có cần deploy sau demo không? (Hôm nay bỏ qua Dockerfile production + CI.)

**Đã đóng:** câu hỏi về mức nhạy cảm của corpus KYC. Red-team đọc file và xác nhận dữ liệu là **tổng hợp** (`Record reference: ECV-KYC-2026-009`, `VietBank Corp` — không phải người thật). Không cần gate phase 2. `.gitignore` vẫn chặn `storage/` và `data/` ngay từ phase 1 vì đó là vệ sinh đúng, không phải vì rủi ro dữ liệu.

---

## Việc cần làm ngay khi có AWS credential

Theo thứ tự. Mỗi bước là cổng chặn cho bước sau.

1. **Xác minh phase 1 §2** — 3 lời gọi T1/T2/T3. Đặc biệt `assert embedding.length === 1024`. Sai ở đây thì mọi thứ dưới đều vô nghĩa.
2. `pnpm backfill:embeddings` → `SELECT count(*) FROM embedding_chunks WHERE embedding IS NOT NULL` > 0. Chạy **lần hai**, số chunk phải không đổi.
3. Upload `$V1/seed/fixtures/scanned-contract.pdf` → `textSource='vision'`, text không rỗng. Đây là lần đầu đường vision chạy thật.
4. Upload `$V1/seed/fixtures/vietnamese-scan.jpg` → đọc đúng chữ Việt có dấu.
5. `POST /search { q: 'hợp đồng với Saigon Retail' }` → MSA phải lên **rank 1**. Hiện lexical xếp nó thứ 3 và **không thể** khác được (tài liệu tiếng Anh, xem phase 4 §Ranking). Đây là phép thử thật của nhánh vector.
6. `POST /ask` một câu có nguồn → citation trỏ document có thật; một câu vô căn cứ → đúng câu "Không tìm thấy…".
7. Chạy lại cùng một job ingest 2 lần → `count(*) FROM embedding_chunks WHERE document_id=…` không đổi.

## Deviation Log

### 2026-08-11 — Bỏ chế độ đọc vô danh: mọi thứ nằm sau trang đăng nhập

**Quyết định của người dùng:** "Ban đầu sẽ là một trang đăng nhập, chỉ có những người đã đăng nhập mới được vào."

**Bối cảnh:** khi kiểm chứng phase 2, `GET /stats` không token trả 200 trong khi acceptance criteria đòi 403. Nguyên nhân là mâu thuẫn có sẵn trong plan: §3 chốt "không token → coi là `viewer`", mà `viewer` có quyền `view`. Đây đúng là câu hỏi mở mà red-team đã nêu và chưa ai trả lời (*"Is the anonymous-viewer behaviour actually required for the demo, or can everything be behind login? Answering 'no' removes most of Finding 3"*).

**Ảnh hưởng:**
- `RbacGuard` thêm một bước: `user == null` → `ForbiddenException`. Vẫn **403**, không 401 — tiêu chí cũ giữ nguyên, chỉ mở rộng ra mọi route.
- `viewer` không còn là trạng thái vô danh → phải là **tài khoản thật**. Seed lên 3 user, thêm `SEED_VIEWER_EMAIL` / `SEED_VIEWER_PASSWORD`.
- `/auth/me` vẫn `@Public()` nhưng trả `{user: null, role: null, permissions: []}` cho khách, thay vì tự nhận là viewer — FE cần phân biệt "hết phiên" với "thiếu quyền" để đẩy về `/login` chứ không lặp lại vào 403.
- FE: `ProtectedRoute` bọc mọi route ngoài `/login`.
- **Phase 7 §rehearsal phải sửa:** bước "đăng xuất → duyệt `/library` với tư cách khách" không còn tồn tại. Thay bằng: đăng xuất → mọi route đẩy về `/login`; đăng nhập lại bằng `viewer` để cho thấy nav mất Upload/Search/Audit; `curl` thẳng vào `/search` không token → 403.
- Finding #13 (`/graph`, `/stats` lộ tên người/công ty cho khách vô danh) **đóng theo cách mạnh hơn** đề xuất ban đầu: không còn khách vô danh nào để lộ.

**Đánh đổi đã chấp nhận:** mất bước demo "khách xem được text đã trích xuất" mà v1 có (`$V1/src/lib/rbac.ts:41-45`). Đổi lại, ranh giới quyền chỉ còn một chỗ để sai thay vì hai.

### 2026-08-11 — Bỏ nhánh A của phase 1 (xác minh Bedrock)

**Quyết định của người dùng:** viết code Bedrock theo khuôn ECVBot, **không** gọi kiểm tra. Credential thật sẽ được cắm vào sau.

**Ảnh hưởng:**
- Phase 1 rút còn nhánh B (Docker + extension). Bước 1, 2 của phase 1 không chạy.
- `scripts/verify-bedrock.mjs` không viết. Phase 3 §2 mất điểm khởi đầu "nâng cấp script phase 1 thành service" → viết `bedrock-llm.service.ts` và `bedrock-vision.service.ts` từ đầu, ước tính không đổi (~35 phút) vì khuôn đã có ở ECVBot.
- **Rủi ro đã dời, không biến mất.** Lỗi model-access / credential / dimension giờ sẽ lộ ở phase 3–4 thay vì phút thứ 15. Lúc đó đã có 6h công đổ vào.

**Giảm nhẹ:** ghim dimension **1024** — cả `amazon.titan-embed-text-v2:0` lẫn `cohere.embed-multilingual-v3` đều 1024, nên bất kỳ model nào người dùng cắm vào cũng không cần migrate lại. Đây là lý do con số 1024 vẫn an toàn dù không xác minh được.

**Mặc định lấy từ `$ECVBOT_BE/.env.example`:** `AWS_REGION=ap-southeast-1`, `BEDROCK_EMBEDDING_MODEL_ID=amazon.titan-embed-text-v2:0`, `BEDROCK_LLM_MODEL_ID=global.anthropic.claude-sonnet-4-5-20250929-v1:0`. Người dùng thay khi cắm credential thật.

**Việc cần làm khi có credential:** chạy 3 lời gọi T1/T2/T3 của phase 1 §2 trước khi tin vào pipeline. Đặc biệt assert `length === 1024`.

---

## Red Team Review

### Session — 2026-08-11
**Reviewers:** 4 (Security Adversary · Failure Mode Analyst · Assumption Destroyer · Scope & Complexity Critic), verification tier Full
**Findings:** 34 thô → **15 sau khử trùng lặp** (15 accepted, 0 rejected — tất cả đều có citation `file:line`)
**Severity:** 5 Critical, 8 High, 2 Medium (+8 mục Medium gộp áp kèm)
**Reports:** `./reports/from-code-reviewer-to-planner-red-team-*-plan-review-report.md`

| # | Finding | Sev | Đồng thuận | Áp vào |
|---|---|---|---|---|
| 1 | `embedding_chunks` DDL không khớp code ghi (`TEXT` vs `SERIAL`, thiếu 2 cột) | Critical | **4/4** | Phase 2 §2b, Phase 4 §1 |
| 2 | Chuỗi auth ECVBot không copy được; `status !== 'ACTIVE'` → mọi request 401 lúc chạy | Critical | 3/4 | Phase 2 §3 |
| 3 | `infrastructure/bedrock/` **không có vision**; module kéo 1454 LOC + LangChain đã patch | Critical | 2/4 | Phase 3 §2 |
| 4 | Prisma 7 cần `prisma.config.ts` + `migration_lock.toml` + pin generator | Critical | 2/4 | Phase 2 §2 |
| 5 | Seed vứt phân tích v1 (59 entity) rồi gọi Claude sinh lại; lưới an toàn phase 7 là sai | Critical | 3/4 | Phase 2 §4, Phase 5, Phase 7 |
| 6 | Corpus ~13 chunk không phải ~200; RRF k=60 sai; ivfflat lists=100 sai; nhánh C khớp key JSON | High | 1/4 | Phase 2 §2b, Phase 4 §1,§3 |
| 7 | `ts_headline` chạy trên text còn dấu → mọi snippet là câu mở đầu; SQL migration sai thứ tự | High | 1/4 | Phase 2 §2b, Phase 4 §3 |
| 8 | `/ask` không có retrieval cấp chunk; ivfflat dựng lúc rỗng → chết im lặng | High | 1/4 | Phase 4 §4 |
| 9 | Không idempotent; `queue.module` thiếu `defaultJobOptions` → `attempts:1` | High | 1/4 | Phase 3 §5,§6, Phase 4 §2 |
| 10 | `content-parser` 1249 LOC/15 file; strategy tách theo header ATX mà corpus có 0 header | High | 2/4 | Phase 3 §5 |
| 11 | Ước tính 8.5h sai — cộng đúng ra 10.6h; phase 2 cần 3.5h; FE bị cấp 115 phút | High | 2/4 | plan.md, mọi phase |
| 12 | Allowlist mô tả ngược; `LocalStorageService` không chặn path traversal; mất `NEUTRALISED_EXTENSIONS` | High | 3/4 | Phase 3 §1 |
| 13 | `/graph`, `/stats` không có permission → lộ tên người/công ty cho khách vô danh | High | 1/4 | Phase 2 §3, Phase 5 |
| 14 | Phase 1 gate không chạy code sẽ ship; SDK bỏ qua profile/SSO nếu thiếu 2 khoá | High | 1/4 | Phase 1 §2,§5 |
| 15 | PDF vision hỏng im lặng do sai thứ tự `ensurePdfjs()`; ngưỡng 200 sai (v1 dùng 100 + đa số trang) | High | 1/4 | Phase 3 §3 |

**Medium áp kèm:** graph thiếu `DISTINCT` → cytoscape trắng màn hình (Phase 5 §2) · `Entity` unique thiếu `type` (Phase 2 §2) · kind `department` thiếu trong enum (Phase 2 §4, Phase 3 §4) · bỏ `charStart/charEnd` khỏi zod schema (Phase 3 §4) · `Promise.allSettled` thay `Promise.all` (Phase 4 §3) · lọc `status='completed'` trong search/graph (Phase 4 §1, Phase 5 §2) · sửa đường dẫn `$V1/seed/fixtures/` (Phase 1 §2) · giữ `ThrottlerModule` + rate-limit login (Phase 2 §1,§3) · thứ tự xoá DB→đĩa (Phase 6 §2) · nonce cho citation id chống giả mạo (Phase 4 §4).

**Non-issue đã ghi để khỏi đào lại:** `$queryRawUnsafe` trong `vector-store.service.ts` dùng positional bind parameter xuyên suốt — không có SQL injection.

### Ảnh hưởng tới tổng thời gian

6 finding **bỏ bớt việc** (5, 3, 10, 6, và 2 mục Medium): ~-2.4h — chủ yếu từ việc không sinh lại entity bằng Claude, không copy `content-parser`, không đấu với module graph của `bedrock/`.
10 finding **thêm việc**: ~+1.7h — auth viết mới, `prisma.config.ts`, idempotency, path containment, assert vision, gate phase 1 chặt hơn.

Net ~-0.7h so với 10.6h → **~10.75h** sau khi tính lại từng bước. Việc áp findings **không** làm plan dài thêm; nó dời thời gian từ chỗ vô ích sang chỗ cần.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01` … `phase-07` (8 file)
- Decision deltas checked: 15
- Reconciled stale references: 11 (số giờ ở `plan.md` + bảng phase; phụ thuộc phase 5 đổi 3→2; `backfill-entities.ts` gỡ khỏi phase 5 và phase 7; tuyên bố "không cần Bedrock" ở phase 7 sửa cho đúng; nguồn offset ở phase 6 đổi từ phase 3 sang phase 2; `ivfflat` gỡ khỏi cả phase 2 và 4; đường dẫn fixture ở phase 1; `document_title_trgm_idx` gỡ; nhánh C gỡ khỏi kiến trúc phase 4; enum entity thêm `department` ở cả phase 2 và 3; danh sách port phase 3 thêm `pdfjs-init.ts` + `global-singleton.ts`)
- **Unresolved contradictions: 0**
