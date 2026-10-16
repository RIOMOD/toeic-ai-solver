// AI English Auto Solver - Service Worker (Background)
const DEFAULT_BACKEND_URL = "https://toeic-ai-solver.onrender.com";

// Bộ nhớ đệm lưu thông tin audio bài nghe
let lastCapturedAudio = null;

// Tự động khôi phục audio từ storage khi service worker khởi động
chrome.storage.local.get(["lastCapturedAudio"], (res) => {
  if (res.lastCapturedAudio) {
    lastCapturedAudio = res.lastCapturedAudio;
  }
});

// =========================================================================
// HỆ THỐNG DUY TRÌ HOẠT ĐỘNG 24/24 (ANTI-SLEEP & SERVICE WORKER KEEP-ALIVE)
// =========================================================================
function enable247KeepAlive() {
  // 1. Chống ngủ máy tính (Windows không rơi vào trạng thái Sleep/Standby)
  if (chrome.power && chrome.power.requestKeepAwake) {
    try {
      chrome.power.requestKeepAwake("system");
      console.log("[Background 24/7] 🛡️ Đã kích hoạt chrome.power: Ngăn Windows/PC Sleep!");
    } catch (e) {
      console.warn("[Background 24/7] Không thể bật keepAwake:", e);
    }
  }

  // 2. Tạo Alarm định kỳ mỗi 1 phút để đánh thức Service Worker
  if (chrome.alarms) {
    chrome.alarms.create("keepAliveAlarm247", { periodInMinutes: 1 });
  }
}

enable247KeepAlive();

// Đảm bảo Alarm luôn được tạo khi khởi động hoặc cài đặt
chrome.runtime.onInstalled.addListener(enable247KeepAlive);
chrome.runtime.onStartup.addListener(enable247KeepAlive);

// Xử lý Alarm thức tỉnh định kỳ
if (chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "keepAliveAlarm247") {
      console.log(`[Background 24/7] ⏰ Heartbeat Alarm (${new Date().toLocaleTimeString()}) - Service Worker đang hoạt động bình thường.`);
      if (chrome.power && chrome.power.requestKeepAwake) {
        try { chrome.power.requestKeepAwake("system"); } catch (e) {}
      }
    }
  });
}

// 3. Giữ kết nối cổng Port dài hạn với Content Script (Heartbeat Port)
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "keepAlivePort247") {
    port.onMessage.addListener((msg) => {
      if (msg && msg.type === "PING") {
        try {
          port.postMessage({ type: "PONG", timestamp: Date.now() });
        } catch (e) {}
      }
    });
  }
});

// Chuyển ArrayBuffer thành base64 an toàn trong Service Worker
function bufferToBase64(buffer, mime = "audio/mp3") {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 16384;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

// Ghi nhớ thông tin audio (Lazy Load - chỉ tải khi gửi sang AI để tránh ngốn RAM)
function recordAudioUrl(url) {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return;
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico|js|css|html|aspx)($|\?)/i.test(url)) return;

  const finalMime = url.toLowerCase().includes(".wav") ? "audio/wav" : "audio/mp3";
  lastCapturedAudio = {
    url: url,
    mime: finalMime,
    timestamp: Date.now()
  };
  // Chỉ lưu metadata gọn nhẹ (vài chục bytes) vào storage
  chrome.storage.local.set({ lastCapturedAudio: { url, mime: finalMime, timestamp: Date.now() } });
}

async function loadAudioBase64(audioObj) {
  if (!audioObj || !audioObj.url) return audioObj;
  if (audioObj.base64) return audioObj;
  try {
    console.log(`[Background] 📥 Đang tải audio theo nhu cầu: ${audioObj.url}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(audioObj.url, { signal: controller.signal });
    if (!res.ok) {
      clearTimeout(timer);
      return audioObj;
    }
    const blob = await res.blob();
    clearTimeout(timer);
    // Giới hạn tối đa 12MB để bảo vệ bộ nhớ trình duyệt
    if (blob.size > 12 * 1024 * 1024) {
      console.warn(`[Background] Bỏ qua file audio quá lớn (${Math.round(blob.size/1024/1024)}MB) để chống tràn RAM.`);
      return audioObj;
    }
    const finalMime = audioObj.mime || blob.type || "audio/mp3";
    const arrayBuf = await blob.arrayBuffer();
    audioObj.base64 = bufferToBase64(arrayBuf, finalMime);
    return audioObj;
  } catch (err) {
    console.warn(`[Background] Lỗi tải audio on-demand:`, err.message);
    return audioObj;
  }
}

// Bắt giữ luồng audio phát trên trang web (TOEIC Listening)
if (chrome.webRequest && chrome.webRequest.onBeforeRequest) {
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      const url = details.url;
      if (!url) return;
      if (/\.(png|jpg|jpeg|gif|svg|webp|ico|js|css|html|aspx)($|\?)/i.test(url)) return;

      const isAudio = (
        /\.(mp3|wav|ogg|m4a|aac|opus|weba)($|\?)/i.test(url) ||
        (details.type === "media" && !/\.(mp4|webm|avi|mov)($|\?)/i.test(url))
      );

      if (isAudio) {
        recordAudioUrl(url);
      }
    },
    { urls: ["<all_urls>"] }
  );
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // A. Chụp ảnh màn hình tab (sử dụng JPEG chất lượng 40% để giảm tải CPU và RAM cho máy yếu)
  if (request.action === "capture_tab") {
    chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 40 }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        sendResponse({ success: false, error: chrome.runtime.lastError?.message || "Không thể chụp màn hình tab" });
      } else {
        sendResponse({ success: true, dataUrl: dataUrl });
      }
    });
    return true; // async
  }

  // B. Lưu audio được Content Script phát hiện
  if (request.action === "save_audio") {
    if (request.url) {
      recordAudioUrl(request.url);
      sendResponse({ success: true, audio: lastCapturedAudio });
      return false;
    } else if (request.base64) {
      const mime = request.mime || "audio/mp3";
      if (!mime.startsWith("audio/")) {
        sendResponse({ success: false });
        return false;
      }
      lastCapturedAudio = {
        base64: request.base64,
        mime: mime,
        timestamp: Date.now()
      };
      sendResponse({ success: true });
      return false;
    }
  }

  // C. Xóa bộ nhớ đệm audio khi chuyển câu hoặc bắt đầu giải câu mới
  if (request.action === "clear_audio") {
    lastCapturedAudio = null;
    chrome.storage.local.remove(["lastCapturedAudio"], () => {
      console.log("[Background] 🧹 Đã xoá sạch bộ nhớ đệm audio cũ!");
      sendResponse({ success: true });
    });
    return true;
  }

  // D. Lấy audio gần nhất (chỉ lấy audio hợp lệ và tươi mới)
  if (request.action === "get_audio") {
    chrome.storage.local.get(["lastCapturedAudio"], async (res) => {
      let audio = lastCapturedAudio || res.lastCapturedAudio;
      const minTs = typeof request.minTimestamp === "number" ? request.minTimestamp : (Date.now() - 30000);
      const isFresh = audio && audio.timestamp && (audio.timestamp >= minTs);
      if (isFresh && audio && audio.url && !audio.base64) {
        audio = await loadAudioBase64(audio);
      }
      const isValid = isFresh && audio && audio.mime && audio.mime.startsWith("audio/") && Boolean(audio.base64);
      if (isValid) {
        console.log(`[Background] 🎧 Cung cấp audio tươi mới (${audio.mime}, thời điểm: ${audio.timestamp})`);
        sendResponse({ success: true, audio: audio });
      } else {
        sendResponse({ success: false, audio: null, reason: audio ? "stale_audio" : "no_audio" });
      }
    });
    return true;
  }

  // E. Gửi bài tập tới Backend để AI giải
  if (request.action === "solve_exercise") {
    forwardToBackend(request.payload)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async
  }

  // H. Tự động lưu file đáp án bài thi vào thư mục Downloads/TOEIC_History trên máy tính người dùng
  if (request.action === "save_history_local_file") {
    try {
      const filename = request.filename || `TOEIC_History/Dap_An_${Date.now()}.txt`;
      const dataUrl = "data:text/plain;charset=utf-8," + encodeURIComponent(request.content || "");
      chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: false,
        conflictAction: "overwrite"
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.warn("[Background] Lỗi lưu file local qua chrome.downloads:", chrome.runtime.lastError.message);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log(`[Background] 💾 Đã lưu đáp án vào thư mục máy tính: Downloads/${filename} (ID: ${downloadId})`);
          sendResponse({ success: true, downloadId });
        }
      });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    return true; // async
  }

  // I. Tự động đẩy lịch sử đáp án bài thi lên Máy chủ (Server)
  if (request.action === "sync_history_to_server") {
    (async () => {
      try {
        const storage = await chrome.storage.local.get(["backendUrl"]);
        const backendUrl = storage.backendUrl || "https://toeic-ai-solver.onrender.com";
        const resp = await fetch(`${backendUrl}/api/history`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request.payload)
        });
        const resJson = await resp.json();
        console.log("[Background] ☁️ Đã đẩy lịch sử bài thi lên Server thành công:", resJson);
        sendResponse({ success: true, data: resJson });
      } catch (err) {
        console.warn("[Background] Lỗi đẩy lịch sử lên server:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // async
  }

  // F. Heartbeat ping từ Content Script để duy trì 24/24
  if (request.action === "ping_keep_alive") {
    sendResponse({ success: true, timestamp: Date.now() });
    return false;
  }

  // G. Đồng bộ ẩn/hiện toolbar tới tất cả các frame & tab
  if (request.action === "toggle_toolbar_all" || request.action === "set_toolbar_state_broadcast") {
    chrome.storage.local.get(["ai_toolbar_hidden"], (res) => {
      const nextHidden = (typeof request.hidden === "boolean") ? request.hidden : !res.ai_toolbar_hidden;
      chrome.storage.local.set({ ai_toolbar_hidden: nextHidden });
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "set_toolbar_state",
            hidden: nextHidden
          }).catch(() => {});
        }
      });
      sendResponse({ success: true, hidden: nextHidden });
    });
    return true;
  }
});

// Lắng nghe phím tắt toàn cục từ Chrome (Commands API)
if (chrome.commands && chrome.commands.onCommand) {
  chrome.commands.onCommand.addListener((command) => {
    console.log(`[Background] ⌨️ Nhận lệnh phím tắt: ${command}`);
    if (command === "toggle_toolbar") {
      chrome.storage.local.get(["ai_toolbar_hidden"], (res) => {
        const nextHidden = !res.ai_toolbar_hidden;
        chrome.storage.local.set({ ai_toolbar_hidden: nextHidden });
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0] && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: "set_toolbar_state",
              hidden: nextHidden
            }).catch(() => {});
          }
        });
      });
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: command }).catch(() => {});
      }
    });
  });
}


async function forwardToBackend(payload) {
  const storage = await chrome.storage.local.get(["backendUrl", "geminiApiKey", "lastCapturedAudio"]);
  let backendUrl = (storage.backendUrl || DEFAULT_BACKEND_URL).replace(/\/$/, "");

  // Đính kèm custom Gemini API Key từ cài đặt Extension nếu có
  if (storage.geminiApiKey && !payload.apiKey) {
    payload.apiKey = storage.geminiApiKey;
  }

  // Tự động kiểm tra: Nếu local backend (http://localhost:5000) đang mở thì ưu tiên dùng ngay để đạt tốc độ tức thì và ổn định 100%
  if (backendUrl !== "http://localhost:5000") {
    try {
      const localCheck = await fetch("http://localhost:5000/api/health", { method: "GET", signal: AbortSignal.timeout(800) });
      if (localCheck.ok) {
        console.log("[Background] ⚡ Phát hiện Local Backend đang chạy, tự động ưu tiên kết nối http://localhost:5000!");
        backendUrl = "http://localhost:5000";
      }
    } catch (e) {}
  }

  // 1. Nếu payload có audio mới, cập nhật vào bộ nhớ đệm
  if (payload.audioBase64) {
    lastCapturedAudio = {
      base64: payload.audioBase64,
      mime: payload.audioMime || "audio/mp3",
      timestamp: Date.now()
    };
    chrome.storage.local.set({ lastCapturedAudio });
  } else if (payload.audioUrl) {
    try {
      console.log(`[Background] 📥 Đang tải audioUrl trực tiếp bằng Service Worker: ${payload.audioUrl}`);
      const audioController = new AbortController();
      const audioTimeout = setTimeout(() => audioController.abort(), 3500);
      const res = await fetch(payload.audioUrl, { signal: audioController.signal });
      if (res.ok) {
        const blob = await res.blob();
        clearTimeout(audioTimeout);
        const mime = blob.type || (payload.audioUrl.toLowerCase().includes(".wav") ? "audio/wav" : "audio/mp3");
        const arrayBuf = await blob.arrayBuffer();
        payload.audioBase64 = bufferToBase64(arrayBuf, mime);
        payload.audioMime = mime;
        lastCapturedAudio = {
          url: payload.audioUrl,
          base64: payload.audioBase64,
          mime: mime,
          timestamp: Date.now()
        };
        chrome.storage.local.set({ lastCapturedAudio });
        console.log(`[Background] ✅ Service Worker đã tải xong audio (${mime})!`);
      } else {
        clearTimeout(audioTimeout);
      }
    } catch (e) {
      console.warn("[Background] Không thể nạp audio từ URL:", e.message);
    }
  }

  // Chỉ cho phép dùng cached audio nếu được cho phép rõ ràng (ví dụ Part 3/Part 4 gồm 3 câu chung audio) và trong vòng 30 giây
  if (!payload.audioBase64 && payload.allowCachedAudio) {
    const cached = lastCapturedAudio || storage.lastCapturedAudio;
    if (cached && cached.base64 && (Date.now() - (cached.timestamp || 0) < 30 * 1000)) {
      payload.audioBase64 = cached.base64;
      payload.audioMime = cached.mime || "audio/mp3";
      console.log(`[Background] 🎧 Đã gắn file âm thanh dùng chung (${payload.audioMime}, ${Math.round((Date.now() - cached.timestamp)/1000)}s trước) cho AI!`);
    } else {
      console.log("[Background] ⚠️ Bộ nhớ đệm audio quá cũ (>30s) hoặc không hợp lệ, không tự tiện gắn cho câu hiện tại.");
    }
  }


  console.log(`[Background] 🚀 Gửi bài tập tới Backend: ${backendUrl}/api/solve (Có Audio: ${Boolean(payload.audioBase64)})`);

  let lastError = null;
  const maxRetries = 1;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(`${backendUrl}/api/solve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || `Lỗi máy chủ HTTP ${response.status}`);
      }

      console.log(`[Background] Backend trả về ${data.solutions?.length || 0} đáp án thành công.`);
      return {
        success: true,
        data: data.solutions,
        conversation_transcript: data.conversation_transcript || "",
        count: data.count
      };
    } catch (error) {
      lastError = error;
      console.warn(`[Background] Lần thử ${attempt}/${maxRetries} thất bại khi kết nối Backend:`, error.message);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
  }

  console.error("[Background Error] Tất cả các lần thử kết nối Backend đều thất bại:", lastError);
  throw new Error(`Không thể kết nối tới Backend (${backendUrl}) sau ${maxRetries} lần thử: ${lastError.message}`);
}
