// Test script for TOEIC AI Solver Backend & Gemini Service
import { solveQuestionsBatch } from "./services/geminiService.js";

const testMultiQuestionSet = [
  {
    id: "q_32",
    question_number: 32,
    text: "Where most likely are the speakers?",
    options: ["(A) At a hotel", "(B) At a restaurant", "(C) At an airport", "(D) At a convention center"],
    target_type: "choice"
  },
  {
    id: "q_33",
    question_number: 33,
    text: "What problem does the woman mention?",
    options: ["(A) A flight is delayed", "(B) A reservation was lost", "(C) A key is broken", "(D) A room is noisy"],
    target_type: "choice"
  },
  {
    id: "q_34",
    question_number: 34,
    text: "What does the man offer to do?",
    options: ["(A) Call a taxi", "(B) Upgrade her room", "(C) Issue a refund", "(D) Provide a complimentary breakfast"],
    target_type: "choice"
  }
];

const mockTranscript = "M: Welcome to the Grand Pacific Hotel front desk. How can I assist you? W: Good evening, I have a reservation under Miller, but the receptionist earlier said the system couldn't find my booking. M: I apologize for the inconvenience. Let me check... ah, here it is. As an apology for the delay, I would be happy to upgrade your room to an executive suite on the top floor free of charge. W: That's very kind of you, thank you!";

async function runDiagnostic() {
  console.log("====================================================");
  console.log("🧪 TOEIC AI SOLVER - DIAGNOSTIC & MULTI-QUESTION TEST");
  console.log("====================================================");

  // 1. Kiểm tra HTTP Server (Local)
  try {
    const health = await fetch("http://localhost:5000/api/health").then(r => r.json());
    console.log("✅ Local Backend (http://localhost:5000) đang chạy:", health);
  } catch (e) {
    console.log("ℹ️ Local Server (http://localhost:5000) chưa bật. Đang kiểm tra trực tiếp qua Gemini Service...");
  }

  // 2. Kiểm tra giải bộ 3 câu hỏi (Part 3/Part 4 Multi-Question Set)
  console.log(`\n🚀 Đang gửi bộ ${testMultiQuestionSet.length} câu hỏi đa phương thức tới Gemini AI...`);
  const startTime = Date.now();
  try {
    const result = await solveQuestionsBatch({
      questions: testMultiQuestionSet,
      pageText: mockTranscript
    });

    console.log(`\n✨ THÀNH CÔNG! Thời gian xử lý: ${Date.now() - startTime}ms`);
    console.log(`📊 Số câu đã giải được: ${result.solutions?.length || 0} / ${testMultiQuestionSet.length} câu.`);
    result.solutions?.forEach((sol, i) => {
      console.log(`   [Câu ${sol.question_number || i + 1}] (${sol.question_id}): ${sol.selected_value} - ${sol.explanation}`);
    });
  } catch (err) {
    console.error("❌ Lỗi kiểm thử:", err.message);
  }
}

runDiagnostic();
