# 🚀 TOEIC AI Auto Solver (Chrome Extension + Node.js Backend)

Hệ thống tối tân tự động hóa việc đọc đề thi tiếng Anh (TOEIC, Edusoft / edtoeic, Canvas, LMS, web trường...), xử lý đa phương thức (Ảnh sắc nét Full HD, Âm thanh bài nghe trực tiếp, Văn bản câu hỏi) qua **Google Gemini Flash API** và tự động click/điền đáp án chính xác 990/990 trên trình duyệt Chrome thật của bạn.

---

## 🌟 Tính Năng Mới Nổi Bật

- 🎯 **Tự Động Nhấn Nút Bắt Đầu (Auto Click Start / Start Section)**: Tự động phát hiện và nhấn nút `Start`, `Start Section`, `Start Test`, `Bắt đầu` ở mọi màn hình chào mừng, popup chuyển Part để làm bài thông suốt mà không cần bấm tay.
- 🔄 **Tự Động Next Liên Tục (Auto-Next)**: Mặc định tự động giải xong câu hiện tại và bấm `Next` sang câu tiếp theo, xuyên suốt từ Part 1 đến Part 7.
- 🖼️ **Tự Động Tăng Độ Nét Cao (Full HD 95% Quality)**: Nâng cấp chụp ảnh tab và trích xuất hình ảnh câu hỏi (Part 1 tranh ảnh, Part 7 bảng biểu / sơ đồ / hóa đơn) đạt độ phân giải cao nhất, sắc nét, không bị mờ nhòe giúp AI nhìn rõ 100% chi tiết.
- 📚 **Giải Quyết Toàn Diện Mọi Bộ Câu Hỏi (Multi-Question Sets)**: Phân nhóm và giải trọn vẹn các chùm 2, 3, 4, 5 câu hỏi cùng lúc (Part 3 hội thoại, Part 4 bài nói, Part 6 điền đoạn văn, Part 7 bài đọc).
- 🎧 **Bắt Âm Thanh Đa Phương Thức Trực Tiếp**: Bắt giữ luồng âm thanh bài nghe Part 1, 2, 3, 4 ngay khi phát trên web để AI nghe và trích xuất transcript chính xác.
- 🛡️ **Lá Chắn Chống Cảnh Báo (Anti-Warning Guard)**: Chống bẫy blur/visibilitychange khi chuyển tab hoặc mất tiêu điểm, ngăn chặn cảnh báo gian lận của hệ thống thi.

---

## 📁 Cấu Trúc Dự Án Đã Tối Ưu & Dọn Dẹp

```text
TOEIC/
├── extension/             # Chrome Extension (Manifest V3)
│   ├── manifest.json      # Khai báo quyền, background & content script
│   ├── popup.html         # Giao diện điều khiển popup hiện đại
│   ├── popup.js           # Xử lý kết nối backend và tiến trình giải bài
│   ├── content.js         # Quét DOM linh hoạt, tự nhấn Start & auto-click
│   ├── background.js      # Service worker chụp ảnh nét cao & chuyển tiếp API
│   ├── shield.js          # Lá chắn chống cảnh báo hệ thống ở Main World
│   ├── styles.css         # Giao diện thanh công cụ nổi & bảng kết quả
│   └── icon.png           # Biểu tượng extension
├── backend/               # Backend Service (Node.js + Express)
│   ├── package.json       # Dependencies: express, cors, dotenv, @google/generative-ai
│   ├── .env               # Chứa GEMINI_API_KEY và PORT=5000
│   ├── server.js          # Express API server (/api/solve, /api/health)
│   ├── test_backend.js    # Script kiểm thử chẩn đoán và giải bộ câu hỏi
│   ├── data/
│   │   └── history/       # Thư mục lưu lịch sử kết quả làm bài (.json, .txt)
│   └── services/
│       └── geminiService.js # Google Gemini Flash API đa phương thức (xoay tua model/key)
├── open_chrome_debug.bat  # Khởi động Chrome chế độ Debug Port 9222 chống ngủ 24/7
├── render.yaml            # Cấu hình triển khai Cloud Render (Miễn phí 24/7)
└── start_backend.bat      # Khởi động Backend Server Local 1-click
```

---

## 🛠️ Hướng Dẫn Sử Dụng

### Bước 1: Khởi động Backend (Tùy chọn Local hoặc dùng Cloud có sẵn)
- **Cách 1 (Khuyên dùng - Cực nhanh & Ổn định)**: Nhấp đúp vào:  
  👉 **`start_backend.bat`**  
  *(Backend sẽ chạy tại `http://localhost:5000` với cơ chế tự khởi động lại 24/24)*
- **Cách 2**: Không cần mở backend nếu muốn dùng trực tiếp Cloud Backend đã dựng sẵn:  
  `https://toeic-ai-solver.onrender.com`

### Bước 2: Cài đặt Chrome Extension (Chỉ làm 1 lần)
1. Mở Chrome, truy cập: `chrome://extensions/`
2. Bật công tắc **"Chế độ dành cho nhà phát triển" (Developer mode)** ở góc trên bên phải.
3. Bấm nút **"Tải tiện ích đã giải nén" (Load unpacked)** ở góc trên bên trái.
4. Chọn thư mục:  
   `C:\Users\Rio\Music\TOEIC\extension`  
   *(Nếu đã cài trước đó, chỉ cần bấm biểu tượng mũi tên xoay tròn 🔄 Reload để cập nhật mã mới)*

### Bước 3: Vào làm bài thi
1. Mở trang bài tập (ETS TOEIC OLPC, edtoeic, LMS trường, Canvas...).
2. Extension sẽ:
   - Tự động nhận diện và nhấn nút **`Start` / `Start Section` / `Bắt đầu`**.
   - Tự động chụp ảnh sắc nét (High Definition 95%), trích xuất câu hỏi và âm thanh bài nghe.
   - Giải chính xác từng câu hoặc toàn bộ chùm câu hỏi.
   - Tự động tick chọn đáp án đúng vào radio/menu.
   - Tự động bấm **`Next`** chuyển câu liên tục cho đến hết bài thi!

---

## ⌨️ Phím Tắt Tiện Lợi Khi Làm Bài

- **`Alt + S`**: Quét & Giải ngay câu hỏi/chùm câu hỏi hiện tại
- **`Alt + A`**: Bật / Tắt chế độ Tự Động Next
- **`Alt + N`**: Chuyển ngay sang câu tiếp theo
- **`Alt + M`**: Bật / Tắt Siêu Auto (Tự làm sạch cả khóa học)
- **`Alt + L`**: Mở bảng xem & tải lịch sử toàn bộ đáp án bài thi (.txt / .json)
- **`Alt + Z`** hoặc **`Alt + H`**: Ẩn/Hiện tàng hình thanh công cụ AI
