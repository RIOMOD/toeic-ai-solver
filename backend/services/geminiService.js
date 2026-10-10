import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("⚠️ CẢNH BÁO: Chưa cấu hình GEMINI_API_KEY trong file backend/.env!");
}

const genAI = new GoogleGenerativeAI(apiKey || "");

// Danh sách model ưu tiên siêu tốc (3.1-flash-lite và 3-flash-preview phản hồi dưới 1.5 giây, còn nguyên quota)
const CANDIDATE_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-flash-latest"
];

/**
 * Giải bài tập tiếng Anh bằng Google Gemini Flash API đa phương thức
 * @param {Object} params
 * @param {Array} params.questions - Danh sách câu hỏi [{ id, text, options, imageUrl, target_type }]
 * @param {string} [params.base64Image] - Ảnh chụp màn hình tab bài tập (nếu có)
 * @param {string} [params.pageText] - Văn bản toàn trang
 * @param {string} [params.audioBase64] - Dữ liệu âm thanh Base64 bài nghe (nếu có)
 * @param {string} [params.audioMime] - MIME type của audio (mặc định audio/mp3)
 * @returns {Promise<Array>} - Danh sách lời giải [{ question_id, selected_index, selected_value, explanation, confidence }]
 */
export async function solveQuestionsBatch({ questions, base64Image, pageText, audioBase64, audioMime }) {
  const finalQuestions = (questions && questions.length > 0) ? questions : [
    {
      id: "q_1",
      text: "Look at the picture and listen to the audio statements, then choose the correct answer (A), (B), (C), or (D)",
      options: ["(A)", "(B)", "(C)", "(D)"],
      target_type: "choice"
    }
  ];

  const prompt = `
You are an expert English test examination solver, speech transcriber, and multimodal teacher.
Analyze the provided English quiz questions carefully.
Context from the web page (if available):
${pageText ? pageText.substring(0, 3000) : "N/A"}

QUESTIONS TO SOLVE:
${JSON.stringify(finalQuestions, null, 2)}

INSTRUCTIONS & STRICT RULES:
1. VISUAL INSPECTION (IMAGE FIRST FOR PART 1 PHOTOGRAPHS):
   - When an image/screenshot is provided (especially Part 1 photographs):
     * Look closely at the actual photo on screen: inspect who is in the picture, what they are wearing, what actions they are performing (e.g. handing a document, standing behind a reception counter, typing on a computer), and what objects/furniture are present.
     * In 'matching_details', describe the visible picture details with precision.

2. AUDIO TRANSCRIPTION & CONVERSATION:
   - When audio is attached:
     * For TOEIC Part 3 & 4 (Conversations / Talks): Transcribe the FULL conversation or speech accurately into 'conversation_transcript':
       "Man: Good morning, Dr. Waheed...
Woman: Thank you. I'm excited to attend the economics conference...
Man: ..."
     * For Part 1 (Photographs) or Part 2 (Question-Response): Transcribe the spoken question and options into 'conversation_transcript':
       "(A) [Full spoken statement A]
(B) [Full spoken statement B]
(C) [Full spoken statement C]
(D) [Full spoken statement D]"
     * SANITY CHECK / CROSS-CHECK: If the audio statements talk about something completely absent from the photo, DETECT THE CONTEXT MISMATCH.

3. ANSWER SELECTION:
   - 'question_id': MUST exactly match the id from the question input (e.g. "${finalQuestions[0]?.id || 'radio_q_1'}").
   - 'selected_index': Integer 0 for A, 1 for B, 2 for C, 3 for D.
   - 'selected_value': Must begin with the letter: "(A)", "(B)", "(C)", or "(D)".
   - 'explanation': Clear, concise explanation in Vietnamese explaining WHY the answer is correct based on the conversation and image.
   - 'confidence': Number between 0.0 and 1.0 (e.g. 0.98).

STRICT JSON SCHEMA:
{
  "conversation_transcript": "string containing the full verbatim conversation or spoken statements from the audio",
  "solutions": [
    {
      "question_id": "string",
      "selected_index": 0,
      "selected_value": "(A) Economics",
      "explanation": "string in Vietnamese",
      "confidence": 0.98
    }
  ]
}
`;

  const contents = [];

  // 1. Đính kèm file âm thanh bài nghe (Audio Multimodal) nếu có và đúng chuẩn audio
  const isValidAudioMime = !audioMime || audioMime.startsWith("audio/");
  if (audioBase64 && isValidAudioMime) {
    const cleanAudio = audioBase64.replace(/^data:[^;]+;base64,/, "").trim();
    if (cleanAudio.length > 100) {
      contents.push({
        inlineData: {
          mimeType: audioMime || "audio/mp3",
          data: cleanAudio
        }
      });
      console.log(`[GeminiService] 🎧 ĐÃ GẮN FILE ÂM THANH BÀI NGHE (${audioMime || "audio/mp3"}, ${Math.round(cleanAudio.length / 1024)} KB) VÀO GEMINI!`);
    }
  } else {
    console.log(`[GeminiService] ⚡ Không có audio âm thanh hợp lệ. Phân tích bằng hình ảnh & văn bản...`);
  }

  // 2. Đính kèm ảnh chụp màn hình đa phương thức nếu có
  if (base64Image) {
    const cleanBase64 = base64Image.replace(/^data:[^;]+;base64,/, "").trim();
    if (cleanBase64.length > 100) {
      contents.push({
        inlineData: {
          mimeType: "image/png",
          data: cleanBase64
        }
      });
    }
  }

  contents.push(prompt);


  // Thử lần lượt các model Flash để đảm bảo luôn phản hồi thành công
  let lastError = null;
  for (const modelName of CANDIDATE_MODELS) {
    try {
      console.log(`[GeminiService] Đang gọi model: ${modelName}...`);
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
          maxOutputTokens: 4000
        }
      });

      const result = await model.generateContent(contents);
      const response = await result.response;
      let text = response.text().trim();

      const parsedRes = safeParseSolutions(text);
      const solutions = Array.isArray(parsedRes) ? parsedRes : (parsedRes.solutions || []);
      const conversationTranscript = parsedRes.conversation_transcript || solutions.conversation_transcript || "";
      solutions.conversation_transcript = conversationTranscript;

      console.log(`[GeminiService] Đã giải thành công ${solutions.length} câu hỏi với model ${modelName}!`);
      return { conversation_transcript: conversationTranscript, solutions };
    } catch (err) {
      console.warn(`[GeminiService] Model ${modelName} gặp sự cố: ${err.message}. Đang thử model tiếp theo...`);
      lastError = err;
    }
  }

  throw new Error(`Tất cả các model Gemini đều không phản hồi: ${lastError?.message || "Lỗi không xác định"}`);
}

/**
 * Phục hồi và bóc tách dữ liệu JSON solutions một cách an toàn và mạnh mẽ
 */
function safeParseSolutions(rawText) {
  let text = rawText.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  let convTranscript = "";

  try {
    const parsed = JSON.parse(text);
    convTranscript = parsed.conversation_transcript || parsed.transcript || parsed.audio_transcript || "";
    let list = parsed.solutions || parsed.answers || (Array.isArray(parsed) ? parsed : [parsed]);
    if (convTranscript && Array.isArray(list)) {
      list.forEach(item => {
        if (!item.conversation_transcript) item.conversation_transcript = convTranscript;
      });
    }
    list.conversation_transcript = convTranscript;
    return { conversation_transcript: convTranscript, solutions: list };
  } catch (parseErr) {
    console.warn(`[GeminiService] JSON.parse gặp lỗi (${parseErr.message}), thử phục hồi bằng Regex...`);
    const solutions = [];

    // Tìm conversation_transcript từ text nếu có
    const transMatch = text.match(/"conversation_transcript"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    if (transMatch) {
      convTranscript = transMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }

    const blockRegex = /\{[^{}]*"question_id"[^{}]*\}/g;
    let match;
    while ((match = blockRegex.exec(text)) !== null) {
      try {
        const item = JSON.parse(match[0]);
        if (item.question_id) solutions.push(item);
      } catch (e) {
        // Fallback extract individual fields
        const qId = match[0].match(/"question_id"\s*:\s*"([^"]+)"/)?.[1];
        const sIdx = match[0].match(/"selected_index"\s*:\s*(\d+)/)?.[1];
        const sVal = match[0].match(/"selected_value"\s*:\s*"([^"]+)"/)?.[1];
        const trans = match[0].match(/"transcript"\s*:\s*"([^"]*)"/)?.[1];
        const exp = match[0].match(/"explanation"\s*:\s*"([^"]*)"/)?.[1];
        const conf = match[0].match(/"confidence"\s*:\s*([0-9.]+)/)?.[1];
        if (qId) {
          solutions.push({
            question_id: qId,
            selected_index: sIdx ? parseInt(sIdx, 10) : 0,
            selected_value: sVal || "",
            transcript: trans || "",
            explanation: exp || "",
            confidence: conf ? parseFloat(conf) : 0.95
          });
        }
      }
    }
    if (solutions.length > 0) {
      console.log(`[GeminiService] ✅ Đã phục hồi thành công ${solutions.length} câu từ chuỗi JSON!`);
      if (convTranscript) {
        solutions.forEach(s => { s.conversation_transcript = convTranscript; });
      }
      solutions.conversation_transcript = convTranscript;
      return { conversation_transcript: convTranscript, solutions };
    }
    throw parseErr;
  }
}

