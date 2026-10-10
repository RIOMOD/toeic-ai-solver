# 🚀 AI English Auto Solver (Chrome Extension + Node.js Backend)

Hệ thống hoàn chỉnh gồm **Chrome Extension (Manifest V3)** và **Backend Service (Node.js/Express)** để tự động hóa việc đọc đề thi tiếng Anh từ DOM web, xử lý câu hỏi đa phương thức qua **Google Gemini Flash API** và tự động click/điền đáp án trên trình duyệt Chrome thật của bạn.

---

## 📁 Cấu Trúc Dự Án

```text
vutruAI/
├── extension/             # Chrome Extension (Manifest V3)
│   ├── manifest.json      # Khai báo quyền, background & content script
│   ├── popup.html         # Giao diện điều khiển popup hiện đại
│   ├── popup.js           # Xử lý kết nối backend và tiến trình giải bài
│   ├── content.js         # Quét DOM linh hoạt & kích hoạt auto-click
│   ├── background.js      # Service worker chụp ảnh tab & chuyển tiếp API
│   ├── styles.css         # Giao diện nút nổi & bảng kết quả
│   └── icon.png           # Biểu tượng extension
├── backend/               # Backend Service (Node.js + Express)
│   ├── package.json       # Dependencies: express, cors, dotenv, @google/generative-ai
│   ├── .env               # Chứa GEMINI_API_KEY và PORT=5000
│   ├── server.js          # Express API server (/api/solve, /api/health)
│   ├── test_backend.js    # Script kiểm thử backend API
│   └── services/
│       └── geminiService.js # Tích hợp Google Gemini Flash API đa phương thức
└── start_backend.bat      # File chạy nhanh Backend server bằng 1 click
```

---

## 🛠️ Hướng Dẫn Sử Dụng

### Bước 1: Khởi động Backend Server
Backend hiện đang chạy sẵn trên máy của bạn tại `http://localhost:5000`. Khi cần khởi động lại, bạn chỉ cần nhấp đúp vào:
👉 **[start_backend.bat](file:///c:/Users/Rio/Music/vutruAI/start_backend.bat)**  
*(Hoặc chạy lệnh: `cd backend && npm start`)*

### Bước 2: Cài đặt Chrome Extension (Làm 1 lần trong 15 giây)
1. Mở Chrome của bạn, vào: `chrome://extensions/`
2. Bật công tắc **"Chế độ dành cho nhà phát triển" (Developer mode)** ở góc trên bên phải.
3. Bấm nút **"Tải tiện ích đã giải nén" (Load unpacked)** ở góc trên bên trái.
4. Chọn thư mục:
   `C:\Users\Rio\Music\vutruAI\extension`

### Bước 3: Giải bài tập tiếng Anh trực tiếp trên trang web (TOEIC, LMS, Web trường...)
1. Mở trang bài tập của bạn (ví dụ trang `edtoeic.engdis.com`) và bấm **F5** để tải lại trang.
2. Bạn có thể giải bằng 2 cách:
   - **Cách 1**: Bấm vào nút màu xanh nổi ở góc dưới bên phải trang web: **`🤖 AI Giải Bài Này`**.
   - **Cách 2**: Bấm vào biểu tượng tiện ích **AI English Solver** trên thanh công cụ góc trên trình duyệt Chrome ➔ Bấm **`🚀 Quét & Tự Động Giải (Scan & Solve)`**.
3. AI sẽ tự động phân tích câu hỏi, chọn đáp án đúng trong menu thả xuống / trắc nghiệm và hiển thị bảng giải thích ngữ pháp tiếng Việt chi tiết!
