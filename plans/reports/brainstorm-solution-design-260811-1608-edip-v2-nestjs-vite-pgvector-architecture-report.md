# eDIP-v2 — Thiết kế giải pháp toàn diện

> Ngày: 2026-08-11 · Phiên: brainstorm · Trạng thái: **đã chốt, chuyển sang /ck:plan**
> Deadline: **1 ngày** · Không cắt scope (quyết định của user: "tới đâu thì tới")
> Modes: (không dùng `--html` / `--wiki`)

---

## 1. Bối cảnh scout

| Nguồn | Trạng thái |
|---|---|
| `eDIP-v2/` | **Trống hoàn toàn** — greenfield |
| `eDIP/` (v1) | **Demo được**. Next.js 15, store JSON→SQLite, OCR thật 4 tầng (`unpdf`+`pdfjs-dist`+`@napi-rs/canvas`+`tesseract.js`+`mammoth`), auth argon2id + iron-session, RBAC 27 case, dashboard/library/detail/graph/search/ask/audit, 9 doc seed VI+EN |
| `eDIP/plans/reports/research-...-oss-mapping-report.md` | Prior-art map từng must-have → OSS. Gap chỉ ra: **thiếu background queue**, **search không fold dấu**, **extraction thiếu char offset** |
| `ECVBot/nestjs-backend` | NestJS 11 · Prisma 7 + `@prisma/adapter-pg` · **pgvector raw SQL** (`embedding_chunks`, toán tử `<=>`) · BullMQ+Redis · LangChain/LangGraph + Bedrock · S3 · FalkorDB · `content-parser` 4 chunking strategies · BM25 + `vietnamese-stopwords.txt` · `entity-extraction` + `entity-deduplication` + ontology |
| `ECVBot/frontend` | React 18 + Vite + shadcn/Radix + TanStack Query/Table + **react-cytoscapejs** + react-hook-form + zod + Biome |

**Kết luận scout:** mọi mảnh eDIP cần đều đã tồn tại ở dạng production trong ECVBot; nghiệp vụ đã kiểm chứng nằm ở v1. v2 là bài toán **lắp ráp**, không phải nghiên cứu.

---

## 2. Problem-first inversion

**Solution-jumping diagnosis** — user đưa sẵn stack (React Vite + NestJS + Postgres/pgvector) cho một feature list mà v1 **đã làm xong**. Tín hiệu ẩn: v1 không chứng minh được năng lực trên stack production của ECV.

**Underlying problem** — cần một artifact vừa *demo được business value*, vừa *chứng minh làm được trên stack ECV thật* (clean architecture, DB thật, queue thật, vector search thật). v1 đạt vế một, trượt vế hai.

**Assumption challenges**

| Giả định | Rủi ro nếu sai | Cách kiểm chứng |
|---|---|---|
| Bedrock model access đã bật | Mất OCR + embedding + Q&A → sập toàn kế hoạch | **P0**: gọi thử `InvokeModel` trong 15 phút đầu |
| Copy ECVBot vào là chạy | DI gãy do Restate/Falkor/S3 kéo theo | Trim theo `app.module.ts`: xoá import trước, xoá file sau |
| 1 ngày đủ | Kết thúc với ít feature hơn v1 | Sắp phase theo giá trị demo giảm dần; giữ v1 làm dự phòng |
| Graph cần graph-DB | Thêm container + dual-write, cháy thời gian | Scale demo ~10 doc/vài trăm entity → SQL thừa sức |

**Problem statement** — Intern cần trình một nền tảng document intelligence chạy trên stack ECV trong 1 ngày; struggle là chênh lệch giữa quy mô hạ tầng (5 dịch vụ) và quỹ thời gian; nguyên nhân là stack production vốn thiết kế cho đội và quý, không cho cá nhân và ngày; hệ quả là rủi ro có kiến trúc đẹp nhưng ít feature hơn v1. Thành công quan sát được: 6 bước demo flow trong đề chạy hết trên NestJS+Vite+Postgres/pgvector.

**Ba framing thay thế**

- **Frame A — "Vấn đề là stack"**: v1 đủ feature, thiếu stack → viết lại tối thiểu trên Nest/Vite/pgvector, tái sử dụng tối đa. ← **đã chọn**
- **Frame B — "Vấn đề là chất lượng AI"**: v1 search chỉ keyword/heuristic → nâng cấp tại chỗ v1 (pgvector + queue + fold dấu), giữ Next.js. Rẻ nhất nhưng không đáp ứng ràng buộc stack.
- **Frame C — "Vấn đề là niềm tin vào kết quả AI"**: điểm yếu thật là không chứng minh được AI lấy dữ liệu từ đâu → dồn công vào char-offset highlight + review queue theo confidence, bất kể stack.

**Evidence status: Strong** cho ràng buộc stack (user xác nhận cả 4 mục tiêu), **Medium** cho gap chất lượng (report prior-art + `feature-status.md` tự đánh giá).

---

## 3. Các phương án đã cân nhắc

| PA | Nội dung | Ưu | Nhược | Kết luận |
|---|---|---|---|---|
| **A** | Fork skeleton ECVBot → thu nhỏ | Nhanh nhất tới "chạy trên stack ECV"; kế thừa code production; mentor đọc quen | Kéo theo Restate/Bedrock/S3/Falkor phải cắt cẩn thận | **Chọn (lai B)** |
| **B** | Scaffold Nest/Vite sạch, port logic v1 | Sạch, không rác, không dính AWS | Tự viết lại vector-store/queue/chunking (~1–2 tuần) | Lấy phần "port nghiệp vụ v1" |
| **C** | Nâng cấp tại chỗ v1 | Rẻ nhất, đúng gap prior-art | Không đáp ứng yêu cầu stack | Loại |

**Chốt: A lai B** — *hạ tầng lấy từ ECVBot, nghiệp vụ lấy từ v1.*

### Ma trận tái sử dụng

| Lớp | Nguồn | Cách lấy |
|---|---|---|
| Skeleton Nest (`common/`, `shared/database`, `shared/logger`, `shared/queue`, `config/`) | ECVBot | Copy gần nguyên |
| `infrastructure/vector-store` (pgvector raw SQL) | ECVBot | Copy, đổi `botId` → `documentId` |
| `infrastructure/content-parser` + chunking strategies | ECVBot | Copy, giữ `document-structure` + `parent-child` |
| `infrastructure/bedrock` | ECVBot | Copy, **thêm vision** |
| BullMQ consumer pattern (`kb/jobs/*`) | ECVBot | Copy pattern, viết lại nội dung job |
| BM25 + `vietnamese-stopwords.txt` | ECVBot | Copy nguyên |
| Entity extraction/dedup | ECVBot `kb/services/*` | Port chọn lọc (ECVBot gắn chặt ontology riêng) |
| FE shell Vite+shadcn+TanStack+cytoscape | ECVBot `frontend/` | Copy shell, bỏ màn chat |
| 4 tầng extraction · RBAC 27 case · graph builder 2 vòng · ranking · seed 9 doc VI/EN | **eDIP v1** | Port sang Nest service |

---

## 4. Quyết định kiến trúc đã chốt

| Hạng mục | Chốt | Lý do |
|---|---|---|
| Layout | `nestjs-backend/` + `frontend/` rời (giống ECVBot) | Copy-paste không phải sửa đường dẫn; mentor đọc quen |
| Backend | NestJS 11 + Prisma 7 + `@prisma/adapter-pg` | Đồng bộ ECVBot |
| Frontend | React 18 + Vite + shadcn + TanStack + react-cytoscapejs | Copy shell ECVBot |
| DB | Postgres 16 + pgvector | 1 nguồn sự thật, kể cả graph |
| Queue | **BullMQ + Redis** | User chọn; giống production, retry thật |
| AI | Bedrock — Claude (vision+analyze+Q&A), **Cohere Embed Multilingual v3 (1024d)** | Cohere tốt hơn Titan cho tiếng Việt |
| OCR | **Claude vision** | 1 call = OCR+classify+extract+summary → đòn bẩy cứu deadline |
| Graph | **Postgres sau `GraphStorePort`**; FalkorDB adapter ngày 2 | Tránh dual-write; scale demo SQL thừa sức; port chừa sẵn chỗ |
| Storage | Local disk volume | Bỏ S3 hôm nay |

---

## 5. Thiết kế

### 5.1 Cấu trúc backend

```
nestjs-backend/src/
  common/          guards, decorators, filters, dtos, port      ← copy ECVBot
  config/          app.yml loader                                ← copy ECVBot
  shared/
    database/      PrismaService                                 ← copy ECVBot
    logger/                                                       ← copy ECVBot
    queue/         BullMQ module                                  ← copy ECVBot
  infrastructure/
    bedrock/       chat + embed + vision                          ← copy + thêm vision
    content-parser/ parsers + chunking strategies                 ← copy ECVBot
    vector-store/  pgvector raw SQL                               ← copy, đổi scope key
    storage/       local disk                                     ← mới ~40 dòng
  features/
    auth/          login JWT, seed users, RBAC guard              ← ECVBot auth + roles.ts v1
    documents/     upload, CRUD, status, edit metadata
    ingestion/     BullMQ consumer: extract→analyze→chunk→embed→graph
    search/        hybrid pgvector + FTS(unaccent) + RRF
    ask/           RAG có citation
    graph/         GraphStorePort + PostgresGraphStore
    stats/         dashboard aggregates
    audit/         audit log
```

### 5.2 Schema

```
User            id, email, passwordHash, role(admin|user|viewer)
Document        id, filename, mimeType, sizeBytes, storagePath, ownerId,
                status(uploaded|processing|completed|failed), error,
                documentType, typeConfidence, language, title, summary,
                textContent, textSource(native|pdf-text|docx|vision),
                metadata Jsonb, metadataEditedById, metadataEditedAt,
                uploadedAt, processedAt
Entity          id, type(company|person|contract|invoice|project|date|amount),
                normalizedName @unique, displayName
DocumentEntity  documentId, entityId, mentionText, charStart, charEnd, confidence
AuditLog        id, actorId, action, targetType, targetId, meta Jsonb, createdAt
embedding_chunks  raw SQL: id, document_id, content, parent_content,
                  metadata jsonb, embedding vector(1024), ivfflat index
```

`normalizedName` unique = toàn bộ cơ chế dedup entity (lowercase + bỏ dấu + bỏ hậu tố `Ltd`/`JSC`/`Co.`). Đủ cho demo; không cần embedding-based dedup của ECVBot.

**Ràng buộc cứng:** dimension vector = **1024**, chốt ở migration đầu, không đổi giữa chừng.

### 5.3 Pipeline ingest (1 BullMQ job / document)

```
extract → analyze → chunk → embed → graph → completed
```

| Bước | Nội dung |
|---|---|
| extract | text/md/csv → native · PDF có text layer → `unpdf` · PDF text <200 ký tự/trang → render → **Claude vision** · DOCX → `mammoth` · ảnh → **Claude vision** |
| analyze | **1 lần gọi Claude**, structured output (JSON schema + zod parse): `documentType` + `confidence` + `title` + `parties` + `date` + `amount` + `keywords` + `language` + `summary` + `entities[]` kèm `charStart/charEnd` |
| chunk | `document-structure` strategy (ECVBot) |
| embed | Cohere batch → `embedding_chunks` |
| graph | upsert Entity + DocumentEntity theo `normalizedName` |

Fail bất kỳ bước nào → `status=failed` + `error`; doc vẫn hiện trong library với badge đỏ (v1 đã chứng minh đây là điểm demo tốt).

### 5.4 Search — sửa luôn bug fold dấu của v1

3 nhánh song song, hợp nhất bằng **RRF** (`score = Σ 1/(60+rank)` — không tune trọng số):
1. pgvector cosine trên `embedding_chunks`
2. Postgres FTS `to_tsvector('simple', unaccent(text))` + `pg_trgm` → **gõ `hop dong` ra `hợp đồng`**
3. Metadata exact match (tên đối tác, số hợp đồng) → boost lên đầu

### 5.5 Ask (RAG)

retrieve top-8 hybrid → Claude, prompt bắt buộc cite `[chunk_id]` → map ngược về document + char offset → FE highlight đoạn nguồn. Không có nguồn hợp lệ → trả "không tìm thấy trong kho tài liệu", **không bịa**.

### 5.6 Graph

`GET /graph?minShared=2` → `{ nodes: [...documents, ...entities], edges: [...] }`. Mặc định chỉ hiện entity được ≥2 doc chia sẻ (v1 chứng minh mặc định này làm graph đọc được). Cytoscape layout `cose` ở client; click node → drawer chi tiết.

Sau `GraphStorePort` + di-token → ngày 2 thêm `FalkorGraphStore` là xong, không sửa feature code.

### 5.7 Frontend routes

`/login` · `/` dashboard · `/library` (filter trong URL) · `/upload` (dropzone + poll status) · `/documents/:id` (preview + metadata panel edit được + summary + entity highlight) · `/graph` · `/search` (2 tab Search/Ask) · `/audit`

---

## 6. Thứ tự thi công — mỗi mốc đều demo được

| Mốc | Giờ | Demo được gì |
|---|---:|---|
| **P0** Verify Bedrock (`InvokeModel` Claude vision + Cohere embed) + `docker compose up` | 0.5 | *Cổng chặn* |
| **P1** Skeleton 2 repo + Prisma migrate + seed 9 doc (corpus v1, text trích sẵn) + auth + RBAC | 2.0 | Đăng nhập 3 role, library có data, dashboard có số |
| **P2** Upload + BullMQ + Claude vision analyze | 2.0 | **Upload → processing → completed + metadata tự sinh** |
| **P3** Embed + hybrid search + Ask có citation | 1.5 | **Hỏi tiếng Việt, trả lời kèm nguồn** |
| **P4** Entity + graph API + cytoscape | 1.5 | **Knowledge graph click được** |
| **P5** Audit log + edit metadata + entity highlight | 1.0 | Đủ 6 bước demo flow trong đề |
| **P6** Polish, empty/error state | còn lại | |

Seed ở P1 nạp text **đã trích sẵn** → demo không phụ thuộc độ trễ Bedrock; P2 trở đi luôn có dữ liệu cho search/graph kể cả khi upload live trục trặc.

---

## 7. Rủi ro

| Rủi ro | Xác suất | Xử lý |
|---|---|---|
| IAM chưa bật model access Bedrock | **Cao** | P0 là cổng chặn. Hỏng → fallback rule-based provider của v1 (copy được), demo vẫn chạy |
| BullMQ worker im lặng, khó debug | Trung bình | Log mỗi step + `GET /documents/:id/status`; timebox 30 phút, quá thì chuyển `EventEmitter2` |
| Claude vision trả JSON sai schema | Trung bình | Zod parse + retry 1 lần kèm lỗi (pattern Instructor) |
| Dimension vector lệch migration | Thấp / hậu quả nặng | Chốt 1024 ở migration đầu |
| Copy ECVBot kéo DI hỏng (Restate/Falkor/S3) | Trung bình | Trim theo `app.module.ts`: xoá import trước, xoá file sau |
| Tràn deadline (~12h ước tính vs 1 ngày) | **Cao** | Phase sắp theo giá trị giảm dần; **giữ eDIP v1 chạy được làm bản dự phòng, không đụng vào hôm nay** |

---

## 8. Tiêu chí nghiệm thu

- [ ] `docker compose up` → Postgres(pgvector) + Redis lên; `pnpm prisma migrate deploy` pass
- [ ] Đăng nhập 3 role; `viewer` bị API từ chối upload/search/ask/audit (không chỉ ẩn UI)
- [ ] Upload 1 PDF scan → status chuyển `uploaded → processing → completed`, có `documentType` + metadata + summary
- [ ] Truy vấn `hop dong` (không dấu) trả về tài liệu `hợp đồng`
- [ ] Ask trả lời kèm ít nhất 1 citation trỏ về document có thật
- [ ] `/graph` hiện ≥2 document nối qua entity chung; click node mở được detail
- [ ] Dashboard đếm đúng tổng / theo loại / theo status, có ít nhất 1 doc `failed`
- [ ] Audit log ghi upload/view/edit/delete/search/ask

---

## 9. Bước tiếp theo

1. **P0 ngay**: xác minh Bedrock model access (Claude vision + Cohere Embed Multilingual v3) + region.
2. Chạy `/ck:plan` với report này → sinh kế hoạch thi công phase P0–P6 kèm file/bước cụ thể.
3. Ngày 2 (nếu có): `FalkorGraphStore` adapter, S3 storage, char-offset highlight nâng cao, review queue theo confidence.

---

## 10. Câu hỏi chưa giải quyết

- Region Bedrock nào đang có quyền, và Cohere Embed Multilingual v3 có sẵn ở region đó không? (Nếu không → Titan Text Embeddings V2, vẫn 1024d, không phải đổi migration.)
- Có cần deploy lên đâu sau demo, hay chỉ chạy local? (Ảnh hưởng việc có cần Dockerfile production + CI hay không — hôm nay bỏ qua.)
- Corpus 9 doc của v1 có được phép copy nguyên sang v2 không (mẫu KYC chứa số đăng ký và thông tin người ký)?
