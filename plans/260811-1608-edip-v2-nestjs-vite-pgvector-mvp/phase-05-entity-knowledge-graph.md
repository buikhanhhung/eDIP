---
phase: 5
title: "Entity & Knowledge Graph"
status: pending
priority: P1
dependencies: [2]
effort: "1.25h"
---

# Phase 5: Entity & Knowledge Graph

> **Sửa sau red-team.** Phase này giờ **chỉ phụ thuộc phase 2**, không phải 3 — entity đã được seed từ `$V1/data/documents.json` ở phase 2, nên graph có dữ liệu ngay. Bỏ `backfill-entities.ts`. Bỏ `getEntityNeighbourhood`. Thêm `DISTINCT`. Ước tính 1.5h → 1.25h.

## Overview

Dựng API graph sau `GraphStorePort` và vẽ bằng cytoscape. Entity đã có sẵn trong DB từ phase 2 (59 entity, 33 sau chuẩn hoá, 12 được chia sẻ bởi ≥2 tài liệu, `ecloudvalley vietnam` có mặt ở cả 9).

Vì phase này không còn phụ thuộc phase 3/4, nó có thể chạy **ngay sau phase 2** nếu Bedrock gặp trục trặc. Đó là van xả quan trọng nhất trong plan.

## Requirements

- Functional: `GET /graph?minShared=2` trả `{ nodes, edges }` dùng trực tiếp cho cytoscape, **không cạnh trùng**.
- Functional: click node document → detail; click node entity → danh sách document liên quan.
- Functional: `@RequirePermission('view')` — không phải route công khai.
- Non-functional: mọi truy cập graph qua `GraphStorePort`, không SQL trong controller/FE.

## Architecture

```
features/graph/
  graph.di-token.ts            GRAPH_STORE
  graph.port.ts                interface IGraphStore
  graph.module.ts              { provide: GRAPH_STORE, useClass: PostgresGraphStore }
  infras/postgres-graph.store.ts
  graph.controller.ts
```

```ts
export interface IGraphStore {
  upsertDocumentEntities(documentId: string, entities: ExtractedEntity[]): Promise<void>;
  getGraph(opts: { minShared: number }): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
  deleteByDocument(documentId: string): Promise<void>;
}
```

`getEntityNeighbourhood` **đã bỏ**. Bản đầu mô tả nó là port của tính năng "Focus its neighbourhood" ở v1 — kiểm lại thì v1 focus theo **document** (`focusDocumentId`, nút truyền documentId), không theo entity. Không có bản tham chiếu nào để port. Và không cần: `getGraph` trả danh sách cạnh hai phía đã chứa đủ mọi document chia sẻ entity, nên "neighbourhood" là bộ lọc **5 dòng ở client** trên dữ liệu đã nằm sẵn trong trang. Bỏ một endpoint, một query, một vòng round-trip.

Ngày 2: thêm `infras/falkor-graph.store.ts` implement cùng interface, đổi 1 dòng trong `graph.module.ts`.

## Related Code Files

- Create: `$ROOT/nestjs-backend/src/features/graph/**`
- Create: `$ROOT/frontend/src/pages/graph.tsx`
- Create: `$ROOT/frontend/src/components/graph/{graph-canvas.tsx,node-drawer.tsx}`
- Reuse từ phase 2: `src/common/rbac/`, `entity-normalizer.ts` (đã viết ở seed)
- Modify: `$ROOT/nestjs-backend/src/features/ingestion/ingest.consumer.ts` (thêm step graph cho document upload mới)
- Copy từ `$ECVBOT_FE`: cách khởi tạo `react-cytoscapejs` + `cytoscape`
- Tham khảo `$V1/src/lib/graph/build-graph.ts` — **đọc để hiểu ý tưởng, không port trực tiếp**

### Không port được (đã kiểm)

12 test graph của v1 (203 LOC) dựng trên fixture `DocumentRecord` với `doc.analysis.entities`; v2 nhận row join từ `GROUP BY ... HAVING`. Output của v1 cũng là hình dạng xyflow, không phải `{data:{...}}` của cytoscape. Viết test mới nếu có thời gian, đừng cố chuyển.

## Implementation Steps

### 1. `normalizeEntityName` — đã viết ở phase 2 (~0 phút)

```ts
export function normalizeEntityName(raw: string): string {
  return raw
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\b(ltd|jsc|co|corp|inc|company|cong ty|tnhh|cp)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

Kết quả đã đo trên corpus thật: 59 entity → **33 sau chuẩn hoá**, 12 được ≥2 document chia sẻ. Các `kind` xuất hiện: `company`, `person`, `project`, `date`, `amount`, **`department`**.

Khoá unique là `@@unique([type, normalizedName])` (phase 2), không phải unique trên riêng `normalizedName` — nếu không, entity gặp lần đầu chiếm `type` vĩnh viễn vì `upsert` dùng `update: {}`.

### 2. `PostgresGraphStore` (~30 phút)

**upsert** — như bản đầu, dùng khoá composite mới.

**getGraph(minShared)** — `DISTINCT` là bắt buộc:

```sql
WITH shared AS (
  SELECT "entityId", count(DISTINCT "documentId") AS doc_count
  FROM "DocumentEntity" GROUP BY "entityId"
  HAVING count(DISTINCT "documentId") >= $1
)
SELECT DISTINCT           -- ← không có nó là trắng màn hình /graph
  de."documentId", de."entityId", e."displayName", e.type, s.doc_count
FROM "DocumentEntity" de
JOIN shared s ON s."entityId" = de."entityId"
JOIN "Entity" e ON e.id = de."entityId"
JOIN "Document" d ON d.id = de."documentId"
WHERE d.status = 'completed';
```

Lý do cụ thể: khoá chính của `DocumentEntity` là `[documentId, entityId, mentionText]`, cho phép **nhiều row cho cùng cặp document–entity**. Chính ví dụ dedup trong plan (`Ecloudvalley Vietnam Ltd` và `ECLOUDVALLEY VIETNAM` cùng một tài liệu) tạo 2 row → 2 cạnh cùng id → cytoscape ném `Can not create second element with ID`, **trắng màn hình `/graph` đúng bước 4 của demo**.

Lọc `d.status='completed'` để document `failed` của seed không thành node.

Format trả về đúng cytoscape để FE không phải map:
```json
{ "nodes": [{ "data": { "id": "...", "label": "...", "kind": "document|entity", "type": "..." } }],
  "edges": [{ "data": { "id": "d1__e7", "source": "d1", "target": "e7" } }] }
```

Mặc định `minShared=2` cho **UI**. Ghi cho đúng: API của v1 mặc định `minDocuments=1`, con số 2 là mặc định phía giao diện — v1 tách hai cái này có chủ đích. Đừng viết "giữ nguyên mặc định của v1" ở tầng API.

Lọc loại mặc định: chỉ `company`, `person`, `project`, `contract`, `invoice`, `department`. `date` và `amount` là metadata, không phải node đáng nối.

### 3. Nối vào pipeline (~10 phút)

`ingest.consumer.ts` step cuối: `graphStore.upsertDocumentEntities(documentId, analysis.entities)` — chỉ cho tài liệu **upload mới**. 9 document seed đã có entity từ phase 2.

Không còn `backfill-entities.ts`.

### 4. FE graph (~35 phút)

`react-cytoscapejs`, layout `cose`:

```ts
const stylesheet = [
  { selector: 'node[kind="document"]', style: { shape: 'round-rectangle', 'background-color': '#2563eb', label: 'data(label)' } },
  { selector: 'node[kind="entity"]',   style: { shape: 'ellipse',          'background-color': '#f59e0b', label: 'data(label)' } },
  { selector: 'edge', style: { width: 1, 'line-color': '#cbd5e1', 'curve-style': 'bezier' } },
];
```

- Slider `minShared` (1–4), mặc định 2 → gọi lại API
- Filter theo entity type — lọc ở client
- Click node → drawer: document thì title/type/summary + nút mở detail; entity thì danh sách document liên quan
- "Focus neighbourhood": lọc client-side trên dữ liệu đã có, không gọi API

Tham chiếu cho phần khởi tạo: `$ECVBOT_FE` có một tab cytoscape 445 dòng, kèm workaround dọn WebGL lúc unmount. Đọc chỗ đó trước khi tự viết vòng đời component — 35 phút chỉ đủ nếu không vấp lại đúng cái bug ấy.

Không thêm plugin layout (`cytoscape-fcose`...). ~45 node, `cose` đủ.

## Success Criteria

- [ ] Ngay sau `db seed` (chưa chạy gì của phase 3/4): `SELECT count(*) FROM "Entity"` ≥ 30
- [ ] `Ecloudvalley Vietnam Ltd` và `ECLOUDVALLEY VIETNAM` là **1** row `Entity`
- [ ] Entity `department` tồn tại trong DB (corpus có 6)
- [ ] `GET /graph?minShared=2` → ≥2 document node nối qua ≥1 entity chung
- [ ] **Không có 2 edge nào trùng `data.id`** — kiểm bằng `new Set(edges.map(e=>e.data.id)).size === edges.length`
- [ ] `/graph` render, không có lỗi `Can not create second element with ID` trong console
- [ ] `minShared=1` cho nhiều node hơn `minShared=2`
- [ ] Document `failed` không xuất hiện trên graph
- [ ] `GET /graph` không token → **403**
- [ ] Click node entity → drawer liệt kê đúng document
- [ ] Không SQL nào ngoài `infras/postgres-graph.store.ts`
- [ ] Xoá 1 document → cạnh của nó biến mất (cascade)

## Risk Assessment

| Rủi ro | Xử lý |
|---|---|
| Cạnh trùng làm trắng màn hình | `DISTINCT` ở §2 + assert trong success criteria. Đây là lỗi đã suýt lọt |
| Chuẩn hoá gộp nhầm 2 công ty khác nhau | Chỉ bỏ hậu tố pháp nhân, không bỏ từ nội dung. Đã đo: 59 → 33, nhìn mắt bảng `Entity` sau seed |
| Graph rối lúc demo | `minShared=2` mặc định ở UI. Đừng mở về 1 cho "hoành tráng" |
| `react-cytoscapejs` + React 18 lỗi vòng đời | Đọc cách ECVBot xử lý cleanup WebGL trước khi tự viết |
| 35 phút không đủ cho FE | Cắt theo thứ tự: filter type → slider → chỉ giữ canvas + drawer. Canvas render được là đã đạt bước 4 demo |
