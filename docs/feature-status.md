# Tình trạng tính năng

Cập nhật 12/08/2026. Mỗi dòng ghi **đã đo bằng cách nào**, không ghi ý định.

✅ đã chạy thật và kiểm được · ⚠️ chạy được nhưng có giới hạn đã biết · ❌ chưa làm

Provider model lúc đo: **Gemini** (`gemini-3.5-flash-lite`, `gemini-embedding-001`).

## Xác thực & phân quyền

| Tính năng | | Đo bằng |
|---|:-:|---|
| Đăng nhập 3 vai trò | ✅ | admin/user/viewer đều lấy được JWT, `/auth/me` trả đúng bộ quyền |
| Chặn ở API, không chỉ ẩn giao diện | ✅ | `viewer` gọi `/search` → 403; `user` gọi `PATCH metadata` và `DELETE` → 403 |
| Không token → 403 (không phải 401) | ✅ | `/documents`, `/stats`, `/graph` khi thiếu token đều 403 |
| Sai email và sai mật khẩu không phân biệt được | ✅ | cùng mã 401, cùng nội dung, cùng đường chạy `bcrypt.compare` |
| Chặn dò mật khẩu | ✅ | lần đăng nhập sai thứ 11 trong 15 phút → 429 |

## Nạp tài liệu

| Tính năng | | Đo bằng |
|---|:-:|---|
| Tải lên + hàng đợi + theo dõi trạng thái | ✅ | `POST /documents` → 202, badge chạy `uploaded → processing → completed` không cần tải lại trang |
| Chặn loại tệp theo phần mở rộng | ✅ | `.exe` → 400 **trước khi** ghi đĩa; có test cho cả `invoice.pdf.exe` |
| Chống thoát thư mục | ✅ | tên `../../evil.md` lưu thành `<uuid>.md` trong `storage/`; kiểm 4 thư mục cha, không có tệp nào lọt ra |
| Trích văn bản `.md` / `.txt` / `.docx` | ✅ | hợp đồng thật, `textSource=native` |
| Đọc chữ từ ảnh (vision) | ✅ | `vietnamese-scan.jpg` → `textSource=vision`, đọc đúng dấu tiếng Việt |
| PDF scan qua vision | ⚠️ | đường chạy giống hệt ảnh và có 2 assert chặn trang trắng, nhưng **chưa chạy thử với PDF scan thật** |
| Thử lại khi lỗi | ✅ | 3 lần, giãn 2s rồi 4s; chỉ lần cuối mới ghi `failed` |
| Lỗi dựng đồ thị không làm hỏng tài liệu | ✅ | chủ ý nuốt lỗi: tài liệu giữ `completed` với đồ thị rỗng |

## Phân tích bằng model

| Tính năng | | Đo bằng |
|---|:-:|---|
| Phân loại + độ tin cậy | ✅ | hợp đồng thật → `contract`, tiêu đề đúng |
| Rút metadata | ✅ | các bên, ngày `2026-02-08`, giá trị `1,850,000,000 VND`, từ khoá |
| Tóm tắt | ✅ | tiếng Việt, bám nội dung |
| Trích thực thể + vị trí trong văn bản | ✅ | 10 thực thể, 10 định vị được bằng `indexOf` |
| Quan hệ có nhãn kèm bằng chứng | ⚠️ | chạy được, mỗi cạnh có câu văn nguyên văn. Nhưng **số lượng phụ thuộc model rất mạnh**: cùng một tài liệu, `2.5-flash` cho 9 quan hệ, `3.5-flash-lite` cho 3 |
| Không bịa quan hệ | ✅ | endpoint không nằm trong danh sách thực thể đã kiểm bị loại ở server, có ghi log |

## Tìm kiếm & hỏi đáp

| Tính năng | | Đo bằng |
|---|:-:|---|
| Tìm kiếm lai ghép 2 nhánh | ✅ | `degraded: false`, kết quả có mặt ở cả `vector` và `lexical` |
| Không dấu ra tài liệu có dấu | ✅ | `hop dong` và `hợp đồng` cho cùng tài liệu đầu bảng |
| Đoạn trích bôi đúng chỗ khớp | ✅ | hai truy vấn khác nhau cho hai đoạn khác nhau, không rơi về câu mở đầu |
| Câu demo `hợp đồng với Saigon Retail` | ⚠️ | MSA Saigon Retail đứng **hạng 1** — nhưng nó **hoà điểm tuyệt đối** với một hợp đồng khác, và thắng nhờ luật gỡ hoà (ưu tiên nhánh ngữ nghĩa). Đổi corpus là thứ tự có thể đổi |
| Một nhánh hỏng không làm sập endpoint | ✅ | chạy suốt giai đoạn chưa có khoá model: nhánh vector hỏng, `/search` vẫn trả kết quả |
| Trả lời kèm trích dẫn | ✅ | trích dẫn trỏ về tài liệu có thật, `unsourced: false` |
| Không có nguồn thì từ chối | ✅ | "giá cổ phiếu Apple hôm nay" → đúng câu "Không tìm thấy thông tin này trong kho tài liệu" |
| Chống giả mạo trích dẫn | ⚠️ | id trích dẫn có nonce đổi mỗi lần gọi. **Chưa thử tấn công thật** bằng tài liệu chứa sẵn chuỗi `[a3f9-1]` |

## Đồ thị tri thức

| Tính năng | | Đo bằng |
|---|:-:|---|
| Dựng và vẽ được | ✅ | 21 nút · 38 cạnh ở `minShared=2`, canvas render thật trong trình duyệt |
| Không cạnh trùng id | ✅ | `new Set(ids).size === ids.length` đúng ở cả 3 mức lọc |
| Tài liệu lỗi không lên đồ thị | ✅ | tài liệu `failed` không xuất hiện |
| Gộp thực thể trùng | ⚠️ | gộp theo tên chuẩn hoá chạy đúng (`Ecloudvalley Vietnam Ltd` có mặt ở cả 9 tài liệu). **Ngưỡng gộp theo vector `0.92` là số phỏng đoán, chưa hiệu chỉnh trên dữ liệu thật** |
| Xoá tài liệu thì node biến mất | ✅ | xoá tường minh vì không có khoá ngoại xuyên hai kho; đã kiểm |

## Nhật ký, sửa metadata, highlight

| Tính năng | | Đo bằng |
|---|:-:|---|
| Ghi nhật ký hành động | ✅ | `search.query`, `ask.query` kèm câu đã gõ; `/audit` chỉ admin |
| Nhật ký lỗi không làm hỏng request | ⚠️ | đã bọc `.catch()` và không `await`. **Chưa dựng kịch bản lỗi để chứng minh** |
| Sửa metadata + ghi người sửa | ✅ | `metadataEditedAt` được đặt, `typeConfidence` lên 1 |
| Sửa "các bên" thì đồ thị theo | ✅ | liên kết công ty dựng lại, còn person/date/amount giữ nguyên |
| Bôi vàng thực thể trong văn bản | ✅ | cắt chuỗi theo offset, không dùng regex thay thế |

## Hạ tầng

| | | |
|---|:-:|---|
| Đổi nhà cung cấp model | ✅ | Bedrock/OpenAI/Gemini sau 3 interface; đổi bằng `AI_PROVIDER` + restart, đã chạy thử cả ba đường |
| Vector 1024 chiều xuyên nhà cung cấp | ✅ | Gemini `outputDimensionality: 1024` chạy thật, không phải migrate |
| Test | ✅ | 86 test, 9 suite |
| Kiểm thử tự động cho pipeline model | ❌ | không có test nào gọi model thật; mọi thứ ở trên là kiểm tay |

## Chưa làm

Adapter S3 · xử lý lại tài liệu lỗi từ giao diện · tải lên hàng loạt · xuất CSV · phát hiện tài liệu trùng · Dockerfile production + CI · phân trang thư viện · dọn thực thể mồ côi.

## Ba điểm yếu nhất, nói trước để khỏi phải phát hiện lúc demo

1. **Ngưỡng gộp thực thể `0.92`** là phỏng đoán. Chưa có tập đánh giá nào để biết nó gộp thiếu hay gộp thừa.
2. **Số quan hệ trích được dao động mạnh theo model.** Cùng tài liệu, 9 so với 3.
3. **Không có tập vàng.** Mọi con số "đúng" ở trên là mắt người nhìn trên một vài tài liệu, không phải precision/recall đo được.
