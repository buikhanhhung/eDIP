---
phase: 1
title: "Registry And Default Strategy"
status: done
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

- [x] Test tương đương pass: `splitText` và service cho kết quả giống nhau trên cả 5 đầu vào
- [x] Gọi chiến lược chưa đăng ký → lỗi nêu tên, không thoái lui âm thầm
- [x] `pnpm test` → **194** (185 + 9 mới), không test cũ nào bị sửa để pass (`git diff --numstat` trên `text-splitter.spec.ts` = `28 0`, không xoá dòng nào)
- [x] `npx tsc --noEmit` sạch
- [x] Upload thử một tệp → `chunking_strategy = 'RECURSIVE_CHARACTER'`, 1 chunk cho fixture 2 đoạn (đúng hành vi `splitText`), `parent_content` NULL

## Đã triển khai — 21/08/2026

Khác với phase file, đều là cố ý:

| Việc | Vì sao |
|---|---|
| `chunks` có **3** chỗ tiêu thụ trong `ingest.consumer.ts`, không phải 2 | `graphExtraction.extractForDocument(…, chunks)` cũng nhận `string[]`. Hoisted một biến `contents` dùng cho cả nó và `generateEmbeddings`; `replaceChunks` nhận `Chunk[]` |
| Xoá hằng `CHUNKING_STRATEGY = 'recursive'` khỏi `text-splitter.ts` | Sau khi cả 2 chỗ gọi đổi sang registry thì nó thành code chết. Grep xác nhận 0 tham chiếu còn lại; chuỗi `'recursive'` không còn xuất hiện trong code. Drift 3 giá trị giờ **không thể xảy ra về mặt cấu trúc**, không chỉ là tránh được |
| Thêm `supports()` + spec chốt registry đúng bằng `['RECURSIVE_CHARACTER']` | Bắt trường hợp "có trong `CHUNKING_STRATEGIES` mà chưa đăng ký" — nếu không thì lỗi chỉ hiện ra lúc job chạy trên tài liệu thật. Mỗi phase 3/4/5 phải sửa đúng 1 dòng này |
| Thêm 2 test **ghim đầu ra** ở tham số mặc định | Review chỉ ra 5 test tương đương là **tự tham chiếu**: chúng tính giá trị mong đợi bằng cách chạy lại chính implementation, nên không phát hiện được `splitText` đổi đầu ra. Đã chứng minh bằng mutation: đổi `overlap` 100→50 thì **chỉ** test ghim mới đỏ, cả 5 test tương đương và 5 test `splitText` cũ đều xanh. Quan trọng vì phase 3 dự định gọi `splitText(thân, 500, 100)` |
| `scripts/` vào cả 2 cổng chất lượng | `tsconfig.json` include thêm `scripts/**/*`; `lint` glob thêm `scripts`. Để `nest build` không đổi layout output, `tsconfig.build.json` được **ghim** `include: ["src/**/*"]` — nếu không, gốc suy ra dịch lên một cấp và `dist/main.js` thành `dist/src/main.js`, phá `start:prod`. Đã verify `dist/main.js` còn nguyên, không có `dist/scripts` |
| Sửa `await` vô nghĩa ở `scripts/reset-corpus.ts:45` | Cổng lint mới vừa bật đã bắt được ngay. `falkor.selectGraph()` trả về `Graph` đồng bộ nên `await` trong là no-op. Không đổi hành vi |

**Ghi nhận trung thực:**

- `pnpm lint` **đã đỏ từ trước** trên `master`: 121 lỗi trong `src/` (67 là `prettier/prettier`), cộng 1 parsing error ở `test/app.e2e-spec.ts` vì `tsconfig` exclude `test`. Việc mở rộng glob sang `scripts/` **không thêm lỗi nào** — `scripts/**/*.ts` sạch 0 lỗi. Dọn 121 lỗi cũ nằm ngoài phạm vi plan này
- Lượt kiểm live chạy qua application context (`IngestionService.upload()` → queue → `IngestConsumer`), không qua HTTP: phase 1 chưa có API. Tài liệu test đã xoá sạch, corpus về đúng 33 tài liệu / 104 chunk
- Trong tiến trình kiểm đó **graph extraction không chạy** — `FalkorDB is not connected`, dù container đang healthy và `FALKORDB_PORT` được `z.coerce.number()` đúng. Đường thoái lui hoạt động như thiết kế (tài liệu vẫn `completed`). Nghĩa là đối số `contents` truyền vào `extractForDocument` **chưa được chạy thật** — chỉ được typecheck bảo đảm, và giá trị thì giống hệt `chunks` cũ. Nguyên nhân không liên quan tới chunking, cần xem lại khi chạy app thật

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| `generateEmbeddings` nhận sai kiểu sau khi đổi `chunks` | Test tương đương chạy trước; typecheck bắt được vì `string[]` ≠ `Chunk[]` |
| Đổi giá trị `chunking_strategy` làm hỏng chỗ nào đó | Đã grep: không code nào so sánh giá trị này, chỉ `INSERT` |
| `backfill:embeddings` ghi giá trị cũ, sinh ra **ba** giá trị `chunking_strategy` khác nhau trong DB | Sửa luôn `scripts/backfill-embeddings.ts` trong phase này. Đây là lỗi im lặng: script vẫn chạy, vẫn xanh, chỉ là dợ liệu lệch |
| `text-splitter.ts` thành lớp trung gian vô nghĩa | Cố ý giữ: 5 test hiện có bám vào nó, xoá là mất lưới an toàn ngay lúc cần nhất |
