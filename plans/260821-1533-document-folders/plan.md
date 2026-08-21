---
title: "Folder chứa tài liệu, upload từ trong folder"
description: "Folder tương đương KnowledgeBase của ECVBot, tài liệu tương đương KbUnit; upload chỉ diễn ra bên trong một folder. Không giới hạn phạm vi search/ask ở vòng này."
status: pending
priority: P2
branch: "master"
tags: [folders, documents, ui, ingestion]
blockedBy: []
blocks: []
created: "2026-08-21T08:40:00.000Z"
createdBy: "cook"
source: user-request
---

# Folder chứa tài liệu, upload từ trong folder

## Overview

Gom tài liệu vào folder, và **upload chỉ diễn ra bên trong một folder** — không còn trang Upload cấp cao nhất.

Ánh xạ theo yêu cầu của người dùng: **1 folder ≡ 1 `KnowledgeBase`**, **1 tài liệu ≡ 1 `KbUnit`**.

## "Như ECVBot" không có bản gốc để port

Đây là điểm khác căn bản so với plan chunking vừa xong, nơi mọi chiến lược đều có bản gốc để đối chiếu từng nhánh.

| Trong ECVBot | Thực chất |
|---|---|
| `model Folder` (`features/conversations/`, migration `add_conversation_folders`) | Folder cho **hội thoại**, không phải tài liệu |
| `KnowledgeBase` → `KbUnit`, bot nối vào KB qua `BotKnowledgeBase` | Đây mới là cách ECVBot gom **tài liệu** |

Nên phần schema và service là **thiết kế mới**; chỉ *UX* folder (tạo/đổi tên/xoá, danh sách có số đếm) là mượn ý ECVBot. Không có bản gốc nghĩa là chỗ giả định sai sẽ tốn thời gian nhất — lý do plan này được viết ra trước khi code.

## Quyết định đã chốt với người dùng

| Câu hỏi | Quyết định |
|---|---|
| Upload có bắt buộc chọn folder? | **Bắt buộc**, giống ECVBot. Bỏ trang Upload cấp cao nhất |
| Xoá folder đang có tài liệu? | **Xoá luôn cả tài liệu**. Lo ngại đã nêu (tài liệu là thứ đắt nhất trong hệ: đã tốn quota trích xuất, phân loại, embedding) và người dùng vẫn giữ quyết định — ghi lại, không bàn lại. Giảm thiểu bằng hộp xác nhận **nêu rõ số tài liệu sẽ mất** |
| Giới hạn phạm vi search/ask theo folder? | **Không ở vòng này** |
| Folder lồng nhau? | **Không**. Phẳng |
| Một tài liệu thuộc nhiều folder? | **Không**. Một folder |

## Hệ quả của việc không scope search/ask

Trong ECVBot, bot gắn vào `KnowledgeBase` nên KB **thực sự giới hạn** phạm vi truy hồi. Ở đây folder chỉ để **sắp xếp**: gom xong rồi hỏi vẫn nhận câu trả lời từ **toàn bộ** kho.

Thêm sau vẫn được, đúng 5 điểm truy vấn đã đo (`+2,5–3h`):

| File | Chỗ |
|---|---|
| `search.service.ts` | dòng 63 (`findMany`) và 129 (raw tsquery) |
| `ask.service.ts` | dòng 160 (`findMany`) |
| `vector-store.service.ts` | dòng 108 và 135 — **raw SQL**, thêm điều kiện là **đánh số lại tham số** |

Hai chỗ raw SQL là loại đã cắn ở phase 3 của plan chunking. Nay đã có `vector-store.service.spec.ts` canh cả danh sách cột, chuỗi `VALUES` và thứ tự tham số, nên chi phí thấp hơn hồi đó — nhưng vẫn là chỗ cần cẩn thận nhất nếu làm vòng sau.

## Cạm bẫy đã phát hiện: cascade ở tầng DB là sai

`documents.service.ts:265` `remove()` làm **ba** việc ngoài dòng Postgres:

```
graph.deleteDocument(id)      → node trong FalkorDB
prisma.document.delete()      → dòng DB (embedding_chunks cascade theo)
storage.remove(storagePath)   → tệp trên đĩa
```

Nên `onDelete: Cascade` từ `Folder` sang `Document` sẽ **để lại tệp mồ côi trên đĩa và node rác trong FalkorDB**. Xoá folder **phải** lặp qua `remove()` từng tài liệu.

Hệ quả về hiệu năng: folder 90 tệp = 90 lượt xoá graph + 90 lượt xoá tệp. Cần quyết ở phase 3 là làm đồng bộ có giới hạn hay đẩy vào queue.

## Phases

| Phase | Name | Giờ | Status |
|-------|------|:-:|--------|
| 1 | [Folder Model And Api](./phase-01-folder-model-and-api.md) | 2–2,5 | Pending |
| 2 | [Upload Inside Folder](./phase-02-upload-inside-folder.md) | 2–2,5 | Pending |
| 3 | [Folder Management Ui](./phase-03-folder-management-ui.md) | 3–3,5 | Pending |
| | **Tổng** | **7–8,5** | |

## Dependencies

```
1 → 2 → 3
```

**Dừng ở đâu cũng ra sản phẩm dùng được:**

| Dừng sau | Còn lại gì |
|---|---|
| Phase 1 | API folder chạy, chưa ai thấy trên UI. Tài liệu cũ nằm ở "Chưa phân loại" |
| Phase 2 | Upload vào folder chạy end-to-end, cả tệp local lẫn Drive. **Giá trị lớn nhất** |
| Phase 3 | Quản lý folder dễ dùng: đổi tên, xoá, chuyển tài liệu |

## Ngoài phạm vi

- Giới hạn phạm vi search/ask theo folder — vòng sau, đã đo 5 điểm ở trên
- Folder lồng nhau
- Một tài liệu thuộc nhiều folder
- Phân quyền theo folder (dùng lại `view`/`upload`/`delete` sẵn có)
- Ánh xạ cây folder của Google Drive sang folder eDIP (chọn một folder cho cả lô; theo cây Drive là `+2h` và phải quyết khi tên trùng)
- Backfill 33 tài liệu sẵn có vào folder nào đó

## Tiêu chí nghiệm thu toàn plan

- [ ] Tạo folder → upload vào đúng folder đó → tài liệu hiện trong folder, `folder_id` đúng trong DB
- [ ] Không thể upload khi chưa chọn folder — API từ chối, UI không cho đi tiếp
- [ ] Import từ Drive vào một folder → mọi tệp trong lô mang `folder_id` đó
- [ ] 33 tài liệu sẵn có hiện ở "Chưa phân loại", không bị gán bừa
- [ ] Xoá folder → hộp xác nhận nêu **đúng số** tài liệu sẽ mất; sau khi xoá, không còn tệp mồ côi trong `storage/` và không còn node trong FalkorDB
- [ ] Lọc Thư viện theo folder, và bộ lọc sống trong URL như các bộ lọc hiện có
- [ ] 294 test hiện tại vẫn pass

## Rủi ro toàn plan

| Rủi ro | Xử lý |
|---|---|
| `onDelete: Cascade` để lại tệp mồ côi và node graph | Xoá folder lặp qua `remove()`, **không** dùng DB cascade. Tiêu chí nghiệm thu kiểm cả `storage/` và FalkorDB |
| Xoá folder mất tài liệu ngoài ý muốn | Quyết định của người dùng. Hộp xác nhận nêu rõ số tài liệu; không có undo |
| `prisma migrate dev` đòi drop `search_tsv` | Viết migration **bằng tay** rồi `migrate deploy` — đã gặp 2 lần trong plan chunking, tiền lệ ở `20260812210000_document_source` |
| Bỏ trang Upload cấp cao nhất phá luồng người dùng đang quen | Có chủ ý theo quyết định. Sidebar đổi trong cùng phase để không còn link chết |
| Người mới không upload được vì chưa có folder | Trạng thái rỗng của trang Folder phải dẫn thẳng tới "Tạo folder đầu tiên" |
| Folder 90 tệp xoá lâu, request timeout | Phase 3 quyết: giới hạn đồng bộ hoặc đẩy queue. Đường Drive import đã có tiền lệ dùng queue cho việc dài |

## Câu chưa trả lời

- Xoá folder 90 tệp: làm đồng bộ có giới hạn, hay đẩy vào queue như Drive import? Quyết ở đầu phase 3, khi đã biết UI cần phản hồi gì.
- Tên folder có cần duy nhất? Nghiêng về **không** (hai folder cùng tên vẫn phân biệt bằng id), nhưng nếu muốn duy nhất thì thêm unique index ở phase 1 rẻ hơn là thêm sau.
