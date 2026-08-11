---
phase: 2
title: "Skeleton DB Auth Seed"
status: done
priority: P1
dependencies: [1]
effort: "3.5h"
---

# Phase 2: Skeleton DB Auth Seed

> **Sửa sau red-team.** Bản đầu ước 2h dựa trên giả định "copy `common/` của ECVBot là xong auth". Giả định đó sai — xem §3. Ước tính mới 3.5h. Ba lỗi Critical được vá ở phase này: `prisma.config.ts` thiếu, chuỗi auth không copy được, `embedding_chunks` DDL không khớp code.

## Overview

Dựng 2 repo, schema Postgres, auth + RBAC, và seed 9 tài liệu **kèm toàn bộ phân tích v1 đã có sẵn**. Kết thúc phase: đăng nhập 3 role, library có dữ liệu thật, dashboard có số thật **và đã phân loại theo type**.

Thay đổi lớn nhất so với bản đầu: seed nạp luôn `documentType`, `metadata`, `summary`, và **59 entity** từ `$V1/data/documents.json`. Bản đầu chỉ nạp `textContent` rồi để phase 5 gọi Claude sinh lại — vừa tốn 9 vòng gọi vừa khiến `/graph` rỗng nếu ngày kết thúc trước phase 5. Với ước tính thật (~10h), khả năng đó là cao.

## Requirements

- Functional: `POST /auth/login` trả JWT; guard chặn theo ma trận quyền; `GET /documents`, `GET /stats` trả dữ liệu thật.
- Functional: FE hiện `/login`, `/`, `/library` với dữ liệu từ API.
- Functional: sau seed, dashboard "theo loại" có số khác 0 và `Entity` có ≥30 row.
- Non-functional: `pnpm build` pass ở cả 2 repo.
- Non-functional: `viewer` bị chặn ở **API**, không chỉ ẩn UI. Thiếu token → **403**, không phải 401.

## Architecture

```
nestjs-backend/src/
  common/        dtos, pipes, filters, exceptions        ← copy ECVBot (CHỈ 4 thư mục này)
                 rbac/{permissions.ts, rbac.guard.ts}    ← port v1 + viết mới
  config/        env.config.ts                            ← copy, rút gọn
  shared/
    database/    prisma.service.ts                        ← copy ECVBot (portable, đã xác minh)
    logger/                                                ← copy ECVBot
  features/
    auth/        login, JwtStrategy, JwtAuthGuard         ← VIẾT MỚI (~45 phút)
    documents/   list, detail, stats
```

## Related Code Files

- Create: `$ROOT/nestjs-backend/**`, `$ROOT/frontend/**`
- Create: `$ROOT/nestjs-backend/prisma.config.ts`
- Create: `$ROOT/nestjs-backend/prisma/schema.prisma`
- Create: `$ROOT/nestjs-backend/prisma/migrations/migration_lock.toml`
- Create: `$ROOT/nestjs-backend/prisma/migrations/0000_init/migration.sql`
- Create: `$ROOT/nestjs-backend/prisma/seed.ts`
- Copy từ `$ECVBOT_BE`: `prisma.config.ts`, `src/common/{dtos,pipes,filters,exceptions}`, `src/shared/database/prisma.service.ts`, `src/shared/logger/`, `src/config/env.config.ts`, `tsconfig.json`, `biome.json`, `.gitignore`
- Port từ `$V1`: `src/lib/roles.ts`
- Đọc từ `$V1`: `data/documents.json`, `data/uploads/*.md`

### KHÔNG copy — danh sách loại trừ cứng

`src/common/{guards,services,repositories,port,constants/auth.constant.ts}`, `src/common/di-token.ts`, `src/common/interceptors/response.interceptor.ts`, toàn bộ `src/features/`, `src/engine/`, `src/restate/`, `src/infrastructure/{s3,falkordb,lambda}/`.

Lý do (§3 giải thích chi tiết): chuỗi phụ thuộc `AuthenticationGuard → ApiKeyGuard → AccessTokenGuard → TokenService → RefreshTokenRepository → prisma.refreshToken` không tồn tại trong schema này, và chính sách "gặp import chết thì xoá file" của bản đầu sẽ xoá sạch mọi thứ liên quan auth. `ResponseInterceptor` bọc mọi response trong envelope, trái với hình dạng API mà phase 3–6 mô tả.

## Implementation Steps

### 1. Scaffold + copy skeleton backend (~30 phút)

```bash
cd $ROOT && npx @nestjs/cli new nestjs-backend --package-manager pnpm --skip-git
```

Copy theo thứ tự, `pnpm build` sau **mỗi** nhóm:
1. `tsconfig.json` (giữ path alias `@common/*`, `@config/*`, `@features/*`, `@infrastructure/*`, `@shared/*`)
2. `biome.json`, `.gitignore` — **thêm ngay** `storage/`, `data/`, `.env` (`.gitignore` của ECVBot không có 2 mục đầu)
3. `src/common/{dtos,pipes,filters,exceptions}` — không hơn
4. `src/shared/database/prisma.service.ts`, `src/shared/logger/`
5. `src/config/env.config.ts` — rút gọn còn đúng biến trong `.env` phase 1

`app.module.ts` viết mới hoàn toàn:

```ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, envFilePath: ['.env'] }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
    SharedModule,      // Prisma + logger
    AuthModule,
    DocumentsModule,
  ],
  providers: [
    { provide: APP_PIPE,   useClass: CustomZodValidationPipe },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD,  useClass: ThrottlerGuard },
    // KHÔNG đăng ký AuthenticationGuard của ECVBot — xem §3
  ],
})
```

`ThrottlerModule` là món quà miễn phí từ ECVBot; bản đầu đánh rơi nó khi viết `app.module.ts` từ đầu. Giữ lại, nó chặn cả brute-force login lẫn spam `/ask` đốt quota Bedrock.

### 2. Prisma 7 — cấu hình trước, schema sau (~40 phút)

Cài: `prisma@7 @prisma/client@7 @prisma/adapter-pg pg`

**`prisma.config.ts` là bắt buộc, không phải tuỳ chọn.** Prisma 7 không tự nạp `.env`, và `db seed` đọc `migrations.seed` từ file này chứ không phải `package.json#prisma.seed`. Copy `$ECVBOT_BE/prisma.config.ts` và sửa đường dẫn:

```ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { seed: 'tsx prisma/seed.ts' },
  datasource: { url: process.env.DATABASE_URL! },
});
```

Trong `schema.prisma`, **pin generator**:
```prisma
generator client { provider = "prisma-client-js" }
```
Scaffold v7 mặc định dùng `prisma-client` với output `../generated/prisma`, import path không phải `@prisma/client` — mà `prisma.service.ts` copy về thì import `@prisma/client`. Không pin là gãy.

Migration viết tay cần `prisma/migrations/migration_lock.toml`:
```toml
provider = "postgresql"
```
Thiếu file này `migrate deploy` từ chối chạy.

Models — như bản đầu (`User`, `Document`, `Entity`, `DocumentEntity`, `AuditLog`), **cộng thêm 2 sửa**:

```prisma
model Entity {
  id             String @id @default(uuid())
  type           String
  normalizedName String
  displayName    String
  documents      DocumentEntity[]

  @@unique([type, normalizedName])   // KHÔNG unique riêng normalizedName
}
```
Unique chỉ trên `normalizedName` khiến entity đầu tiên chiếm luôn `type` vĩnh viễn (`upsert` dùng `update: {}` nên không bao giờ sửa) — `ecloudvalley vietnam` gặp lần đầu là `company` thì mãi là `company`, kể cả khi sau đó xuất hiện đúng như `project`.

Và model **phải khai** `embedding_chunks`, đừng để ngoài Prisma:

```prisma
model EmbeddingChunk {
  id               Int      @id @default(autoincrement())
  documentId       String   @map("document_id")
  content          String
  parentContent    String?  @map("parent_content")
  chunkingStrategy String?  @map("chunking_strategy")
  chunkIndex       Int?     @map("chunk_index")
  metadata         Json?
  embedding        Unsupported("vector(1024)")?
  createdAt        DateTime @default(now()) @map("created_at")

  @@map("embedding_chunks")
}
```

Bản đầu viết "Prisma chưa hỗ trợ type `vector`" — **sai**. `$ECVBOT_BE/prisma/schema/embedding-chunk.prisma` model nó bằng `Unsupported("vector(1024)")`. Để bảng ngoài Prisma nghĩa là lần `migrate dev` kế tiếp sẽ sinh `DROP TABLE embedding_chunks` và `DROP COLUMN search_tsv` như "sửa drift".

### 2b. Migration SQL — thứ tự quan trọng

Bản đầu viết generated column **trước** khi định nghĩa wrapper → `ERROR: generation expression is not immutable`. Thứ tự đúng:

```sql
-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Wrapper IMMUTABLE — PHẢI trước mọi generated column dùng nó
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text AS
$$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

-- 3. Bảng Prisma sinh ra ... (giữ nguyên)

-- 4. Cột FTS
ALTER TABLE "Document"
  ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      immutable_unaccent(
        coalesce(title,'') || ' ' ||
        coalesce("textContent",'') || ' ' ||
        coalesce(metadata::text,'')      -- gộp metadata vào đây, bỏ hẳn nhánh C của phase 4
      ))
  ) STORED;
CREATE INDEX document_search_tsv_idx ON "Document" USING GIN (search_tsv);

-- 5. embedding_chunks — KHỚP với code, không tự chế
CREATE TABLE embedding_chunks (
  id                SERIAL PRIMARY KEY,        -- KHÔNG phải TEXT: code không bao giờ truyền id
  document_id       TEXT NOT NULL REFERENCES "Document"(id) ON DELETE CASCADE,
  content           TEXT NOT NULL,
  parent_content    TEXT,
  chunking_strategy TEXT,                      -- insertBatch có ghi cột này
  chunk_index       INT,                       -- và cột này
  metadata          JSONB,
  embedding         vector(1024),              -- NULL được: phase 3 ghi chunk, phase 4 fill vector
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX embedding_chunks_document_id_idx ON embedding_chunks(document_id);
-- KHÔNG tạo ivfflat: corpus ~13 vector, lists=100 cho kết quả sai. Seq scan nhanh hơn.
```

Ba sửa chí mạng ở khối này, cả 4 reviewer đều chỉ ra: `SERIAL` thay `TEXT`, thêm `chunking_strategy`/`chunk_index`, bỏ `ivfflat`.

Bỏ `document_title_trgm_idx` — GIN trigram trên 9 row không bao giờ được planner chọn.

### 3. Auth + RBAC — viết mới, không port (~45 phút)

**Đây là thay đổi lớn nhất sau red-team.** Bản đầu định copy `AuthenticationGuard` của ECVBot. Không được, vì bốn lý do độc lập:

| Vấn đề | Hậu quả |
|---|---|
| `AuthenticationGuard` constructor-inject `ApiKeyGuard` (mà plan bảo xoá) | Crash lúc bootstrap |
| Mặc định `authTypes:[Bearer]` + `And` → thiếu header ném **401** | Trái tiêu chí 403 và "không token → viewer" |
| `AccessTokenGuard` cần `SHARED_TOKEN_SERVICE → TokenService → RefreshTokenRepository → prisma.refreshToken` + `CACHE_MANAGER` | Bảng không có, `CacheModule` không đăng ký |
| Nó từ chối mọi user có `user.status !== 'ACTIVE'`; `User` model **không có cột `status`** → `undefined !== 'ACTIVE'` → **mọi request đã đăng nhập đều 401** | **Pass `pnpm build`**, chỉ hiện lúc chạy — loại lỗi đắt nhất |

Viết mới, đơn giản, đủ dùng — **một** guard toàn cục làm cả hai việc:

```ts
// RbacGuard, theo đúng thứ tự này:
//   1. Giải mã Bearer nếu có; token sai/thiếu → user = null, KHÔNG ném ở bước này
//   2. @Public() → cho qua (chỉ /auth/login và /auth/me)
//   3. Không có @RequirePermission → ForbiddenException (fail closed)
//   4. user == null → ForbiddenException  ← app mở bằng trang đăng nhập
//   5. can(user.role, perm) ? true : ForbiddenException
```

Bước 4 là quyết định của người dùng ngày 11/08: **không có chế độ đọc vô danh**, app mở bằng trang đăng nhập và chưa đăng nhập thì không đọc được gì. Vẫn ném 403 chứ không 401, nên "bị chặn vì chưa đăng nhập" và "bị chặn vì thiếu quyền" là một với client đang dò API. Hệ quả: `viewer` phải là **tài khoản thật** (xem §4), không còn là trạng thái vô danh.

Không refresh token, không API key, không `status`. Ma trận port nguyên `$V1/src/lib/roles.ts` (file thuần, không phụ thuộc Next):

| | admin | user | viewer |
|---|:-:|:-:|:-:|
| view | ✅ | ✅ | ✅ |
| search / ask / download | ✅ | ✅ | ❌ |
| upload / edit-metadata / delete / audit | ✅ | ❌ | ❌ |

`bcrypt` cho password. Rate-limit login: `@Throttle({ default: { limit: 10, ttl: 900_000 } })` trên `POST /auth/login` — v1 có 10 lần/15 phút, đừng đánh rơi. Sai email và sai mật khẩu phải đi **cùng code path** (luôn chạy `bcrypt.compare` với hash giả khi không tìm thấy user), không chỉ trả cùng thông báo.

**Mọi route đều phải có `@RequirePermission(...)`** — kể cả `/graph` và `/stats`. Route quên decorator bị guard từ chối thẳng (bước 3), nên quên là hỏng lúc chạy chứ không lặng lẽ mở cửa. Corpus có mẫu KYC; `GET /graph?minShared=1` không kiểm quyền sẽ trả toàn bộ tên người và công ty.

### 4. Seed — nạp cả phân tích của v1 (~35 phút)

`$V1/data/documents.json` có 9 record, mỗi record:
```
{ text, fileName, storedPath, uploadedAt, status, textSource,
  analysis: { type, typeConfidence, metadata{title,parties,documentDate,amount,currency,keywords,language},
              summary, tags, entities:[{kind,value,confidence}] } }
```

Bảng ánh xạ tên trường (khác nhau hết, đừng đoán):

| v1 | v2 |
|---|---|
| `text` | `textContent` |
| `fileName` | `filename` |
| `storedPath` | `storagePath` |
| `analysis.type` | `documentType` |
| `analysis.typeConfidence` | `typeConfidence` |
| `analysis.metadata.documentDate` | `metadata.date` |
| `analysis.metadata.currency` + `amount` | `metadata.amount` (ghép chuỗi) |
| `analysis.summary` | `summary` |
| `analysis.entities[].kind` | `Entity.type` |
| `analysis.entities[].value` | `Entity.displayName` |

Việc cần làm:
1. **3 user, mỗi role một tài khoản**, password đọc từ `SEED_ADMIN_PASSWORD` / `SEED_USER_PASSWORD` / `SEED_VIEWER_PASSWORD` — không hardcode. Tài khoản `viewer` là bắt buộc: sau quyết định "mọi thứ sau đăng nhập", role chỉ-đọc không còn tồn tại dưới dạng khách vô danh nên phải đăng nhập được mới demo được
2. 9 Document với **đầy đủ** `textContent`, `documentType`, `typeConfidence`, `metadata`, `summary`, `textSource`
3. Giữ 1 document `status='failed'` + `error` để dashboard có ô đỏ
4. **Upsert 59 entity** qua `normalizeEntityName()` (hàm ở phase 5 — viết nó ở đây luôn, phase 5 dùng lại)
5. Tính `charStart`/`charEnd` bằng `textContent.indexOf(entity.value)` — entity v1 không có offset, nhưng `value` là verbatim nên `indexOf` ra đúng. Đây là thứ làm highlight ở phase 6 chạy được **mà không cần Bedrock**
6. Copy file gốc sang `$ROOT/nestjs-backend/storage/`

Kind `department` xuất hiện 6 lần trong corpus. Thêm nó vào enum entity type, đừng để rơi.

Sau bước này: dashboard "theo loại" có số, `/graph` có dữ liệu, highlight có offset — **tất cả trước khi chạm tới Bedrock**. Đó chính là lưới an toàn mà phase 7 tuyên bố có.

### 5. Frontend skeleton (~50 phút)

```bash
cd $ROOT && pnpm create vite frontend --template react-ts
```

**Không copy `vite.config.ts` của ECVBot.** Nó import `vite-plugin-svgr`, khai block `test` cần `happy-dom` + `./src/test-setup.ts`, pin `port: 5500` và `allowedHosts: ["bot.vibe","ps","bot.kb2a.vn"]`. Viết mới 12 dòng.

**Tailwind 3.4** (không phải 4) — mặc định của scaffold hôm nay nhắm Tailwind 4, lệch một bậc major là một buổi debug config. `react-router-dom@6`, `class-variance-authority`, `tailwind-merge`, `tailwindcss-animate`.

**Đã làm khác kế hoạch (11/08):** scaffold ra React 19 + Vite 8 chứ không phải React 18, và **không copy `ui/` của ECVBot**. Bản pin React 18 chỉ tồn tại để component copy sang chạy được; khi đã tự viết 5 component (button, card, input+select, badge, table) bằng `cva` + `tailwind-merge` thuần thì ràng buộc đó biến mất — không có Radix nào trong 5 file này. Select/dialog/dropdown viết khi phase sau thực sự cần. `lib/api-client.ts` cũng viết mới (~30 dòng) thay vì copy `axios.ts` 86 dòng: chỉ cần `baseURL` + gắn Bearer, và **cố ý không có interceptor điều hướng khi 401/403** — điều hướng nằm ở `ProtectedRoute`, vốn biết có phiên hay không; interceptor tự chuyển trang sẽ biến một lời gọi bị từ chối thành vòng lặp redirect.

3 route: `/login`, `/` (dashboard 3 khối số + phân bổ theo loại), `/library` (TanStack Table, filter trong URL search params). `/` và `/library` bọc trong `ProtectedRoute` — chưa đăng nhập thì đẩy về `/login` kèm `state.from` để quay lại đúng chỗ.

## Success Criteria

- [x] `pnpm build` pass ở cả 2 repo
- [x] `pnpm prisma migrate deploy` pass ngay lần đầu (chứng minh `prisma.config.ts` + `migration_lock.toml` đúng)
- [x] `\d embedding_chunks` → `id` là `integer NOT NULL DEFAULT nextval(...)`, có `chunking_strategy` và `chunk_index`, `embedding` là `vector(1024)`
- [x] `SELECT immutable_unaccent('hợp đồng')` → `hop dong`
- [x] `pnpm prisma db seed` → 3 user, 10 document (1 `failed`), **33 row `Entity`**
- [x] `SELECT count(*) FROM "Document" WHERE "documentType" IS NOT NULL` = 9
- [x] `SELECT count(*) FROM "DocumentEntity" WHERE "charStart" IS NOT NULL` > 0 → 55/59
- [x] `POST /auth/login` cả 3 role → JWT; sai mật khẩu và sai email → cùng thông báo, cùng độ trễ
- [x] Đăng nhập sai lần thứ 11 trong 15 phút → **429**
- [x] Mọi route không token → **403** (không phải 401) — kiểm trên `/documents`, `/stats`; `/audit` và `/graph` khi phase 5–6 thêm route
- [x] FE: đăng nhập được, `/library` 10 dòng, `/` hiện số theo loại khác 0, `?type=contract` → 3 dòng
- [ ] `git status` — `.env`, `storage/`, `data/` đều không xuất hiện → **chưa kiểm được: repo chưa `git init`**

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| Copy `common/` vẫn kéo import chết | Danh sách loại trừ ở trên là cứng. Chỉ 4 thư mục được copy. Gặp import chết trong 4 thư mục đó → xoá file, an toàn |
| Prisma 7 generator/config còn sai chỗ khác | Đối chiếu trực tiếp `$ECVBOT_BE/prisma.config.ts` và `prisma/schema/base.prisma` — cùng version, đã chạy thật |
| Generated column vẫn báo không IMMUTABLE | Thứ tự SQL đã sửa. Vẫn kẹt → bỏ generated column, thêm cột `search_text TEXT` thường do app ghi bằng chính `normalizeEntityName()` |
| Seed mapping sai tên trường | Bảng ánh xạ ở §4. In thử 1 record trước khi chạy vòng lặp |
| Tailwind 3 vs 4 khi copy `ui/` | Pin version ở §5. Sai bậc major thì viết lại 8 component bằng tay còn nhanh hơn debug |
| Phase này tràn 3.5h | Cắt theo thứ tự: FE `/library` filter → dashboard chart → chỉ giữ bảng thô. Backend phải xong đủ |
