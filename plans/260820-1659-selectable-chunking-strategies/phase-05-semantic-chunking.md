---
phase: 5
title: "Semantic Chunking"
status: pending
priority: P3
dependencies: [4]
effort: "2.5h"
---

# Phase 5: Semantic Chunking

## Overview

Chiến lược cuối, và là chiến lược duy nhất **tốn quota**: embed từng câu rồi cắt ở chỗ ý nghĩa nhảy — khi cosine similarity giữa hai câu liền kề tụt dưới ngưỡng.

Đặt cuối vì đắt nhất, rủi ro nhất, và là mục dễ bị cắt nếu hết thời gian. Bốn phase trước đã ra sản phẩm dùng được mà không cần phase này.

## Requirements

**Functional**
- Tách văn bản thành câu, embed từng câu, gộp câu liền kề thành chunk tới khi similarity tụt dưới ngưỡng
- Lỗi embedding (rate limit, mạng, provider) → **thoái lui `RECURSIVE_CHARACTER`**, ghi log warn, tài liệu vẫn `completed`
- Văn bản dưới ngưỡng số câu (đề xuất < 5) → thoái lui, không tốn quota cho tệp bé
- Ghi `TokenUsage` cho lượt embedding này để dashboard không báo thiếu chi phí

**Non-functional**
- Không bao giờ làm fail cả job nạp
- Tôn trọng `GEMINI_MIN_REQUEST_INTERVAL_MS` đã có — không tự gọi song song vượt nhịp

## Architecture

Đây là chiến lược duy nhất cần dependency, và là lý do `ChunkingStrategy` mang chữ ký `async` từ phase 1.

```
text → tách câu → embed[] → similarity(i, i+1) → cắt ở đáy cục bộ → chunks
```

`chunking.service.ts` inject `IEmbeddingService` qua `EMBEDDING_SERVICE` token (đúng cách `ask.service.ts` và `ingest.consumer.ts` đang làm). Chiến lược nhận service qua tham số chứ không tự import — giữ 3 chiến lược kia thuần.

**Chi phí thật, cần nói rõ trong nhãn UI:** một tài liệu 200 câu = 200 lần embed, so với 1 lần cho `RECURSIVE_CHARACTER`. Người dùng đang ở Gemini free tier và **đã từng gặp rate limit** (`GEMINI_MIN_REQUEST_INTERVAL_MS` tồn tại chính vì lý do đó). Nên embed theo **lô** qua `generateEmbeddings(sentences, 'search_document')` — nó nhận mảng, một lượt gọi cho nhiều câu — chứ không gọi từng câu một.

**Ngưỡng cắt:** đề xuất khởi điểm 0.75, hằng số trong file kèm comment nêu rõ đây là số chưa hiệu chỉnh trên corpus thật. Không đưa ra UI.

## Related Code Files

**Create**
- `nestjs-backend/src/infrastructure/chunking/semantic.strategy.ts`
- `nestjs-backend/src/infrastructure/chunking/semantic.strategy.spec.ts`

**Modify**
- `nestjs-backend/src/infrastructure/chunking/chunking.service.ts` — inject `EMBEDDING_SERVICE`, đăng ký khoá thứ 4
- `nestjs-backend/src/infrastructure/chunking/chunking.module.ts` — import `AiModule` để có embedding token
- `frontend/src/features/documents/document-types.ts` — entry thứ 4 (`SEMANTIC`)
- `frontend/src/features/upload/upload-page.tsx` — dòng cảnh báo chi phí dưới `Select`

## Implementation Steps

**Tests trước — mock embedding, không gọi provider thật**

1. Mock trả vector sao cho câu 1-3 giống nhau, câu 4-6 khác hẳn → đúng 2 chunk, cắt giữa câu 3 và 4
2. Mock **ném lỗi** → kết quả bằng `RECURSIVE_CHARACTER`, không ném ra ngoài
3. Văn bản 3 câu (< ngưỡng) → thoái lui, mock embedding **không được gọi** (assert số lần gọi = 0)
4. Mock trả về số vector **lệch** số câu → thoái lui thay vì crash
5. Assert `generateEmbeddings` được gọi **một lần với mảng**, không phải N lần
6. `pnpm test` → đỏ

**Rồi mới code**

7. Tách câu: theo `.`/`!`/`?` + khoảng trắng, có xử lý số thập phân (`1.850.000`) và viết tắt
8. `semantic.strategy.ts` nhận `(text, embeddings)` → chunk
9. `chunking.service.ts` inject token, truyền vào chiến lược
10. `chunking.module.ts` import `AiModule`
11. Frontend: entry 4 nhãn `SEMANTIC`, thêm dòng cảnh báo chi phí dưới `Select`
12. `pnpm test` + typecheck + frontend build
13. **Thử thật một lần** với Gemini: upload tệp ~200 câu, xem log có rate limit không, xem `TokenUsage` có ghi

## Success Criteria

- [ ] 5 test mock pass, gồm 2 ca thoái lui và ca assert gọi theo lô
- [ ] Mock lỗi → tài liệu vẫn `completed`, không `failed`
- [ ] Upload thật một tệp dài → chạy xong, `chunking_strategy = 'SEMANTIC'`
- [ ] `TokenUsage` có dòng cho lượt embedding này (dashboard Token usage không hụt)
- [ ] Tệp ngắn → không tốn lượt embedding nào
- [ ] Dropdown 4 lựa chọn với nhãn `SEMANTIC`; lồi cảnh báo chi phí nằm riêng dưới `Select`, không nhét vào nhãn
- [ ] 185 test cũ + toàn bộ test mới pass

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| Rate limit Gemini free tier | Embed theo lô một lượt gọi; thoái lui khi lỗi; opt-in nên chỉ tốn khi người dùng chủ động chọn |
| Tách câu sai với tiếng Việt (`1.850.000 VND`) | Test riêng cho ca số thập phân; regex không cắt khi hai bên dấu chấm đều là số |
| Ngưỡng 0.75 chọn bừa | Ghi thẳng trong comment rằng chưa hiệu chỉnh. Không có bộ đo (đã chốt), nên đây là hằng số cần xem lại nếu thấy chunk quá vụn hoặc quá to |
| Chunk quá vụn làm phình số chunk | Đặt số câu tối thiểu mỗi chunk (đề xuất 2) và số chunk tối đa |
| ~~`chunking.module.ts` import `AiModule` gây phụ thuộc vòng~~ | **Đã loại ở Validation Session 1**: `ai.module.ts` chỉ import Bedrock/Gemini/OpenAI, không import `ChunkingModule`. Không có vòng |

## Nhãn và cảnh báo chi phí

Nhãn trên dropdown là **`SEMANTIC`** — tên kỹ thuật, theo quyết định ở Validation Session 1.

Nhưng một tên kỹ thuật không nói được rằng nó chậm và tốn quota. Nên lời cảnh báo **tách ra khỏi nhãn**: một dòng chữ nhỏ dưới `Select` nói rõ chỉ riêng `SEMANTIC` tốn thêm lượt gọi embedding. Giữ được cả hai — nhãn khớp giá trị trong DB, mà người chọn vẫn biết cái giá.
