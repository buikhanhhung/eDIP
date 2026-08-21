---
phase: 1
title: "Registry And Default Strategy"
status: pending
priority: P1
dependencies: []
effort: "1.5h"
---

# Phase 1: Registry And Default Strategy

## Overview

Tách `splitText()` thành một registry 4 chỗ nhưng **chỉ điền một chiến lược**: `RECURSIVE_CHARACTER`, là chính logic hiện tại chuyển sang nguyên văn. Kết thúc phase, hành vi hệ thống **không đổi một chút nào** — đây là lưới an toàn để 4 phase sau có chỗ đứng.

## Requirements

**Functional**
- `chunking.service.ts` trả về chunk giống hệt `splitText()` cho mọi đầu vào
- `ingest.consumer.ts` gọi service thay vì hàm, với chiến lược mặc định
- Chunk vẫn được ghi `chunking_strategy` — giá trị đổi từ `'recursive'` sang `'RECURSIVE_CHARACTER'`

**Non-functional**
- 185 test hiện tại pass, không sửa test nào để chúng pass
- Không thêm dependency npm nào

## Architecture

```
Chunk { content: string; parentContent?: string; metadata?: Record<string, unknown> }

interface ChunkingStrategy {
  (text: string): Promise<Chunk[]>      // async vì phase 5 cần
}

CHUNKING_STRATEGIES = ['RECURSIVE_CHARACTER','PARENT_CHILD_MARKDOWN',
                       'DOCUMENT_STRUCTURE','SEMANTIC'] as const

ChunkingService.split(text, strategy) → Chunk[]
```

`metadata` có trong interface từ phase 1 dù phase này không dùng: phase 3 và 4 đều ghi nó (bảng `embedding_chunks` đã có cột `metadata` chưa ai dùng), và để sẵn từ đầu thì không phải đổi chữ ký giữa đường.

Registry là một `Record<ChunkingStrategyId, ChunkingStrategy>`. Phase này chỉ đăng ký 1 khoá; 3 khoá còn lại chưa có, và service **ném lỗi rõ ràng** khi bị gọi với chiến lược chưa đăng ký — không thoái lui âm thầm.

Chữ ký `async` ngay từ đầu dù 3 chiến lược đầu đồng bộ, để phase 5 không phải đổi chữ ký của mọi chỗ gọi.

**Đổi giá trị `chunking_strategy` từ `'recursive'` → `'RECURSIVE_CHARACTER'`**: các tài liệu đã nạp giữ `'recursive'`. Không migrate (đã chốt "chỉ tài liệu mới"). Cột là `String?` nên hai giá trị cùng tồn tại được; không có code nào so sánh giá trị này, chỉ ghi và đọc để hiển thị.

## Related Code Files

**Create**
- `nestjs-backend/src/infrastructure/chunking/chunking.types.ts`
- `nestjs-backend/src/infrastructure/chunking/recursive-character.strategy.ts`
- `nestjs-backend/src/infrastructure/chunking/chunking.service.ts`
- `nestjs-backend/src/infrastructure/chunking/chunking.module.ts`
- `nestjs-backend/src/infrastructure/chunking/chunking.service.spec.ts`

**Modify**
- `nestjs-backend/src/infrastructure/chunking/text-splitter.spec.ts` — giữ nguyên 5 test, thêm test tương đương
- `nestjs-backend/src/features/ingestion/ingest.consumer.ts` — dòng ~83 `splitText()` và ~91 `CHUNKING_STRATEGY`
- `nestjs-backend/src/features/ingestion/ingestion.module.ts` — import ChunkingModule
- `nestjs-backend/scripts/backfill-embeddings.ts` — **chỗ tiêu thụ thứ ba** của đường chunking, dòng 6/42/50/55. Bỏ sót sẽ khiến `pnpm backfill:embeddings` vẫn ghi `'recursive'` trong khi upload mới ghi `'RECURSIVE_CHARACTER'`

**Delete** — không xoá gì. `text-splitter.ts` giữ lại; `recursive-character.strategy.ts` gọi vào nó, nên 5 test hiện có vẫn bảo vệ đúng logic đó.

## Implementation Steps

**Tests trước**

1. Thêm vào `text-splitter.spec.ts` một test tương đương: với ~5 đầu vào (rỗng, một đoạn, nhiều đoạn, một đoạn dài hơn `size`, văn bản có dấu tiếng Việt), `splitText(t)` và `await service.split(t,'RECURSIVE_CHARACTER')` cho **mảng bằng nhau từng phần tử**
2. `chunking.service.spec.ts`: gọi với chiến lược chưa đăng ký → ném lỗi có nêu tên chiến lược
3. Chạy `pnpm test` — test mới **phải đỏ** (service chưa tồn tại)

**Rồi mới code**

4. `chunking.types.ts`: 4 id, `Chunk`, `ChunkingStrategy`
5. `recursive-character.strategy.ts`: `async (text) => splitText(text).map(content => ({ content }))`
6. `chunking.service.ts`: registry 1 khoá + `split()` ném lỗi cho khoá thiếu
7. `chunking.module.ts` export service; `ingestion.module.ts` import
8. `ingest.consumer.ts`: thay `splitText(extracted.text)` bằng service. **Lưu ý** — chỗ này hiện dùng `chunks` (string[]) ở 2 nơi: `replaceChunks` và `generateEmbeddings(chunks, ...)`. Sau khi service trả `Chunk[]`, phải sửa cả hai: `chunks.map(c => c.content)` cho embedding
9. Chạy `pnpm test` — toàn bộ xanh

## Success Criteria

- [ ] Test tương đương pass: `splitText` và service cho kết quả giống nhau trên cả 5 đầu vào
- [ ] Gọi chiến lược chưa đăng ký → lỗi nêu tên, không thoái lui âm thầm
- [ ] `pnpm test` → **185 + số test mới**, không test cũ nào bị sửa để pass
- [ ] `npx tsc --noEmit` sạch
- [ ] Upload thử một tệp → `chunking_strategy = 'RECURSIVE_CHARACTER'`, số chunk như trước

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| `generateEmbeddings` nhận sai kiểu sau khi đổi `chunks` | Test tương đương chạy trước; typecheck bắt được vì `string[]` ≠ `Chunk[]` |
| Đổi giá trị `chunking_strategy` làm hỏng chỗ nào đó | Đã grep: không code nào so sánh giá trị này, chỉ `INSERT` |
| `backfill:embeddings` ghi giá trị cũ, sinh ra **ba** giá trị `chunking_strategy` khác nhau trong DB | Sửa luôn `scripts/backfill-embeddings.ts` trong phase này. Đây là lỗi im lặng: script vẫn chạy, vẫn xanh, chỉ là dợ liệu lệch |
| `text-splitter.ts` thành lớp trung gian vô nghĩa | Cố ý giữ: 5 test hiện có bám vào nó, xoá là mất lưới an toàn ngay lúc cần nhất |
