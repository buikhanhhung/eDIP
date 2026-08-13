# Hướng dẫn chạy chi tiết

README có bản rút gọn cho người đã quen. Trang này đi từng bước, **kèm cách tự kiểm sau mỗi bước** — để khi hỏng, bạn biết hỏng ở đâu thay vì phải đoán ngược từ triệu chứng cuối cùng.

- [1. Chuẩn bị máy](#1-chuẩn-bị-máy)
- [2. Hạ tầng](#2-hạ-tầng)
- [3. Cấu hình `.env`](#3-cấu-hình-env)
- [4. Cài và tạo dữ liệu](#4-cài-và-tạo-dữ-liệu)
- [5. Chạy](#5-chạy)
- [6. Google Drive](#6-google-drive)
- [7. Xử lý sự cố](#7-xử-lý-sự-cố)
- [8. Lệnh tham khảo](#8-lệnh-tham-khảo)

---

## 1. Chuẩn bị máy

| Thứ | Bản | Kiểm bằng |
|---|---|---|
| Node | 20 trở lên | `node -v` |
| pnpm | 9 trở lên | `pnpm -v` |
| Docker Desktop | đang chạy | `docker ps` |

Chưa có pnpm: `npm i -g pnpm`.

Cần **ít nhất 5 GB trống** trên ổ chứa Docker. Ba container và image của chúng chiếm khoảng 2 GB, `node_modules` của hai workspace thêm khoảng 1,5 GB.

---

## 2. Hạ tầng

```bash
docker compose -f docker-compose.dev.yml up -d
```

Dựng ba container. Cổng lệch khỏi mặc định để chạy song song với stack khác trên cùng máy:

| Dịch vụ | Container | Cổng máy | Dùng để |
|---|---|---|---|
| Postgres + pgvector | `edip-v2-postgres-dev` | `5434` | tài liệu, người dùng, nhật ký, vector |
| Redis | `edip-v2-redis-dev` | `6383` | hàng đợi BullMQ |
| FalkorDB | `edip-v2-falkordb-dev` | `6384` | toàn bộ đồ thị tri thức |

**Tự kiểm** — cả ba phải `healthy`, không phải chỉ `Up`:

```bash
docker compose -f docker-compose.dev.yml ps
```

Chờ khoảng 15 giây nếu còn `starting`. Sang bước sau khi còn `starting` thì `migrate deploy` sẽ báo không kết nối được.

---

## 3. Cấu hình `.env`

```bash
cd nestjs-backend
cp .env.example .env
```

`.env` nằm trong `.gitignore` và **không bao giờ được commit**. `.env.example` là bản mẫu duy nhất đi vào git.

### Bắt buộc

| Biến | Ghi chú |
|---|---|
| `DATABASE_URL` | mặc định trong file mẫu đã khớp docker-compose, thường không phải sửa |
| `JWT_SECRET` | tối thiểu 32 ký tự — `openssl rand -base64 32` |
| `SEED_ADMIN_PASSWORD` `SEED_USER_PASSWORD` `SEED_VIEWER_PASSWORD` | mật khẩu 3 tài khoản mẫu; băm lúc seed, không lưu dạng thô |

### Nhà cung cấp model — chọn **một**

```bash
AI_PROVIDER=gemini
GEMINI_API_KEY=...
```

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=...
```

```bash
AI_PROVIDER=bedrock
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Với Bedrock, **phải có cả hai khoá**. SDK truyền `credentials: undefined` nếu thiếu một trong hai, nghĩa là đăng nhập SSO/profile chạy được `aws sts get-caller-identity` vẫn **không đủ**.

Đổi nhà cung cấp về sau chỉ là đổi `AI_PROVIDER` rồi khởi động lại. Vector đã lưu vẫn dùng được vì cả ba đều phát đúng 1024 chiều.

> **Gemini free tier:** `gemini-2.5-flash` chỉ cho 5 lượt/phút mà một lần nạp tài liệu tốn ~6 lượt. Dùng model đó thì đặt `GEMINI_MIN_REQUEST_INTERVAL_MS=13000`. Các model `flash-lite` không cần.

**Tự kiểm:** chưa có gì để chạy ở bước này. Sai sót sẽ lộ ở bước 4 dưới dạng lỗi rõ ràng — schema `.env` được kiểm ngay lúc khởi động, nên API **không boot** nếu thiếu biến bắt buộc, thay vì chạy rồi hỏng giữa chừng.

---

## 4. Cài và tạo dữ liệu

```bash
pnpm install
pnpm prisma migrate deploy
pnpm prisma db seed
```

`db seed` **cần FalkorDB đang chạy** — thực thể của corpus mẫu được ghi thẳng vào đồ thị, không có bảng Postgres nào chứa chúng.

> Prisma 7 không tự đọc `.env` và không dùng `package.json#prisma.seed`. Cả hai được khai trong `prisma.config.ts`. Xoá file đó thì `migrate deploy` báo thiếu datasource URL và `db seed` im lặng không làm gì.

**Tự kiểm:**

```bash
docker exec edip-v2-postgres-dev psql -U edip -d edip -c "SELECT count(*) FROM \"Document\";"
```

Phải ra một số dương.

### Vector cho tìm kiếm ngữ nghĩa và hỏi đáp

```bash
pnpm backfill:embeddings
```

Bước này **cần khoá model** và là bước duy nhất cần. Bỏ qua thì:

- Dashboard, thư viện, trang chi tiết, highlight, đồ thị — **vẫn chạy đủ**
- Tìm kiếm — vẫn chạy, nhưng chỉ khớp từ khoá, không khớp ngữ nghĩa
- Hỏi AI — **luôn** trả lời không tìm thấy

Đó là thiếu bước, không phải hỏng.

**Tự kiểm:**

```bash
docker exec edip-v2-postgres-dev psql -U edip -d edip \
  -c "SELECT count(*) AS chunks, count(embedding) AS co_vector FROM embedding_chunks;"
```

Hai số phải bằng nhau. Lệch nhau nghĩa là backfill dừng giữa chừng — chạy lại, nó bỏ qua phần đã xong.

---

## 5. Chạy

Hai tiến trình, hai cửa sổ terminal:

```bash
# cửa sổ 1
cd nestjs-backend && pnpm start:dev      # http://localhost:3000

# cửa sổ 2
cd frontend && pnpm install && pnpm dev  # http://localhost:5173
```

**Tự kiểm:** mở `http://localhost:5173`, đăng nhập bằng `admin@ecloudvalley.demo` với mật khẩu đã đặt ở `SEED_ADMIN_PASSWORD`. Vào được Tổng quan và thấy số liệu là xong.

---

## 6. Google Drive

Phần này **tuỳ chọn**. Bỏ qua thì trang **Nguồn** báo connector chưa cấu hình — không phải lỗi.

### 6.1 Trên Google Cloud Console

1. Tạo project, hoặc chọn project có sẵn
2. **APIs & Services → Library** → bật **Google Drive API**
3. Cũng ở Library → bật **Google Picker API**
   *Bỏ sót bước này là ca hỏng khó đoán nhất: OAuth thành công, mà hộp chọn tệp không bao giờ hiện.*
4. **OAuth consent screen** → chọn External → thêm chính email của bạn vào **Test users**
   *Scope `drive.readonly` là scope hạn chế. App chưa qua thẩm định vẫn dùng được cho chủ sở hữu và test user — đây là giới hạn khi phát hành, không phải khi phát triển.*
5. **Credentials → Create credentials → OAuth client ID** → loại **Web application**
   Thêm vào **Authorized redirect URIs**, đúng từng ký tự kể cả cổng:
   ```
   http://localhost:3000/connectors/google/callback
   ```
6. **Credentials → Create credentials → API key** → sau khi tạo, bấm **Restrict key**:
   - Application restrictions → **HTTP referrers** → thêm `http://localhost:5173/*`
   - API restrictions → chỉ chọn **Google Picker API**

### 6.2 Trong `.env`

```bash
ENCRYPTION_KEY=          # openssl rand -hex 32  → đúng 64 ký tự hex
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_API_KEY=
GOOGLE_REDIRECT_URI=http://localhost:3000/connectors/google/callback
```

`ENCRYPTION_KEY` mã hoá refresh token khi lưu xuống database. Thiếu nó thì connector không bật — token sống lâu như vậy không được để dạng thô.

`GOOGLE_API_KEY` **công khai theo thiết kế**: nó được gửi tới trình duyệt, và thứ bảo vệ nó là giới hạn referrer chứ không phải sự bí mật. Client secret thì ngược lại, không bao giờ rời khỏi server.

### 6.3 Khởi động lại API

**Bắt buộc.** Cấu hình chỉ được đọc một lần lúc boot.

**Tự kiểm:** vào **Nguồn** → bấm **Kết nối** → chọn tài khoản Google → quay lại thấy `Đã kết nối` kèm **đúng địa chỉ email**. Nút **Chọn từ Drive** phải mở được hộp chọn tệp của Google.

---

## 7. Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Đặt biến trong `.env` rồi mà app vẫn báo chưa cấu hình | `.env` chỉ đọc lúc khởi động | Khởi động lại API. **Đây là ca phổ biến nhất.** |
| `EADDRINUSE :::3000` | còn tiến trình cũ giữ cổng | Windows: `Get-NetTCPConnection -LocalPort 3000 -State Listen` rồi `Stop-Process -Id <pid> -Force` |
| Bấm *Chọn từ Drive* không có gì xảy ra | thiếu `GOOGLE_API_KEY`, hoặc chưa bật Picker API | Kiểm `GET /connectors/google/picker-config` — trả `ready:false` là chưa đủ cấu hình |
| `Đã kết nối, tài khoản không rõ` | connector nối từ trước bản sửa | Mở lại trang Nguồn một lần; email được lấy và lưu ở lần xem tiếp theo |
| Google báo `redirect_uri_mismatch` | URI khai trên Console lệch | Phải khớp **từng ký tự** kể cả cổng và không có dấu `/` thừa cuối |
| Hỏi AI luôn trả lời không tìm thấy | chưa chạy `backfill:embeddings` | Chạy bước đó; kiểm bằng truy vấn đếm vector ở mục 4 |
| Hỏi AI trả lời được câu này nhưng không câu kia | gõ từ khoá trơ chứ không phải câu hỏi | `ecloudvalley` không phải câu hỏi. Hỏi `eCloudvalley là ai?`. Muốn tra từ khoá thì dùng trang **Tìm kiếm** |
| `db seed` chạy xong nhưng đồ thị rỗng | FalkorDB chưa sẵn sàng lúc seed | Đợi container `healthy` rồi seed lại |
| Docker treo, lệnh không phản hồi | hết dung lượng ổ đĩa | Dọn chỗ trống. `docker system prune -a` — **không kèm `--volumes`** nếu muốn giữ dữ liệu đã nạp |
| `pnpm lint` (backend) báo hàng chục lỗi định dạng | `.prettierrc` thiếu `printWidth`, mặc định 80 trong khi code viết ở 100 | Đừng chạy `--fix`: nó định dạng lại cả file bạn không đụng. Sửa gốc bằng cách thêm `"printWidth": 100` |

### Đọc log

Log của API in thẳng ra terminal đang chạy `start:dev`. Vài dòng đáng chú ý:

- `... lane failed during retrieval` — một nhánh tìm kiếm gãy, thường do khoá model
- `declined "..." after reading N chunk(s)` — model đọc tài liệu nhưng không trả lời được
- `could not record ...` — ghi nhật ký lỗi; **không** ảnh hưởng hành động vừa làm, đúng như thiết kế

---

## 8. Lệnh tham khảo

```bash
# backend — chạy trong nestjs-backend/
pnpm start:dev               # API, tự nạp lại khi sửa code
pnpm start                   # chạy một lần, không watch
pnpm test                    # 185 test / 22 tệp
pnpm build

pnpm prisma migrate deploy   # áp migration
pnpm prisma db seed          # nạp lại corpus mẫu (xoá và dựng lại đồ thị)
pnpm backfill:embeddings     # tạo lại vector cho tài liệu đã có
pnpm reset:corpus            # xoá sạch tài liệu
pnpm ingest:dir <thư-mục>    # nạp hàng loạt từ đĩa

# frontend — chạy trong frontend/
pnpm dev
pnpm build
pnpm lint

# hạ tầng
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.dev.yml down        # giữ dữ liệu
docker compose -f docker-compose.dev.yml down -v     # XOÁ luôn dữ liệu
```

Đổi cổng API: đặt `PORT` trong `.env`. Nhớ đổi cả `VITE_API_URL` trong `frontend/.env.local`, và cả redirect URI trên Google Console nếu đang dùng Drive.
