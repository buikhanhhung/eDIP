# Chọn chiến lược chunking khi upload — brainstorm

Ngày 20/08/2026 · dự án `eDIP-v2` · tham chiếu `PROJECTS/ECVBot`
Flags: không có (`--html`, `--wiki` không được yêu cầu)

## Bối cảnh

Yêu cầu ban đầu gồm 4 nhóm tính năng lấy ECVBot làm hình mẫu: chọn chiến lược chunking, folder cho tài liệu, config loại search, và thêm connector (SharePoint, S3…). Đó là **4 hệ thống độc lập**, không phải một việc — làm cùng lúc thì không review được và khi hỏng không biết hỏng vì cái nào.

Đã chốt: vòng này **chỉ làm chọn chiến lược chunking**. Ba mục còn lại ghi nhận ở cuối.

## Hiện trạng đã kiểm chứng

| Phát hiện | Bằng chứng |
|---|---|
| Schema **đã lường trước** nhiều chiến lược | `EmbeddingChunk` có `chunking_strategy`, `parent_content`, `chunk_index`; cùng tên bảng `embedding_chunks` như ECVBot |
| `chunking_strategy` ghi cứng một giá trị | `ingest.consumer.ts:91` ghi hằng `CHUNKING_STRATEGY = 'recursive'` |
| `parent_content` **đọc mà chưa ai ghi** | `vector-store.service.ts` dùng `COALESCE(ec.parent_content, ec.content)` ở 2 truy vấn; câu `INSERT` chỉ có 5 cột, không có cột này |
| Cách của ECVBot **từng bị loại có đo đạc** | comment trong `text-splitter.ts`: *15 files, 1249 LOC… splits on ATX markdown headers. The corpus contains none — its headings look like `1. MỤC ĐÍCH`* |
| Nhưng bối cảnh đã đổi | corpus giờ có markdown ATX thật: `policy-data-retention-and-compliance-th.md` mở đầu bằng một ATX header tiếng Thái |
| ECVBot hiện có 4 chiến lược | `chunking.types.ts`: `RECURSIVE_CHARACTER`, `SEMANTIC`, `DOCUMENT_STRUCTURE`, `PARENT_CHILD_MARKDOWN` — 13 file, 2088 LOC |
| `Document` **không có** field folder | đọc toàn bộ model — không có collection/folder/kb |
| Search không có mặt cấu hình | `search.service.ts`: `LANE_LIMIT=10`, `RESULT_LIMIT=10` ghi cứng |

## Quyết định của người dùng

| Câu hỏi | Chốt |
|---|---|
| Làm gì trước | Chọn chiến lược chunking |
| Ai chọn, lúc nào | **Người dùng chọn khi upload** (không tự nhận diện) |
| Tài liệu đã nạp | **Chỉ áp dụng cho tài liệu mới**, không re-chunk |
| Bộ đo so sánh | **Không cần** |
| Danh sách chiến lược | **Đủ 4 như ECVBot** (gồm SEMANTIC) |
| Upload nhiều tệp | Một chiến lược cho cả lô |
| Import từ Drive | Mặc định đoạn văn, không đụng luồng Picker |

Lo ngại đã nêu, người dùng vẫn giữ quyết định:

- **Không đo → không có căn cứ khách quan** chiến lược nào tốt hơn. Giảm thiểu: giữ splitter hiện tại làm **mặc định**, nên không có gì đang chạy tốt bị đổi ngầm.
- **SEMANTIC tốn quota embedding** (embed từng câu; đang dùng Gemini free tier, `GEMINI_MIN_REQUEST_INTERVAL_MS` tồn tại vì đã gặp rate limit). Giảm thiểu: vì người dùng phải chủ động chọn, chi phí chỉ phát sinh khi tự nguyện.

## Hệ quả kiến trúc của việc lấy đủ 4

Ba chiến lược là hàm thuần `text → chunks`, đồng bộ. **SEMANTIC cần `IEmbeddingService`**, phải `async`, và có thể lỗi. Nên `text-splitter.ts` thôi là module hàm thuần và thành service có dependency — ba chiến lược đơn giản phải mang chữ ký `async` chỉ vì cái thứ tư.

## Phương án đã cân nhắc

**A. Bê nguyên strategy-pattern factory của ECVBot** — 13 file, 2088 LOC cho 4 hàm. Loại: splitter hiện tại 40 dòng, và chính comment trong đó lấy số LOC của ECVBot làm lý do từ chối.

**B. Registry phẳng** *(chọn)* — 4 hàm cùng chữ ký + một `Record<StrategyId, Strategy>` để tra. Lấy **danh sách chiến lược** của ECVBot, không lấy tầng trừu tượng của nó.

**C. Nhồi hết vào `text-splitter.ts`** — Loại: SEMANTIC cần DI và async, gộp vào sẽ buộc một file thuần phải biết tới NestJS.

## Thiết kế chốt

| Tầng | Thay đổi |
|---|---|
| `prisma/schema.prisma` | thêm `Document.chunkingStrategy String?` → 1 migration. `EmbeddingChunk` không cần gì |
| `infrastructure/chunking/` | `chunking.types.ts` (4 id + interface) · 4 file chiến lược · `chunking.service.ts` tra registry, inject embedding cho SEMANTIC |
| `vector-store.service.ts` | câu `INSERT` thêm `parent_content` — bắt buộc, không có thì parent-child vô nghĩa |
| `ingest.consumer.ts:91` | đọc `document.chunkingStrategy` thay vì hằng số |
| `ingestion.controller` / `ingestion.service` | nhận field chiến lược trong multipart, lưu lên `Document` |
| `upload-page.tsx` | một `Select` cạnh nút Choose files, dùng lại component `Select` sẵn có |
| Drive import | truyền mặc định `RECURSIVE_CHARACTER` |

## Ngoài phạm vi vòng này

Không re-chunk 23 tài liệu cũ · không bộ đo so sánh · không chọn riêng từng tệp trong lô · không dropdown ở trang Nguồn · không folder · không search config.

## Tiêu chí nghiệm thu

1. Upload với chiến lược X → mọi chunk của tài liệu đó có `chunking_strategy = X` trong `embedding_chunks`
2. Chọn parent-child → `parent_content` khác null, và câu trả lời trích ra **đoạn cha** (đường đọc `COALESCE` đã có sẵn)
3. Không chọn gì → hành vi y như hiện tại, **185 test vẫn pass**
4. Chọn SEMANTIC → chạy được, và khi embedding lỗi thì thoái lui về đoạn văn chứ không làm hỏng cả lần nạp
5. Tài liệu từ Drive → `chunking_strategy = 'RECURSIVE_CHARACTER'`

## Rủi ro

| Rủi ro | Xử lý |
|---|---|
| SEMANTIC đụng rate limit khi nạp | opt-in; thoái lui về đoạn văn khi lỗi thay vì fail cả job |
| Kho thành hỗn hợp nhiều chiến lược, không so sánh được | chấp nhận theo quyết định "không cần đo"; `chunking_strategy` vẫn lưu nên truy vết được sau |
| Thêm cột vào `INSERT` làm lệch đường raw SQL | có test cho vector-store; chạy lại toàn bộ suite |
| Người upload không hiểu 4 lựa chọn | mặc định là đoạn văn; nhãn viết theo việc chứ không theo thuật ngữ |

## Ba mục còn lại — ghi nhận cho vòng sau

| Mục | Chốt được gì | Ghi chú |
|---|---|---|
| **Folder** | dùng để **giới hạn phạm vi search/hỏi AI** | Không copy `KnowledgeBase` của ECVBot: nó mang `organizationId`, `teamId`, soft-delete, ontology, cost estimate — eDIP không có Organization/Team. Phần khó là sửa retrieval hai làn và đường ask, không phải CRUD |
| **Search config** | **admin/tuning**, không cho người dùng cuối | Đưa `LANE_LIMIT`, `RESULT_LIMIT`, RRF `k` ra cấu hình. `rrf.ts` tự ghi `k=5` chọn cho corpus 9 tài liệu — kho lớn lên là sai |
| **Connector** | chưa chốt nguồn nào | S3 rẻ hơn SharePoint rất nhiều (IAM vs Microsoft Graph + tenant consent). `DocumentSource` là **Prisma enum** → mỗi connector là một migration; nên đổi sang string có validate |

## Đề xuất thêm ngoài 4 mục

- **CI (GitHub Actions)** — hôm nay `.gitignore` nuốt `src/infrastructure/storage/` và thiếu `prisma generate` khiến máy khác không build được. Một job `install + build + test` bắt được cả hai. README đang ghi CI là chưa làm
- **Bug trích xuất entity tiếng Thái** — đã quan sát được, chưa điều tra xong
- **Reprocess tài liệu lỗi từ UI** — README liệt kê là chưa có
- Vênh nhỏ còn treo: server chặn câu hỏi 1000 ký tự, ô nhập cho gõ 2000

## Câu chưa trả lời

- Nguồn connector nào muốn khảo sát thêm (Dropbox/Box, email, URL crawl, local folder watch) — chưa chọn
