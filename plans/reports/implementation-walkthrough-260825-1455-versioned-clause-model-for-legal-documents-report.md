# Quản lý hiệu lực văn bản theo thời gian — triển khai trên eDIP

*Tài liệu trình bày · 25/08/2026 · bản 4*

---

## Đọc 2 phút

**Vấn đề.** Hỏi *"quy định cho vay góp vốn hiện nay thế nào"* — câu trả lời phụ thuộc ba thông tư sửa nhau. RAG thường trả lời sai vì không có khái niệm "tại ngày nào".

**Giải pháp.** Biến điều khoản thành đơn vị có địa chỉ (`Thông tư 39/2016` + `8.9`) và **có phiên bản kèm khoảng hiệu lực**. **Xử lý sửa đổi lúc nạp tài liệu, không phải lúc hỏi.**

**Điều bất ngờ.** Tầng hiệu lực **hầu như không dùng AI** — nó là một bảng phiên bản và một dòng `WHERE` lọc theo ngày. AI chỉ tham gia hai chỗ: **lúc nạp** đọc *"sửa khoản 8 Điều 8"* thành lệnh cập nhật, và **lúc hỏi** bóc ngày từ câu chữ. Phần nhúng và viết câu trả lời thì eDIP đã có, không đổi.

**Quy mô.** 2 bảng mới, 6 cột thêm, sửa 5 chỗ truy vấn, thêm một bước LLM bóc ngày. **54–74 giờ** ≈ 7–9 ngày.

**Nên làm gì trước.** Phiên bản **cấp tài liệu** (8 giờ, chạy cho cả kho hiện tại) trước cấp điều khoản. Nó kiểm chứng giả định lớn nhất với 8 giờ thay vì 74.

**Tốn nhất, và không phải code.** Đi thu thập văn bản pháp quy và gắn quan hệ "ai sửa ai".

---

## Mục lục

| Phần | Nội dung |
|---|---|
| **I** | Bối cảnh — vấn đề và ý tưởng cốt lõi |
| **II** | Silaw làm thế nào — theo bằng chứng |
| **III** | Đề xuất cho eDIP — mô hình dữ liệu, hai hướng kỹ thuật |
| **IV** | Chi tiết — chunking, tài liệu không cấu trúc, bảng/ảnh, đồ thị |
| **V** | Triển khai — sẽ sửa gì, lộ trình, rủi ro |
| — | Phụ lục: những chỗ bản trước nói sai *(10 dòng — đã sửa 3 lần)* |

> **Cách đọc.** Phần II là **bằng chứng** đọc từ bundle JavaScript của Silaw. Phần III trở đi là **đề xuất** — có chỗ giống Silaw, có chỗ khác. Hai phần tách riêng vì bản 1 đã trộn lẫn và mô tả sai mô hình của họ.

---
---

# PHẦN I — BỐI CẢNH

## 1. Vấn đề

Người dùng hỏi: **"Quy định về cho vay góp vốn hiện nay thế nào?"**

| Văn bản | Hiệu lực | Làm gì |
|---|---|---|
| Thông tư 39/2016 | 15/03/2017 | Quy định gốc |
| Thông tư 06/2023 | 01/09/2023 | **Bổ sung** khoản 8, 9, 10 vào Điều 8 |
| Thông tư 10/2023 | 01/09/2023 | **Ngưng hiệu lực** đúng ba khoản đó |

Kết quả: khoản 8.9 *có tồn tại*, nhưng *không được áp dụng*.

RAG thường trả lời sai vì nó nạp cả ba thông tư rồi để mô hình tự ghép — mà mô hình không biết TT 06 chỉ sửa 3 dòng, không biết TT 10 đã vô hiệu hoá phần đó, và không có khái niệm thời điểm.

Đây không phải ngoại lệ: **mọi câu hỏi về pháp luật đều ngầm mang một mốc thời gian.** Hợp đồng ký năm 2022 phải xét theo quy định năm 2022.

## 2. Ý tưởng cốt lõi

> **Xử lý sửa đổi khi *nạp*, không phải khi *hỏi*.**

**Ẩn dụ bảng giá quán cà phê.** Quán có bảng giá: cà phê 50k. Ngày 1/7 chủ quán ra tờ thông báo *"điều chỉnh giá thành 60k"*.

| | Cách làm | Kết quả |
|---|---|---|
| ❌ | Đưa khách cả bảng giá **và** tờ thông báo, để khách tự ghép | Khách ghép sai |
| ✅ | Nhân viên sửa bảng giá ngay khi nhận thông báo | Luôn đúng |

**bảng giá** = văn bản tách theo điều khoản · **tờ thông báo** = văn bản sửa đổi · **sửa bảng ngay** = xử lý lúc nạp

Có hai loại thông báo, loại thứ hai hay bị bỏ sót:

| Loại | Ví dụ | Mang nội dung mới? |
|---|---|:-:|
| Đổi giá | *"Sửa khoản 8 như sau: ..."* | ✅ |
| **Tạm ngừng bán** | *"Ngưng hiệu lực khoản 8, 9, 10"* | ❌ |

Loại thứ hai **không có nội dung nào** — và vì thế **dễ xử lý hơn**.

---
---

# PHẦN II — SILAW LÀM THẾ NÀO

**Nguồn:** bundle JavaScript phía client (1,79 MB). Nhìn được đường API, tên trường, hình dạng dữ liệu, các bước pipeline, từ vựng trạng thái. **Không** nhìn được code server, database, hay prompt của agent.

## 3. Nạp tài liệu

**Upload chỉ gửi 2 field:**

```
POST /api/kb/upload   →   { file, source }
```

Không có mã văn bản, không có ngày hiệu lực, không có lựa chọn chia nhỏ. **Mọi thứ do pipeline suy ra.**

**Pipeline 6 bước:**

```
register → classify_pages → transform_md → verify_fidelity → agent_extract → persist
Đăng ký    Phân loại trang   Chuyển MD      Kiểm trung thực   Agent (CMA)      Lưu graph+vector
```

**Hai bước đã bỏ, mang nhãn `legacy`:**

```
parse_structure         "Parse cấu trúc (legacy)"
extract_change_events   "Trích xuất sự kiện (legacy)"
```

**Trạng thái job:** `pending` · `running` · `done` · `failed` · **`needs_review`** *(Cần duyệt)*

**Suy ra:** vì hai bước làm-bằng-luật đã bị bỏ, `path` và các mốc **chỉ có thể sinh ra ở `agent_extract`** — tức một agent LLM đọc Markdown rồi tự sinh tất cả.

Hai chi tiết đáng học:

- **`verify_fidelity` đứng *trước* `agent_extract`** — kiểm độ trung thực của bước **chuyển sang Markdown**, không phải của bước tách điều khoản. Markdown mất chữ thì mọi bước sau vô nghĩa.
- **`classify_pages`** — lọc trang bìa, trang ký, mục lục trước khi xử lý.

## 4. Dữ liệu và từ vựng

Silaw có **hai lớp dữ liệu**, phục vụ hai câu hỏi khác nhau.

### Lớp 1 — `provisions`: điều khoản **có phiên bản**, truy vấn theo ngày

Phản hồi khi mở nội dung một văn bản:

```
{ id, title, source, as_of: <ngày>, pdf_url, provisions: [ ... ] }
```

Mỗi `provision`:

```
prov_id                            ← id riêng
path, number, title
kind                               ← 'dieu' | 'section' | 'paragraph' ...
text
version_id                         ← PHIÊN BẢN
effective_from, effective_to       ← KHOẢNG HIỆU LỰC
```

**Server lọc theo `as_of` rồi mới trả về.** Ba chuỗi trong UI xác nhận:

| Chuỗi | Nghĩa |
|---|---|
| *"Không có điều khoản hiệu lực tại ngày này."* | Danh sách rỗng sau khi lọc theo ngày |
| *"Không tìm thấy điều khoản «8.9» tại ngày as-of — hiển thị đầu văn bản."* | Tra theo `path` tại ngày đó |
| *"Nội dung có thể khác phiên bản được trích dẫn."* | So `provision.version_id` với `versionId` trong trích dẫn |

Chuỗi thứ ba là chi tiết tinh nhất: bấm vào một trích dẫn cũ mà điều khoản **đã sang phiên bản khác** thì nó cảnh báo. Chỉ làm được nếu **từng điều khoản có phiên bản riêng**.

### Lớp 2 — `clauses` + `milestones`: lịch sử một điều khoản

```
Clause    { id, code, path, title, source, status, milestone_count, latest_event_date }
Milestone { id, date, effective_date, event, source_doc, note, text }
```

Địa chỉ là **khoá ghép `code/path`**: `/lich-su?clause=39%2F2016%2FTT-NHNN%2F8.9`

### Hai lớp dùng để làm gì

| Lớp | Trả lời câu |
|---|---|
| `provisions` *(theo văn bản, lọc `as_of`)* | *"Ngày X điều khoản này nói gì"* |
| `clauses` + `milestones` | *"Điều khoản này đã qua những thay đổi nào"* |

### Từ vựng chính xác

| Trường | Giá trị |
|---|---|
| `kind` *(provision)* | `dieu` · `section` · `paragraph` … — **từ vựng pháp lý ngay trong dữ liệu** |
| `event` *(mốc)* | `issue` · `amend` · `suspend` · `current` |
| `status` *(điều khoản)* | `active` · `partial` · `warn` |
| `legal_status` *(văn bản)* | `active` · `partial` · `expired` |
| `source` | `state` · `internal` |

## 5. Bốn điều rút ra

**① Không có bảng cây mục lục chung.** Không endpoint nào kiểu `/documents/{id}/sections`. Không có `depth` hay `parent_id`. Cấp bậc thể hiện qua `path` và `kind`, không qua quan hệ cha–con.

**② Điều khoản **có** hàng phiên bản với khoảng `từ ngày – đến ngày`.** `version_id` + `effective_from` + `effective_to` nằm trên chính `provision`, và server lọc theo `as_of`.

> Bản 2 và 3 của tài liệu này nói **ngược lại** — rằng không có hàng phiên bản, chỉ có mốc. **Sai.** Nguyên nhân: tôi chỉ tìm thấy `effective_from` trong đối tượng trích dẫn rồi kết luận vội là không có chỗ khác, trong khi nó nằm trên `provision` ở một hàm tôi chưa đọc tới. Kết luận *"không có"* từ việc *"chưa tìm thấy"* — lỗi phương pháp.

**③ Có thêm loại sự kiện `current`** ở lớp lịch sử — con trỏ *"bản nào đang dùng"*:

```
issue    ← ban hành gốc (TT 39/2016)
amend    ← sửa bởi TT 06/2023
suspend  ← ngưng bởi TT 10/2023
current  ← ĐÁNH DẤU bản hiện hành
```

**④ Không có `revoked` ở cấp điều khoản.** "Bãi bỏ" xử lý ở cấp văn bản. Và `warn` = *"Cần rà soát"* là trạng thái **của điều khoản** — cờ tuân thủ nằm ngay ở cấp khoản.

## 6. Đồ thị chỉ góp ứng viên

Mỗi nguồn trong câu trả lời mang `origin: 'vector' | 'graph'` và `hop`. Đồ thị **ngang hàng với vector** trong việc tìm ứng viên. Khoảng hiệu lực và trạng thái đến từ dữ liệu điều khoản. **Đồ thị không phải nguồn sự thật.**

## 7. Phần lõi không có AI

| Thành phần | Có AI? |
|---|:-:|
| Điều khoản + mốc | ❌ |
| Lọc theo ngày | ❌ một câu SQL |
| Trạng thái | ❌ một cột |
| Đồ thị | ❌ |
| Đối chiếu nội bộ ↔ nhà nước *(mức chắc chắn)* | ❌ một câu JOIN |
| **Đọc văn bản mới → sinh cập nhật** | ✅ **chỗ duy nhất** |
| Diễn đạt câu trả lời | ✅ |

"Trợ lý pháp chế AI" thực chất là **hệ quản lý phiên bản có một bước AI ở đầu vào**.

## 8. Chưa biết

Prompt và schema của `agent_extract` · `CMA` là gì · ai quyết định `needs_review` · `current` do agent đặt hay tự tính · **vì sao hai bước cũ bị bỏ** · bao nhiêu dữ liệu là tự động.

Bundle có chuỗi *"(Nội dung mẫu hybrid — BE chưa trả provision cho văn bản này.)"* → **chính họ cũng chưa phủ hết dữ liệu.**

---
---

# PHẦN III — ĐỀ XUẤT CHO eDIP

## 9. Hai cấp phiên bản — làm cấp A trước

| Cấp | Ví dụ | Cần đánh số? | Bảng mới |
|---|---|:-:|:-:|
| **A — Tài liệu** | *Quy chế lao động 2024* → *2026* | ❌ | **0** |
| **B — Điều khoản** | *Điều 8 khoản 9* qua ba mốc | ✅ | **2** |

Cấp A chạy cho **mọi** tài liệu, kể cả PDF scan, và trả lời được *"quy định nội bộ hiện tại là bản nào"*. Chỉ cần 5 cột:

```
series_id · effective_from · effective_to · doc_status · doc_scope
```

**Silaw không có cấp A rõ rệt** — đây là chỗ eDIP nên khác, vì kho hiện tại toàn tài liệu không phải văn bản luật.

## 10. Cấp B — 2 bảng

Bảng chính là **`provisions`**: mỗi hàng là **một phiên bản của một điều khoản**, có khoảng hiệu lực riêng. Đây là bảng mà truy vấn as-of chạy trên.

```
provisions
  doc_code           "39/2016/TT-NHNN"  ┐ ĐỊA CHỈ LOGIC
  path               "8.9"              ┘
  version_id                            ← phiên bản thứ mấy
  kind               dieu | khoan | diem | section
  number, title
  text                                  ← nội dung của bản này
  effective_from     01/09/2023         ┐ KHOẢNG HIỆU LỰC
  effective_to       NULL               ┘ NULL = còn hiệu lực
  status             active | suspended | expired
  source_doc         "06/2023/TT-NHNN"  ← văn bản tạo ra bản này

  UNIQUE (doc_code, path, version_id)
  INDEX (effective_from, effective_to)

clause_milestones                       ← lịch sử để hiển thị
  doc_code, path                        → cùng địa chỉ với provisions
  event              issue | amend | suspend | current
  source_doc, date, effective_date
  note

embedding_chunks
  + provision_id     ← nullable. Bản lề của lọc theo ngày
```

**Hàng là bất biến.** Sửa đổi = đóng khoảng hàng cũ (`effective_to = ngày mới`) + chèn hàng mới. Không `UPDATE` nội dung.

Truy vấn as-of thành một vị từ:

```
effective_from <= $asOf  AND  (effective_to IS NULL OR $asOf < effective_to)
```

> **`UNIQUE (doc_code, path, version_id)` là thứ giữ mô hình đúng.** Thiếu nó thì một phiên bản có thể tồn tại hai hàng, và câu trả lời as-of trả về hai nội dung khác nhau cho cùng một ngày — lỗi âm thầm.

**Hai bảng tôi từng đề xuất mà thấy dư:**

| Bảng | Vì sao không cần |
|---|---|
| Quan hệ văn bản | **Mỗi hàng `provisions` đã mang `source_doc`** — đủ để chiếu ra cạnh đồ thị *"TT 06 sửa TT 39"* |
| Cây mục lục | Silaw không có `depth`/`parent_id`. Cấp bậc nằm trong `path` và `kind` |

**Bảng chỉ cần khi làm thêm:** `doc_references` *(cho đối chiếu tuân thủ)* · `legal_documents` *(cho văn bản chưa nạp file)*

**Có thể bỏ `clause_milestones` không?** Được, nếu chấp nhận không có màn "lịch sử thay đổi" — vì lịch sử suy được từ chính các hàng `provisions` của cùng `(doc_code, path)`. Silaw có cả hai, nhưng bảng mốc có thể chỉ là **view** chứ không phải bảng thật. Bằng chứng phía client không phân biệt được.

## 11. Ba trạng thái phải phân biệt

| Trạng thái | Tồn tại? | Áp dụng? | Trả lời |
|---|:-:|:-:|---|
| Còn hiệu lực | ✅ | ✅ | Đưa nội dung |
| **Bị ngưng** | ✅ | ❌ | *"Đang bị ngưng"* — **không** quay về bản cũ |
| Hết hiệu lực | ❌ | ❌ | *"Đã hết hiệu lực"* + bản thay thế |

Ca giữa dễ sai nhất và phổ biến nhất trong thực tế ngân hàng.

**Một điều khoản, ba văn bản:**

| Văn bản | Vai trò | Lưu ở |
|---|---|---|
| TT 39/2016 | **Chứa** nó | `code` |
| TT 06/2023 | **Thêm** nó | mốc `amend` |
| TT 10/2023 | **Ngưng** nó | mốc `suspend` |

## 12. Hai hướng kỹ thuật — phải chọn bằng đo

| | **A — Agent** *(Silaw dùng)* | **B — Luật + kiểm** |
|---|---|---|
| Lấy `path` | LLM đọc, tự sinh | Ngăn xếp + bảng regex |
| Phát hiện thay đổi | Cùng agent | Đọc cây văn bản sửa đổi |
| Kiểm đúng/sai | ❌ chỉ nhờ người | ✅ **5 phép kiểm cơ học** |
| Công sức | Ít code, nhiều prompt | Nhiều code, ít prompt |
| Chi phí chạy | Token mỗi tài liệu | Gần miễn phí |
| Văn phong lạ | Tốt | Kém |

> ⚠️ **Hướng B chính là hai bước Silaw đã bỏ.** Không rõ vì thất bại hay chỉ gộp cho gọn. Tín hiệu đáng cân.

**Cách quyết:** lấy 20–30 thông tư sửa đổi thật, chạy cả hai, **đo tỷ lệ đúng**. Nửa ngày, thay thế toàn bộ suy đoán.

## 13. Lấy `path` — hướng B chi tiết

Hai kiểu đánh số:

| Kiểu | Ví dụ | Đặc điểm |
|---|---|---|
| Tuyệt đối | `1.2.a` | Tự mang cấp bậc. **Dễ nhất** |
| Theo ngữ cảnh | `Điều 8` → `9.` → `a)` | Phải suy từ vị trí. Pháp quy VN thuộc kiểu này |

**Thuật toán: một ngăn xếp.**

```
Điều 8. Những nhu cầu vốn không được cho vay
Tổ chức tín dụng không được cho vay đối với các nhu cầu vốn:
1. Để thực hiện các hoạt động đầu tư...
2. Để thanh toán các chi phí...
a) Chi phí liên quan đến...
3. Để trả nợ khoản cấp tín dụng...
```

| Dòng | Nhận là | Ngăn xếp | `path` |
|---|---|---|---|
| `Điều 8.` | cấp 1 | `[8]` | `8` |
| `Tổ chức tín dụng...` | **không phải marker** | `[8]` | *thân của* `8` |
| `1.` | cấp 2 | `[8,1]` | `8.1` |
| `2.` | cấp 2 | `[8,2]` | `8.2` |
| `a)` | cấp 3 | `[8,2,a]` | `8.2.a` |
| `3.` | cấp 2 → **bỏ cấp 3** | `[8,3]` | `8.3` |

Luật nhận dạng chỉ là một bảng nhỏ — đổi loại tài liệu thì đổi bảng, thuật toán không đổi:

```
cấp 1:  ^Điều\s+(\d+)\.       cấp 2:  ^(\d+)\.\s       cấp 3:  ^([a-zđ])\)\s
```

**Bẫy dễ mất nhất:** dòng `Tổ chức tín dụng không được cho vay...` không phải marker nên dễ bị bỏ. Thiếu nó thì `1. Để thực hiện đầu tư...` **mất nghĩa hoàn toàn**. Dòng không phải marker luôn gán vào **mục đang mở**.

**Ba phép kiểm bằng máy** — thứ hướng A không có:

| Kiểm | Bắt được |
|---|---|
| Số tăng liên tục trong cùng cha | `1,2,3,5` → OCR mất số 4 |
| Không nhảy cấp | `Điều 8` → thẳng `a)` |
| Ghép text các mục ≈ text gốc | Đoạn bị nuốt |

## 14. Phát hiện thay đổi — hướng B chi tiết

> **Mục lục của văn bản sửa đổi *chính là* danh sách lệnh.** Nên mục 13 đã làm gần hết việc — dùng lại y nguyên bộ tách.

```
Điều 1. Sửa đổi, bổ sung một số điều của Thông tư số 39/2016/TT-NHNN
1. Bổ sung khoản 8, khoản 9, khoản 10 vào Điều 8 như sau:
   "8. Để gửi tiền.
    9. Để thanh toán tiền góp vốn...
    10. Để bù đắp vốn..."
Điều 2. Hiệu lực thi hành
Thông tư này có hiệu lực thi hành từ ngày 01 tháng 9 năm 2023.
```

Đọc mục `1.1` như một câu lệnh:

| Cần tìm | Tìm ở đâu | Ra |
|---|---|---|
| Văn bản đích | Tiêu đề `Điều 1` | `39/2016/TT-NHNN` |
| Thao tác | Động từ đầu câu | *Bổ sung* → `add` |
| Nhắm vào đâu | `khoản 8, 9, 10 vào Điều 8` | `8.8`, `8.9`, `8.10` |
| Nội dung mới | **Trong ngoặc kép**, tách theo số đầu dòng | `"8. …"` → `8.8` |
| Ngày hiệu lực | `Điều 2` | `01/09/2023` |

**Ngoặc kép là mỏ neo đáng tin nhất** — quy ước soạn thảo VN. Nó còn cho phép kiểm miễn phí: nội dung phải **mở đầu bằng chính số khoản**.

**Năm phép kiểm:**

| Kiểm | Bắt được |
|---|---|
| `replace` → khoản đích **phải tồn tại** | Sai số điều/khoản |
| `add` → khoản đích **phải chưa tồn tại** | Nhầm thao tác |
| Nội dung mở đầu bằng số khớp đích | Lệch ghép |
| Số lệnh = số mục con của `Điều 1` | Bỏ sót |
| **Sau khi áp**: `Điều 8` có khoản `1..10` liên tục | Áp sai chỗ |

Phép cuối hay nhất: kiểm **sau khi** áp, bắt kết quả vô lý mà từng lệnh riêng lẻ trông vẫn hợp lệ.

**Lưu mốc, không chỉ lưu kết quả** *(áp dụng cho cả hai hướng)*. Vì hai chuyện xảy ra thật: văn bản đến **không đúng thứ tự**, và **phát hiện đọc sai sau ba tháng**. Có nhật ký thì sắp lại theo ngày hiệu lực và dựng lại — giống migration của database.

**Năm ca sẽ vấp:**

| Ca | Xử lý |
|---|---|
| OCR mất dấu ngoặc kép | Đẩy duyệt |
| Một thông tư sửa **nhiều** thông tư | Đọc đích theo **từng Điều** |
| Sửa cấp câu chữ | Tạo bản mới của **cả khoản**, không lưu diff |
| *"Bãi bỏ các Điều 5, 6, 7"* | Một câu sinh **nhiều** mốc |
| Văn bản đích chưa có trong kho | Mốc **chờ**, tự áp khi nạp văn bản kia |

## 15. AI nằm ở đâu

### 15.1 Bốn giai đoạn

| Giai đoạn | AI |
|---|---|
| **Lúc hỏi** — bóc ngày từ câu chữ | ✅ xem 15.2 |
| **Lúc nạp** — đọc văn bản mới thành lệnh | ✅ |
| Lúc kiểm lệnh | Hướng B: máy kiểm · Hướng A: người duyệt |
| Áp lệnh · chọn bản đúng ngày | ❌ thuần database |
| Lúc trả lời | Nhận nội dung **đã đúng ngày**, chỉ diễn đạt |

AI được đưa kèm một dòng lai lịch lấy thẳng từ bảng:

> *Điều 8 khoản 9, TT 39/2016 — bổ sung bởi TT 06/2023, đang bị ngưng bởi TT 10/2023 từ 01/09/2023*

Nên **AI không bao giờ phải tự hiểu "văn bản mới chỉ là một mẩu"**. Câu trả lời đúng cho ca đầu bài:

> *"Khoản 9 Điều 8 TT 39/2016 được TT 06/2023 bổ sung, nhưng đang bị TT 10/2023 ngưng hiệu lực từ 01/09/2023. Nội dung khoản này không áp dụng tại thời điểm bạn hỏi."*

### 15.2 Hỏi theo ngày bằng câu chữ tự nhiên

**Silaw không làm phần này.** Request của họ là `{ content, as_of, compare_naive }` — `as_of` là **field riêng**, lấy từ một ô chọn ngày trên UI. Người dùng gõ *"tháng 3/2024 quy định thế nào"* thì câu đó **không** ảnh hưởng tới ngày được dùng.

Đó là **bẫy im lặng**: người dùng hỏi một ngày, hệ thống trả lời theo ngày khác, và câu trả lời **trông hoàn toàn đúng**.

eDIP sẽ làm khác: **dùng LLM bóc ngày từ câu hỏi.**

**Đầu vào / đầu ra:**

```
vào:  câu hỏi + ngày hôm nay + ngày đang chọn trên UI
ra:   { asOf: "2024-03-01" | null,
        phrase: "tháng 3/2024",      ← đoạn chữ đã nhận ra
        needsLookup: false }
```

**Hành vi:**

```
Mặc định            →  asOf = hôm nay  (bản mới nhất)
Câu hỏi có ngày     →  dùng ngày đó ngay, không hỏi lại
Câu hỏi không ngày  →  giữ mặc định
```

Không có bước xác nhận. Người dùng gõ *"tháng 3/2024 quy định thế nào"* là nhận câu trả lời theo 03/2024 luôn.

**Bốn quy tắc bắt buộc:**

| Quy tắc | Vì sao |
|---|---|
| Không có ngày trong câu → trả `null` | **Không được bịa.** `null` nghĩa là dùng mặc định |
| **Ngày đã dùng luôn hiện trên câu trả lời** | Chặn duy nhất còn lại. LLM bóc sai thì người dùng thấy ngay |
| Kiểm hợp lệ trước khi dùng | Ngày phải có thật, không ở tương lai xa, nằm trong khoảng dữ liệu kho có |
| Bỏ qua số hiệu văn bản | `39/2016` trong *"Thông tư 39/2016"* **không phải** ngày |

Quy tắc thứ hai thay thế bước xác nhận: không cần thêm một cú bấm, nhưng nếu LLM đọc *"Thông tư 39/2016"* thành năm 2016 thì nhãn *"Hiệu lực tại 31/12/2016"* hiện ngay trên câu trả lời — người dùng nhận ra và hỏi lại.

**Ô chọn ngày** chỉ cần ở màn **xem nội dung văn bản** (duyệt văn bản tại một thời điểm), không cần ở màn hỏi đáp.

**Ba mức khó của diễn đạt:**

| Người dùng gõ | Xử lý |
|---|---|
| `01/03/2024` · `tháng 3/2024` · `năm 2022` · `hiện nay` | LLM trả ngày ngay |
| *"trước khi TT 06 có hiệu lực"* | LLM trả `needsLookup: true` + tên văn bản → **tra DB** lấy ngày hiệu lực, trừ đi một ngày |
| *"lúc ký hợp đồng này"* | Cần ngữ cảnh tài liệu khác. Trả `null`, rơi về ô chọn |

Mức hai đáng làm vì nó là câu hỏi rất tự nhiên của pháp chế, và **hai bước đều xác định được**: LLM chỉ nhận diện tên văn bản, còn ngày thì lấy từ bảng.

**Chi phí:** một lượt gọi LLM cho mỗi câu hỏi. Nếu muốn giảm, chỉ gọi khi câu hỏi có dấu hiệu thời gian (`ngày`, `tháng`, `năm`, `trước`, `sau`, `hiện nay`, hoặc chuỗi bốn chữ số) — cắt được phần lớn câu hỏi thông thường mà không mất tính năng.

**Ca LLM sẽ sai:** đọc `39/2016` trong *"Thông tư 39/2016"* thành ngày. Chặn bằng cách yêu cầu nó bỏ qua số hiệu văn bản, và kiểm lại: ngày trả về phải nằm trong khoảng dữ liệu kho đang có.

### 15.3 Vì sao không dùng ô chọn ngày như Silaw

Silaw **có** ô chọn ngày — một dải công cụ trên ô nhập tin nhắn:

```
[icon] Áp dụng văn bản tại   [📅 Hôm nay ▾]   ∙   So sánh AI thông thường [toggle]
```

Bấm chip mở popover lịch, dưới lịch có dòng *"Chỉ dùng điều khoản còn hiệu lực tại ngày này"*. Hai chế độ: `asOfMode = 'today' | 'custom'`.

Nó khó thấy vì ba lý do nằm trong code: nhãn `hidden sm:inline` *(ẩn trên màn hình nhỏ)*, chip ở chế độ `ghost` nền nhạt chữ nhỏ *(trông như nhãn trạng thái)*, và mặc định hiện chữ `Hôm nay` *(không gợi ý là đổi được)*.

**Bốn điểm yếu của cách đó:**

| Điểm yếu | Bằng chứng |
|---|---|
| **Ngày dính lại qua nhiều câu hỏi** | `asOfMode`/`asOfDate` là state của component; mỗi câu gửi giá trị hiện tại. Đặt 01/03/2024 rồi hỏi năm câu → cả năm dùng ngày đó |
| **Phải vá bằng `sessionStorage`** | `sessionStorage.setItem('silaw_asof_' + assistant_message_id, t)` — client tự nhớ ngày của từng câu trả lời, tức **API không mang thông tin đó** |
| Chặn cứng mốc dưới 2016 | `disabled: { before: new Date('2016-01-01') }` — ràng buộc dữ liệu nhét vào UI |
| **Không hỏi được về tương lai** | Có mốc trên. Câu *"từ 01/01/2027 quy định thế nào"* — thông tư đã ban hành chưa hiệu lực — **không đặt được**, mà đó là câu pháp chế hay hỏi nhất khi có văn bản mới |

Điểm đầu là **lỗi đúng/sai**, không phải bất tiện: trả lời theo quy định 2024 cho một câu hỏi về hiện tại là câu trả lời **sai mà trông đúng**.

**So sánh hai cách:**

| | Silaw — ô chọn | eDIP — bóc từ câu hỏi |
|---|---|---|
| Ngày thuộc về | Phiên | **Câu hỏi** — độc lập từng câu |
| Ghi lại ở đâu | Chip nhỏ + `sessionStorage` | **Trong chính câu chữ** |
| Đọc lại lịch sử chat | Phải tin `sessionStorage` còn đó | Đọc câu hỏi là biết |
| Hỏi về tương lai | ❌ bị UI chặn | ✅ |
| *"trước khi TT 06 có hiệu lực"* | ❌ | ✅ tra DB lấy ngày |
| Chi phí | 0 | Một lượt LLM khi câu hỏi có dấu hiệu thời gian |

**Giữ picker ở đâu:** chỉ ở **màn xem nội dung văn bản** — nơi người dùng đang *duyệt* văn bản tại một thời điểm, không có câu hỏi nào để bóc ngày ra. Màn hỏi đáp không cần picker.

> **Điều sẽ đảo ngược khuyến nghị này:** nếu phần lớn việc dùng thật là **rà soát hợp đồng cũ** — tức đa số câu hỏi đều về một ngày quá khứ — thì picker nên là chính, vì đặt một lần rồi hỏi hàng loạt tiện hơn gõ ngày vào từng câu. Tỉ lệ đó chỉ biết được sau khi có người dùng thật, và là một lý do nữa để dừng ở GĐ 1 rồi dùng một tuần.

---
---

# PHẦN IV — CHI TIẾT KỸ THUẬT

## 16. Ảnh hưởng tới chunking

Ranh giới thôi do máy đoán: với văn bản pháp quy, hết khoản 8 là hết khoản 8. **1 điều khoản = 1 chunk.**

| Ca | Xử lý | eDIP có sẵn |
|---|---|:-:|
| Khoản **quá dài** | Cắt nhỏ, nhiều chunk cùng trỏ một khoản | ✅ `DOCUMENT_STRUCTURE` |
| Khoản **quá ngắn** (*"3. Không quá 30 ngày."*) | Nhúng khoản, trả về **cả Điều** | ✅ `PARENT_CHILD` |

**Lợi ích lớn nhất — cập nhật từng phần:**

| Sửa 1 khoản trong thông tư 200 trang | |
|---|---|
| Cắt theo ký tự | Nhúng lại **cả tài liệu** (ranh giới trôi) |
| Cắt theo điều khoản | Nhúng lại **1 khoản** |

**Chiến lược nào dùng:**

| | Với văn bản pháp quy |
|---|---|
| Cắt theo cấu trúc | ✅ nền tảng |
| Cha–con | ✅ cần |
| Cắt theo ký tự | ⚠️ đường lùi |
| **Cắt theo ngữ nghĩa** | ❌ **không dùng** |

Chỗ cuối hơi ngược: chiến lược "thông minh" nhất lại **sai**, vì ranh giới đúng là ranh giới **pháp lý** — hai khoản cùng chủ đề vẫn phải riêng, vì bị sửa/ngưng **độc lập**.

## 17. Tài liệu không có mục lục

> **Quản lý phiên bản cần một địa chỉ ổn định.** *"Điều 8 khoản 9"* ổn định. *"Chunk thứ 7"* không — đổi cách cắt là thành chunk thứ 8.

| Loại | Xử lý |
|---|---|
| Số tuyệt đối `1.2.a` | Dễ nhất |
| Số theo ngữ cảnh | Ngăn xếp hoặc agent |
| **Không đánh số** | Cả tài liệu = **một mục** |
| Trang bìa, trang ký, mục lục | **Không vào tầng điều khoản** |

**Phần lớn tài liệu không cần tầng này.** Hợp đồng và báo cáo không bị thông tư sửa. Nên tầng phiên bản là **tuỳ chọn theo từng tài liệu** — tài liệu không tham gia hoạt động y như hiện tại.

**Khi nào vào nhánh này:** khi người upload đánh dấu `doc_scope = state | internal`. **Không** tự đoán theo hình dạng chữ — báo cáo cũng có `1.`, `2.`, `3.`, mà hình dạng chữ không nói lên mục đích.

## 18. Bảng, phụ lục và ảnh — vướng ở tầng trích xuất

Phần này tôi đã nói sai hai lần, nên viết lại theo code thật.

### 18.1 Vì sao nó quan trọng

Trong văn bản pháp quy VN, **phụ lục và biểu mẫu bị thay thế rất thường xuyên** — có khi nhiều hơn cả sửa điều khoản:

> *"Thay thế Phụ lục 01 ban hành kèm theo Thông tư số 39/2016/TT-NHNN"*

### 18.2 Vướng thật: đầu ra trích xuất là **một chuỗi phẳng**

```ts
ExtractionResult { text: string, textSource, warning? }
```

Bên trong pipeline **có** cấu trúc, nhưng bị **ném đi** khi trả về:

| Bên trong có | Ra ngoài |
|---|:-:|
| `PageText { blocks[], tables[], tableCoverage }` | ❌ mất |
| `TableRegion { left, right, top, bottom, blockIndex }` — toạ độ thật | ❌ mất |
| `SectionedText { sections[], imagesBySection[][] }` | ❌ mất |

Nên **không thể gắn địa chỉ cho bảng/ảnh sau khi trích xuất** — thông tin vị trí đã không còn. Muốn gắn thì phải **sửa `ExtractionResult`**, tức đổi ở tầng nền.

### 18.3 Ba chặn cứng đang có

| Hằng số | Giá trị | Nghĩa |
|---|:-:|---|
| `MAX_VISION_PAGES` | **5** | Thông tư scan 50 trang → **chỉ 5 trang đầu được đọc** |
| `MIN_CHARS_PER_PAGE` | 100 | Dưới ngưỡng → coi là ảnh, đưa vào vision |
| `TABULAR_PAGE_COVERAGE` | 0.5 | >50% dòng trong bảng → dùng bộ tách bảng riêng |

Chặn 5 trang là vấn đề lớn với văn bản pháp quy dài, **và nó tồn tại độc lập với tính năng hiệu lực**.

### 18.4 Vấn đề sâu nhất: nội dung vision **không phải nguyên văn**

`renderReading({ transcription, description })` — vision trả về **phiên âm + mô tả**, nối cả hai vào text. `description` là **văn bản do model viết**.

Gắn địa chỉ `PL.01` cho nội dung đó nghĩa là **version hoá văn bản do AI viết** rồi trích dẫn như văn bản pháp quy. Với pháp chế ngân hàng, đó là vấn đề về **tính xác thực**, không phải kỹ thuật.

### 18.5 Vậy xử lý thế nào — chia theo **nguồn nội dung**

| Nguồn | `textSource` | Gắn địa chỉ pháp lý? |
|---|---|:-:|
| Text thật từ PDF | `pdf_text` | ✅ nguyên văn |
| Bảng tách bằng `pdf-tables` | `pdf_text` | ✅ vẫn text thật, có toạ độ |
| DOCX / XLSX / PPTX | `docx`/`xlsx`/`pptx` | ✅ nguyên văn |
| **Trang hoặc ảnh qua vision** | `vision` | ⚠️ **có, nhưng phải đánh dấu** |

Với dòng cuối: vẫn cho vào tầng điều khoản (không thì mất luôn phụ lục scan), nhưng mốc ghi rõ nguồn là `vision`, khi trả lời hiện cảnh báo *"nội dung do đọc ảnh, không phải nguyên văn"*, và **bắt buộc người duyệt**. eDIP đã có cột `textSource` — chỉ cần đưa xuống tới cấp mốc.

### 18.6 Ca khó: sửa **một ô** trong bảng

| Cách | Vấn đề |
|---|---|
| Địa chỉ tới từng ô `PL.01.R3.C2` | **Không ổn định** — thêm một dòng là mọi số dòng sau lệch |
| ✅ **Thay cả bảng** | Bảng vài chục dòng, lưu lại là rẻ. `PL.01` ổn định vĩnh viễn |

### 18.7 Quyết định: **hoãn sang vòng sau**

| | Làm ngay | Hoãn |
|---|---|---|
| Thêm giờ | **+16–23h** | 0 |
| Phải sửa | `ExtractionResult`, `MAX_VISION_PAGES`, lưu ảnh cắt | không |
| Mất gì | — | Phụ lục scan ở nhánh thường — **vẫn tìm được**, chỉ không có lịch sử hiệu lực |

**Khuyến nghị hoãn.** Phần văn xuôi (Điều/khoản/điểm) là phần bị hỏi nhiều nhất, và làm nó trước cho ra tính năng đúng mà không phải chạm vào tầng trích xuất.

## 19. Đồ thị — chỉ cần cho phân tích tác động

| | Đồ thị | Bảng điều khoản + mốc |
|---|---|---|
| Biết | *"TT 06 sửa TT 39"* — quan hệ **giữa văn bản** | *"khoản 8.9 đang bị ngưng"* — trạng thái **từng khoản** |
| Dùng để | Tìm và hiển thị | **Trả lời** |

**Đồ thị không biết cái nào mới nhất.** Nếu bảng điều khoản đã ghi *"bị ngưng bởi TT 10/2023"* thì trả lời **không cần đồ thị** — đọc một hàng là xong.

Đồ thị chỉ cần cho hai việc: **phân tích tác động ngược** (*"TT 39 đổi thì quy chế nội bộ nào bị ảnh hưởng"*) và **hiển thị sơ đồ**. Nên nó **hoãn được**, gộp vào lúc làm phần đối chiếu.

---
---

# PHẦN V — TRIỂN KHAI

## 20. Sẽ sửa gì

**Database — 2 bảng, 6 cột**

```
+ provisions         (doc_code, path, version_id, kind, text,
                      effective_from, effective_to, status, source_doc)
                     UNIQUE(doc_code, path, version_id)
+ clause_milestones  (doc_code, path, event, source_doc, date)  ← có thể là view
~ documents          + series_id, effective_from/to, doc_status, doc_scope
~ embedding_chunks   + provision_id
```

Migration **viết tay** — `migrate dev` sẽ đòi drop `search_tsv`.

**Ingest — thêm 1 bước**

```
trích text → [MỚI] tách điều khoản → chunking → nhúng
```

Văn bản sửa đổi đi thêm nhánh: đọc mốc → kiểm → người duyệt → áp.

**Chunking — sửa 2 chiến lược đã có**, không viết mới. `DOCUMENT_STRUCTURE` đọc ranh giới từ bảng điều khoản; `PARENT_CHILD` đọc cha–con từ đó.

**Tìm kiếm — 5 chỗ**

`search-options.ts` thêm `asOf` · 2 câu raw SQL trong `vector-store.service.ts` thêm điều kiện ngày · `search.service.ts` và `ask.service.ts` truyền `asOf` xuống.

**Bóc ngày từ câu hỏi** — một bước LLM nhỏ trước khi tìm kiếm, trả `{ asOf, phrase, needsLookup }`. Mặc định hôm nay; câu hỏi có ngày thì dùng ngày đó ngay.

**UI** — **ngày as-of hiện trên mọi câu trả lời** · ô chọn ngày ở màn xem văn bản · trích dẫn hiện `Điều 8 khoản 9` · màn duyệt lệnh · timeline điều khoản.

**Không đụng** — đăng nhập · phân quyền · audit · token · storage · vision · phân loại · job queue · **33 tài liệu hiện có**.

## 21. Bốn bẫy đã biết trước

1. **Điều kiện `provision_id IS NULL` trong câu lọc.** Thiếu nó thì **toàn bộ tài liệu cũ biến mất khỏi kết quả tìm kiếm** — không lỗi, không log, chỉ là không còn ra.
2. **Đánh số lại tham số** trong SQL viết tay — đúng loại lỗi đã từng gặp trong dự án.
3. **Ngày as-of phải hiện trên câu trả lời, mọi lúc.** Không có nó thì một lần LLM bóc sai ngày cho ra câu trả lời **trông đúng nhưng sai câu hỏi**, và không ai phát hiện. Đây là chặn duy nhất cho bước bóc ngày.
4. **Chunk của văn bản sửa đổi phải loại khỏi truy hồi mặc định** — nếu không, AI trả lời bằng câu lệnh *"sửa khoản 8 như sau"* thay vì bằng quy định.

## 22. Lộ trình

| GĐ | Nội dung | Giờ |
|:-:|---|:-:|
| 0 | Kiểm **"văn bản hợp nhất"** của NHNN + **đo hai hướng** trên 20–30 thông tư | 8 *(không code)* |
| 1 | Phiên bản **cấp tài liệu** — 5 cột | **6–8** |
| 2 | Bộ lấy `path` *(theo kết quả GĐ 0)* | **10–16** |
| 3 | 2 bảng + hỏi theo ngày *(ô chọn)* | **8–10** |
| 3b | **Bóc ngày từ câu hỏi bằng LLM** + hiện ngày as-of trên câu trả lời | **4–6** |
| 4 | Đọc mốc thay đổi + màn duyệt | **12–16** |
| 5 | Quét đối chiếu **+ đồ thị** *(gộp)* | **14–18** |
| — | *(Hoãn)* Bảng, phụ lục, ảnh scan | *+16–23* |
| | **Tổng** | **54–74h** ≈ 7–9 ngày |

**Ba điểm dừng an toàn:**

| Dừng sau | Có gì |
|---|---|
| **GĐ 1** *(8h)* | Phiên bản tài liệu cho **cả kho hiện tại**. Không cần bộ đọc, không cần AI |
| **GĐ 4** *(~50h)* | Hỏi theo ngày ở cấp điều khoản, đầy đủ. Chưa cần đồ thị |
| **GĐ 5** *(~68h)* | Đủ như Silaw |

**Đề xuất: dừng ở GĐ 1 và dùng thật một tuần.** Nó kiểm chứng giả định lớn nhất — người dùng có thật cần trục thời gian không — với 8 giờ thay vì 74.

**Hai việc làm trước tiên:**

① **Kiểm "văn bản hợp nhất" của NHNN.** Bản đã ghép sẵn mọi sửa đổi. Nếu dùng được thì **bỏ hẳn GĐ 4** (12–16h). Mất nửa ngày, tiết kiệm hai ngày.

② **Đo hai hướng trên dữ liệu thật.** Cách duy nhất chọn hướng bằng số của chính mình.

## 23. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|:-:|---|
| **Thu thập dữ liệu** — chưa có kho pháp quy | **Cao nhất** | Tốn công hơn toàn bộ phần code |
| Đọc mốc sai | Cao | Đo trước khi tin. Người duyệt bắt buộc ở cả hai hướng |
| Trách nhiệm pháp lý | Cao | Giữ hành vi từ chối khi thiếu căn cứ. **Luôn hiện ngày as-of** |
| Chọn sai hướng | Vừa | GĐ 0 giải quyết bằng số |
| Nội dung vision không nguyên văn | Vừa | Đánh dấu `textSource`, bắt duyệt |

## 24. Câu chưa trả lời được

1. **NHNN có công bố văn bản hợp nhất dạng máy đọc được không?** → quyết định có bỏ được GĐ 4.
2. **Tỷ lệ đọc đúng của mỗi hướng trên corpus thật?** → quyết định chọn hướng A hay B.
3. **Silaw bỏ hai bước xác định vì thất bại hay vì gộp cho gọn?** → câu 2 làm câu này bớt quan trọng.
4. **Người dùng cần trục thời gian, hay chỉ cần "bản mới nhất"?** → GĐ 1 trả lời với 8 giờ.
5. **`CMA` là gì?** → không đủ dữ kiện.
6. **`clause_milestones` là bảng thật hay chỉ là view suy từ `provisions`?** → quyết định cấp B cần 2 bảng hay 1. Bằng chứng phía client không phân biệt được.

---

## Phụ lục — Những chỗ bản trước nói sai

| Đã nói | Thực tế |
|---|---|
| Silaw có bảng cây mục lục với `depth`, `parent_id` | **Không có.** Địa chỉ là khoá ghép `code + path` |
| *(bản 1)* Silaw lưu hàng phiên bản `từ ngày–đến ngày` | ✅ **Đúng** — `provision` mang `version_id` + `effective_from/to` |
| *(bản 2, 3)* Không có hàng phiên bản, chỉ có mốc + cờ `current` | ❌ **Sai — tôi đã lật ngược một kết luận đúng.** Nguyên nhân: chỉ tìm thấy `effective_from` trong đối tượng trích dẫn rồi kết luận *"không có"* từ việc *"chưa tìm thấy"* |
| Trạng thái là `active/suspended/revoked` | Silaw: `active/partial/warn`; `expired` ở cấp văn bản |
| Silaw tách cấu trúc bằng luật | **Đã bỏ** — hai bước mang nhãn `legacy`, thay bằng agent |
| Cấp B cần **3 bảng** | Cần **2**, và bảng chính là `provisions` chứ không phải `clauses`+`milestones`. Bảng quan hệ là dư — mỗi hàng `provisions` đã mang `source_doc` |
| Đồ thị thuộc phần lõi | Chỉ cần cho phân tích tác động |
| Pipeline regex + 5 phép kiểm là cách Silaw làm | Đó là **đề xuất**, không phải mô tả Silaw |
| Bảng, biểu mẫu "không vào cây" | **Có địa chỉ** như điều khoản |
| *"eDIP đã có sẵn, chỉ cần gắn địa chỉ"* cho bảng/ảnh | **Sai.** `ExtractionResult` là chuỗi phẳng, cấu trúc bị ném đi. Phải sửa tầng trích xuất, +16–23h |
| eDIP "lưu cả ảnh gốc" cho từng mục | Ảnh trích ra chỉ ở **bộ nhớ**, không lưu thành asset. Chỉ tệp gốc trong storage |
