import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

/**
 * Gom toàn bộ API key được cấu hình:
 * - Hỗ trợ cả 1 dòng cách nhau bằng dấu phẩy
 * - Hỗ trợ cả nhiều dòng GEMINI_API_KEY=... riêng biệt
 * - Hỗ trợ GEMINI_API_KEY_1, GEMINI_API_KEY_2...
 * - Hỗ trợ key truyền trực tiếp từ Extension
 */
export function getAllConfiguredKeys(requestApiKey = null) {
  const keys = [];

  function addKey(val) {
    if (!val) return;
    const parts = String(val).split(/[,\n]/);
    for (const part of parts) {
      const clean = part.replace(/["'\r]/g, "").trim();
      if (clean && !keys.includes(clean)) {
        keys.push(clean);
      }
    }
  }

  // 1. Key từ extension payload
  if (requestApiKey) addKey(requestApiKey);

  // 2. Key từ process.env
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("GEMINI_API_KEY")) {
      addKey(process.env[k]);
    }
  }

  // 3. Đọc trực tiếp từ các file .env để không bỏ sót các dòng bị ghi đè
  const envPaths = [".env", "backend/.env", "../.env"];
  for (const p of envPaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf-8");
        const lines = raw.split("\n");
        for (const line of lines) {
          const match = line.match(/^\s*GEMINI_API_KEY\w*\s*=\s*(.+)$/);
          if (match) {
            addKey(match[1]);
          }
        }
      }
    } catch (e) {}
  }

  return keys;
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("⚠️ CẢNH BÁO: Chưa cấu hình GEMINI_API_KEY trong file backend/.env!");
}

const genAI = new GoogleGenerativeAI(apiKey || "");

// Danh sách model ưu tiên cao nhất: gemini-3.5-flash (tư duy logic đa phương thức cao nhất), sau đó là các bản flash-lite
const CANDIDATE_MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-3-flash-preview",
  "gemini-3.5-flash",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-flash-latest"
].filter(Boolean);

/**
 * Giải bài tập tiếng Anh bằng Google Gemini Flash API đa phương thức
 * @param {Object} params
 * @param {Array} params.questions - Danh sách câu hỏi [{ id, text, options, imageUrl, target_type }]
 * @param {string} [params.base64Image] - Ảnh chụp màn hình tab bài tập (nếu có)
 * @param {string} [params.pageText] - Văn bản toàn trang
 * @param {string} [params.audioBase64] - Dữ liệu âm thanh Base64 bài nghe (nếu có)
 * @param {string} [params.audioMime] - MIME type của audio (mặc định audio/mp3)
 * @param {string} [params.apiKey] - API key tùy chọn từ Extension
 * @returns {Promise<Array>} - Danh sách lời giải [{ question_id, selected_index, selected_value, explanation, confidence }]
 */
export async function solveQuestionsBatch({ questions, base64Image, pageText, audioBase64, audioMime, apiKey: requestApiKey }) {
  const finalQuestions = (questions && questions.length > 0) ? questions : [
    {
      id: "q_1",
      text: "Look at the picture and listen to the audio statements, then choose the correct answer (A), (B), (C), or (D)",
      options: ["(A)", "(B)", "(C)", "(D)"],
      target_type: "choice"
    }
  ];

  const prompt = `
You are an ELITE TOEIC MASTER EXAMINER and Native English Professor (990/990 TOEIC Scorer).
Your mission is to achieve 100% PERFECT ACCURACY across all TOEIC Listening and Reading questions.
You must cross-reference audio, visual screenshot, and question text with extreme rigor, avoiding all common test traps.

CONTEXT FROM THE WEB PAGE (Passages, Directions, Full text):
${pageText ? pageText.substring(0, 25000) : "N/A"}

QUESTIONS TO SOLVE:
${JSON.stringify(finalQuestions, null, 2)}

=============================================================================
CRITICAL RULES FOR 100% ACCURACY ACROSS ALL TOEIC SECTIONS:
=============================================================================

1. TOEIC PART 1 - PHOTOGRAPHS (Image + Audio):
   - INSPECT THE SCREENSHOT IMAGE METICULOUSLY:
     * Identify who is in the picture, what they are wearing, what specific actions they are currently performing.
     * Check object states and positions (e.g. Is the laptop open or closed? Are cups ON the table? Are shelves stacked? Is the street crowded?).
   - LISTEN TO ALL 4 SPOKEN STATEMENTS (A), (B), (C), (D):
     * Transcribe all 4 options verbatim in 'conversation_transcript':
       "(A) [Full spoken statement A]
(B) [Full spoken statement B]
(C) [Full spoken statement C]
(D) [Full spoken statement D]"
   - TRAP AVOIDANCE: Eliminate statements describing actions not visibly occurring, wrong subjects, sound-alike words, or passive results that haven't happened. Pick the ONLY statement that is 100% visibly true.

2. TOEIC PART 2 - QUESTION-RESPONSE (Pure Audio):
   - The question and options (A), (B), (C) are SPOKEN ONLY IN AUDIO (not written on screen).
   - TRANSCRIBE BOTH THE QUESTION AND ALL 3 OPTIONS VERBATIM into 'conversation_transcript':
     "Question: [Full spoken question or statement]
(A) [Full spoken response A]
(B) [Full spoken response B]
(C) [Full spoken response C]"
   - LOGICAL REASONING:
     * Identify the question intent (Wh-question, Yes/No, Suggestion, Statement, Choice question).
     * Wh-questions (Who, Where, When, What, Why, How) ALMOST NEVER accept Yes/No answers.
     * Beware of same-word repetition traps (words that sound the same or repeat from the question in the wrong meaning).
     * The correct answer is often an indirect, realistic conversational response (e.g. "When is the meeting?" -> "I haven't checked my calendar yet").

3. TOEIC PART 3 & PART 4 - CONVERSATIONS & TALKS (Audio + Written Questions):
   - TRANSCRIBE the entire conversation/speech verbatim into 'conversation_transcript'.
   - FOR EACH QUESTION (usually 3 questions per talk):
     * Locate the EXACT segment in the talk that addresses the question.
     * Quote the exact spoken sentence in 'evidence_quote'.
     * TRAP AVOIDANCE: Beware of distractor options that repeat a word mentioned by the speaker in a different, negative, or hypothetical context (e.g. "We considered option A, but we chose option B").
     * GRAPHIC QUESTIONS ("Look at the graphic"): Look at the chart/table in the screenshot image! Cross-reference the detail spoken in the audio with the table to find the matching choice.

4. TOEIC PART 5 & PART 6 - INCOMPLETE SENTENCES & TEXT COMPLETION:
   - Perform strict syntactic and grammatical analysis:
     * Identify subject, predicate, clauses, prepositions, conjunctions.
     * Determine exact part of speech needed for the blank (noun, verb, adjective, adverb, gerund, infinitive).
     * Check subject-verb agreement, verb tense, active vs passive voice.
     * For vocabulary questions, check precise business collocations and prepositions.
     * For Part 6 sentence insertion, verify contextual coherence with both preceding and following sentences.

5. TOEIC PART 7 - READING COMPREHENSION:
   - Read the full passage, email, notice, or table provided in the page text and screenshot.
   - Quote the exact sentence or paragraph that proves the answer in 'evidence_quote'.
   - For double and triple passages, synthesize cross-document information (e.g., date in email + schedule in attachment).

=============================================================================
MANDATORY STEP-BY-STEP REASONING & JSON SCHEMA:
=============================================================================
Before committing to the answer index, you MUST write down:
1. 'evidence_quote': The exact sentence from the audio transcript or reading passage proving the answer.
2. 'reasoning_steps': Step-by-step logic explaining why the chosen option is correct and eliminating distractor traps.
3. 'selected_index': 0 for (A), 1 for (B), 2 for (C), 3 for (D).
4. 'selected_value': Must begin with the letter: "(A) ...", "(B) ...", "(C) ...", or "(D) ...".
5. 'explanation': Súc tích, rõ ràng bằng tiếng Việt giải thích vì sao chọn đáp án này.

STRICT JSON OUTPUT FORMAT:
{
  "conversation_transcript": "string containing the full verbatim conversation or spoken statements from the audio",
  "solutions": [
    {
      "question_id": "string matching the question id",
      "evidence_quote": "exact sentence from audio or passage",
      "reasoning_steps": "logical deduction and distractor elimination",
      "selected_index": 0,
      "selected_value": "(A) Full text of option",
      "explanation": "giải thích ngắn gọn súc tích bằng tiếng Việt",
      "confidence": 0.99
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
    console.log(`[GeminiService] ⚡ Không có audio âm thanh đính kèm. Phân tích bằng hình ảnh & văn bản...`);
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

  const keysToUse = getAllConfiguredKeys(requestApiKey);
  console.log(`[GeminiService] 🔑 Đang quản lý và sẵn sàng xoay tua ${keysToUse.length} API keys.`);

  // Thử lần lượt các key và model Flash để đảm bảo luôn phản hồi thành công và đạt độ chính xác cao nhất
  let lastError = null;
  for (const currentKey of keysToUse) {
    const client = new GoogleGenerativeAI(currentKey);
    for (const modelName of CANDIDATE_MODELS) {
      try {
        console.log(`[GeminiService] 🚀 Đang gọi model trí tuệ cao: ${modelName}...`);
        const model = client.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
            maxOutputTokens: 6000
          }
        });

        const result = await model.generateContent(contents);
        const response = await result.response;
        let text = response.text().trim();

        const parsedRes = safeParseSolutions(text);
        const solutions = Array.isArray(parsedRes) ? parsedRes : (parsedRes.solutions || []);
        const conversationTranscript = parsedRes.conversation_transcript || solutions.conversation_transcript || "";
        solutions.conversation_transcript = conversationTranscript;

        console.log(`[GeminiService] ✅ Đã giải thành công ${solutions.length} câu hỏi với model ${modelName}!`);
        return { conversation_transcript: conversationTranscript, solutions };
      } catch (err) {
        console.warn(`[GeminiService] Model ${modelName} gặp sự cố: ${err.message}. Đang thử model tiếp theo...`);
        lastError = err;
      }
    }
  }

  throw new Error(`Tất cả các model/key Gemini đều không phản hồi: ${lastError?.message || "Lỗi không xác định"}`);
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
        const ev = match[0].match(/"evidence_quote"\s*:\s*"([^"]*)"/)?.[1];
        const rsn = match[0].match(/"reasoning_steps"\s*:\s*"([^"]*)"/)?.[1];
        const trans = match[0].match(/"transcript"\s*:\s*"([^"]*)"/)?.[1];
        const exp = match[0].match(/"explanation"\s*:\s*"([^"]*)"/)?.[1];
        const conf = match[0].match(/"confidence"\s*:\s*([0-9.]+)/)?.[1];
        if (qId) {
          solutions.push({
            question_id: qId,
            selected_index: sIdx ? parseInt(sIdx, 10) : 0,
            selected_value: sVal || "",
            evidence_quote: ev || "",
            reasoning_steps: rsn || "",
            transcript: trans || "",
            explanation: exp || "",
            confidence: conf ? parseFloat(conf) : 0.99
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

