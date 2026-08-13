# eDIP v2 — Document Intelligence Platform

Thả tài liệu vào, hệ thống trích văn bản, phân loại, rút metadata, dựng đồ thị tri thức, và trả lời câu hỏi kèm trích dẫn về đúng tài liệu nguồn.

NestJS 11 + Prisma 7 + Postgres/pgvector + FalkorDB + BullMQ · React 18 + Vite + cytoscape.

## Yêu cầu

- Node 20+, pnpm, Docker Desktop
- **Một** khoá của một nhà cung cấp model: Gemini, OpenAI, hoặc AWS Bedrock
- *(tuỳ chọn)* Một project Google Cloud, nếu muốn nạp tài liệu thẳng từ Google Drive

## Dựng lại từ 0

```bash
# 1. Hạ tầng: Postgres+pgvector, Redis, FalkorDB
docker compose -f docker-compose.dev.yml up -d

# 2. Cấu hình
cd nestjs-backend
cp .env.example .env
#    Sửa .env: JWT_SECRET, 3 mật khẩu SEED_*, và MỘT nhà cung cấp model:
#      AI_PROVIDER=gemini   + GEMINI_API_KEY=...
#      AI_PROVIDER=openai   + OPENAI_API_KEY=...
#      AI_PROVIDER=bedrock  + AWS_ACCESS_KEY_ID=... + AWS_SECRET_ACCESS_KEY=...

# 3. Cài, tạo bảng, nạp dữ liệu mẫu
pnpm install
pnpm prisma migrate deploy
pnpm prisma db seed          # cần FalkorDB đang chạy — entity nằm trong đó
pnpm backfill:embeddings     # cần khoá model — xem lưu ý dưới

# 4. Chạy
pnpm start:dev               # API   http://localhost:3000
cd ../frontend && pnpm install && pnpm dev    # Web http://localhost:5173
```

Cổng: Postgres `5434`, Redis `6383`, FalkorDB `6384` — lệch khỏi cổng mặc định để chạy song song với stack khác trên cùng máy.

**Lưu ý về `backfill:embeddings`.** Sau `db seed` bạn đã có đủ dữ liệu cho dashboard, thư viện, trang chi tiết, highlight và đồ thị — **không cần khoá model nào**. Chỉ **tìm kiếm ngữ nghĩa** và **hỏi đáp** mới cần bước backfill này. Bỏ qua nó thì search vẫn chạy nhưng chỉ bằng từ khoá, và ask luôn trả "không tìm thấy" — đó là thiếu bước, không phải hỏng.

Hướng dẫn từng bước, cách tự kiểm sau mỗi bước, và bảng xử lý sự cố: [`docs/setup.md`](docs/setup.md).

## Nối Google Drive (tuỳ chọn)

Bỏ qua phần này thì mọi thứ khác vẫn chạy — trang **Nguồn** sẽ báo connector chưa cấu hình thay vì lỗi.

Cần 4 biến trong `.env`, lấy từ Google Cloud Console:

| Biến | Lấy ở đâu |
|---|---|
| `ENCRYPTION_KEY` | tự sinh: `openssl rand -hex 32` — mã hoá refresh token khi lưu |
| `GOOGLE_CLIENT_ID` `GOOGLE_CLIENT_SECRET` | OAuth client ID, loại **Web application** |
| `GOOGLE_API_KEY` | API key, sau khi bật **Google Picker API** |

Redirect URI phải khai đúng từng ký tự kể cả cổng: `http://localhost:3000/connectors/google/callback`

Thiếu `GOOGLE_API_KEY` thì hộp chọn tệp của Google **không mở**, còn thiếu `ENCRYPTION_KEY` thì connector không bật. Chi tiết từng bước trong [`docs/setup.md`](docs/setup.md#6-google-drive).

## Tài khoản mẫu

| Email | Quyền |
|---|---|
| `admin@ecloudvalley.demo` | tải lên, sửa metadata, xoá, xem nhật ký |
| `user@ecloudvalley.demo` | tìm kiếm, hỏi AI, tải xuống |
| `viewer@ecloudvalley.demo` | chỉ đọc |

Mật khẩu đọc từ `SEED_*_PASSWORD` trong `.env` — không ghi ở đây.

Không có chế độ khách: mọi route ngoài đăng nhập đều trả **403** khi thiếu token.

## Demo flow

1. Đăng nhập `admin` → **Tải lên** một tệp (`.md`, `.pdf`, `.docx`, ảnh scan) → badge chuyển `Đã tải lên → Đang xử lý → Hoàn tất`, và bảng **Tải lên gần đây** ngay dưới tự cập nhật
2. Mở tài liệu → loại + độ tin cậy + metadata + tóm tắt, và **thực thể được bôi vàng đúng vị trí trong văn bản**
3. **Tìm kiếm** `hợp đồng với Saigon Retail`, rồi gõ lại không dấu `hop dong` → cùng ra tài liệu đúng
4. **Đồ thị** → bật "Hiện quan hệ" → click một nút công ty → drawer liệt kê tài liệu và các quan hệ kèm **câu văn làm bằng chứng**
   *Quan hệ có nhãn chỉ tồn tại cho tài liệu đã đi qua pipeline của hệ thống này — tức tệp bạn vừa tải ở bước 1. Dữ liệu mẫu từ `db seed` chỉ có cạnh "cùng được nhắc tới", không có nhãn.*
5. Tab **Hỏi AI**: `tóm tắt chính sách bảo mật` → câu trả lời kèm trích dẫn bấm được. Hỏi `giá cổ phiếu Apple hôm nay` → hệ thống nói thẳng là không trả lời được **và liệt kê những tài liệu nó đã đọc**, không bịa
6. *(nếu đã nối Drive)* **Nguồn** → *Chọn từ Drive* → chọn cả thư mục → tệp chảy về thư viện dần trong vài phút
7. **Tổng quan** + **Nhật ký** → số khớp dữ liệu; nhật ký lọc được theo ngày, loại, hành động, người dùng

Kiểm tra phân quyền: đăng xuất → mở thẳng `/library` → bị đẩy về `/login`. Đăng nhập lại bằng `viewer` → nav mất Tải lên / Tìm kiếm / Nhật ký.

## Kiến trúc

```
Postgres   tài liệu, người dùng, nhật ký, và chunk + vector (pgvector 1024 chiều)
FalkorDB   toàn bộ đồ thị: thực thể, mention kèm offset, quan hệ có nhãn
Redis      hai hàng đợi BullMQ: xử lý tài liệu, và kéo tệp từ Drive
```

Đồ thị **không có bảng Postgres** — FalkorDB là nhà duy nhất của nó, và `:Document` trong đồ thị là bản chiếu của bảng `Document`. Không khoá ngoại nào xuyên hai kho, nên xoá tài liệu phải xoá node tường minh.

Ba năng lực model — embedding, vision, trích có cấu trúc — nằm sau ba interface. Đổi nhà cung cấp là đổi `AI_PROVIDER` rồi restart; vector đã lưu vẫn dùng được vì cả ba đều phát đúng 1024 chiều.

Nạp từ Drive đi qua **đúng một đường** với tải lên từ trình duyệt: mỗi tệp thành một job, kết thúc ở cùng `ingestion.upload`, nên vẫn qua allowlist, kiểm trùng và hàng đợi xử lý — không có bản cài đặt thứ hai của bất kỳ bước nào.

## Lệnh hay dùng

```bash
# backend
pnpm start:dev               # API, tự nạp lại khi sửa code
pnpm prisma db seed          # nạp lại corpus mẫu (xoá và dựng lại đồ thị)
pnpm backfill:embeddings     # tạo lại vector cho toàn bộ tài liệu đã có
pnpm test                    # 185 test / 22 tệp
pnpm build

# frontend
pnpm dev                     # Vite dev server
pnpm build                   # tsc -b && vite build
pnpm lint                    # oxlint
```

`.env` **không** được nạp lại khi đang chạy. Sửa xong phải khởi động lại API — thiếu bước này là nguồn gốc của phần lớn ca "đã đặt biến rồi mà vẫn báo chưa cấu hình".

## Chưa làm

Adapter S3 · xử lý lại tài liệu lỗi từ giao diện · Dockerfile production và CI · bộ nhớ hội thoại cho Hỏi AI (mỗi câu hỏi hiện được trả lời độc lập).

Tình trạng từng tính năng, kèm cách đo: [`docs/feature-status.md`](docs/feature-status.md).
