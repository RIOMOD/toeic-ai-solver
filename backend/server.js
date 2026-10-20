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
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const HISTORY_DIR = path.join(DATA_DIR, "history");

// Đảm bảo thư mục lưu trữ lịch sử trên máy chủ luôn tồn tại
try {
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("Không thể tạo thư mục HISTORY_DIR:", e);
}

// Hàm hỗ trợ phân loại Part TOEIC chuẩn xác
function getQuestionPartName(qNum, explicitPart) {
  if (explicitPart && String(explicitPart).trim()) {
    return String(explicitPart).trim();
  }
  const match = String(qNum || "").match(/\d+/);
  if (!match) return "Phần Chung";
  const n = parseInt(match[0], 10);
  if (n >= 1 && n <= 6) return "Part 1: Photographs";
  if (n >= 7 && n <= 31) return "Part 2: Question - Response";
  if (n >= 32 && n <= 70) return "Part 3: Conversations";
  if (n >= 71 && n <= 100) return "Part 4: Short Talks";
  if (n >= 101 && n <= 130) return "Part 5: Incomplete Sentences";
  if (n >= 131 && n <= 146) return "Part 6: Text Completion";
  if (n >= 147 && n <= 200) return "Part 7: Reading Comprehension";
  return "Phần Khác";
}

// Tạo nội dung file TXT lưu trữ chi tiết theo từng Part kèm bảng đáp án nhanh
function generateServerTxtContent(session) {
  if (!session || !session.answers || session.answers.length === 0) return "";

  const sortedAnswers = [...session.answers].sort((a, b) => {
    const numA = parseInt(String(a.questionNum || "").replace(/\D/g, ""), 10) || 0;
    const numB = parseInt(String(b.questionNum || "").replace(/\D/g, ""), 10) || 0;
    return numA - numB;
  });

  let content = `================================================================================\r\n`;
  content += `                    BẢNG ĐÁP ÁN BÀI THI TOEIC HOÀN CHỈNH\r\n`;
  content += `================================================================================\r\n`;
  content += `Tên bài thi: ${session.title || session.testName || "Bài Thi TOEIC"}\r\n`;
  content += `Thời gian bắt đầu: ${session.createdAt || "N/A"}\r\n`;
  content += `Cập nhật lần cuối: ${session.lastUpdated || new Date().toISOString()}\r\n`;
  content += `Đường dẫn bài thi: ${session.url || "N/A"}\r\n`;
  content += `Tổng số câu đã giải: ${sortedAnswers.length} câu\r\n`;
  content += `================================================================================\r\n\r\n`;

  const partsMap = new Map();
  sortedAnswers.forEach(ans => {
    const partKey = ans.part || getQuestionPartName(ans.questionNum);
    if (!partsMap.has(partKey)) {
      partsMap.set(partKey, []);
    }
    partsMap.get(partKey).push(ans);
  });

  partsMap.forEach((ansList, partTitle) => {
    content += `--------------------------------------------------------------------------------\r\n`;
    content += `=== ${partTitle.toUpperCase()} (${ansList.length} CÂU) ===\r\n`;
    content += `--------------------------------------------------------------------------------\r\n\r\n`;

    ansList.forEach((ans, i) => {
      content += `[${ans.questionNum || `Câu ${i + 1}`}]\r\n`;
      if (ans.prompt) content += `Đề bài: ${ans.prompt}\r\n`;
      content += `👉 ĐÁP ÁN CHỌN: ${ans.selectedAnswer || "N/A"}\r\n`;
      if (ans.confidence) content += `Độ tin cậy: ${ans.confidence}%\r\n`;
      if (ans.transcript) content += `🎧 Transcript (Hội thoại/Bài nghe): ${ans.transcript}\r\n`;
      if (ans.explanation) content += `💡 Giải thích: ${ans.explanation}\r\n`;
      content += `\r\n`;
    });
    content += `\r\n`;
  });

  content += `================================================================================\r\n`;
  content += `BẢNG TỔNG HỢP NHANH ĐÁP ÁN (DỄ DÒ & ĐỐI CHIẾU):\r\n`;
  content += `================================================================================\r\n`;

  let line = "";
  sortedAnswers.forEach((ans, idx) => {
    const rawNum = parseInt(String(ans.questionNum || "").replace(/\D/g, ""), 10) || (idx + 1);
    const letterMatch = (ans.selectedAnswer || "").match(/\b([A-D])\b/i);
    const ansLetter = letterMatch ? letterMatch[1].toUpperCase() : (ans.selectedAnswer || "?").substring(0, 3);
    const itemStr = `${rawNum}. ${ansLetter}`.padEnd(10, " ");
    line += itemStr;
    if ((idx + 1) % 5 === 0) {
      content += line.trimEnd() + `\r\n`;
      line = "";
    }
  });
  if (line.trim()) {
    content += line.trimEnd() + `\r\n`;
  }
  content += `================================================================================\r\n`;
  content += `Được lưu trữ tự động trên Database Server lúc: ${new Date().toLocaleString("vi-VN")}\r\n`;

  return content;
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
    const { questions, base64Image, questionImages, pageText, audioBase64, audioMime, apiKey } = req.body;

    if ((!questions || questions.length === 0) && !base64Image && !audioBase64 && !pageText && (!questionImages || questionImages.length === 0)) {
      return res.status(400).json({
        success: false,
        error: "Yêu cầu phải có danh sách câu hỏi, văn bản bài thi, ảnh chụp màn hình hoặc file âm thanh bài tập."
      });
    }

    console.log(`[POST /api/solve] Nhận yêu cầu giải: ${questions?.length || 0} câu hỏi, kèm ảnh tab: ${Boolean(base64Image)}, kèm ${questionImages?.length || 0} ảnh câu hỏi, kèm Audio: ${Boolean(audioBase64)}, kèm custom Key: ${Boolean(apiKey)}`);

    const result = await solveQuestionsBatch({
      questions: questions || [],
      base64Image,
      questionImages,
      pageText,
      audioBase64,
      audioMime,
      apiKey
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

    // 2. Tạo và lưu file TXT rõ ràng, dễ đọc trên máy chủ theo Part & bảng tổng hợp
    let txtContent = session.txtContent || generateServerTxtContent(session);
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

    console.log(`[POST /api/history] 📁 Đã lưu trữ bài thi [${session.title}] (${session.answers?.length || 0} câu) lên Server Database.`);

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

// Route lấy danh sách toàn bộ bài thi đã lưu trên Server Database
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

// Route xem/tải trực tiếp file TXT đáp án từ Server Database
app.get("/api/history/:id/txt", (req, res) => {
  try {
    const safeId = String(req.params.id).replace(/[^a-zA-Z0-9_-]/g, "_");
    const txtPath = path.join(HISTORY_DIR, `${safeId}.txt`);
    if (!fs.existsSync(txtPath)) {
      return res.status(404).send("Không tìm thấy file TXT của bài thi này trên server.");
    }
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.sendFile(txtPath);
  } catch (err) {
    return res.status(500).send(err.message);
  }
});

// Route xóa một bài thi khỏi Server Database
app.delete("/api/history/:id", (req, res) => {
  try {
    const safeId = String(req.params.id).replace(/[^a-zA-Z0-9_-]/g, "_");
    const jsonPath = path.join(HISTORY_DIR, `${safeId}.json`);
    const txtPath = path.join(HISTORY_DIR, `${safeId}.txt`);
    if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
    if (fs.existsSync(txtPath)) fs.unlinkSync(txtPath);

    const indexPath = path.join(HISTORY_DIR, "index.json");
    if (fs.existsSync(indexPath)) {
      try {
        let indexList = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        indexList = indexList.filter(item => item.id !== req.params.id && item.id !== safeId);
        fs.writeFileSync(indexPath, JSON.stringify(indexList, null, 2), "utf-8");
      } catch (e) {}
    }
    return res.json({ success: true, message: `Đã xóa bài thi ${safeId} khỏi database server.` });
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
