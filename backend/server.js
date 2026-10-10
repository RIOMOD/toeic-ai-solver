import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { solveQuestionsBatch } from "./services/geminiService.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Cấu hình Middleware
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Route kiểm tra trạng thái hoạt động (Healthcheck)
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "AI English Auto Solver Backend",
    timestamp: new Date().toISOString()
  });
});

// Route chính: Giải bài tập tiếng Anh từ Extension
app.post("/api/solve", async (req, res) => {
  try {
    const { questions, base64Image, pageText, audioBase64, audioMime } = req.body;

    if ((!questions || questions.length === 0) && !base64Image && !audioBase64 && !pageText) {
      return res.status(400).json({
        success: false,
        error: "Yêu cầu phải có danh sách câu hỏi, văn bản bài thi, ảnh chụp màn hình hoặc file âm thanh bài tập."
      });
    }


    console.log(`[POST /api/solve] Nhận yêu cầu giải: ${questions?.length || 0} câu hỏi, kèm ảnh: ${Boolean(base64Image)}, kèm Audio: ${Boolean(audioBase64)}`);

    const solutions = await solveQuestionsBatch({
      questions: questions || [],
      base64Image,
      pageText,
      audioBase64,
      audioMime
    });

    return res.json({
      success: true,
      count: solutions.length,
      solutions
    });
  } catch (error) {
    console.error("[POST /api/solve Lỗi]", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Lỗi máy chủ nội bộ khi phân tích bài tập."
    });
  }
});

// Bảo vệ chống crash cho Node.js khi chạy 24/24
process.on("uncaughtException", (err) => {
  console.error(`[${new Date().toISOString()}] [Backend Uncaught Exception]`, err);
});
process.on("unhandledRejection", (reason) => {
  console.error(`[${new Date().toISOString()}] [Backend Unhandled Rejection]`, reason);
});

// Khởi chạy server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 AI English Solver Backend đang chạy (Chế độ 24/24):`);
  console.log(`   👉 http://localhost:${PORT}`);
  console.log(`   👉 Health check: http://localhost:${PORT}/api/health`);
  console.log(`====================================================`);
});
