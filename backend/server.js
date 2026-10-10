import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { solveQuestionsBatch } from "./services/geminiService.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HISTORY_DIR = path.join(__dirname, "data", "history");

// Đảm bảo thư mục lưu trữ lịch sử trên máy chủ luôn tồn tại
try {
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("Không thể tạo thư mục HISTORY_DIR:", e);
}

const app = express();
const PORT = process.env.PORT || 5000;

// Cấu hình Middleware
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Route kiểm tra trạng thái hoạt động (Healthcheck)
app.get(["/", "/health", "/api/health"], (req, res) => {
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

    const result = await solveQuestionsBatch({
      questions: questions || [],
      base64Image,
      pageText,
      audioBase64,
      audioMime
    });

    const solutions = Array.isArray(result) ? result : (result.solutions || []);
    const conversationTranscript = result.conversation_transcript || solutions.conversation_transcript || solutions[0]?.conversation_transcript || "";

    return res.json({
      success: true,
      count: solutions.length,
      conversation_transcript: conversationTranscript,
      solutions,
      data: solutions
    });
  } catch (error) {
    console.error("[POST /api/solve Lỗi]", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Lỗi máy chủ nội bộ khi phân tích bài tập."
    });
  }
});

// Route nhận và lưu trữ lịch sử bài thi lên Server (lưu file .json và .txt)
app.post("/api/history", async (req, res) => {
  try {
    const session = req.body;
    if (!session || !session.id) {
      return res.status(400).json({ success: false, error: "Dữ liệu session không hợp lệ." });
    }

    const safeId = String(session.id).replace(/[^a-zA-Z0-9_-]/g, "_");
    const jsonPath = path.join(HISTORY_DIR, `${safeId}.json`);
    const txtPath = path.join(HISTORY_DIR, `${safeId}.txt`);

    // 1. Lưu file JSON đầy đủ chi tiết
    fs.writeFileSync(jsonPath, JSON.stringify(session, null, 2), "utf-8");

    // 2. Tạo và lưu file TXT rõ ràng, dễ đọc trên máy chủ
    let txtContent = `========================================================================\r\n`;
    txtContent += `BẢNG ĐÁP ÁN BÀI THI: ${session.title || "TOEIC Test"}\r\n`;
    txtContent += `Thời gian làm bài: ${session.createdAt || session.lastUpdated || new Date().toISOString()}\r\n`;
    txtContent += `Đường dẫn bài thi: ${session.url || "N/A"}\r\n`;
    txtContent += `Tổng số câu đã giải: ${session.answers?.length || 0} câu\r\n`;
    txtContent += `========================================================================\r\n\r\n`;

    if (Array.isArray(session.answers)) {
      session.answers.forEach((ans, i) => {
        txtContent += `[${i + 1}] ${ans.questionNum || `Câu ${i + 1}`}\r\n`;
        if (ans.prompt) txtContent += `Đề bài: ${ans.prompt}\r\n`;
        txtContent += `👉 ĐÁP ÁN CHỌN: ${ans.selectedAnswer || "N/A"}\r\n`;
        if (ans.confidence) txtContent += `Độ tin cậy: ${ans.confidence}%\r\n`;
        if (ans.transcript) txtContent += `Phụ đề nghe được (Transcript): ${ans.transcript}\r\n`;
        if (ans.explanation) txtContent += `💡 Giải thích: ${ans.explanation}\r\n`;
        txtContent += `------------------------------------------------------------------------\r\n\r\n`;
      });
    }

    txtContent += `Lưu trữ tự động trên Server lúc: ${new Date().toLocaleString("vi-VN")}\r\n`;
    fs.writeFileSync(txtPath, txtContent, "utf-8");

    // 3. Cập nhật file danh mục tổng quan (index)
    const indexPath = path.join(HISTORY_DIR, "index.json");
    let indexList = [];
    if (fs.existsSync(indexPath)) {
      try {
        indexList = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
      } catch (e) {
        indexList = [];
      }
    }

    const existingIdx = indexList.findIndex(item => item.id === session.id);
    const summaryItem = {
      id: session.id,
      title: session.title,
      url: session.url,
      totalQuestions: session.answers?.length || 0,
      lastUpdated: session.lastUpdated || new Date().toISOString(),
      txtFile: `${safeId}.txt`,
      jsonFile: `${safeId}.json`
    };

    if (existingIdx >= 0) {
      indexList[existingIdx] = summaryItem;
    } else {
      indexList.unshift(summaryItem);
    }

    // Giới hạn index lưu 100 bài gần nhất
    if (indexList.length > 100) indexList = indexList.slice(0, 100);
    fs.writeFileSync(indexPath, JSON.stringify(indexList, null, 2), "utf-8");

    console.log(`[POST /api/history] 📁 Đã lưu trữ bài thi [${session.title}] (${session.answers?.length || 0} câu) lên Server.`);

    return res.json({
      success: true,
      message: "Đã lưu lịch sử đáp án lên máy chủ thành công!",
      id: session.id,
      total: session.answers?.length || 0
    });
  } catch (err) {
    console.error("[POST /api/history Error]", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Route lấy danh sách toàn bộ bài thi đã lưu trên Server
app.get("/api/history", (req, res) => {
  try {
    const indexPath = path.join(HISTORY_DIR, "index.json");
    if (!fs.existsSync(indexPath)) {
      return res.json({ success: true, count: 0, history: [] });
    }
    const indexList = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    return res.json({ success: true, count: indexList.length, history: indexList });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Route tải chi tiết bài thi theo ID từ Server
app.get("/api/history/:id", (req, res) => {
  try {
    const safeId = String(req.params.id).replace(/[^a-zA-Z0-9_-]/g, "_");
    const jsonPath = path.join(HISTORY_DIR, `${safeId}.json`);
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ success: false, error: "Không tìm thấy bài thi trên server." });
    }
    const session = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    return res.json({ success: true, session });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
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
