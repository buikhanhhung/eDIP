# eDIP v2 — Document Intelligence Platform

Thả tài liệu vào, hệ thống trích văn bản, phân loại, rút metadata, dựng đồ thị tri thức, và trả lời câu hỏi kèm trích dẫn về đúng tài liệu nguồn.

NestJS 11 + Prisma 7 + Postgres/pgvector + FalkorDB + BullMQ · React 18 + Vite + cytoscape.

## Yêu cầu

- Node 20+, pnpm, Docker Desktop
- **Một** khoá của một nhà cung cấp model: Gemini, OpenAI, hoặc AWS Bedrock

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

**Lưu ý về `backfill:embeddings`.** Sau `db seed` bạn đã có đủ dữ liệu cho dashboard, thư viện, trang chi tiết, highlight và đồ thị — **không cần khoá model nào**. Chỉ **tìm kiếm ngữ nghĩa** và **hỏi đáp** mới cần bước backfill này. Bỏ qua nó thì search vẫn chạy nhưng chỉ bằng từ khoá, và ask luôn trả "không tìm thấy" — đó là thiếu bước, không phải hỏng.

## Tài khoản mẫu

| Email | Quyền |
|---|---|
| `admin@ecloudvalley.demo` | tải lên, sửa metadata, xoá, xem nhật ký |
| `user@ecloudvalley.demo` | tìm kiếm, hỏi AI, tải xuống |
| `viewer@ecloudvalley.demo` | chỉ đọc |

Mật khẩu đọc từ `SEED_*_PASSWORD` trong `.env` — không ghi ở đây.

Không có chế độ khách: mọi route ngoài đăng nhập đều trả **403** khi thiếu token.

## Demo flow

1. Đăng nhập `admin` → **Tải lên** một tệp (`.md`, `.pdf`, `.docx`, ảnh scan) → badge chuyển `Đã tải lên → Đang xử lý → Hoàn tất`
2. Mở tài liệu → loại + độ tin cậy + metadata + tóm tắt, và **thực thể được bôi vàng đúng vị trí trong văn bản**
3. **Tìm kiếm** `hợp đồng với Saigon Retail`, rồi gõ lại không dấu `hop dong` → cùng ra tài liệu đúng
4. **Đồ thị** → bật "Hiện quan hệ" → click một nút công ty → drawer liệt kê tài liệu và các quan hệ kèm **câu văn làm bằng chứng**
   *Quan hệ có nhãn chỉ tồn tại cho tài liệu đã đi qua pipeline của hệ thống này — tức tệp bạn vừa tải ở bước 1. Dữ liệu mẫu từ `db seed` chỉ có cạnh "cùng được nhắc tới", không có nhãn.*
5. Tab **Hỏi AI**: `tóm tắt chính sách bảo mật` → câu trả lời kèm trích dẫn bấm được. Hỏi `giá cổ phiếu Apple hôm nay` → trả lời "Không tìm thấy thông tin này trong kho tài liệu", không bịa
6. **Tổng quan** + **Nhật ký** → số khớp dữ liệu, nhật ký ghi đủ hành động vừa làm

Kiểm tra phân quyền: đăng xuất → mở thẳng `/library` → bị đẩy về `/login`. Đăng nhập lại bằng `viewer` → nav mất Tải lên / Tìm kiếm / Nhật ký.

## Kiến trúc

```
Postgres   tài liệu, người dùng, nhật ký, và chunk + vector (pgvector 1024 chiều)
FalkorDB   toàn bộ đồ thị: thực thể, mention kèm offset, quan hệ có nhãn
Redis      hàng đợi BullMQ cho pipeline xử lý tài liệu
```

Đồ thị **không có bảng Postgres** — FalkorDB là nhà duy nhất của nó, và `:Document` trong đồ thị là bản chiếu của bảng `Document`. Không khoá ngoại nào xuyên hai kho, nên xoá tài liệu phải xoá node tường minh.

Ba năng lực model — embedding, vision, trích có cấu trúc — nằm sau ba interface. Đổi nhà cung cấp là đổi `AI_PROVIDER` rồi restart; vector đã lưu vẫn dùng được vì cả ba đều phát đúng 1024 chiều.

## Lệnh hay dùng

```bash
pnpm prisma db seed          # nạp lại corpus mẫu (xoá và dựng lại đồ thị)
pnpm backfill:embeddings     # tạo lại vector cho toàn bộ tài liệu đã có
pnpm test                    # 86 test
pnpm build
```

## Chưa làm

Adapter S3 · xử lý lại tài liệu lỗi từ giao diện · tải lên hàng loạt · xuất CSV · phát hiện trùng lặp · Dockerfile production và CI.

Tình trạng từng tính năng, kèm cách đo: [`docs/feature-status.md`](docs/feature-status.md).
