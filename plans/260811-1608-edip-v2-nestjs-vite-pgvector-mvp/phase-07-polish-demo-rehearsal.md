---
phase: 7
title: "Polish & Demo Rehearsal"
status: done
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

## Success Criteria — chạy 12/08, provider Gemini

- [x] Chạy trọn demo flow bằng cách **bấm thật trong trình duyệt**, không đọc code
- [x] Không trang nào màn hình trắng khi API lỗi; đã bổ sung empty state cho nhật ký, thư viện rỗng-vs-lọc-hết, và search trước truy vấn đầu
- [x] `/graph` 21 nút · 38 cạnh, `/search` trả kết quả từ **cả hai** nhánh sau `seed` + `backfill:embeddings` (19 chunk có vector)
- [x] README + `docs/feature-status.md` viết xong, ghi rõ bước nào cần khoá model bước nào không
- [x] `git status` sạch, `.env` và `storage/` đều bị ignore, không có secret trong file đã commit
- [ ] Dựng lại từ `docker compose down -v` — **chưa chạy**; các bước có trong README nhưng chưa ai làm lại từ máy sạch
- [x] `$V1` không bị phiên này đụng tới (`run-seed.ts` có một thay đổi từ 14:26, trước khi phiên bắt đầu — của người dùng, để nguyên)

## Bốn lỗi tìm được khi bấm thật

Không lỗi nào lộ ra khi đọc code hay chạy test.

1. **Câu demo `hợp đồng với Saigon Retail` hoà điểm tuyệt đối** giữa MSA và một hợp đồng khác — vector xếp cái này nhất, lexical xếp cái kia nhất. Tie-break khi đó là **so sánh id tài liệu**, tức kết quả hạng nhất của câu demo quan trọng nhất do UUID quyết định. Sửa: gỡ hoà bằng nhánh dẫn đầu (ngữ nghĩa cho truy vấn ngôn ngữ tự nhiên). MSA giờ đứng nhất.
2. **Bật "Hiện quan hệ" mà quan hệ vẫn biến mất**: cạnh quan hệ bị lọc theo `minShared`, vốn hỏi "thực thể này có nối các tài liệu không" — câu hỏi khác hẳn "có trích được quan hệ không". 5/7 cạnh bị giấu sau mặc định. Sửa: hai đầu của quan hệ luôn được đưa lên canvas.
3. **`viewer` gõ thẳng `/search` vẫn vào được trang** — nav ẩn link nhưng route không kiểm quyền, nên mỗi lần bấm Tìm là một lỗi đỏ. Sửa: route khai báo quyền cần có và giải thích khi từ chối.
4. **`backfill:embeddings` gọi thẳng lớp Bedrock**, nên đòi khoá AWS trong khi ứng dụng đang chạy Gemini. Script nằm ngoài `src/` nên lần refactor provider đã sót nó.

## Còn thiếu, nói trước

- **Quan hệ có nhãn chỉ có cho tài liệu đã qua pipeline của hệ thống này.** 9 tài liệu seed mang dữ liệu phân tích của v1 nên chỉ có cạnh đồng xuất hiện. Bước 1 của demo (tải lên) là thứ sinh ra quan hệ — nếu upload hỏng giữa buổi thì bước 4 sẽ không có cạnh có nhãn để khoe.
- Chưa dựng lại từ máy sạch để bấm giờ README.

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| Hết giờ, không tới được phase này | Chạy **mục 1** thôi. Rehearsal 20 phút bắt được nhiều lỗi hơn 2h code thêm |
| Demo phụ thuộc mạng/Bedrock, lúc trình bị chậm | Seed phase 2 đã có text + `documentType` + metadata + summary + **59 entity kèm offset** → bước 2, 4, 6 chạy hoàn toàn không cần Bedrock. Bước 3 (search) và 5 (ask) cần embedding, tức cần `backfill-embeddings.ts` đã chạy xong **trước** buổi demo — chạy nó tối hôm trước, đừng để tới lúc trình |
| Upload live fail giữa buổi demo | Có sẵn 9 document seed để đi tiếp. Nói thẳng "đây là lỗi mạng" rồi chuyển bước, đừng đứng sửa |
| Vô tình commit `.env` hoặc corpus KYC | Checklist mục 5. Kiểm `git status` trước khi commit lần cuối |
