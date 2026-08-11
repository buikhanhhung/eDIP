---
phase: 7
title: "Polish & Demo Rehearsal"
status: pending
priority: P3
dependencies: [6]
effort: "còn lại"
---

# Phase 7: Polish & Demo Rehearsal

## Overview

Chạy thử trọn demo flow 6 bước, vá chỗ vấp, viết README đủ để người khác dựng lại. Phase này **không thêm tính năng** — chỉ làm cho thứ đã có không gãy trước mặt người xem.

Nếu hết giờ trước khi tới đây: chạy **mục 1 (rehearsal)** thôi cũng đủ. Nó rẻ nhất và bắt được nhiều lỗi nhất.

## Requirements

- Functional: chạy hết 6 bước demo flow trong đề, từ máy sạch, không vấp.
- Functional: mọi trang có empty state và error state, không màn hình trắng.
- Non-functional: README dựng lại được từ 0 trong <10 phút.

## Architecture

Không có thay đổi kiến trúc. Chỉ vá.

## Related Code Files

- Create: `$ROOT/README.md`
- Create: `$ROOT/docs/feature-status.md` (theo mẫu `$V1/docs/feature-status.md` — trung thực, ghi cả ⚠️ và ❌)
- Modify: các file FE có empty/error state thiếu
- Modify: `$ROOT/nestjs-backend/.env.example`

## Implementation Steps

### 1. Rehearsal — chạy trọn demo flow (~20 phút)

Theo đúng 6 bước trong đề, **bấm thật, không đọc code**:

| Bước | Thao tác | Phải thấy |
|---|---|---|
| 1 | Admin đăng nhập, upload 3–5 file (1 PDF text, 1 ảnh scan, 1 docx) | badge chuyển `uploaded → processing → completed` |
| 2 | Mở detail từng file | documentType + metadata + summary + confidence |
| 3 | Search theo metadata (`hợp đồng với Saigon Retail`) và **không dấu** (`hop dong`) | cùng ra kết quả đúng |
| 4 | Mở `/graph`, click node company | drawer liệt kê đúng document; "Focus neighbourhood" chạy |
| 5 | Tab Ask: `tóm tắt chính sách bảo mật` | answer + citation bấm được, nhảy đúng document |
| 6 | Dashboard + `/audit` | số khớp DB; audit có đủ hành động vừa làm |

Thêm bước quyền (đã sửa sau quyết định "mọi thứ sau đăng nhập" — không còn khách vô danh để duyệt):
- Đăng xuất → mở thẳng `/library` → bị đẩy về `/login`, không thấy dữ liệu nào.
- Đăng nhập lại bằng `viewer` → nav mất Upload/Search/Audit, `/library` và dashboard vẫn xem được.
- `curl` `POST /search` không token → **403**; cùng lời gọi bằng token `viewer` → cũng **403** (chặn ở API, không chỉ ẩn UI).

Ghi lại **mọi** chỗ vấp. Vá theo thứ tự: crash → sai dữ liệu → xấu.

### 2. Empty & error state (~15 phút)

| Trang | Empty | Error |
|---|---|---|
| `/library` | "Chưa có tài liệu nào. Upload để bắt đầu." + nút | banner + nút thử lại |
| `/search` | "Chưa có truy vấn" / "Không tìm thấy kết quả cho `x`" | banner |
| `/graph` | "Chưa đủ dữ liệu để dựng graph. Cần ≥2 tài liệu chia sẻ entity chung." + gợi ý hạ `minShared` | banner |
| `/audit` | "Chưa có hoạt động nào" | banner |
| detail | document `failed` → hiện `error` + nút reprocess (nếu kịp) | 404 rõ ràng |

Màn hình trắng khi API lỗi là lỗi tệ nhất lúc demo. TanStack Query `isError` phải được xử lý ở mọi trang.

### 3. README (~15 phút)

`$ROOT/README.md`:
- Yêu cầu: Node 20+, pnpm, Docker Desktop, AWS credentials có Bedrock model access
- Dựng: `docker compose -f docker-compose.dev.yml up -d` → `.env` (gồm **2 khoá AWS**) → `pnpm prisma migrate deploy` → `pnpm prisma db seed` → `pnpm tsx scripts/backfill-embeddings.ts` → `pnpm start:dev` → `cd frontend && pnpm dev`
- Ghi rõ: `db seed` cho đủ dữ liệu để dùng dashboard / library / detail / graph; **chỉ** search và ask cần bước backfill. Người đọc README bỏ qua backfill sẽ thấy search rỗng — nói trước để họ không tưởng là hỏng
- Bảng tài khoản demo (email + role; **mật khẩu đọc từ env, không viết vào README**)
- Demo flow 6 bước để người khác tự chạy
- Mục "Chưa làm": FalkorDB adapter, S3, reprocess, batch upload, export CSV, duplicate detection

### 4. `docs/feature-status.md` (~10 phút)

Theo mẫu `$V1/docs/feature-status.md`: mỗi tính năng ghi **đã đo bằng cách nào**. Đánh dấu trung thực ✅ / ⚠️ / ❌.

Đây là tài liệu mentor đọc để biết cái gì thật cái gì không. Ghi ⚠️ ở chỗ yếu tốt hơn để người ta tự phát hiện lúc demo.

### 5. Vệ sinh trước khi giao (~10 phút)

- [ ] `.env` **không** trong git; `.env.example` không có giá trị thật
- [ ] `storage/` và file upload không commit
- [ ] Không có mật khẩu/khoá AWS trong code, log, seed, README
- [ ] Xoá `scripts/verify-bedrock.mjs` hoặc chuyển vào `scripts/` có ghi chú là script dùng 1 lần
- [ ] `pnpm build` pass ở cả 2 repo
- [ ] `$V1` **không bị sửa** — `git status` trong `$V1` phải sạch

## Success Criteria

- [ ] Chạy trọn 6 bước demo flow không vấp, từ trạng thái `docker compose down -v` rồi dựng lại
- [ ] Không trang nào màn hình trắng khi API lỗi
- [ ] `/graph` không rỗng, `/search` không rỗng ngay sau khi seed + backfill
- [ ] README dựng lại được từ 0 trong <10 phút bởi người chưa từng đọc code
- [ ] `git status` sạch, không có secret, không có file upload
- [ ] `$V1` vẫn chạy được (`pnpm dev` ở `$V1` lên bình thường)

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| Hết giờ, không tới được phase này | Chạy **mục 1** thôi. Rehearsal 20 phút bắt được nhiều lỗi hơn 2h code thêm |
| Demo phụ thuộc mạng/Bedrock, lúc trình bị chậm | Seed phase 2 đã có text + `documentType` + metadata + summary + **59 entity kèm offset** → bước 2, 4, 6 chạy hoàn toàn không cần Bedrock. Bước 3 (search) và 5 (ask) cần embedding, tức cần `backfill-embeddings.ts` đã chạy xong **trước** buổi demo — chạy nó tối hôm trước, đừng để tới lúc trình |
| Upload live fail giữa buổi demo | Có sẵn 9 document seed để đi tiếp. Nói thẳng "đây là lỗi mạng" rồi chuyển bước, đừng đứng sửa |
| Vô tình commit `.env` hoặc corpus KYC | Checklist mục 5. Kiểm `git status` trước khi commit lần cuối |
