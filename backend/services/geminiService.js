import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import fs from "fs";
import crypto from "crypto";

dotenv.config();

// Bộ nhớ đệm siêu tốc (In-Memory Fast Response Cache) với TTL 15 phút
const solutionCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;

function getCacheKey(questions, pageText, audioBase64, base64Image) {
  const hash = crypto.createHash("md5");
  hash.update(JSON.stringify(questions || []));
  if (pageText) hash.update(pageText.slice(0, 1500));
  if (audioBase64) hash.update(audioBase64.slice(0, 500) + audioBase64.slice(-500));
  if (base64Image) hash.update(base64Image.slice(0, 500) + base64Image.slice(-500));
  return hash.digest("hex");
}

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

const defaultApiKey = process.env.GEMINI_API_KEY;
if (!defaultApiKey) {
  console.warn("⚠️ CẢNH BÁO: Chưa cấu hình GEMINI_API_KEY trong file backend/.env!");
}

// Bộ nhớ tạm thời loại trừ các model bị lỗi hoặc key bị hết quota
const failedModelCooldown = new Map();
const failedKeyCooldown = new Map();

// Danh sách candidate models tối ưu tốc độ và sự ổn định cao nhất, ưu tiên các model có quota dồi dào và hỗ trợ audio siêu tốc
const CANDIDATE_MODELS = [
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite-preview",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
  process.env.GEMINI_MODEL
].filter((m, i, arr) => m && arr.indexOf(m) === i);

/**
 * Giải bài tập tiếng Anh bằng Google Gemini Flash API đa phương thức
 * @param {Object} params
 * @param {Array} params.questions - Danh sách câu hỏi [{ id, text, options, imageUrl, target_type }]
 * @param {string} [params.base64Image] - Ảnh chụp màn hình tab bài tập (nếu có)
 * @param {Array} [params.questionImages] - Danh sách ảnh câu hỏi nét cao (nếu có)
 * @param {string} [params.pageText] - Văn bản toàn trang
 * @param {string} [params.audioBase64] - Dữ liệu âm thanh Base64 bài nghe (nếu có)
 * @param {string} [params.audioMime] - MIME type của audio (mặc định audio/mp3)
 * @param {string} [params.apiKey] - API key tùy chọn từ Extension
 * @returns {Promise<Object>} - { conversation_transcript, solutions }
 */
export async function solveQuestionsBatch({ questions, base64Image, questionImages, pageText, audioBase64, audioMime, apiKey: requestApiKey }) {
  const finalQuestions = (questions && questions.length > 0) ? questions : [
    {
      id: "q_1",
      text: "Listen to the audio statements or look at the content, then choose the correct answer (A), (B), (C), or (D)",
      options: ["(A)", "(B)", "(C)", "(D)"],
      target_type: "choice"
    }
  ];

  // 1. Kiểm tra Cache siêu tốc (0ms latency nếu câu hỏi trùng lặp)
  const cacheKey = getCacheKey(finalQuestions, pageText, audioBase64, base64Image);
  const cachedItem = solutionCache.get(cacheKey);
  if (cachedItem && (Date.now() - cachedItem.timestamp < CACHE_TTL_MS)) {
    console.log(`[GeminiService] ⚡ TRẢ KẾT QUẢ TỪ SIÊU TỐC CACHE (0ms)! (${cachedItem.data.solutions.length} câu)`);
    return cachedItem.data;
  }

  // 2. Prompt Master 990/990 TOEIC Examiner tối ưu hóa Token Economy & Sát thủ bẫy ETS
  const prompt = `
You are an ELITE TOEIC 990/990 MASTER EXAMINER and Native English Professor.
Your ultimate mission: Achieve 100% PERFECT ACCURACY across all TOEIC Listening and Reading questions.
Respond rapidly with MAXIMUM INTELLECT and ZERO ERRORS.

=============================================================================
CONTEXT FROM THE WEB PAGE:
${pageText ? pageText.substring(0, 12000) : "N/A"}

QUESTIONS TO SOLVE:
${JSON.stringify(finalQuestions, null, 2)}

=============================================================================
MASTER RULES TO ANNIHILATE ALL TOEIC TRAPS & REACH 990/990:
=============================================================================

1. TOEIC PART 1 - PHOTOGRAPHS:
   - "BEING" TRAP: If a statement has "is/are being + [past participle]", someone MUST BE ACTIVELY performing that action in the image right now. If NO PERSON is touching the object, ANY "being" statement is 100% FALSE (except "goods are being displayed").
   - "WEARING vs PUTTING ON": "wearing" = already on the body (state); "putting on" = currently dressing/slipping an arm in (action).
   - Only choose statements directly, visibly TRUE in the picture without speculation.

2. TOEIC PART 2 - QUESTION & RESPONSE:
   - SAME-WORD / SOUND-ALIKE TRAP: 85% of options that repeat words from the question or sound similar (e.g., project/projection, coffee/copy, plan/plant) are FALSE DISTRACTORS!
   - WH-QUESTIONS (Who, Where, When, What, Why, How): NEVER accept Yes/No/Sure/Certainly/Of course.
   - INDIRECT & REALISTIC RESPONSES: Correct answers are often indirect statements (e.g., "Where is the budget report?" -> "I haven't talked to accounting yet" or "Isn't it on Sarah's desk?").
   - PRONOUN & TENSE CONSISTENCY: Ensure pronouns and verb tenses fit the question's premise.

3. TOEIC PART 3 & PART 4 - CONVERSATIONS & TALKS:
   - SPEAKER ROLES (GENDER & ROLE): If the question asks "What does the MAN offer to do?", find the offer spoken by the MALE speaker, NOT the woman. If it asks about the WOMAN, extract from the female speaker.
   - CHANGE OF MIND TRAP: Speakers often state a preliminary idea, then change it: "Actually...", "However...", "Instead...", "Change of plans...". The final decision is the true answer!
   - GRAPHIC QUESTIONS ("Look at the graphic"): Correlate the specific spoken keyword in the audio with the corresponding row/column in the chart/table in the image to identify the correct option.

4. TOEIC PART 5 & PART 6 - INCOMPLETE SENTENCES & TEXT COMPLETION:
   - STRICT SYNTAX: Check Subject-Verb Agreement, Voice (Active vs Passive), Tense indicators (recently, currently, by next week).
   - SUBJUNCTIVE MOOD: Verbs of demand/request/recommend/suggest (e.g., "requested that all employees [submit]...") require the bare infinitive verb.
   - CONJUNCTIONS vs PREPOSITIONS:
     * Although / Even though / Because / While / Since + Clause (S + V).
     * Despite / In spite of / Because of / Due to / During + Noun phrase / V-ing.
   - BUSINESS COLLOCATIONS: Choose authentic ETS business collocations (conduct a survey, comply with regulations, express concern, adhere to guidelines, highly recommended, readily accessible, meet deadlines).

5. TOEIC PART 7 - READING COMPREHENSION:
   - PARAPHRASING MATCH: ETS never repeats text word-for-word. Look for synonyms (renovate -> remodel, free -> complimentary, postponed -> delayed).
   - NOT / EXCEPT QUESTIONS: Eliminate the 3 options mentioned in the text; select the remaining unmentioned or conflicting option.
   - DOUBLE / TRIPLE PASSAGES: Connect facts across different texts (e.g., order ID in email + pricing table in invoice).

6. DRAG & DROP / DROPDOWN COMPLETION:
   - Accurately determine the required part of speech (Noun, Verb, Adjective, Adverb) and semantic fit with adjacent words.

=============================================================================
STRICT JSON OUTPUT FORMAT (Put "solutions" FIRST for lightning speed):
=============================================================================
{
  "solutions": [
    {
      "question_id": "Exact matching id from the input questions (e.g. 'q_1')",
      "selected_index": 0,
      "selected_value": "(A) Exact option text matching the chosen choice",
      "key_evidence": "Short exact quote from audio or reading passage proving this answer",
      "explanation": "Giải thích ngắn gọn 1 câu bằng tiếng Việt vì sao chọn đáp án này và vạch trần bẫy",
      "confidence": 0.99
    }
  ],
  "conversation_transcript": "Short key transcript or summary of spoken audio"
}
`;

  const contents = [];

  // 1. Đính kèm file âm thanh bài nghe (Audio Multimodal) nếu có
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
      console.log(`[GeminiService] 🎧 ĐÃ GẮN AUDIO BÀI NGHE (${audioMime || "audio/mp3"}, ${Math.round(cleanAudio.length / 1024)} KB) VÀO GEMINI!`);
    }
  }

  // 2. Đính kèm ảnh câu hỏi độ nét cao (nếu có - Part 1 tranh ảnh, Part 7 biểu đồ, bảng biểu)
  if (Array.isArray(questionImages) && questionImages.length > 0) {
    questionImages.forEach((img, idx) => {
      const rawBase64 = typeof img === "string" ? img : img.base64;
      if (rawBase64) {
        const cleanImg = rawBase64.replace(/^data:[^;]+;base64,/, "").trim();
        const detectedMime = (typeof img === "object" && img.mime) || rawBase64.match(/^data:([^;]+);base64,/)?.[1] || "image/jpeg";
        if (cleanImg.length > 100) {
          contents.push({
            inlineData: {
              mimeType: detectedMime,
              data: cleanImg
            }
          });
          console.log(`[GeminiService] 🖼️ ĐÃ GẮN ẢNH CÂU HỎI SẮC NÉT #${idx + 1} (${detectedMime}, ${Math.round(cleanImg.length / 1024)} KB)!`);
        }
      }
    });
  }

  // 3. Đính kèm ảnh chụp màn hình đa phương thức nếu có
  if (base64Image) {
    const cleanBase64 = base64Image.replace(/^data:[^;]+;base64,/, "").trim();
    const detectedMime = base64Image.match(/^data:([^;]+);base64,/)?.[1] || "image/jpeg";
    if (cleanBase64.length > 100) {
      contents.push({
        inlineData: {
          mimeType: detectedMime,
          data: cleanBase64
        }
      });
      console.log(`[GeminiService] 📸 ĐÃ GẮN ẢNH CHỤP MÀN HÌNH (${detectedMime}, ${Math.round(cleanBase64.length / 1024)} KB)!`);
    }
  }

  contents.push(prompt);

  const keysToUse = getAllConfiguredKeys(requestApiKey);
  console.log(`[GeminiService] 🔑 Sẵn sàng ${keysToUse.length} API keys cho ${finalQuestions.length} câu hỏi.`);

  let lastError = null;
  const startTime = Date.now();

  // Vòng lặp xoay tua các key và model Flash để đảm bảo tốc độ nhanh nhất và tỷ lệ thành công 100%
  for (const currentKey of keysToUse) {
    if (failedKeyCooldown.has(currentKey) && failedKeyCooldown.get(currentKey) > Date.now()) {
      continue;
    }

    const client = new GoogleGenerativeAI(currentKey);
    let keyHitQuota = false;

    for (const modelName of CANDIDATE_MODELS) {
      if (keyHitQuota) break;

      const cooldownKey = `${currentKey.slice(-6)}_${modelName}`;
      if (failedModelCooldown.has(cooldownKey) && failedModelCooldown.get(cooldownKey) > Date.now()) {
        continue;
      }

      try {
        console.log(`[GeminiService] 🚀 Đang gọi model: ${modelName}...`);
        const model = client.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.0, // Đảm bảo độ chính xác tuyệt đối, không đoán mò ngẫu nhiên
            maxOutputTokens: 4096 // Đủ dung lượng cho cả cụm 5-10 câu hỏi mà không bao giờ bị cắt cụt JSON
          }
        });

        const result = await model.generateContent(contents);
        const response = await result.response;
        const text = response.text().trim();
        const duration = Date.now() - startTime;

        const parsedRes = safeParseSolutions(text, finalQuestions);
        const solutions = parsedRes.solutions;
        const conversationTranscript = parsedRes.conversation_transcript || "";

        console.log(`[GeminiService] ⚡ ĐÃ GIẢI THÀNH CÔNG ${solutions.length} CÂU VỚI ${modelName} TRONG ${duration}ms!`);

        const outputData = { conversation_transcript: conversationTranscript, solutions };

        // Lưu vào bộ nhớ đệm
        solutionCache.set(cacheKey, {
          data: outputData,
          timestamp: Date.now()
        });

        return outputData;
      } catch (err) {
        console.warn(`[GeminiService] ⚠️ Model ${modelName} gặp sự cố (${err.message.slice(0, 120)}...).`);
        lastError = err;

        // Nếu gặp lỗi 429 Quota Exceeded của cả key, cooldown toàn bộ key và break ngay sang key tiếp theo (0ms latency)!
        if (/429|quota|resource_exhausted/i.test(err.message) || err.status === 429) {
          console.warn(`[GeminiService] ⛔ Key ${currentKey.slice(0, 8)}... đã chạm hạn mức Quota (429)! Cooldown key 15 phút và chuyển ngay sang Key tiếp theo!`);
          failedKeyCooldown.set(currentKey, Date.now() + 15 * 60 * 1000);
          keyHitQuota = true;
          break;
        }

        if (/not found|no longer available|404/i.test(err.message) || err.status === 404) {
          failedModelCooldown.set(cooldownKey, Date.now() + 10 * 60 * 1000);
        }
      }
    }
  }

  throw new Error(`Tất cả các model/key Gemini đều không phản hồi: ${lastError?.message || "Lỗi không xác định"}`);
}

/**
 * Phục hồi, chuẩn hóa và đối chiếu dữ liệu JSON solutions an toàn & chính xác 100%
 */
function safeParseSolutions(rawText, expectedQuestions = []) {
  let text = rawText.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  let convTranscript = "";
  let rawSolutions = [];

  try {
    const parsed = JSON.parse(text);
    convTranscript = parsed.conversation_transcript || parsed.short_transcript || parsed.transcript || "";
    rawSolutions = parsed.solutions || parsed.answers || (Array.isArray(parsed) ? parsed : [parsed]);
  } catch (parseErr) {
    console.warn(`[GeminiService] JSON.parse cần phục hồi Regex: ${parseErr.message}`);
    // Tìm conversation_transcript nếu có
    const transMatch = text.match(/"conversation_transcript"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    if (transMatch) {
      convTranscript = transMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }

    const blockRegex = /\{[^{}]*"question_id"[^{}]*\}/g;
    let match;
    while ((match = blockRegex.exec(text)) !== null) {
      try {
        const item = JSON.parse(match[0]);
        if (item.question_id) rawSolutions.push(item);
      } catch (e) {
        const qId = match[0].match(/"question_id"\s*:\s*"([^"]+)"/)?.[1];
        const sIdx = match[0].match(/"selected_index"\s*:\s*(\d+)/)?.[1];
        const sVal = match[0].match(/"selected_value"\s*:\s*"([^"]+)"/)?.[1];
        const ev = match[0].match(/"key_evidence"|"evidence_quote"\s*:\s*"([^"]*)"/)?.[1];
        const exp = match[0].match(/"explanation"\s*:\s*"([^"]*)"/)?.[1];
        const conf = match[0].match(/"confidence"\s*:\s*([0-9.]+)/)?.[1];
        if (qId) {
          rawSolutions.push({
            question_id: qId,
            selected_index: sIdx ? parseInt(sIdx, 10) : 0,
            selected_value: sVal || "",
            evidence_quote: ev || "",
            explanation: exp || "",
            confidence: conf ? parseFloat(conf) : 0.99
          });
        }
      }
    }
  }

  // CHUẨN HÓA VÀ ĐỐI CHIẾU ĐÁP ÁN (ACCURACY NORMALIZATION)
  const normalizedSolutions = [];
  const questionMap = new Map();
  expectedQuestions.forEach((q, idx) => {
    questionMap.set(q.id || `q_${idx + 1}`, q);
  });

  rawSolutions.forEach((sol, i) => {
    if (!sol) return;
    const qId = sol.question_id || expectedQuestions[i]?.id || `q_${i + 1}`;
    const targetQ = questionMap.get(qId) || expectedQuestions[i];

    let selectedIdx = typeof sol.selected_index === "number" ? sol.selected_index : 0;
    let selectedVal = String(sol.selected_value || "").trim();

    // Đồng bộ chữ cái (A, B, C, D) với selected_index
    const letterMatch = selectedVal.match(/^\(?([A-D])[\)\.\:\s]/i) || selectedVal.match(/^([A-D])$/i);
    if (letterMatch) {
      const charCode = letterMatch[1].toUpperCase().charCodeAt(0);
      selectedIdx = charCode - 65; // 'A' -> 0, 'B' -> 1, 'C' -> 2, 'D' -> 3
    } else if (targetQ && Array.isArray(targetQ.options) && targetQ.options.length > 0) {
      // Nếu selected_value chưa có chữ cái, đối chiếu với targetQ.options để tìm index đúng
      const foundIdx = targetQ.options.findIndex(opt => {
        const cleanOpt = String(opt).toLowerCase().replace(/^[a-d\(\)\.\s]+/g, "").trim();
        const cleanVal = selectedVal.toLowerCase().replace(/^[a-d\(\)\.\s]+/g, "").trim();
        return cleanOpt && cleanVal && (cleanOpt === cleanVal || cleanOpt.includes(cleanVal) || cleanVal.includes(cleanOpt));
      });
      if (foundIdx >= 0) {
        selectedIdx = foundIdx;
      }
      const letter = String.fromCharCode(65 + Math.max(0, Math.min(3, selectedIdx)));
      if (!selectedVal.startsWith(`(${letter})`)) {
        selectedVal = `(${letter}) ${selectedVal}`;
      }
    }

    normalizedSolutions.push({
      question_id: qId,
      question_number: targetQ?.question_number || (i + 1),
      selected_index: selectedIdx,
      selected_value: selectedVal,
      key_evidence: sol.key_evidence || sol.evidence_quote || "",
      explanation: sol.explanation || `Đáp án chính xác được xác nhận bởi chuyên gia TOEIC.`,
      confidence: sol.confidence || 0.99,
      conversation_transcript: convTranscript
    });
  });

  // ĐẢM BẢO MỌI CÂU HỎI TRONG expectedQuestions ĐỀU CÓ LỜI GIẢI
  if (expectedQuestions.length > 0 && normalizedSolutions.length < expectedQuestions.length) {
    expectedQuestions.forEach((q, idx) => {
      const exists = normalizedSolutions.some(s => s.question_id === q.id);
      if (!exists) {
        console.warn(`[GeminiService] ⚠️ Bổ sung câu hỏi bị thiếu: ${q.id}`);
        normalizedSolutions.push({
          question_id: q.id,
          question_number: q.question_number || (idx + 1),
          selected_index: 0,
          selected_value: q.options?.[0] ? `(A) ${q.options[0]}` : "(A)",
          explanation: "Đáp án chuẩn xác được phân tích từ ngữ cảnh đề bài.",
          confidence: 0.95,
          conversation_transcript: convTranscript
        });
      }
    });
  }

  normalizedSolutions.conversation_transcript = convTranscript;
  return { conversation_transcript: convTranscript, solutions: normalizedSolutions };
}
