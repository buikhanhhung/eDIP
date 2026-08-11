---
phase: 1
title: "Bedrock & Docker Gate"
status: done
priority: P1
dependencies: []
effort: "0.75h"
---

# Phase 1: Bedrock & Docker Gate

## Overview

Cổng chặn. Xác minh **Bedrock model access** và **Docker infra** chạy được trước khi gõ dòng code nghiệp vụ nào. Hỏng ở đây thì cả kế hoạch đổi hướng — biết trong 30 phút tốt hơn biết ở giờ thứ 6.

## Requirements

- Functional: gọi được `InvokeModel` cho Claude (text + vision) và cho embedding model, trả về kết quả hợp lệ.
- Functional: `docker compose up -d` dựng được Postgres có extension `vector`, `unaccent`, `pg_trgm` và Redis.
- Non-functional: toàn phase ≤ 30 phút. Quá thì kích hoạt fallback ngay.

## Architecture

Hai nhánh độc lập, chạy song song:

```
Nhánh A (AI)     : aws sts get-caller-identity → bedrock list-foundation-models → InvokeModel x3
Nhánh B (Infra)  : docker compose up → psql CREATE EXTENSION → redis-cli PING
```

Nhánh A hỏng → fallback sang rule-based provider của v1 (xem Risk).
Nhánh B hỏng → không có đường vòng, phải sửa.

## Related Code Files

- Create: `$ROOT/docker-compose.dev.yml`
- Create: `$ROOT/scripts/verify-bedrock.mjs` (script dùng 1 lần, có thể xoá sau)
- Reference (chỉ đọc): `$ECVBOT_BE/docker-compose.dev.yml`, `$ECVBOT_BE/src/infrastructure/bedrock/bedrock-embedding.service.ts`

## Implementation Steps

### 1. Kiểm tra danh tính và quyền AWS

```bash
aws sts get-caller-identity
aws bedrock list-foundation-models --region <region> \
  --query "modelSummaries[?contains(modelId,'claude') || contains(modelId,'embed')].modelId" \
  --output table
```

Ghi lại: `AWS_REGION`, model id Claude, model id embedding.

Ứng viên embedding theo thứ tự ưu tiên:
1. `cohere.embed-multilingual-v3` — 1024d, tiếng Việt tốt nhất
2. `amazon.titan-embed-text-v2:0` — 1024d (cấu hình được 256/512/1024)

**Cả hai đều 1024d** → chọn cái nào cũng không phải đổi migration.

### 2. Gọi thử 3 lời gọi quyết định

Viết `$ROOT/scripts/verify-bedrock.mjs` dùng `@aws-sdk/client-bedrock-runtime`:

| Test | Input | Pass khi |
|---|---|---|
| T1 text | Claude, prompt "Trả về JSON {\"ok\":true}" | parse được JSON |
| T2 vision | Claude + 1 ảnh scan có chữ Việt (base64) | trả về đúng chữ trong ảnh |
| T3 embed | embedding model, 2 câu tiếng Việt | trả về 2 vector **length === 1024** |

Fixture cho T2: `$V1/seed/fixtures/vietnamese-scan.jpg` (hoặc `scanned-contract.pdf`). **Không** dùng `$V1/data/uploads/` — thư mục đó chỉ chứa 9 file `.md`, không có ảnh.

**Assert `length === 1024` ở T3 là bắt buộc.** Sai dimension mà phát hiện ở phase 4 thì phải migrate lại.

**T3 phải gọi qua service thật, không phải body tự viết tay.** Đây là bẫy đã bắt được ở review: `BedrockEmbeddingService` truyền `credentials: undefined` trừ khi có **cả hai** `AWS_ACCESS_KEY_ID` và `AWS_SECRET_ACCESS_KEY` trong env. `aws sts get-caller-identity` ở bước 1 thường xanh nhờ SSO/profile cache mà tiến trình Node **không** đọc được → gate xanh lúc 00:30, `CredentialsProviderError` ở giờ thứ 5. Cách chặn: copy `$ECVBOT_BE/src/infrastructure/bedrock/bedrock-embedding.service.ts` vào `scripts/`, gọi trực tiếp nó trong T3, chỉ nạp env từ `.env`.

Lưu ý về Cohere v3: `invokeCohereBatch` luôn gửi `output_dimension: 1024`. Comment trong chính file đó nói tham số này được **embed-v4** tôn trọng và chỉ *giả định* là vô hại trên v3 (mặc định của ECVBot là `global.cohere.embed-v4:0`, nên nhánh v3 chưa từng chạy thật). Vì T3 gọi service thật nên nó sẽ bắt được nếu v3 trả về dimension khác.

### 3. Dựng infra

`$ROOT/docker-compose.dev.yml`:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: edip
      POSTGRES_PASSWORD: edip_dev
      POSTGRES_DB: edip
    ports: ['5434:5432']
    volumes: [pgdata:/var/lib/postgresql/data]
  redis:
    image: redis:7-alpine
    ports: ['6383:6379']
    volumes: [redisdata:/data]
volumes:
  pgdata:
  redisdata:
```

Port `5434`/`6383` chọn lệch khỏi ECVBot dev (`5433`/`6381`) để chạy song song không đụng.

Không dùng `paradedb/paradedb` như ECVBot: nó kèm `pg_search` (BM25) mà plan này không cần — FTS + `unaccent` + `pg_trgm` có sẵn trong Postgres chuẩn là đủ.

### 4. Xác minh extension

```bash
docker compose -f docker-compose.dev.yml up -d
docker compose exec postgres psql -U edip -d edip -c \
  "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS unaccent; CREATE EXTENSION IF NOT EXISTS pg_trgm; SELECT extname FROM pg_extension;"
docker compose exec redis redis-cli PING
```

### 5. Ghi `.env` gốc

Tạo `$ROOT/nestjs-backend/.env` (và `.env.example` không có giá trị thật):

```
DATABASE_URL=postgresql://edip:edip_dev@localhost:5434/edip
REDIS_HOST=localhost
REDIS_PORT=6383
AWS_REGION=<region đã xác minh>
AWS_ACCESS_KEY_ID=<bắt buộc — SDK bỏ qua profile/SSO nếu thiếu>
AWS_SECRET_ACCESS_KEY=<bắt buộc>
BEDROCK_LLM_MODEL_ID=<model id Claude>
BEDROCK_EMBEDDING_MODEL_ID=<model id embedding>
JWT_SECRET=<openssl rand -base64 32>
STORAGE_DIR=./storage
SEED_ADMIN_PASSWORD=<đặt tuỳ ý>
SEED_USER_PASSWORD=<đặt tuỳ ý>
```

Hai khoá AWS là **bắt buộc**, không phải tuỳ chọn — xem ghi chú ở bước 2. Nếu tổ chức cấm khoá tĩnh, thay bằng `AWS_PROFILE` **và** sửa `bedrock-embedding.service.ts` để dùng `fromIni()`; đừng để `credentials: undefined` rồi hy vọng.

`.env` **không** commit. `.gitignore` phải có `.env`, `storage/`, `data/` ngay từ đầu — không đợi phase 7.

## Success Criteria

- [ ] `aws sts get-caller-identity` trả về identity hợp lệ
- [ ] T1 Claude text → parse được JSON
- [ ] T2 Claude vision → đọc đúng chữ trong `$V1/seed/fixtures/vietnamese-scan.jpg`
- [ ] T3 chạy **qua `BedrockEmbeddingService` thật** (không phải body tự viết) → 2 vector, mỗi vector **length === 1024**
- [ ] T3 vẫn pass khi chỉ nạp biến từ `.env` (chứng minh không phụ thuộc profile/SSO cache)
- [ ] `SELECT extname FROM pg_extension` có `vector`, `unaccent`, `pg_trgm`
- [ ] `redis-cli PING` → `PONG`
- [ ] `.env` đủ biến (gồm 2 khoá AWS); `.gitignore` đã chặn `.env`, `storage/`, `data/`

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| **Model access chưa bật** (`AccessDeniedException`) | Bedrock console → Model access → request. Không tự bật được thì **fallback ngay** — xem khối "Fallback đã định nghĩa" dưới. |
| Region không có Cohere | Chuyển Titan v2, vẫn 1024d, không đổi gì khác |
| Port 5434/6383 đã bị chiếm | Đổi port trong compose + `.env`, không đổi gì khác |
| Docker Desktop chưa chạy | Khởi động trước, đây là điều kiện tiên quyết |

**Timebox cứng: 30 phút.** Quá 30 phút mà nhánh A chưa xanh → kích hoạt fallback và đi tiếp phase 2. Không ngồi debug IAM cả buổi sáng.

## Fallback đã định nghĩa (không chỉ đặt tên)

Review bắt được rằng bản trước chỉ *nêu tên* fallback mà không định phạm vi. Đây là phạm vi thật:

| Thành phần | Nguồn | Ghi chú |
|---|---|---|
| Classify + extract metadata | `$V1/src/lib/ai/heuristics.ts` + rule-based provider trong `$V1/src/lib/ai/` | Deterministic, chạy offline |
| OCR ảnh / PDF scan | `$V1/src/lib/extraction/ocr.ts` (tesseract.js) + `pdf-raster.ts` + `pdfjs-init.ts` | **Bổ sung vào danh sách port của phase 3** |
| Embedding | `fastembed` hoặc `transformers.js` ONNX, 384d | Đổi migration sang `vector(384)` |
| `/ask` | **Không có bản v1 tương đương.** Trả lời bằng trích đoạn top-k + template, không sinh văn bản | Nói thẳng khi demo: đây là retrieval, không phải generation |

**Bẫy thứ tự — đọc kỹ.** Quyết định 384d phải xảy ra **trước** khi phase 2 chạy `migrate deploy`. Nếu quyền Bedrock được cấp lúc 14:00, dimension đã nằm trong migration init đã apply cùng `search_tsv`; sửa file migration đã apply làm `migrate deploy` fail checksum.

Đường lùi duy nhất, ghi ra đây để khỏi phải nghĩ lúc hoảng:
```bash
docker compose -f docker-compose.dev.yml down -v
# sửa vector(384) → vector(1024) trong migration init
pnpm prisma migrate deploy && pnpm prisma db seed
pnpm tsx scripts/backfill-embeddings.ts
```
Mất ~10 phút. Chấp nhận được, nhưng chỉ khi biết trước.
