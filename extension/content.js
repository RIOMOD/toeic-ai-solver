// AI English Auto Solver - Content Script with Auto-Next Loop & 24/7 Keep-Alive Engine
(function () {
  // ⛔ CHỈ CHẠY TRÊN KHUNG CHÍNH (Top Window)
  // Ngăn chặn nhân bản script trên hàng chục iframe gây tràn RAM (OOM), nghẽn CPU và sập tab trình duyệt
  if (window !== window.top) {
    return;
  }

  window._elementRefs = new Map();
  let isAutoNextRunning = false;
  let isMasterAutoRunning = false;
  let lastSolvedFingerprint = null;
  let isSolvingCurrentQuestion = false;

  // =========================================================================
  // 🛡️ LÁ CHẮN CHỐNG CẢNH BÁO HỆ THỐNG TIẾNG ANH (ANTI-WARNING & ANTI-BLUR SHIELD)
  // =========================================================================
  // Ngăn chặn các hệ thống thi/học tiếng Anh (Edusoft / English Discoveries, Canvas, Moodle, LMS...)
  // bắt sự kiện blur, visibilitychange để phát cảnh báo khi mất tiêu điểm hoặc chuyển tab.
  function activateAntiWarningGuard() {
    // 1. Chặn các bẫy sự kiện trong Context Content Script (pha capture)
    const blockEvent = function(e) {
      if (e) {
        e.stopImmediatePropagation();
        e.stopPropagation();
      }
    };

    window.addEventListener("blur", blockEvent, true);
    window.addEventListener("focusout", blockEvent, true);
    document.addEventListener("visibilitychange", blockEvent, true);
    document.addEventListener("webkitvisibilitychange", blockEvent, true);

    // 2. Tiêm lá chắn vào Main World (Ngữ cảnh JavaScript trực tiếp của trang web)
    try {
      const script = document.createElement("script");
      script.textContent = `
        (function() {
          if (window.__w_f_guard) return;
          window.__w_f_guard = 1;

          // A. Luôn giữ trạng thái Tab đang hoạt động & Trang có Focus 24/7
          try {
            Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
            Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
            Object.defineProperty(document, 'webkitVisibilityState', { get: () => 'visible', configurable: true });
            document.hasFocus = function() { return true; };
          } catch (e) {}

          // B. Chặn các hàm cảnh báo blur / focusout / visibilitychange của website thi tiếng Anh
          const blockBlur = function(e) {
            e.stopImmediatePropagation();
            e.stopPropagation();
          };
          window.addEventListener('blur', blockBlur, true);
          window.addEventListener('focusout', blockBlur, true);
          document.addEventListener('visibilitychange', blockBlur, true);
          document.addEventListener('webkitvisibilitychange', blockBlur, true);

          // C. Vô hiệu hóa gán window.onblur và window.onvisibilitychange từ website
          try {
            Object.defineProperty(window, 'onblur', {
              get: () => null,
              set: () => { console.log('[AI Shield] 🛡️ Đã chặn website gán window.onblur!'); },
              configurable: true
            });
          } catch(e) {}

          // D. Chặn cảnh báo rời chuột khỏi trang web (mouseleave / mouseout)
          window.addEventListener('mouseleave', function(e) {
            if (e.target === document || e.target === document.documentElement) {
              e.stopImmediatePropagation();
              e.stopPropagation();
            }
          }, true);

          // E. Bỏ qua các hộp thoại alert/confirm cảnh báo từ hệ thống tiếng Anh
          try {
            window.alert = function(msg) {
              console.log("[AI Shield] 🔕 Đã bỏ qua cảnh báo alert:", msg);
            };
            window.confirm = function(msg) {
              console.log("[AI Shield] 🛡️ Đã tự động chấp thuận confirm:", msg);
              return true;
            };
            window.prompt = function(msg) {
              console.log("[AI Shield] 🔕 Bỏ qua prompt:", msg);
              return null;
            };
            window.onbeforeunload = null;
          } catch(e) {}

          console.log("[AI Shield] 🛡️ Lá chắn chống cảnh báo hệ thống tiếng Anh đã sẵn sàng bảo vệ!");
        })();
      `;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    } catch (e) {
      console.warn("[AI Shield] Không thể tiêm script lá chắn:", e);
    }
  }

  activateAntiWarningGuard();

  // 1. Chặn các hộp thoại modal/alert mặc định của trình duyệt làm đóng băng luồng JS trong content script
  try {
    window.alert = function (msg) { console.log("[Shield 24/7] Bỏ qua alert:", msg); };
    window.confirm = function (msg) { console.log("[Shield 24/7] Tự động confirm OK:", msg); return true; };
    window.prompt = function (msg) { console.log("[Shield 24/7] Bỏ qua prompt:", msg); return null; };
    window.onbeforeunload = null;
  } catch (e) {}

  // 2. Ghi nhận thời điểm hoạt động gần nhất để Watchdog theo dõi chống treo
  let lastProgressTimestamp = Date.now();
  function recordProgress(action = "") {
    lastProgressTimestamp = Date.now();
    if (action) console.log(`[Watchdog 24/7] ⏱️ Ghi nhận hoạt động: ${action} (${new Date().toLocaleTimeString()})`);
  }

  // 3. Giữ Chrome Tab không bị Sleep / Discard (Tối ưu siêu nhẹ: phát 1 xung ngắn thay vì loop liên tục)
  let silentAudioEl = null;
  let lastAudioTickTime = 0;
  async function startSilentAudioKeepAlive() {
    try {
      // Chỉ bật khi người dùng bật chế độ 24/24 trong cài đặt
      const storage = await chrome.storage.local.get(["run247Mode"]);
      if (storage && storage.run247Mode === false) return;

      const now = Date.now();
      // Chỉ phát 1 xung nhẹ mỗi 90 giây thay vì loop liên tục gây nghẽn CPU audio thread
      if (now - lastAudioTickTime < 90000) return;
      lastAudioTickTime = now;

      if (!silentAudioEl) {
        const silentWavBase64 = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
        silentAudioEl = new Audio(silentWavBase64);
        silentAudioEl.volume = 0.001;
      }
      silentAudioEl.play().catch(() => {});
    } catch (e) {}
  }

  function stopSilentAudioKeepAlive() {
    try {
      if (silentAudioEl) {
        silentAudioEl.pause();
        silentAudioEl.removeAttribute("src");
        silentAudioEl = null;
      }
    } catch (e) {}
  }

  // 4. Cổng kết nối dài hạn Heartbeat với Service Worker (Background)
  let keepAlivePort = null;
  function setupKeepAlivePort() {
    try {
      if (keepAlivePort) {
        try { keepAlivePort.disconnect(); } catch (e) {}
      }
      keepAlivePort = chrome.runtime.connect({ name: "keepAlivePort247" });
      keepAlivePort.onDisconnect.addListener(() => {
        keepAlivePort = null;
        setTimeout(setupKeepAlivePort, 2000);
      });
      keepAlivePort.onMessage.addListener(() => {});
    } catch (e) {
      setTimeout(setupKeepAlivePort, 5000);
    }
  }

  // Gửi heartbeat ping mỗi 20 giây
  setInterval(() => {
    try {
      if (keepAlivePort) {
        keepAlivePort.postMessage({ type: "PING" });
      } else {
        setupKeepAlivePort();
      }
      chrome.runtime.sendMessage({ action: "ping_keep_alive" }, () => {
        if (chrome.runtime.lastError) {}
      });
    } catch (e) {
      setupKeepAlivePort();
    }
  }, 20000);
  setupKeepAlivePort();

  // 5. Watchdog tự phục hồi: Tự động phát hiện treo trang và khôi phục vòng lặp
  function init247Watchdog() {
    setInterval(async () => {
      try {
        const res = await chrome.storage.local.get(["masterAutoMode", "autoNextMode", "run247Mode"]);
        const isMaster = Boolean(res?.masterAutoMode);
        const isNext = Boolean(res?.autoNextMode);

        if (!isMaster && !isNext) return;

        // Đảm bảo audio keep-alive luôn hoạt động
        startSilentAudioKeepAlive();

        // Nếu chế độ đang bật nhưng cờ JS bị tắt (do lỗi hoặc gián đoạn)
        if (isMaster && !isMasterAutoRunning) {
          console.warn("[Watchdog 24/7] ⚠️ Phát hiện Siêu Auto bị ngắt quãng, tự khởi động lại vòng lặp...");
          startMasterAuto();
          return;
        }

        // Nếu trang bị kẹt/treo hoàn toàn không có tiến triển > 10 phút (600 giây)
        const idleTime = Date.now() - lastProgressTimestamp;
        if (idleTime > 600000) {
          console.warn(`[Watchdog 24/7] ⚠️ Trang không có tiến triển ${Math.round(idleTime / 1000)}s. Thử khởi động lại vòng lặp giải bài...`);
          lastProgressTimestamp = Date.now();
          if (isMaster) startMasterAuto();
        }
      } catch (err) {
        if (err?.message?.includes("Extension context invalidated")) {
          console.warn("[Watchdog 24/7] Extension context invalidated.");
        }
      }
    }, 15000);
  }
  init247Watchdog();

  // Bắt giữ Audio playback từ trang web (TOEIC Listening) - Tuân thủ CSP 100%, không inject script
  function initAudioListeners() {
    function handleMediaEvent(event) {
      const target = event.target;
      if (!target) return;
      if (target.tagName === "AUDIO" || target.tagName === "VIDEO") {
        const src = target.currentSrc || target.src || target.getAttribute("src");
        if (src && !src.startsWith("blob:") && !src.startsWith("data:")) {
          window.__capturedAudioUrl = src;
          console.log("[Content] 🎵 Bắt được audio đang phát qua event:", src);
          chrome.runtime.sendMessage({ action: "save_audio", url: src });
        }
      }
    }

    window.addEventListener("play", handleMediaEvent, true);
    window.addEventListener("playing", handleMediaEvent, true);
    window.addEventListener("loadeddata", handleMediaEvent, true);
    window.addEventListener("canplay", handleMediaEvent, true);
  }
  initAudioListeners();
  initAutoQuestionWatcher();



  // =========================================================================
  // HỆ THỐNG GIAO DIỆN & PHÍM TẮT ĐIỀU KHIỂN (TOOLBAR, MINIMIZE, HIDE, HOTKEYS)
  // =========================================================================

  // =========================================================================
  // HỆ THỐNG GIAO DIỆN & PHÍM TẮT ĐIỀU KHIỂN (TOOLBAR, MINIMIZE, HIDE, HOTKEYS)
  // =========================================================================

  let isToolbarHidden = false; // Mặc định tự động bật extension khi tải trang
  let isToolbarMinimized = false;
  let cachedToolbarEl = null;
  let cachedBubbleEl = null;

  // Đọc cấu hình ẩn/hiện và thu nhỏ từ storage đã lưu
  try {
    chrome.storage.local.get(["ai_toolbar_hidden", "ai_toolbar_minimized"], (res) => {
      if (res) {
        if (typeof res.ai_toolbar_hidden === "boolean") {
          isToolbarHidden = res.ai_toolbar_hidden;
        }
        if (typeof res.ai_toolbar_minimized === "boolean") {
          isToolbarMinimized = res.ai_toolbar_minimized;
        }
        updateToolbarDisplay();
      }
    });
  } catch (e) {}

  // Lắng nghe thay đổi trạng thái ẩn/hiện từ chrome.storage (Đồng bộ tức thì mọi iframe và cửa sổ chính)
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") {
        if (changes.ai_toolbar_hidden !== undefined) {
          isToolbarHidden = Boolean(changes.ai_toolbar_hidden.newValue);
          updateToolbarDisplay();
        }
        if (changes.ai_toolbar_minimized !== undefined) {
          isToolbarMinimized = Boolean(changes.ai_toolbar_minimized.newValue);
          updateToolbarDisplay();
        }
      }
    });
  } catch (e) {}

  // Hiển thị thông báo Toast nhẹ nhàng ở góc màn hình (Chỉ hiện khi KHÔNG ở chế độ ẩn tàng hình)
  function showAiToast(msg, duration = 2500) {
    if (window !== window.top) return;
    if (isToolbarHidden) return; // Đang ở chế độ tàng hình -> Tuyệt đối không hiện toast

    const oldToast = document.getElementById("ai-solver-toast");
    if (oldToast) oldToast.remove();

    const toast = document.createElement("div");
    toast.id = "ai-solver-toast";
    toast.innerHTML = msg;
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, duration);
  }

  // Cập nhật trạng thái hiển thị của Toolbar và Bubble
  function updateToolbarDisplay() {
    const card = document.getElementById("ai-solver-card");
    const modal = document.getElementById("ai-review-modal");
    const toast = document.getElementById("ai-solver-toast");

    if (isToolbarHidden) {
      // 1. Chế độ Tàng Hình: Gỡ bỏ khỏi DOM
      if (cachedToolbarEl && cachedToolbarEl.parentNode) {
        cachedToolbarEl.remove();
      }
      if (cachedBubbleEl && cachedBubbleEl.parentNode) {
        cachedBubbleEl.remove();
      }
      if (card) card.remove();
      if (modal) modal.remove();
      if (toast) toast.remove();
    } else {
      // 2. Chế độ Hiển Thị: Gắn vào document.body
      if (!document.body) return;
      initToolbarElements();

      if (isToolbarMinimized) {
        if (cachedToolbarEl && cachedToolbarEl.parentNode) {
          if (cachedToolbarEl.style.left) {
            cachedBubbleEl.style.setProperty("left", cachedToolbarEl.style.left, "important");
            cachedBubbleEl.style.setProperty("top", cachedToolbarEl.style.top, "important");
            cachedBubbleEl.style.setProperty("right", "auto", "important");
          }
          cachedToolbarEl.remove();
        }
        if (cachedBubbleEl && !cachedBubbleEl.parentNode) {
          document.body.appendChild(cachedBubbleEl);
        }
      } else {
        if (cachedBubbleEl && cachedBubbleEl.parentNode) {
          if (cachedBubbleEl.style.left) {
            cachedToolbarEl.style.setProperty("left", cachedBubbleEl.style.left, "important");
            cachedToolbarEl.style.setProperty("top", cachedBubbleEl.style.top, "important");
            cachedToolbarEl.style.setProperty("right", "auto", "important");
          }
          cachedBubbleEl.remove();
        }
        if (cachedToolbarEl && !cachedToolbarEl.parentNode) {
          document.body.appendChild(cachedToolbarEl);
        }
      }
    }
  }

  // Bật/Tắt ẩn hiện Toolbar (Ẩn triệt để - Tàng hình chống cảnh báo)
  function toggleToolbarVisibility(notify = false) {
    isToolbarHidden = !isToolbarHidden;
    updateToolbarDisplay();

    try {
      chrome.storage.local.set({ ai_toolbar_hidden: isToolbarHidden });
    } catch (e) {}

    // Gửi thông báo broadcast để đồng bộ ngay lập tức tới tất cả các tab & iframe
    try {
      chrome.runtime.sendMessage({
        action: "set_toolbar_state_broadcast",
        hidden: isToolbarHidden
      }).catch(() => {});
    } catch (e) {}

    if (notify && !isToolbarHidden) {
      showAiToast(`🤖 <strong>AI Extension đã sẵn sàng!</strong> <span style="color:#94a3b8;">(Bấm <kbd>Alt + Z</kbd> hoặc <kbd>Alt + H</kbd> để ẩn)</span>`, 1800);
    }
  }

  // Thu nhỏ hoặc mở rộng Toolbar
  function setToolbarMinimized(minimized, notify = false) {
    isToolbarMinimized = minimized;
    updateToolbarDisplay();

    try {
      chrome.storage.local.set({ ai_toolbar_minimized: isToolbarMinimized });
    } catch (e) {}

    if (notify && minimized && !isToolbarHidden) {
      showAiToast(`📦 <strong>Đã thu nhỏ toolbar</strong> <span style="color:#94a3b8;">(Bấm icon 🤖 hoặc <kbd>Alt + Z</kbd>)</span>`);
    }
  }

  // Cài đặt kéo thả (Draggable) linh hoạt cho Toolbar, Bubble, Card kết quả và Modal
  function setupDraggable(element) {
    if (!element || element._draggableInit) return;
    element._draggableInit = true;

    let isMouseDown = false;
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    element.addEventListener("mousedown", (e) => {
      // Chỉ kích hoạt kéo thả khi nhấn vào header (.ai-card-header, #ai-drag-handle) hoặc bubble
      const isHandle = Boolean(e.target.closest("#ai-drag-handle, .ai-card-header, #ai-solver-bubble"));
      if (!isHandle) return;
      // Không kéo thả khi click các nút bấm, input, resize handle
      if (e.target.closest("button, input, select, a, .ai-card-resize-handle")) return;

      isMouseDown = true;
      isDragging = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = element.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
    });

    window.addEventListener("mousemove", (e) => {
      if (!isMouseDown) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!isDragging && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        isDragging = true;
        element.style.setProperty("right", "auto", "important");
      }
      if (isDragging) {
        let newLeft = Math.max(5, Math.min(window.innerWidth - element.offsetWidth - 5, initialLeft + dx));
        let newTop = Math.max(5, Math.min(window.innerHeight - element.offsetHeight - 5, initialTop + dy));
        element.style.setProperty("left", `${newLeft}px`, "important");
        element.style.setProperty("top", `${newTop}px`, "important");
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (!isMouseDown) return;
      const wasDragging = isDragging;
      isMouseDown = false;
      isDragging = false;

      // Nếu là bubble và người dùng chỉ nhấp chuột (không phải kéo thả) -> Mở rộng thanh công cụ ngay lập tức!
      if (element.id === "ai-solver-bubble" && !wasDragging) {
        setToolbarMinimized(false);
      }
    });
  }

  // Cài đặt kéo dãn / mở rộng (Resizable) mượt mà cho bảng kết quả và modal
  function setupResizable(element) {
    if (!element) return;
    let handle = element.querySelector(".ai-card-resize-handle");
    if (!handle) {
      handle = document.createElement("div");
      handle.className = "ai-card-resize-handle";
      handle.title = "Kéo để kéo dài / mở rộng bảng đáp án";
      element.appendChild(handle);
    }

    if (element._resizableInit) return;
    element._resizableInit = true;

    let isResizing = false;
    let startX = 0, startY = 0;
    let startW = 0, startH = 0;

    element.addEventListener("mousedown", (e) => {
      const resizeHandle = e.target.closest(".ai-card-resize-handle");
      if (!resizeHandle) return;
      e.preventDefault();
      e.stopPropagation();
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = element.offsetWidth;
      startH = element.offsetHeight;
      document.body.style.cursor = "nwse-resize";
    });

    window.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      const dw = e.clientX - startX;
      const dh = e.clientY - startY;
      const newW = Math.max(300, Math.min(window.innerWidth - element.offsetLeft - 10, startW + dw));
      const newH = Math.max(180, Math.min(window.innerHeight - element.offsetTop - 10, startH + dh));
      element.style.setProperty("width", `${newW}px`, "important");
      element.style.setProperty("height", `${newH}px`, "important");
      element.style.setProperty("max-height", `${newH}px`, "important");
    });

    window.addEventListener("mouseup", () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = "";
      }
    });
  }

  // Tạo các thành phần Toolbar & Bubble (Sử dụng SVG để chống bị trình dịch thay thế)
  function initToolbarElements() {
    if (window !== window.top) return;
    if (cachedToolbarEl) return cachedToolbarEl;

    const toolbar = document.createElement("div");
    toolbar.id = "ai-solver-toolbar";
    toolbar.className = "notranslate";
    toolbar.style.setProperty("display", "inline-flex", "important");
    toolbar.style.setProperty("flex-direction", "row", "important");
    toolbar.style.setProperty("flex-wrap", "nowrap", "important");
    toolbar.style.setProperty("align-items", "center", "important");
    toolbar.style.setProperty("height", "44px", "important");
    toolbar.style.setProperty("min-height", "44px", "important");
    toolbar.style.setProperty("max-height", "44px", "important");
    toolbar.style.setProperty("width", "auto", "important");
    toolbar.style.setProperty("max-width", "fit-content", "important");
    toolbar.style.setProperty("padding", "4px 10px", "important");
    toolbar.style.setProperty("margin", "0px", "important");
    toolbar.style.setProperty("box-sizing", "border-box", "important");
    toolbar.style.setProperty("border-radius", "50px", "important");
    toolbar.innerHTML = `
      <div class="ai-toolbar-drag-handle notranslate" id="ai-drag-handle" title="Nhấp giữ chuột để kéo di chuyển thanh AI">
        <span class="notranslate">⋮⋮</span>
      </div>
      <button class="ai-toolbar-btn notranslate" id="ai-btn-solve" title="Quét & Giải câu này (Phím tắt: Alt + S)">
        <span class="notranslate">⚡</span> <span class="notranslate" id="ai-solve-text">Quét & Giải</span>
      </button>
      <button class="ai-toolbar-btn notranslate" id="ai-btn-autonext" title="Tự động Next câu liên tục (Phím tắt: Alt + A)">
        <span class="notranslate">🔄</span> <span class="notranslate" id="ai-autonext-text">Tự Động Next</span>
      </button>
      <button class="ai-toolbar-btn notranslate" id="ai-btn-masterauto" title="Tự động chọn bài, giải bài tập và làm sạch cả khóa học (Phím tắt: Alt + M)">
        <span class="notranslate">🚀</span> <span class="notranslate" id="ai-masterauto-text">Siêu Auto</span>
      </button>
      <button class="ai-toolbar-btn notranslate" id="ai-btn-review" title="Dò lại bài thi xem đã hoàn thành hết các câu chưa">
        <span class="notranslate">🔍</span> <span class="notranslate" id="ai-review-text">Dò Lại Bài</span>
      </button>
      <button class="ai-toolbar-btn notranslate" id="ai-btn-history" title="Xem & Tải lịch sử đáp án bài thi này (Phím tắt: Alt + L)">
        <span class="notranslate">📜</span> <span class="notranslate" id="ai-history-text">Lịch Sử</span>
      </button>
      <button class="ai-toolbar-btn notranslate" id="ai-btn-next" title="Chuyển ngay sang câu tiếp theo (Phím tắt: Alt + N)">
        <span class="notranslate">⏭️</span>
      </button>
      <div class="ai-toolbar-divider notranslate"></div>
      <button class="ai-toolbar-icon-btn minimize notranslate" id="ai-btn-minimize" title="Thu nhỏ toolbar thành bong bóng nổi">
        <span class="notranslate">➖</span>
      </button>
      <button class="ai-toolbar-icon-btn close notranslate" id="ai-btn-close" title="Ẩn tạm thời (Phím tắt: Alt + Z hoặc Alt + H)">
        <span class="notranslate">✖</span>
      </button>
    `;

    // Tạo Floating Mini Bubble (Sử dụng biểu tượng Robot SVG sắc nét, không bị Google Translate can thiệp)
    const bubble = document.createElement("div");
    bubble.id = "ai-solver-bubble";
    bubble.className = "notranslate";
    bubble.title = "Bấm để mở bảng điều khiển AI Solver (Phím tắt: Alt + Z hoặc Alt + H)";
    bubble.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="pointer-events:none;display:block;">
        <rect x="3" y="6" width="18" height="13" rx="4" fill="white"/>
        <circle cx="8.5" cy="12.5" r="1.75" fill="#0284c7"/>
        <circle cx="15.5" cy="12.5" r="1.75" fill="#0284c7"/>
        <path d="M10 16H14" stroke="#0284c7" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M12 2V6" stroke="white" stroke-width="2" stroke-linecap="round"/>
        <circle cx="12" cy="2" r="1.5" fill="white"/>
      </svg>
    `;

    // Gắn sự kiện các nút trên Toolbar
    toolbar.querySelector("#ai-btn-solve").addEventListener("click", () => {
      triggerScanAndSolve();
    });

    toolbar.querySelector("#ai-btn-autonext").addEventListener("click", () => {
      toggleAutoNextLoop();
    });

    toolbar.querySelector("#ai-btn-masterauto").addEventListener("click", () => {
      toggleMasterAuto();
    });

    toolbar.querySelector("#ai-btn-review").addEventListener("click", () => {
      runReviewAndCheckCompletion();
    });

    toolbar.querySelector("#ai-btn-history").addEventListener("click", () => {
      showHistoryModal();
    });

    toolbar.querySelector("#ai-btn-next").addEventListener("click", () => {
      findAndClickNextButton();
    });

    // Nút thu nhỏ về bong bóng
    toolbar.querySelector("#ai-btn-minimize").addEventListener("click", (e) => {
      e.stopPropagation();
      setToolbarMinimized(true, true);
    });

    // Nút đóng/ẩn hoàn toàn
    toolbar.querySelector("#ai-btn-close").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleToolbarVisibility(false);
    });

    // Click vào bubble để mở lại toolbar
    bubble.addEventListener("click", (e) => {
      e.stopPropagation();
      setToolbarMinimized(false);
    });

    // Kéo thả di chuyển linh hoạt
    setupDraggable(toolbar);
    setupDraggable(bubble);

    cachedToolbarEl = toolbar;
    cachedBubbleEl = bubble;

    return cachedToolbarEl;
  }

  // Tự động BẬT và gắn Toolbar vào DOM liên tục không bao giờ bị mất giao diện
  function autoStartAndMount() {
    if (window !== window.top) return;

    function doMount() {
      if (!document.body) return;
      if (!isToolbarHidden) {
        initToolbarElements();
        updateToolbarDisplay();
      }
    }

    // 1. Thử gắn ngay
    doMount();

    // 2. Gắn khi DOM sẵn sàng
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", doMount);
    }
    window.addEventListener("load", doMount);

    // 3. Quét định kỳ mỗi 500ms trong 10 giây đầu để chống SPA xóa DOM
    let mountAttempts = 0;
    const mountTimer = setInterval(() => {
      mountAttempts++;
      doMount();
      if (mountAttempts >= 20) clearInterval(mountTimer);
    }, 500);

    // 4. Lắng nghe thay đổi URL trên Single Page App (SPA) của EdToeic
    window.addEventListener("hashchange", () => {
      setTimeout(doMount, 300);
      setTimeout(doMount, 1000);
    });
    window.addEventListener("popstate", () => {
      setTimeout(doMount, 300);
    });
  }

  autoStartAndMount();

  // =========================================================================
  // BẮT SỰ KIỆN BÀN PHÍM TOÀN TRANG (KEYBOARD SHORTCUTS LISTENER)
  // =========================================================================
  window.addEventListener("keydown", (e) => {
    // 1. Phím tắt Escape: Đóng nhanh bảng kết quả, review modal hoặc history modal nếu đang mở
    if (e.key === "Escape") {
      const card = document.getElementById("ai-solver-card");
      const modal = document.getElementById("ai-review-modal");
      const historyModal = document.getElementById("ai-history-modal");
      if (card || modal || historyModal) {
        if (card) card.remove();
        if (modal) modal.remove();
        if (historyModal) historyModal.remove();
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
        return;
      }
    }

    // 2. Phím tắt Bật/Tắt Ẩn/Hiện Extension (Tàng hình chống hệ thống tiếng Anh cảnh báo):
    // Hỗ trợ: Alt + Z, Alt + H, F2, hoặc Ctrl + Shift + H
    const isAlt = e.altKey;
    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;
    const key = (e.key || "").toLowerCase();
    const code = e.code;

    const isToggleHotkey =
      (isAlt && (key === "z" || code === "KeyZ" || key === "h" || code === "KeyH")) ||
      (isCtrl && isShift && (key === "h" || code === "KeyH")) ||
      (e.key === "F2");

    if (isToggleHotkey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      console.log("[Hotkey] 🛡️ Kích hoạt phím tắt Ẩn/Hiện Tàng Hình!");
      toggleToolbarVisibility();
      return;
    }

    // Nếu đang nhập liệu trong thẻ input/textarea thì không kích hoạt các phím tắt làm bài
    const activeEl = document.activeElement;
    const isEditing = activeEl && (
      activeEl.tagName === "INPUT" ||
      activeEl.tagName === "TEXTAREA" ||
      activeEl.isContentEditable
    );
    if (isEditing) return;

    // 3. Phím tắt Alt + S: Giải câu hiện tại (hoạt động kể cả khi đang ẩn)
    if (isAlt && (key === "s" || code === "KeyS")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      console.log("[Hotkey] ⚡ Nhấn Alt + S: Kích hoạt Giải Câu Này!");
      if (!isToolbarHidden) {
        showAiToast("⚡ Đang quét và giải câu này...");
      }
      triggerScanAndSolve();
      return;
    }

    // 4. Phím tắt Alt + N: Next câu tiếp theo
    if (isAlt && (key === "n" || code === "KeyN")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      console.log("[Hotkey] ⏭️ Nhấn Alt + N: Chuyển câu tiếp theo!");
      findAndClickNextButton();
      return;
    }

    // 5. Phím tắt Alt + A: Bật/Tắt Tự Động Next
    if (isAlt && (key === "a" || code === "KeyA")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      console.log("[Hotkey] ⚡ Nhấn Alt + A: Bật/Tắt Tự Động Next!");
      toggleAutoNextLoop();
      return;
    }

    // 6. Phím tắt Alt + M: Bật/Tắt Siêu Auto (Cả Khóa)
    if (isAlt && (key === "m" || code === "KeyM")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      console.log("[Hotkey] 🚀 Nhấn Alt + M: Bật/Tắt Siêu Auto!");
      toggleMasterAuto();
      return;
    }

    // 7. Phím tắt Alt + L: Xem & Tải Lịch Sử Đáp Án Bài Thi
    if (isAlt && (key === "l" || code === "KeyL")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      console.log("[Hotkey] 📜 Nhấn Alt + L: Mở Lịch Sử Đáp Án Bài Thi!");
      showHistoryModal();
      return;
    }
  }, true);

  // Lắng nghe lệnh từ popup.js và background.js (Commands)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ping") {
      sendResponse({ status: "ready" });
      return;
    }

    // Phím tắt hoặc lệnh toggle toolbar
    if (request.action === "toggle_toolbar") {
      toggleToolbarVisibility();
      sendResponse({ success: true, hidden: isToolbarHidden });
      return;
    }

    if (request.action === "get_toolbar_state") {
      sendResponse({ hidden: isToolbarHidden, minimized: isToolbarMinimized });
      return;
    }

    if (request.action === "set_toolbar_state" || request.action === "set_toolbar_state_broadcast") {
      if (typeof request.hidden === "boolean") {
        isToolbarHidden = request.hidden;
      } else {
        isToolbarHidden = !isToolbarHidden;
      }
      if (typeof request.minimized === "boolean") {
        isToolbarMinimized = request.minimized;
      }
      updateToolbarDisplay();
      try {
        chrome.storage.local.set({
          ai_toolbar_hidden: isToolbarHidden,
          ai_toolbar_minimized: isToolbarMinimized
        });
      } catch (e) {}
      sendResponse({ success: true, hidden: isToolbarHidden, minimized: isToolbarMinimized });
      return;
    }

    if (request.action === "next_question") {
      findAndClickNextButton();
      sendResponse({ success: true });
      return;
    }

    if (request.action === "scan_and_solve" || request.action === "solve_question") {
      triggerScanAndSolve()
        .then(res => {
          sendResponse(res);
          if (request.autoNext) {
            console.log("[AutoNext] Đã giải xong câu đầu, chuẩn bị bấm Next và giải tiếp...");
            setTimeout(() => {
              startAutoNextLoop(true); // Câu hiện tại đã giải xong, bấm Next để sang câu kế tiếp
            }, 1800);
          }
        })
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (request.action === "toggle_master_auto") {
      if (request.enabled) {
        startMasterAuto();
      } else {
        stopMasterAuto();
      }
      sendResponse({ success: true, running: isMasterAutoRunning });
      return;
    }

    if (request.action === "start_auto_next") {
      startAutoNextLoop(false);
      sendResponse({ success: true, running: true });
      return;
    }

    if (request.action === "stop_auto_next") {
      stopAutoNextLoop();
      sendResponse({ success: true, running: false });
      return;
    }
  });

  /**
   * Trích xuất dấu vân tay (fingerprint) của câu hỏi hiện tại trên màn hình
   * Giúp tự động phát hiện ngay lập tức khi đề thi chuyển sang câu hỏi mới
   */
  function getQuestionFingerprint() {
    const allDocsText = getCachedPageText(1200);

    // 1. Tiêu đề câu hỏi / số thứ tự câu (vd: Listening Part 2 • Câu 5 hoặc Question 5 of 100)
    const title = getCurrentQuestionTitle() || "";

    // 2. Số câu trước danh sách đáp án (vd: "5.\n(A)" hoặc "5.\n")
    const numMatch = allDocsText.match(/(?:^|\n|\r)\s*(\d{1,3})\s*\.\s*(?:\([A-D]\)|[A-D]\.|\n)/);
    const itemNum = numMatch ? `Num:${numMatch[1]}` : "";

    // 3. Chữ ký các input radio/checkbox hiện tại trên trang
    const inputs = queryAllInDocs("input[type='radio'], input[type='checkbox'], select");
    const inputSig = inputs.slice(0, 8).map(i => `${i.name || ""}_${i.id || ""}_${i.value || ""}`).join("|");

    // 4. Nếu có câu hỏi dạng kéo thả
    const draggables = queryAllInDocs(".ui-draggable, .draggable, .dropTarget");
    const dragSig = draggables.slice(0, 4).map(d => (d.textContent || "").trim().substring(0, 8)).join("|");

    if (!title && !itemNum && inputs.length === 0 && draggables.length === 0) {
      return null;
    }

    return `${window.location.pathname}__${title}__${itemNum}__${inputSig}__${dragSig}`;
  }

  /**
   * Kiểm tra xem trang hiện tại có phải là bài tập hoặc bài kiểm tra không
   */
  function isExerciseOrTestPage() {
    const url = window.location.href.toLowerCase();
    if (url.includes("learningarea") || url.includes("test.aspx") || url.includes("/runtime/") || url.includes("toeicolpc.com")) {
      return true;
    }
    const allText = getCachedPageText(1500);
    if (/(?:Question|Câu)\s*\d+/i.test(allText)) return true;
    if (queryAllInDocs("input[type='radio'], input[type='checkbox'], select").length > 0) return true;
    return false;
  }

  /**
   * Bộ giám sát chuyển câu tự động (Continuous Question Watcher)
   * Tối ưu hóa: Giãn chu kỳ kiểm tra lên 2500ms để CPU luôn ở mức cực thấp (< 3%)
   */
  function initAutoQuestionWatcher() {
    setInterval(async () => {
      // ⛔ 1. CHỈ CHẠY KHI MỘT TRONG CÁC CHẾ ĐỘ AUTO ĐANG THỰC SỰ BẬT!
      if (!isAutoNextRunning && !isMasterAutoRunning) {
        return;
      }

      // Nếu đang trong tiến trình giải câu, nhường toàn bộ CPU
      if (isSolvingCurrentQuestion) {
        return;
      }

      // 0. Luôn ưu tiên phát hiện và nhấn nút chuyển tiếp Section (Start Section) TRƯỚC HẾT!
      if (findAndClickSectionTransitionButton()) {
        console.log("[AutoWatcher] 🚀 Đã tự động nhấn nút chuyển tiếp Section mới!");
        isSolvingCurrentQuestion = false;
        window._solvingStartTime = null;
        await sleep(1800);
        return;
      }

      // Watchdog bảo vệ: Nếu bị treo trạng thái isSolvingCurrentQuestion quá 15 giây, tự động giải phóng!
      if (isSolvingCurrentQuestion) {
        if (!window._solvingStartTime) {
          window._solvingStartTime = Date.now();
        } else if (Date.now() - window._solvingStartTime > 15000) {
          console.warn("[AutoWatcher] ⏱️ Cảnh báo: Trạng thái giải bị treo >15s, tự động giải phóng khóa để tiếp tục!");
          isSolvingCurrentQuestion = false;
          window._solvingStartTime = null;
          const sTxt = document.getElementById("ai-solve-text");
          if (sTxt) sTxt.innerText = "Giải Câu Này";
        }
        return;
      }
      window._solvingStartTime = null;

      // 0b. Kiểm tra nếu bài thi đã hoàn thành đến câu cuối cùng (màn hình tổng kết điểm) - dùng textContent tránh giật lag
      const allDocsText = getAllExerciseDocuments().map(d => d.body?.textContent || "").join(" ");
      if (allDocsText.includes("Your test score is:") || /Test\s*Score\s*:\s*\d+/i.test(allDocsText) || allDocsText.includes("You have reached the end of the test")) {
        return;
      }

      const currentFingerprint = getQuestionFingerprint();
      if (!currentFingerprint) return;

      // Nếu câu hỏi trên màn hình khác với câu vừa giải gần nhất và chưa được điền đáp án -> ĐÃ CHUYỂN SANG CÂU MỚI!
      if (currentFingerprint !== lastSolvedFingerprint && !isCurrentQuestionAnswered()) {
        console.log(`[AutoWatcher] 🔔 Phát hiện hệ thống tự chuyển sang câu mới!`);
        console.log(`[AutoWatcher] Cũ: ${lastSolvedFingerprint}`);
        console.log(`[AutoWatcher] Mới: ${currentFingerprint}`);

        // Đợi 500ms để câu mới ổn định (audio, radio inputs tải xong)
        await sleep(500);

        const recheckFp = getQuestionFingerprint();
        if (!recheckFp || recheckFp === lastSolvedFingerprint || isSolvingCurrentQuestion || isCurrentQuestionAnswered()) {
          return;
        }

        // Tự động kích hoạt phát âm thanh ngay khi phát hiện câu mới
        tryTriggerAudioPlayback();

        isSolvingCurrentQuestion = true;
        window._solvingStartTime = Date.now();
        lastSolvedFingerprint = recheckFp;

        try {
          const qTitle = getCurrentQuestionTitle() || "Câu mới";
          console.log(`[AutoWatcher] 🚀 Tự động giải câu mới: ${qTitle}`);
          showLoadingCard(`⚡ Tự động giải ${qTitle}...`);

          await triggerScanAndSolve();
        } catch (err) {
          console.warn("[AutoWatcher] Lỗi khi tự động giải câu mới:", err);
        } finally {
          isSolvingCurrentQuestion = false;
          window._solvingStartTime = null;
        }
      }
    }, 2500);
  }

  /**
   * Bật / Tắt chế độ Tự Động Next giải liên tục 1 bài
   */
  function toggleAutoNextLoop() {
    if (isAutoNextRunning) {
      stopAutoNextLoop();
    } else {
      startAutoNextLoop(false);
    }
  }

  function startAutoNextLoop(skipInitialSolve = false) {
    isAutoNextRunning = true;
    chrome.storage.local.set({ autoNextMode: true });
    updateAutoNextButtonUI(true);
    startSilentAudioKeepAlive();
    recordProgress("start_auto_next");
    runAutoNextLoop(skipInitialSolve);
  }

  function stopAutoNextLoop() {
    isAutoNextRunning = false;
    chrome.storage.local.set({ autoNextMode: false });
    updateAutoNextButtonUI(false);
    stopSilentAudioKeepAlive();
  }

  function updateAutoNextButtonUI(active) {
    const btn = document.getElementById("ai-btn-autonext");
    const text = document.getElementById("ai-autonext-text");
    if (btn && text) {
      if (active) {
        btn.classList.add("active");
        text.innerText = "⏹️ Dừng Auto";
      } else {
        btn.classList.remove("active");
        text.innerText = "Tự Động Next";
      }
    }
    if (cachedBubbleEl) {
      if (active) {
        cachedBubbleEl.classList.add("autonext-running");
      } else {
        cachedBubbleEl.classList.remove("autonext-running");
      }
    }
  }

  /**
   * Vòng lặp: Giải câu hiện tại -> Bấm Next -> Đợi tải -> Giải câu tiếp theo
   */
  async function runAutoNextLoop(skipInitialSolve = false) {
    console.log("[AutoNext] Bắt đầu vòng lặp giải tự động siêu tốc...");

    let isFirstIteration = true;

    while (isAutoNextRunning) {
      // 0. Nếu đang trong tiến trình AI giải, chờ nó giải và điền xong
      if (isSolvingCurrentQuestion) {
        await sleep(800);
        continue;
      }

      // 0a. Kiểm tra nếu có màn hình chuyển tiếp Section (Start Section)
      if (findAndClickSectionTransitionButton()) {
        console.log("[AutoNext] 🚀 Đã tự động nhấn nút chuyển tiếp Section mới!");
        await sleep(1800);
        continue;
      }

      // 0b. Kiểm tra nếu bài thi đã hoàn thành đến câu cuối cùng hoặc màn hình kết thúc
      const allDocsText = getCachedPageText();
      const isListening = isCurrentInListeningSection();
      const isEndReached = !isListening && (
        allDocsText.includes("Your test score is:") ||
        /Test\s*Score\s*:\s*\d+/i.test(allDocsText) ||
        allDocsText.includes("You have reached the end of the test")
      );

      if (isEndReached && !isFirstIteration) {
        console.log("[AutoNext] 🏁 Đã đến câu cuối cùng của bài thi! Tự động kích hoạt Dò Lại Toàn Bộ Bài...");
        stopAutoNextLoop();
        await runReviewAndCheckCompletion(true);
        break;
      }

      // 1. Kiểm tra xem câu hiện tại đã được giải và điền đáp án chưa
      const currentFp = getQuestionFingerprint();
      const answered = isCurrentQuestionAnswered();
      const shouldSolve = (!answered) || (currentFp && currentFp !== lastSolvedFingerprint && (!isFirstIteration || !skipInitialSolve));

      let currentCycleSolutions = null;
      if (shouldSolve) {
        try {
          console.log("[AutoNext] 🎯 Đang giải câu hỏi hiện tại...");
          const solveRes = await triggerScanAndSolve();
          currentCycleSolutions = solveRes?.solutions || null;
        } catch (err) {
          console.warn("[AutoNext] Lỗi khi giải câu:", err);
        }
        await sleep(500);
      }
      isFirstIteration = false;

      if (!isAutoNextRunning) break;

      // 2. BẢO VỆ CHỐNG BỎ SÓT CÂU: Kiểm tra kỹ và tự động chọn nếu còn câu trống
      if (!isCurrentQuestionAnswered()) {
        console.warn("[AutoNext] ⚠️ Phát hiện đáp án chưa được chọn đủ! Đang kích hoạt chọn bù...");
        await ensureAnswerChecked(currentCycleSolutions);
        await sleep(500);
      }

      // 3. KHÓA CHẶN NEXT: Đảm bảo đã chọn ít nhất một đáp án trước khi bấm Next
      if (!isCurrentQuestionAnswered()) {
        console.warn("[AutoNext] ⚠️ Câu hỏi chưa có đáp án sau khi giải, kích hoạt chọn đáp án khả dĩ nhất...");
        await ensureAnswerChecked(currentCycleSolutions);
        await sleep(400);
      }

      if (!isAutoNextRunning) break;

      // 4. Lưu fingerprint hiện tại trước khi bấm Next và xóa cache audio câu cũ
      const prevFp = getQuestionFingerprint();
      try {
        await chrome.runtime.sendMessage({ action: "clear_audio" });
      } catch (e) {}

      // 5. Tìm và bấm nút Next
      console.log("[AutoNext] ✅ Đã hoàn thành câu hỏi. Bấm nút Next sang câu tiếp theo...");
      const clicked = findAndClickNextButton();

      if (clicked) {
        // 5b. CHỜ ĐỢI ĐỘNG: Đợi trang thực sự chuyển sang câu mới (tối đa 4.5 giây)
        let transitioned = false;
        const startWait = Date.now();
        while (Date.now() - startWait < 4500) {
          await sleep(600);
          if (findAndClickSectionTransitionButton()) {
            transitioned = true;
            await sleep(1500);
            break;
          }
          const newFp = getQuestionFingerprint();
          if (newFp && newFp !== prevFp) {
            transitioned = true;
            console.log("[AutoNext] 🌟 Đã chuyển sang câu hỏi mới!");
            await sleep(600); // Chờ 600ms để DOM câu mới render xong radio
            break;
          }
        }
        if (!transitioned) {
          console.log("[AutoNext] Chuyển câu đang chờ hoặc đã đến câu cuối bài thi.");
        }
      } else {
        // Không tìm thấy nút Next thủ công (đặc trưng của phần thi Listening ETS tự động chuyển câu)
        const isListening = isCurrentInListeningSection();
        const hasQuestions = queryAllInDocs("input[type='radio'], input[type='checkbox']").length > 0;

        if (isListening || hasQuestions) {
          console.log("[AutoNext] ⏳ Đang ở bài thi Listening tự chuyển câu. Đang đợi hệ thống tự chuyển sang câu tiếp theo...");
          const solveText = document.getElementById("ai-solve-text");
          if (solveText) solveText.innerText = "Chờ câu mới...";
          const nextText = document.getElementById("ai-autonext-text");
          if (nextText) nextText.innerText = "Chờ chuyển câu...";

          let transitioned = false;
          const startWait = Date.now();
          while (isAutoNextRunning && Date.now() - startWait < 90000) {
            await sleep(1000);

            // 1. Kiểm tra nếu có nút chuyển tiếp Section
            if (findAndClickSectionTransitionButton()) {
              transitioned = true;
              await sleep(1500);
              break;
            }

            // 2. Kiểm tra nếu hệ thống đã tự chuyển sang câu mới
            const newFp = getQuestionFingerprint();
            if (newFp && newFp !== prevFp) {
              transitioned = true;
              console.log("[AutoNext] 🔔 Hệ thống ETS đã tự chuyển sang câu mới:", getCurrentQuestionTitle());
              await sleep(500);
              break;
            }

            // 3. Kiểm tra nếu bài thi kết thúc
            const allDocsText = getCachedPageText();
            if (allDocsText.includes("Your test score is:") || /Test\s*Score\s*:\s*\d+/i.test(allDocsText)) {
              transitioned = true;
              break;
            }
          }

          if (transitioned) {
            continue; // Tiếp tục vòng lặp để giải câu mới ngay lập tức!
          }
        }

        // Chỉ khi không phải listening và thực sự hết câu hỏi thì mới dừng để nộp bài
        console.log("[AutoNext] 🔍 Không còn nút Next, mở Item Review để kiểm tra...");
        stopAutoNextLoop();
        await runReviewAndCheckCompletion(true);
        break;
      }
    }
  }

  /**
   * =========================================================================
   * CHẾ ĐỘ SIÊU AUTO (CẢ KHÓA HỌC): TỰ CHỌN BÀI, TỰ HỌC, TỰ GIẢI BÀI TẬP VÀ TEST
   * =========================================================================
   */
  function toggleMasterAuto() {
    if (isMasterAutoRunning) {
      stopMasterAuto();
    } else {
      startMasterAuto();
    }
  }

  function startMasterAuto() {
    isMasterAutoRunning = true;
    chrome.storage.local.set({ masterAutoMode: true });
    updateMasterAutoButtonUI(true);
    startSilentAudioKeepAlive();
    recordProgress("start_master_auto");
    runMasterAutoLoop();
  }

  function stopMasterAuto() {
    isMasterAutoRunning = false;
    chrome.storage.local.set({ masterAutoMode: false });
    updateMasterAutoButtonUI(false);
    stopSilentAudioKeepAlive();
  }

  function updateMasterAutoButtonUI(active) {
    const btn = document.getElementById("ai-btn-masterauto");
    const text = document.getElementById("ai-masterauto-text");
    if (btn && text) {
      if (active) {
        btn.classList.add("active");
        text.innerText = "⏹️ Dừng Siêu Auto";
      } else {
        btn.classList.remove("active");
        text.innerText = "Siêu Auto";
      }
    }
    if (cachedBubbleEl) {
      if (active) {
        cachedBubbleEl.classList.add("auto-running");
        cachedBubbleEl.title = "Đang chạy Siêu Auto Cả Khóa (Bấm để mở bảng điều khiển • Alt + M để dừng)";
      } else {
        cachedBubbleEl.classList.remove("auto-running");
        cachedBubbleEl.title = "Bấm để mở bảng điều khiển AI Solver (Phím tắt: Alt + Z hoặc Alt + H)";
      }
    }
  }

  async function runMasterAutoLoop() {
    console.log("[MasterAuto] 🚀 Bắt đầu chế độ Siêu Auto Cả Khóa Học...");

    while (isMasterAutoRunning) {
      try {
        dismissModals();

        const inExercise = isExerciseOrTestPage();

        // 1. Màn hình bài tập / kiểm tra (bao gồm ets.toeicolpc.com / Test.aspx / LearningArea)
        if (inExercise) {
          dismissModals();

          // 0. Tự động xử lý các màn hình chuyển tiếp: Chọn test mode -> "Go" -> Chào mừng -> "Start" -> Directions -> "Next" -> "Start Section"
          if (findAndClickSectionTransitionButton()) {
            console.log("[MasterAuto] 🚀 Đã tự động kích hoạt nút chuyển tiếp màn hình thi!");
            recordProgress("section_transition_clicked");
            await sleep(1800);
            continue;
          }

          // A. Nếu đang ở màn hình kết thúc bài test (Score summary)
          const allDocsText = getCachedPageText();
          const isScoreSummary = (
            allDocsText.includes("Your test score is:") ||
            /Test\s*Score\s*:\s*\d+/i.test(allDocsText) ||
            allDocsText.includes("You have reached the end of the test")
          );

          if (isScoreSummary) {
            console.log("[MasterAuto] 🏆 Đã hoàn thành bài kiểm tra!");
            const storage = await chrome.storage.local.get(["run247Mode"]);
            const is247 = storage.run247Mode !== false; // Mặc định chế độ 24/24 được bật

            if (is247) {
              console.log("[MasterAuto 24/7] 🔄 Chế độ 24/24: Tự động hoàn tất bài thi và chuyển sang bài tiếp theo...");
              showResultsCard([{
                question_id: "Hoàn Thành",
                selected_value: "100%",
                explanation: "🎉 Chúc mừng bạn! Bài thi đã được giải xong toàn bộ. Đang tự động chuyển bài tiếp theo...",
                confidence: 1.0
              }]);
              recordProgress("test_finished_advancing_next");
              await sleep(3500);
              closeCompletedTestWindow(true);

              // Nếu là cửa sổ / tab popup riêng (Test.aspx hoặc toeicolpc), đóng tab để quay lại trang chủ khóa học LMS
              if (window.opener || window.location.href.toLowerCase().includes("test.aspx") || window.location.href.toLowerCase().includes("toeicolpc.com")) {
                try { window.close(); } catch(e) {}
              }
              await sleep(3000);
              continue; // Tiếp tục vòng lặp 24/24
            } else {
              console.log("[MasterAuto] 🏆 Đã hoàn thành bài kiểm tra! Dừng tự động và giữ nguyên trình duyệt.");
              closeCompletedTestWindow(false);
              showResultsCard([{
                question_id: "Hoàn Thành",
                selected_value: "100%",
                explanation: "🎉 Chúc mừng bạn! Bài thi đã được giải xong toàn bộ.",
                confidence: 1.0
              }]);
              break;
            }
          }

          // B. Quét kiểm tra xem có câu hỏi bài tập không
          let questions = await scanDOMQuestions();
          
          // Kiểm tra xem trang có dấu hiệu đề bài kiểm tra không
          const hasQuestionSign = /(?:Question|Câu)\s*\d+/i.test(allDocsText) || /Listening\s*Part/i.test(allDocsText) || /Reading\s*Part/i.test(allDocsText);

          // Nếu trang có đề bài nhưng scan chưa thấy phần tử (đang render DOM), thử quét lại tối đa 3 lần
          if (questions.length === 0 && hasQuestionSign) {
            for (let r = 0; r < 3; r++) {
              await sleep(600);
              questions = await scanDOMQuestions();
              if (questions.length > 0) break;
            }
          }

          if (questions.length > 0) {
            console.log(`[MasterAuto] 📝 Phát hiện ${questions.length} câu hỏi.`);
            const currentFp = getQuestionFingerprint();
            
            // 1. Luôn giải câu nếu chưa được chọn đáp án hoặc là câu mới
            if (!isCurrentQuestionAnswered() || (currentFp && currentFp !== lastSolvedFingerprint)) {
              try {
                console.log("[MasterAuto] 🎯 Đang giải câu hỏi bài tập...");
                await triggerScanAndSolve();
              } catch (solveErr) {
                console.warn("[MasterAuto] Lỗi giải:", solveErr);
              }
              await sleep(500);
            }

            // 2. BẢO VỆ CHỐNG BỎ SÓT: Đảm bảo đáp án đã được chọn
            if (!isCurrentQuestionAnswered()) {
              await ensureAnswerChecked();
              await sleep(500);
            }

            // 3. KHÓA BẢO VỆ TUYỆT ĐỐI: Không bao giờ bấm Next khi chưa điền đủ câu hỏi
            if (!isCurrentQuestionAnswered()) {
              console.error("[MasterAuto] ⛔ BẢO VỆ CHẶN NEXT: Chưa điền đủ câu hỏi, không bấm Next!");
              await sleep(1500);
              continue; // QUAY LẠI LẶP, KHÔNG BẤM NEXT
            }

            const prevFp = getQuestionFingerprint();
            const clicked = findAndClickNextButton();
            if (clicked) {
              // Đợi câu mới tải xong (tối đa 4.5 giây)
              let transitioned = false;
              const startWait = Date.now();
              while (Date.now() - startWait < 4500) {
                await sleep(600);
                if (findAndClickSectionTransitionButton()) {
                  transitioned = true;
                  await sleep(1500);
                  break;
                }
                const newFp = getQuestionFingerprint();
                if (newFp && newFp !== prevFp) {
                  transitioned = true;
                  await sleep(600); // Chờ 600ms để DOM câu mới ổn định
                  break;
                }
              }
            } else {
              // Không tìm thấy nút Next thủ công (đặc trưng của phần thi Listening ETS)
              const isListening = isCurrentInListeningSection();
              const hasQuestions = queryAllInDocs("input[type='radio'], input[type='checkbox']").length > 0;

              if (isListening || hasQuestions) {
                console.log("[MasterAuto] ⏳ Đang ở bài thi Listening tự chuyển câu. Đang đợi hệ thống tự chuyển sang câu tiếp theo...");
                const solveText = document.getElementById("ai-solve-text");
                if (solveText) solveText.innerText = "Chờ câu mới...";

                let transitioned = false;
                const startWait = Date.now();
                while (isMasterAutoRunning && Date.now() - startWait < 90000) {
                  await sleep(1000);

                  // 1. Kiểm tra nếu có nút chuyển tiếp Section
                  if (findAndClickSectionTransitionButton()) {
                    transitioned = true;
                    await sleep(1500);
                    break;
                  }

                  // 2. Kiểm tra nếu hệ thống đã tự chuyển sang câu mới
                  const newFp = getQuestionFingerprint();
                  if (newFp && newFp !== prevFp) {
                    transitioned = true;
                    console.log("[MasterAuto] 🔔 Hệ thống ETS đã tự chuyển sang câu mới:", getCurrentQuestionTitle());
                    await sleep(500);
                    break;
                  }

                  // 3. Kiểm tra nếu bài thi kết thúc
                  const allDocsText = getCachedPageText();
                  if (allDocsText.includes("Your test score is:") || /Test\s*Score\s*:\s*\d+/i.test(allDocsText)) {
                    transitioned = true;
                    break;
                  }
                }

                if (transitioned) {
                  continue; // Tiếp tục vòng lặp để giải câu mới ngay lập tức!
                }
              }

              // Nếu không còn nút Next và không phải listening, tự động mở Item Review để kiểm tra và nộp bài
              console.log("[MasterAuto] 🔍 Không còn nút Next, mở Item Review để kiểm tra và nộp bài...");
              await runReviewAndCheckCompletion(true);
              await sleep(2500);
            }
          } else {
            // Nếu trang có chữ Question nhưng chưa load xong, TUYỆT ĐỐI KHÔNG BẤM NEXT!
            if (hasQuestionSign) {
              console.log("[MasterAuto] ⏳ Trang câu hỏi đang tải DOM, đợi thêm...");
              await sleep(1000);
              continue;
            }

            // Chỉ bấm Next khi THỰC SỰ là màn hình hướng dẫn Directions/Intro không có câu hỏi:
            console.log("[MasterAuto] 📖 Màn hình lý thuyết Explore / Intro. Bấm Next qua bước...");
            await sleep(1500);
            findAndClickNextButton();
            await sleep(1000);
          }
        } else {
          // 2. Màn hình Trang Chủ / Chọn bài (edtoeic.engdis.com/EdToeic1#/home)
          console.log("[MasterAuto] 🏠 Đang ở trang chủ / chọn bài...");
          await sleep(1500);
          dismissModals();

          // A. ƯU TIÊN 1: Kiểm tra xem modal Assessment Center có đang mở và có bài thi sẵn sàng làm không
          let startTestBtn = findAssessmentCenterStartTestButton();
          if (startTestBtn) {
            console.log("[MasterAuto] 🎯 Bấm nút Start Test trong Assessment Center:", startTestBtn);
            triggerSmartClick(startTestBtn);
            await sleep(4000);
            continue;
          }

          // B. Nếu Assessment Center chưa mở, thử mở Assessment Center trên menu bên trái
          const acOpened = openAssessmentCenter();
          if (acOpened) {
            await sleep(2500);
            startTestBtn = findAssessmentCenterStartTestButton();
            if (startTestBtn) {
              console.log("[MasterAuto] 🎯 Bấm nút Start Test sau khi mở Assessment Center:", startTestBtn);
              triggerSmartClick(startTestBtn);
              await sleep(4000);
              continue;
            }
          }

          // C. ƯU TIÊN 2: Tìm nút Continue chính ở banner lớn
          const continueBtn = findHomeContinueButton();
          if (continueBtn) {
            console.log("[MasterAuto] 🎯 Bấm nút Continue chính để vào học tiếp:", continueBtn);
            triggerSmartClick(continueBtn);
            await sleep(3000);
            continue;
          }

          // D. ƯU TIÊN 3: Tìm nút bài học tiếp theo
          const nextLessonBtn = findNextIncompleteLessonButton();
          if (nextLessonBtn) {
            console.log("[MasterAuto] 🎯 Bấm nút vào bài học:", nextLessonBtn);
            triggerSmartClick(nextLessonBtn);
            await sleep(3000);
            continue;
          }
        }
      } catch (err) {
        console.warn("[MasterAuto] Ngoại lệ vòng lặp:", err);
      }

      await sleep(1000);
    }
  }

  function openAssessmentCenter() {
    const modalHeader = queryAllInDocs("h1, h2, h3, h4, div, span").find(el => {
      if (isAiElement(el) || !isElementVisible(el)) return false;
      const t = (el.innerText || "").trim().toLowerCase();
      return t === "assessment center" || t.includes("assessment center");
    });
    if (modalHeader && modalHeader.closest(".modal, .dialog, [role='dialog'], [class*='modal' i]")) {
      return true;
    }

    const sideNavItems = queryAllInDocs("a, button, li, div, i, span").filter(el => {
      if (isAiElement(el) || !isElementVisible(el)) return false;
      const title = (el.getAttribute("title") || "").toLowerCase();
      const tooltip = (el.getAttribute("data-original-title") || el.getAttribute("aria-label") || "").toLowerCase();
      const text = (el.innerText || "").toLowerCase();
      const cl = (el.className || "").toString().toLowerCase();
      const id = (el.id || "").toLowerCase();
      return (
        title.includes("assessment") || tooltip.includes("assessment") ||
        text.includes("assessment") || id.includes("assessment") || cl.includes("assessment")
      );
    });

    if (sideNavItems.length > 0) {
      console.log("[MasterAuto] 🎯 Click mở Assessment Center trên menu:", sideNavItems[0]);
      triggerSmartClick(sideNavItems[0]);
      return true;
    }
    return false;
  }

  function findAssessmentCenterStartTestButton() {
    const candidates = queryAllInDocs("button, a, input[type='button'], div[role='button']").filter(el => {
      if (isAiElement(el) || !isElementVisible(el)) return false;
      const t = (el.innerText || el.value || "").trim().toLowerCase();
      return t === "start test" || t === "start" || (el.className && el.className.toString().toLowerCase().includes("starttest"));
    });

    for (const b of candidates) {
      if (!b.disabled && !b.classList.contains("disabled") && !b.getAttribute("disabled")) {
        return b;
      }
    }
    return candidates[0] || null;
  }

  function findHomeContinueButton() {
    const all = Array.from(document.querySelectorAll("button, a, div[role='button'], div.btn, .btn, .continue"));
    return all.find(el => {
      if (isAiElement(el)) return false;
      const t = (el.innerText || "").trim().toLowerCase();
      const cl = (el.className || "").toString().toLowerCase();
      return (t === "continue" || t === "tiếp tục" || cl.includes("continue") || cl.includes("btn-continue")) && el.offsetParent !== null;
    });
  }

  function findNextIncompleteLessonButton() {
    // 1. Nút Lessons màu xanh lá ở unit card
    const lessonsBtn = Array.from(document.querySelectorAll("button, a, div[role='button'], div.btn")).find(el => {
      if (isAiElement(el)) return false;
      const t = (el.innerText || "").trim().toLowerCase();
      return (t === "lessons" || t === "bài học") && el.offsetParent !== null;
    });
    if (lessonsBtn) return lessonsBtn;

    // 2. Tìm bài học chưa hoàn thành trong danh sách
    const items = Array.from(document.querySelectorAll(".unit-item, .lesson-item, .lesson, [class*='lesson']")).filter(el => {
      if (isAiElement(el)) return false;
      return !el.innerText?.includes("Completed") && el.offsetParent !== null;
    });
    if (items.length > 0) return items[0];

    return null;
  }

  function dismissModals() {
    // 1. Quét tìm và đóng ngay popup "Please close any messages or popups before opening this link" của EdToeic
    const allModals = Array.from(document.querySelectorAll("div, [role='dialog'], .modal, .dialog, .popup, [class*='modal' i], [class*='popup' i], [class*='alert' i]"));
    for (const m of allModals) {
      if (isAiElement(m)) continue;
      const text = (m.innerText || "").toLowerCase();
      if (text.includes("please close any messages or popups") || text.includes("close any messages") || text.includes("before opening this link")) {
        const okBtn = Array.from(m.querySelectorAll("button, div, span, a, input[type='button']")).find(el => {
          const t = (el.innerText || el.value || "").trim().toLowerCase();
          return t === "ok" || t === "x" || t === "×" || el.classList.contains("close") || el.id?.includes("close");
        });
        if (okBtn) {
          console.log("[MasterAuto] 🔘 Tự động đóng popup EdToeic 'Please close any messages or popups':", okBtn);
          triggerSmartClick(okBtn);
          return true;
        }
      }
    }

    // 2. Quét các modal/dialog thông báo chung khác
    const btns = Array.from(document.querySelectorAll(".modal button, .dialog button, .popup button, button.ok, button.confirm, button.btn-primary, [role='dialog'] button, .bootbox button"));
    for (const b of btns) {
      if (isAiElement(b)) continue;
      const t = (b.innerText || "").trim().toLowerCase();
      if (t === "ok" || t === "yes" || t === "submit" || t === "đồng ý" || t === "xác nhận" || t === "close" || t === "đóng") {
        console.log("[MasterAuto] 🔘 Tự động đóng hộp thoại / modal:", b);
        triggerSmartClick(b);
        return true;
      }
    }
    return false;
  }

  // Dọn dẹp và tắt tự động chạy ngầm nếu đang ở màn hình trang chủ (home)
  function cleanupHomePageState() {
    const isHome = window.location.hash.includes("home") || window.location.href.includes("#/home");
    if (isHome) {
      stopMasterAuto();
      stopAutoNextLoop();
      try {
        chrome.storage.local.set({ masterAutoMode: false, autoNextMode: false });
      } catch (e) {}
      const card = document.getElementById("ai-solver-card");
      if (card) card.remove();
    }
  }

  cleanupHomePageState();
  window.addEventListener("hashchange", cleanupHomePageState);
  window.addEventListener("popstate", cleanupHomePageState);

  // Chỉ tiếp tục Auto khi THỰC SỰ đang ở trong bài tập/bài thi (Tuyệt đối không chạy ở trang chủ)
  chrome.storage.local.get(["masterAutoMode", "autoNextMode"], (res) => {
    const isHome = window.location.hash.includes("home") || window.location.href.includes("#/home");
    if (isHome) return;

    if (res && res.masterAutoMode && isExerciseOrTestPage()) {
      console.log("[MasterAuto] 🔄 Đang ở trong bài thi, tiếp tục Siêu Auto...");
      setTimeout(() => {
        if (!isMasterAutoRunning && isExerciseOrTestPage()) {
          startMasterAuto();
        }
      }, 1500);
    } else if (res && res.autoNextMode && isExerciseOrTestPage()) {
      console.log("[AutoNext] 🔄 Đang ở trong bài thi, tiếp tục Tự Động Next...");
      setTimeout(() => {
        if (!isAutoNextRunning && isExerciseOrTestPage()) {
          startAutoNextLoop(false);
        }
      }, 1500);
    }
  });

  /**
   * =========================================================================
   * HỖ TRỢ ĐA IFRAME (CROSS-FRAME / EMBEDDED FRAMES CỦA EDTOEIC)
   * =========================================================================
   */
  let _cachedExerciseDocs = null;
  let _cachedExerciseDocsTime = 0;

  function getElementScreenRect(el) {
    if (!el) return null;
    try {
      const rect = el.getBoundingClientRect();
      let left = rect.left;
      let top = rect.top;
      let right = rect.right;
      let bottom = rect.bottom;
      const width = rect.width;
      const height = rect.height;

      let doc = el.ownerDocument;
      let win = doc?.defaultView || window;

      while (win && win !== window.top) {
        try {
          const frameEl = win.frameElement;
          if (!frameEl) break;
          const fRect = frameEl.getBoundingClientRect();
          left += fRect.left;
          top += fRect.top;
          right = left + width;
          bottom = top + height;
          win = frameEl.ownerDocument?.defaultView || window;
        } catch (e) {
          break;
        }
      }

      return { left, top, right, bottom, width, height };
    } catch (e) {
      return el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    }
  }

  function isElementOnScreen(el) {
    if (!el) return false;
    try {
      const screenRect = getElementScreenRect(el);
      if (!screenRect) return false;
      const topWin = window.top || window;
      const screenW = topWin.innerWidth || window.innerWidth || 1920;
      const screenH = topWin.innerHeight || window.innerHeight || 1080;

      // Loại bỏ các phần tử nằm ngoài khung hình nhìn thấy (ví dụ iframe preload tại left: -9999px)
      if (screenRect.right <= 10 || screenRect.bottom <= 10) return false;
      if (screenRect.left >= screenW - 10 || screenRect.top >= screenH - 10) return false;
      if (screenRect.left <= -50 || screenRect.top <= -50) return false;

      return true;
    } catch (e) {
      return true;
    }
  }

  function isIframeVisible(ifr) {
    if (!ifr) return false;
    try {
      const win = ifr.ownerDocument?.defaultView || window;
      const style = win.getComputedStyle(ifr);
      if (!style || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const rect = ifr.getBoundingClientRect();
      if (rect.width <= 15 || rect.height <= 15) return false;
      if (ifr.offsetParent === null && style.position !== 'fixed') return false;

      // Loại bỏ hoàn toàn iframe buffer/preload nằm ngoài khung nhìn
      if (rect.right <= 10 || rect.bottom <= 10 || rect.left >= win.innerWidth - 10 || rect.top >= win.innerHeight - 10) return false;
      if (rect.left <= -50 || rect.top <= -50) return false;

      if (!isElementOnScreen(ifr)) return false;

      if (win !== window && win.frameElement) {
        return isIframeVisible(win.frameElement);
      }
      return true;
    } catch (e) {
      return true;
    }
  }

  function getAllExerciseDocuments() {
    const now = Date.now();
    if (_cachedExerciseDocs && (now - _cachedExerciseDocsTime < 1500)) {
      return _cachedExerciseDocs;
    }
    const docs = [document];
    function collectFrames(rootDoc) {
      try {
        const iframes = rootDoc.querySelectorAll("iframe, frame");
        for (let i = 0; i < iframes.length; i++) {
          try {
            const ifr = iframes[i];
            const src = (ifr.src || "").toLowerCase();
            if (src.includes("googlesyndication") || src.includes("doubleclick") || src.includes("googleads")) continue;
            // CHỐNG QUÉT TRÙNG LẶP: Bỏ qua hoàn toàn các iframe ẩn, clone hoặc preload
            if (!isIframeVisible(ifr)) continue;
            const innerDoc = ifr.contentDocument || ifr.contentWindow?.document;
            if (innerDoc && !docs.includes(innerDoc)) {
              docs.push(innerDoc);
              collectFrames(innerDoc);
            }
          } catch (eInner) {}
        }
      } catch (e) {}
    }
    collectFrames(document);
    _cachedExerciseDocs = docs;
    _cachedExerciseDocsTime = now;
    return docs;
  }

  // Bộ nhớ đệm văn bản trang web: Dùng textContent (0% Reflow CPU) thay vì innerText (gây 100% CPU do ép tính layout)
  let _cachedPageText = "";
  let _cachedPageTextTime = 0;
  function getCachedPageText(maxAge = 1200) {
    const now = Date.now();
    if (_cachedPageText && (now - _cachedPageTextTime < maxAge)) {
      return _cachedPageText;
    }
    const docs = getAllExerciseDocuments();
    _cachedPageText = docs.map(d => d.body?.textContent || "").join(" ");
    _cachedPageTextTime = now;
    return _cachedPageText;
  }

  function queryAllInDocs(selector) {
    const docs = getAllExerciseDocuments();
    const results = [];
    for (const doc of docs) {
      try {
        const items = Array.from(doc.querySelectorAll(selector));
        results.push(...items);
      } catch (e) {}
    }
    return results;
  }

  function isElementVisible(el) {
    if (!el) return false;
    // Input radio hoặc checkbox trong form trắc nghiệm dù bị ẩn CSS vẫn là mục tiêu tương tác hợp lệ
    if (el.tagName === 'INPUT' && (el.type === 'radio' || el.type === 'checkbox')) {
      return true;
    }

    // Fast path: nếu offsetParent tồn tại và có kích thước thực tế
    if (el.offsetParent !== null && (el.offsetWidth > 0 || el.offsetHeight > 0)) {
      return true;
    }

    try {
      const win = el.ownerDocument?.defaultView || window;
      const style = win.getComputedStyle(el);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) {
        return false;
      }
      if (style && style.opacity === '0' && el.tagName !== 'INPUT') {
        return false;
      }
    } catch (e) {}
    const r = el.getBoundingClientRect();
    return (r.width > 0 && r.height > 0);
  }

  function isAiElement(el) {
    if (!el) return false;
    return Boolean(el.closest("#ai-solver-toolbar, #ai-solver-card, #ai-review-modal, [id^='ai-'], [class^='ai-']"));
  }

  function triggerSmartClick(el) {
    if (!el) return;
    recordProgress("smart_click");
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {}

    const win = el.ownerDocument?.defaultView || window;
    const doc = el.ownerDocument || document;
    const target = el.closest('button, a, input, [role="button"]') || el;

    const opts = { bubbles: true, cancelable: true, view: win, clientX: 10, clientY: 10 };

    [el, target].forEach(elem => {
      if (!elem) return;
      elem.dispatchEvent(new PointerEvent('pointerdown', opts));
      elem.dispatchEvent(new MouseEvent('mousedown', opts));
      elem.dispatchEvent(new PointerEvent('pointerup', opts));
      elem.dispatchEvent(new MouseEvent('mouseup', opts));
      elem.dispatchEvent(new MouseEvent('click', opts));
      if (typeof elem.click === 'function') {
        try { elem.click(); } catch (e) {}
      }
    });

    // 1. Nếu target là thẻ <a> có href="javascript:..." (phổ biến trong ASP.NET WebForms __doPostBack)
    const href = target.getAttribute && (target.getAttribute('href') || target.href || '');
    if (href && href.toLowerCase().startsWith('javascript:')) {
      try {
        const code = decodeURIComponent(href.replace(/^javascript:/i, ''));
        const s = doc.createElement('script');
        s.textContent = code;
        (doc.head || doc.documentElement).appendChild(s);
        s.remove();
      } catch (e) {
        try { win.eval(href.replace(/^javascript:/i, '')); } catch (e2) {}
      }
    }

    // 2. Nếu target có attribute onclick
    const onclickAttr = target.getAttribute && target.getAttribute('onclick');
    if (onclickAttr) {
      try {
        const s = doc.createElement('script');
        s.textContent = onclickAttr;
        (doc.head || doc.documentElement).appendChild(s);
        s.remove();
      } catch (e) {
        try { win.eval(onclickAttr); } catch (e2) {}
      }
    }

    // 3. Kích hoạt jQuery trigger nếu trang sử dụng jQuery
    try {
      const $ = win.jQuery || win.$;
      if ($) {
        $(el).trigger('click');
        if (target !== el) $(target).trigger('click');
      }
    } catch (e) {}
  }

  /**
   * Kiểm tra xem một radio button có đang được chọn hay không (hỗ trợ cả class CSS, checked, aria)
   */
  function isRadioSelected(r) {
    if (!r) return false;
    if (r.checked) return true;
    if (r.getAttribute && (r.getAttribute('checked') === 'checked' || r.getAttribute('checked') === 'true')) return true;
    if (r.getAttribute && r.getAttribute('aria-checked') === 'true') return true;
    const parent = r.closest('label, tr, td, li, .choice, .option');
    if (parent && (parent.classList.contains('selected') || parent.classList.contains('checked') || parent.classList.contains('active') || parent.classList.contains('ui-state-active'))) {
      return true;
    }
    return false;
  }

  /**
   * Kích hoạt chọn radio button an toàn tuyệt đối
   * Tương thích hoàn toàn với ASP.NET WebForms, jQuery và dynamic event listeners
   */
  async function checkRadioButtonSafely(radio) {
    if (!radio) return;
    try {
      radio.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {}

    const win = radio.ownerDocument?.defaultView || window;
    const doc = radio.ownerDocument || document;

    // 1. Gán thuộc tính checked
    radio.checked = true;
    try { radio.setAttribute('checked', 'checked'); } catch (e) {}
    try { radio.setAttribute('aria-checked', 'true'); } catch (e) {}

    // 2. Kích hoạt native events
    radio.dispatchEvent(new Event('input', { bubbles: true }));
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    radio.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: win }));

    // 3. Tìm thẻ <label for="id"> liên kết với radio và click
    if (radio.id) {
      const label = doc.querySelector(`label[for="${radio.id}"]`);
      if (label) {
        label.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: win }));
        if (typeof label.click === 'function') label.click();
      }
    }

    // 4. Tìm label hoặc tr/td cha chứa radio và click
    const parentContainer = radio.closest('label, tr, td, li, .choice, .option');
    if (parentContainer && parentContainer !== radio) {
      parentContainer.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: win }));
      if (parentContainer.tagName === 'LABEL' && typeof parentContainer.click === 'function') {
        parentContainer.click();
      }
    }

    // 5. Smart click
    triggerSmartClick(radio);

    // 6. Kích hoạt jQuery nếu trang dùng jQuery
    try {
      const $ = win.jQuery || win.$;
      if ($) {
        $(radio).prop('checked', true).trigger('change').trigger('click');
      }
    } catch (eJq) {}

    highlightElement(radio);
    await sleep(80);
  }

  /**
   * Kiểm tra xem bài kiểm tra có đang ở phần Nghe (Listening Part 1, 2, 3, 4) không
   * Trong phần Nghe, hệ thống ETS khoá không cho tua lại câu trước
   */
  function isCurrentInListeningSection() {
    const text = getCachedPageText().toLowerCase();
    return (
      text.includes("listening part") ||
      text.includes("listening test") ||
      text.includes("spoken only one time") ||
      text.includes("hear four statements") ||
      text.includes("hear some conversations") ||
      text.includes("hear some talks")
    );
  }

  function isDangerousSubmitButton(el) {
    if (!el) return false;
    const txt = (el.innerText || el.value || el.title || el.getAttribute("aria-label") || "").trim().toLowerCase();
    const id = (el.id || "").toLowerCase();
    const cl = (el.className || "").toString().toLowerCase();
    return (
      txt.includes("submit test") || txt.includes("nộp bài") || txt.includes("finish test") ||
      txt.includes("end test") || txt.includes("exit test") ||
      id.includes("submittest") || cl.includes("submittest")
    );
  }

  /**
   * Tự động phát hiện và nhấn các nút chuẩn bị/bắt đầu bài thi TOEIC Test (ETS OLPC)
   * 1. Màn hình SysCheck: Kiểm tra hệ thống -> Bấm Proceed / Next / Confirm
   * 2. Màn hình chọn mode: "Please select test mode" -> Chọn mode & Bấm [ Go ]
   * 3. Màn hình chào mừng: "Welcome to the TOEIC Practice Test" -> Bấm [ Start ]
   * 4. Màn hình Directions (hướng dẫn không có câu hỏi) -> Bấm [ Next ]
   */
  function findAndClickTestIntroButtons() {
    const allDocs = getAllExerciseDocuments();
    const allDocsText = allDocs.map(d => d.body?.textContent || "").join(" ");
    const currentUrl = window.location.href.toLowerCase();

    // 1. Màn hình SysCheck.aspx (Kiểm tra hệ thống trước khi vào bài test)
    if (currentUrl.includes("syscheck.aspx") || allDocsText.includes("SysCheck") || allDocsText.includes("System Check")) {
      const proceedBtn = queryAllInDocs("#btnNext, .btnNext, input[type='submit'], input[type='button'], button, [role='button']").find(el => {
        if (isAiElement(el) || !isElementVisible(el)) return false;
        const t = (el.innerText || el.value || "").trim().toLowerCase();
        const id = (el.id || "").toLowerCase();
        const cl = (el.className || "").toString().toLowerCase();
        return (
          t === "next" || t.includes("next") || t.includes("tiếp") || t.includes("start") ||
          t.includes("confirm") || t.includes("xác nhận") || t.includes("đồng ý") || t.includes("vào bài") ||
          id.includes("btnnext") || cl.includes("btnnext") || id.includes("confirm") || id.includes("start")
        );
      });
      if (proceedBtn) {
        console.log("[TestStarter] 🚀 Đã click nút chuyển tiếp trên SysCheck:", proceedBtn);
        showAiToast("🚀 Tự động vượt qua kiểm tra hệ thống (SysCheck)...", 2000);
        triggerSmartClick(proceedBtn);
        return true;
      }
    }

    // 2. Màn hình "Please select test mode" / Chọn kiểu test lúc đầu -> Bấm "Go" hoặc "Start"
    if (
      allDocsText.includes("select test mode") || allDocsText.includes("test mode") ||
      allDocsText.includes("Learning Mode") || allDocsText.includes("Practice Mode") ||
      allDocsText.includes("Test Mode")
    ) {
      // Nếu có radio chọn mode chưa chọn, tự động chọn mode đầu tiên
      const modeRadios = queryAllInDocs("input[type='radio']").filter(isElementVisible);
      if (modeRadios.length > 0 && !modeRadios.some(r => isRadioSelected(r))) {
        checkRadioButtonSafely(modeRadios[0]);
      }

      const goBtn = queryAllInDocs("#btnGo, .btnGo, button, input[type='button'], input[type='submit'], [role='button']").find(el => {
        if (isAiElement(el) || !isElementVisible(el)) return false;
        const t = (el.innerText || el.value || "").trim().toLowerCase();
        const id = (el.id || "").toLowerCase();
        const cl = (el.className || "").toString().toLowerCase();
        return t === "go" || t.includes("bắt đầu") || id.includes("btngo") || cl.includes("btngo") || id === "go";
      });
      if (goBtn) {
        console.log("[TestStarter] 🚀 Đã click nút 'Go' trên màn hình chọn chế độ thi:", goBtn);
        showAiToast("🚀 Đang tự động chọn kiểu test và bắt đầu...", 2000);
        triggerSmartClick(goBtn);
        return true;
      }
    }

    // 3. Màn hình "Welcome to the TOEIC Practice Test" -> Bấm "Start"
    if (allDocsText.includes("Welcome to the") || allDocsText.includes("Practice Test") || allDocsText.includes("Test your sound")) {
      const startBtn = queryAllInDocs("#btnStart, .btnStart, button, input[type='button'], input[type='submit'], [role='button']").find(el => {
        if (isAiElement(el) || !isElementVisible(el) || isDangerousSubmitButton(el)) return false;
        const t = (el.innerText || el.value || "").trim().toLowerCase();
        const id = (el.id || "").toLowerCase();
        const cl = (el.className || "").toString().toLowerCase();
        return (
          t === "start" || t === "start test" || t === "bắt đầu" ||
          id.includes("btnstart") || cl.includes("btnstart") ||
          id.includes("startbtn")
        );
      });
      if (startBtn) {
        console.log("[TestStarter] 🚀 Đã click nút 'Start' trên màn hình chào mừng bài test:", startBtn);
        showAiToast("🚀 Đang khởi động bài kiểm tra TOEIC...", 2000);
        triggerSmartClick(startBtn);
        return true;
      }
    }

    // 4. Màn hình hướng dẫn Part (Directions) không có câu hỏi -> Tự động bấm "Next"
    const hasDirections = (
      allDocsText.includes("Listening Test") ||
      allDocsText.includes("Reading Test") ||
      allDocsText.includes("Directions") ||
      allDocsText.includes("Listening Part") ||
      allDocsText.includes("Reading Part") ||
      allDocsText.includes("Intermediate Final Test") ||
      allDocsText.includes("Intermediate Midterm Test") ||
      allDocsText.includes("demonstrate how well you understand") ||
      allDocsText.includes("will be spoken only one time")
    );
    const hasZeroInputs = queryAllInDocs("input[type='radio'], input[type='checkbox']").filter(isElementVisible).length === 0;

    if (hasDirections && hasZeroInputs) {
      const nextBtn = queryAllInDocs("#btnNext, .btnNext, button, input[type='button'], input[type='image'], [role='button']").find(el => {
        if (isAiElement(el) || !isElementVisible(el) || isDangerousSubmitButton(el)) return false;
        const t = (el.innerText || el.value || "").trim().toLowerCase();
        const id = (el.id || "").toLowerCase();
        const cl = (el.className || "").toString().toLowerCase();
        return (
          id === "btnnext" || cl.includes("btnnext") || id.includes("btnnext") ||
          t === "next" || t.startsWith("next") || t === "tiếp" || t === "tiếp tục" ||
          cl.includes("next") || id.includes("next")
        );
      });
      if (nextBtn) {
        console.log("[TestStarter] 🚀 Đã click nút 'Next' qua màn hình Directions:", nextBtn);
        showAiToast("📖 Màn hình hướng dẫn — Đang tự động bấm Next vào bài làm...", 2000);
        triggerSmartClick(nextBtn);
        return true;
      }
    }

    return false;
  }

  /**
   * Tự động phát hiện và nhấn nút chuyển tiếp Section / Part mới
   * Ví dụ: Khi kết thúc Part 2 chuyển sang Part 3 / Part 4 có màn hình giới thiệu kèm nút "Start Section"
   */
  function findAndClickSectionTransitionButton() {
    // 0. Nếu đang ở màn hình trang chủ / chọn bài (home), TUYỆT ĐỐI KHÔNG tự động bấm hay hiện card chuyển section
    if (window.location.hash.includes("home") || window.location.href.includes("#/home")) {
      return false;
    }

    // 0b. Kiểm tra màn hình chào mừng / chọn mode / directions của bài kiểm tra trước
    if (findAndClickTestIntroButtons()) {
      return true;
    }

    const candidates = queryAllInDocs(
      "button, input[type='button'], input[type='submit'], [role='button'], a[class*='btn' i], a[class*='button' i], [class*='btn' i], [class*='start' i], [id*='start' i]"
    );

    for (const b of candidates) {
      if (isAiElement(b) || !isElementVisible(b)) continue;
      if (isDangerousSubmitButton(b)) continue;

      const rawTxt = (b.innerText || b.value || b.getAttribute("title") || b.getAttribute("aria-label") || "").trim();
      const normTxt = rawTxt.replace(/[\s\u00A0\u200B]+/g, ' ').toLowerCase();
      const id = (b.id || "").toLowerCase();
      const cl = (b.className || "").toString().toLowerCase();

      // Giới hạn độ dài văn bản để tránh chọn nhầm container bao trọn cả đoạn giới thiệu bài
      const isShortText = normTxt.length > 0 && normTxt.length < 50;

      const isStartSection = isShortText && (
        normTxt === "start section" || normTxt.includes("start section") ||
        normTxt === "begin section" || normTxt.includes("begin section") ||
        normTxt === "next section" || normTxt.includes("next section") ||
        normTxt === "continue section" || normTxt.includes("continue section") ||
        normTxt === "start part" || normTxt.includes("start part") ||
        normTxt === "begin part" || normTxt.includes("begin part") ||
        normTxt === "start test" || normTxt.includes("start test") ||
        normTxt === "begin test" || normTxt.includes("begin test") ||
        normTxt.includes("bắt đầu phần") || normTxt.includes("tiếp tục phần") ||
        normTxt.includes("bắt đầu bài") ||
        /start\s*section/i.test(normTxt) || /begin\s*section/i.test(normTxt) ||
        (normTxt === "start" && (id.includes("section") || cl.includes("section") || b.closest(".modal, .dialog, [class*='section' i], [class*='part' i], div"))) ||
        id.includes("startsection") || cl.includes("startsection") ||
        id.includes("btnstartsection") || cl.includes("btnstartsection") ||
        id.includes("btn-start") || cl.includes("btn-start")
      );

      if (isStartSection) {
        console.log("[AutoSection] 🚀 Phát hiện nút chuyển tiếp Section! Tự động nhấn:", b);
        showLoadingCard("🚀 Đang tự động chuyển sang Section tiếp theo...");
        triggerSmartClick(b);
        return true;
      }
    }
    return false;
  }

  /**
   * Tìm và kích hoạt click vào nút Next trên giao diện (hỗ trợ cả iframe)
   */
  function findAndClickNextButton() {
    console.log("[AutoNext] Đang tìm nút Next...");

    // 0. Ưu tiên nút chuyển tiếp Section (Start Section) nếu xuất hiện
    if (findAndClickSectionTransitionButton()) {
      return true;
    }

    // 1. Selector trực tiếp cho ETS TOEIC và các hệ thống thi trực tuyến
    const etsCandidates = queryAllInDocs("#btnNext, .btnNext, a.btnNext, button.btnNext, [id*='btnNext' i], [class*='btnNext' i], [id*='Next' i]:not([id^='ai-'])").filter(el => {
      if (isAiElement(el) || isDangerousSubmitButton(el)) return false;
      return isElementVisible(el);
    });
    if (etsCandidates.length > 0) {
      console.log("[AutoNext] Đã click nút Next theo ID/Class ETS:", etsCandidates[0]);
      triggerSmartClick(etsCandidates[0]);
      return true;
    }

    const selectors = [
      "button.next", "button.btn-next", "#btnNext", ".btnNext", ".nextBtn",
      ".btn-forward", ".arrow-next", ".arrow-right", ".nextArrow",
      "[title*='Next' i]", "[title*='Tiếp' i]", "[aria-label*='Next' i]",
      "[class*='next' i]:not([id^='ai-'])"
    ];

    for (const sel of selectors) {
      try {
        const els = queryAllInDocs(sel).filter(el => !isAiElement(el) && !isDangerousSubmitButton(el));
        for (const el of els) {
          if (isElementVisible(el)) {
            console.log("[AutoNext] Đã click nút Next theo selector:", sel, el);
            triggerSmartClick(el);
            return true;
          }
        }
      } catch (e) {}
    }

    // 2. Tìm nút Next nằm ngay bên phải bộ đếm trang (ví dụ "1 / 5")
    const allCounters = queryAllInDocs("span, div, p, b, strong").filter(el => 
      !isAiElement(el) && /\b\d+\s*\/\s*\d+\b/.test(el.innerText?.trim() || "") && isElementVisible(el)
    );

    for (const counterEl of allCounters) {
      const parent = counterEl.parentElement;
      if (parent) {
        const rect = counterEl.getBoundingClientRect();
        const siblings = Array.from(parent.querySelectorAll("button, a, div, span, img, svg, i")).filter(el => {
          if (isAiElement(el) || isDangerousSubmitButton(el) || el === counterEl || el.contains(counterEl)) return false;
          const cr = el.getBoundingClientRect();
          return cr.left >= rect.right - 5 && cr.width >= 10 && cr.height >= 10;
        });

        if (siblings.length > 0) {
          siblings.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
          console.log("[AutoNext] Đã tìm thấy nút Next bên cạnh bộ đếm câu:", siblings[0]);
          triggerSmartClick(siblings[0]);
          return true;
        }
      }
    }

    // 3. Tìm nút Next ở thanh footer điều hướng ở góc phải dưới
    const bottomCandidates = queryAllInDocs("button, a, div[role='button'], div, span, img, svg, i").filter(el => {
      if (isAiElement(el) || isDangerousSubmitButton(el)) return false;
      const r = el.getBoundingClientRect();
      const win = el.ownerDocument?.defaultView || window;
      const inBottomBar = r.bottom >= win.innerHeight - 80 && r.top >= win.innerHeight - 90 && r.left >= win.innerWidth - 260;
      const hasSize = r.width >= 15 && r.height >= 15 && r.width <= 200 && r.height <= 80;
      return inBottomBar && hasSize && isElementVisible(el);
    });

    if (bottomCandidates.length > 0) {
      bottomCandidates.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right);
      const target = bottomCandidates[0];
      console.log("[AutoNext] Đã click nút Next ở thanh footer góc phải dưới:", target);
      triggerSmartClick(target);
      return true;
    }

    // 4. Tìm theo text hoặc ký tự mũi tên > / >> / » hoặc chứa chữ "Next"
    const textCandidates = queryAllInDocs("button, a, div[role='button'], div, span, i").filter(el => {
      if (isAiElement(el) || isDangerousSubmitButton(el)) return false;
      const t = (el.innerText || "").trim();
      return (
        t === ">" || t === ">>" || t === "»" ||
        /^\s*Next\b/i.test(t) || /^\s*Next\s*$/i.test(t) ||
        t === "Tiếp" || t === "Tiếp tục"
      ) && isElementVisible(el);
    });

    if (textCandidates.length > 0) {
      textCandidates.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
      console.log("[AutoNext] Đã click nút Next theo ký tự text:", textCandidates[0]);
      triggerSmartClick(textCandidates[0]);
      return true;
    }

    return false;
  }

  /**
   * Kiểm tra xem tất cả câu hỏi trên màn hình hiện tại đã được chọn/điền đáp án chưa
   */
  function isCurrentQuestionAnswered() {
    // 0. Nếu AI đang trong tiến trình phân tích âm thanh, đọc đề hoặc đang giải
    if (isSolvingCurrentQuestion) {
      return false;
    }

    // 1. Kiểm tra tất cả các nhóm radio trên trang
    const radioGroups = groupRadioButtons();
    if (radioGroups.length > 0) {
      const allDone = radioGroups.every(group => group.some(r => isRadioSelected(r)));
      if (!allDone) {
        console.log(`[CheckAnswer] ⚠️ Còn nhóm radio chưa được chọn: ${radioGroups.filter(g => !g.some(r => isRadioSelected(r))).length}/${radioGroups.length} nhóm`);
        return false;
      }
      return true;
    }

    // 1b. Fallback: Nếu không phân nhóm được nhưng trang có radio
    const allRadios = getVisibleTestRadios();
    if (allRadios.length > 0) {
      const anyChecked = allRadios.some(r => isRadioSelected(r));
      if (!anyChecked) {
        console.log("[CheckAnswer] ⚠️ Có radio trên trang nhưng chưa chọn đáp án nào!");
        return false;
      }
      return true;
    }

    // 2. Kiểm tra thẻ select
    const selects = queryAllInDocs("select").filter(s => isElementVisible(s) && !isAiElement(s));
    if (selects.length > 0) {
      const allSelectDone = selects.every(s => s.value !== "" && s.selectedIndex > 0);
      if (!allSelectDone) return false;
      return true;
    }

    // 3. Kiểm tra input text
    const textInputs = queryAllInDocs("input[type='text'], textarea").filter(i => isElementVisible(i) && !isAiElement(i));
    if (textInputs.length > 0) {
      const allTextDone = textInputs.every(i => i.value && i.value.trim().length > 0);
      if (!allTextDone) return false;
      return true;
    }

    // 4. Nếu trang hoàn toàn không có bất kỳ radio, select hay input nào:
    // Đây là màn hình hướng dẫn (Directions / SysCheck / Mode selection), coi như đã hoàn thành để tự động bấm Next!
    console.log("[CheckAnswer] ℹ️ Không có câu hỏi bài tập trên màn hình (Directions / Intro) -> Cho phép bấm Next!");
    return true;
  }

  /**
   * Đảm bảo mọi câu hỏi đều có ít nhất 1 đáp án được chọn (tuyệt đối không để trống)
   * Ưu tiên tuyệt đối dùng đáp án do AI đề xuất, không chọn bừa Option B
   */
  async function ensureAnswerChecked(solutions = null) {
    const radioGroups = groupRadioButtons();
    for (let g = 0; g < radioGroups.length; g++) {
      const group = radioGroups[g];
      const isAnswered = group.some(r => isRadioSelected(r));
      if (!isAnswered && group.length > 0) {
        console.warn(`[AutoFill] ⚠️ Câu hỏi trắc nghiệm nhóm ${g + 1} chưa được chọn! Đang tự động chọn theo AI hoặc an toàn...`);
        let targetIdx = -1;
        const sol = (solutions && Array.isArray(solutions)) ? (solutions[g] || solutions[0]) : null;
        if (sol) {
          if (typeof sol.selected_index === "number" && sol.selected_index >= 0 && sol.selected_index < group.length) {
            targetIdx = sol.selected_index;
          } else if (sol.selected_value) {
            const m = String(sol.selected_value).match(/^\(?([A-D])\)?/i);
            if (m) {
              const lIdx = m[1].toUpperCase().charCodeAt(0) - 65;
              if (lIdx >= 0 && lIdx < group.length) targetIdx = lIdx;
            }
          }
        }
        if (targetIdx < 0 || targetIdx >= group.length) {
          targetIdx = group.length >= 2 ? 1 : 0; // Chỉ fallback khi hoàn toàn không có AI solution
        }
        const targetOpt = group[targetIdx] || group[0];
        await checkRadioButtonSafely(targetOpt);
        await sleep(100);
      }
    }
  }

  /**
   * Quy trình chính: Quét DOM -> Chụp ảnh -> Gửi Backend AI -> Tự động điền & Click
   */
  async function triggerScanAndSolve() {
    isSolvingCurrentQuestion = true;
    window._solvingStartTime = Date.now();
    const solveText = document.getElementById("ai-solve-text");
    if (solveText) solveText.innerText = "Đang Giải...";
    if (cachedBubbleEl) cachedBubbleEl.classList.add("solving");

    try {
      // 0. Tự động chuyển tiếp nếu đang ở màn hình giới thiệu Section (ví dụ Listening Part 3 / Part 4 có nút "Start Section")
      if (findAndClickSectionTransitionButton()) {
        if (solveText) solveText.innerText = "Bắt đầu Section...";
        showLoadingCard("🚀 Đang bắt đầu Section mới...");
        await sleep(2000);
        return triggerScanAndSolve(); // Giải ngay câu đầu tiên của Section mới!
      }

      // 0b. Kiểm tra nếu đang ở màn hình kết thúc bài test
      const allDocsText = getCachedPageText();
      if (allDocsText.includes("Your test score is:") || /Test\s*Score\s*:\s*\d+/i.test(allDocsText) || allDocsText.includes("You have reached the end of the test")) {
        console.log("[Content] 🏁 Bài kiểm tra đã hoàn thành đến câu cuối cùng!");
        showResultsCard([{
          question_id: "Hoàn Thành",
          selected_value: "100%",
          explanation: "🎉 Chúc mừng bạn! Bài thi đã được giải xong toàn bộ từ đầu đến cuối. Bấm nút '📜 Lịch Sử Bài' ở trên để xem và tải về file đáp án.",
          confidence: 1.0
        }]);
        if (solveText) solveText.innerText = "Đã Hoàn Thành!";
        return { success: true, count: 0, solutions: [], finished: true };
      }

      // 0c. Hiển thị thẻ loading ngay lập tức
      showLoadingCard();

      // 1. Trích xuất DOM câu hỏi từ tất cả tài liệu (bao gồm cả iframe)
      const questionsData = await scanDOMQuestions();
      console.log(`[Content] Trích xuất được ${questionsData.length} phần tử bài tập.`);

      // NẾU KHÔNG CÓ CÂU HỎI BÀI TẬP NÀO TRÊN MÀN HÌNH (màn hình chuyển tiếp Section, chọn kiểu test hoặc Directions):
      if (questionsData.length === 0) {
        if (findAndClickSectionTransitionButton()) {
          if (solveText) solveText.innerText = "Chuyển tiếp...";
          await sleep(2000);
          return triggerScanAndSolve();
        }

        // Tự động kiểm tra nếu là màn hình Directions / Hướng dẫn / Chọn kiểu test không có câu hỏi:
        const hasZeroInputs = queryAllInDocs("input[type='radio'], input[type='checkbox'], select, input[type='text']").filter(isElementVisible).length === 0;
        if (hasZeroInputs) {
          console.log("[Content] 📖 Màn hình hướng dẫn/Directions không có câu hỏi. Tự động bấm Next để vào bài thi...");
          if (solveText) solveText.innerText = "Bấm Next...";
          showAiToast("📖 Màn hình hướng dẫn/chọn kiểu test — Đang tự động bấm Next vào bài làm...", 2000);
          const clickedNext = findAndClickNextButton();
          if (clickedNext) {
            await sleep(2000);
            return triggerScanAndSolve();
          }
        }

        console.log("[Content] ℹ️ Không phát hiện câu hỏi bài tập trên màn hình (đang tải hoặc chuyển trang)...");
        const existingCard = document.getElementById("ai-solver-card");
        if (existingCard) existingCard.remove();
        if (solveText) solveText.innerText = "Chờ câu mới...";
        setTimeout(() => {
          if (solveText && solveText.innerText === "Chờ câu mới...") {
            solveText.innerText = "Giải Câu Này";
          }
        }, 1500);
        return { success: false, count: 0, solutions: [], reason: "no_questions_on_screen" };
      }

      // Gom toàn bộ nội dung văn bản từ tất cả iframe để AI hiểu toàn bộ ngữ cảnh bài tập
      const combinedPageText = getCachedPageText();

      // 2. Phân loại bài tập: Part 5, 6, 7 là READING (Đọc hiểu/Điền từ), TUYỆT ĐỐI không nghe audio
      const qCurrentTitle = (getCurrentQuestionTitle() || "").toLowerCase();
      const isReadingSection = (
        qCurrentTitle.includes("part 5") || qCurrentTitle.includes("part 6") || qCurrentTitle.includes("part 7") ||
        allDocsText.includes("Part 5") || allDocsText.includes("Part 6") || allDocsText.includes("Part 7") ||
        allDocsText.includes("Reading Part") || allDocsText.includes("Incomplete Sentences") ||
        allDocsText.includes("Text Completion") || allDocsText.includes("Reading Comprehension")
      );

      // Cập nhật giao diện loading theo đúng loại bài
      showLoadingCard(isReadingSection ? "AI đang đọc câu hỏi & chọn đáp án chính xác..." : "AI đang lắng nghe âm thanh & tải phụ đề...");

      let audioUrl = null;
      let audioData = null;
      const isDragOrGrammar = (
        allDocsText.includes("Drag ") ||
        allDocsText.includes("drag ") ||
        allDocsText.includes("into place") ||
        allDocsText.includes("Subjunctive") ||
        Boolean(queryAllInDocs(".ui-draggable, .draggable").length > 0)
      );

      const isListeningExercise = !isDragOrGrammar && !isReadingSection && (
        allDocsText.includes("Listening Part") ||
        allDocsText.includes("Listening Comprehension") ||
        allDocsText.includes("Listen to the") ||
        allDocsText.includes("hear four statements") ||
        allDocsText.includes("require sound") ||
        allDocsText.includes("test your sound") ||
        allDocsText.includes("spoken only one time") ||
        (document.title.toLowerCase().includes("listening") && !allDocsText.includes("Drag ")) ||
        Boolean(queryAllInDocs("audio, [class*='audio' i], [id*='audio' i], object[type*='audio']").length > 0)
      );

      if (isListeningExercise) {
        const questionSolveStartTime = Date.now();

        // 1. Luôn xóa bộ nhớ đệm audio cũ để không bao giờ bị dính audio câu trước!
        try {
          await chrome.runtime.sendMessage({ action: "clear_audio" });
        } catch (e) {}

        // 2. Kích hoạt nút Play âm thanh của trang
        tryTriggerAudioPlayback();
        await sleep(300);

        audioUrl = findAudioUrl();
        if (audioUrl) {
          console.log(`[Content] 🎵 Đã tìm thấy audio bài nghe trực tiếp:`, audioUrl);
          audioData = await fetchAudioAsBase64(audioUrl);
        }

        // 3. Nếu chưa tải được audio trực tiếp, đợi Background bắt network request của câu này (tối đa 1.5 giây)
        if (!audioData) {
          const waitAudioStart = Date.now();
          while (Date.now() - waitAudioStart < 1500) {
            try {
              const bgRes = await chrome.runtime.sendMessage({
                action: "get_audio",
                minTimestamp: questionSolveStartTime - 500
              });
              if (bgRes && bgRes.success && bgRes.audio) {
                audioData = bgRes.audio;
                console.log("[Content] 🎧 Đã nạp thành công audio tươi mới từ Background Service Worker!");
                break;
              }
            } catch (e) {}
            await sleep(250);
          }
        }

        if (audioData) {
          if (!audioData.mime || !audioData.mime.startsWith("audio/")) {
            console.warn("[Content] ⚠️ Bỏ qua audioData vì MIME không phải audio:", audioData.mime);
            audioData = null;
          }
        }
      }

      // 3. Chụp ảnh màn hình:
      // - Với Part 1 TOEIC (bài miêu tả ảnh): 100% BẮT BUỘC PHẢI CHỤP MÀN HÌNH để AI nhìn thấy bức tranh!
      // - Với Part 3/4/7 có biểu đồ/tranh: Chụp màn hình để AI đọc ngữ cảnh
      // - Với Part 2 (chỉ hỏi đáp audio thuần túy): Bỏ qua chụp ảnh để tăng tốc
      let screenshotBase64 = null;
      const isPart1 = (
        allDocsText.includes("Listening Part 1") ||
        qCurrentTitle.includes("part 1") ||
        allDocsText.includes("hear four statements about a picture") ||
        allDocsText.includes("picture on the screen")
      );
      const isPart2 = (allDocsText.includes("Listening Part 2") || qCurrentTitle.includes("part 2")) && !isPart1;

      const visibleImages = queryAllInDocs("img, canvas, svg, picture, [style*='background-image']").filter(img => {
        if (isAiElement(img) || !isElementVisible(img)) return false;
        const r = img.getBoundingClientRect();
        const src = (img.src || "").toLowerCase();
        return r.width > 60 && r.height > 60 && !src.includes("logo") && !src.includes("icon") && !src.includes("sound");
      });
      const hasImages = visibleImages.length > 0;

      // NẾU LÀ PART 1 HOẶC TRANG CÓ TRANH/ẢNH MINH HỌA
      const shouldCaptureScreenshot = isPart1 || (!isPart2 && hasImages);

      if (shouldCaptureScreenshot) {
        try {
          const captureResp = await chrome.runtime.sendMessage({ action: "capture_tab" });
          if (captureResp && captureResp.success && captureResp.dataUrl) {
            screenshotBase64 = captureResp.dataUrl;
            console.log(`[Content] 📸 Đã chụp ảnh màn hình bài tập (${Math.round(screenshotBase64.length / 1024)} KB) - isPart1: ${isPart1}`);
          } else {
            console.warn("[Content] Không thể chụp tab, captureResp:", captureResp);
          }
        } catch (e) {
          console.warn("[Content] Lỗi khi chụp ảnh màn hình:", e);
        }
      } else {
        console.log("[Content] ⚡ Bỏ qua chụp ảnh màn hình (Part 2 thuần audio) để tăng tốc độ tối đa!");
      }

      // 4. Gửi sang Backend Node.js
      const solveResp = await chrome.runtime.sendMessage({
        action: "solve_exercise",
        payload: {
          questions: questionsData,
          base64Image: screenshotBase64,
          pageText: combinedPageText,
          audioUrl: audioUrl,
          audioBase64: audioData ? audioData.base64 : null,
          audioMime: audioData ? audioData.mime : "audio/mp3",
          allowCachedAudio: false // Tuyệt đối không tự ý dùng audio cũ
        }
      });

      if (!solveResp || !solveResp.success) {
        throw new Error(solveResp?.error || "Không nhận được lời giải từ Backend.");
      }

      const solutions = solveResp.data || solveResp.solutions || [];
      const conversationTranscript = solveResp.conversation_transcript || solutions[0]?.conversation_transcript || "";
      console.log(`[Content] Nhận được ${solutions.length} lời giải:`, solutions);

      // Gán question_number từ questionsData sang solutions nếu thiếu
      solutions.forEach((sol, idx) => {
        if (!sol.question_number && questionsData[idx]?.question_number) {
          sol.question_number = questionsData[idx].question_number;
        }
      });

      // 5. Tự động click và điền đáp án
      await autoFillAnswers(solutions);

      // 5b. Đảm bảo đáp án đã được chọn thật sự trên trang (chống bỏ sót câu)
      if (!isCurrentQuestionAnswered()) {
        console.warn("[Content] ⚠️ Phát hiện đáp án chưa được chọn sau autoFill! Đang kích hoạt chọn bù theo AI...");
        await ensureAnswerChecked(solutions);
      }

      // 5c. Tự động lưu lịch sử đáp án bài thi này
      await recordTestAnswers(solutions, questionsData);

      // 6. Hiển thị bảng kết quả nổi trên trang (transcript ở trên, đáp án ở dưới)
      showResultsCard(solutions, questionsData, conversationTranscript);
      lastSolvedFingerprint = getQuestionFingerprint();

      if (solveText) {
        solveText.innerText = "Đã Xong!";
        setTimeout(() => {
          if (!isAutoNextRunning && solveText) solveText.innerText = "Giải Câu Này";
        }, 3000);
      }

      return { success: true, count: solutions.length, solutions: solutions };
    } catch (err) {
      console.error("[Content Error]", err);
      showErrorCard(err.message || "Lỗi kết nối Backend AI");
      if (solveText) {
        solveText.innerText = "Lỗi!";
        setTimeout(() => {
          if (solveText) solveText.innerText = "Giải Câu Này";
        }, 3000);
      }
      throw err;
    } finally {
      isSolvingCurrentQuestion = false;
      window._solvingStartTime = null;
      if (cachedBubbleEl) cachedBubbleEl.classList.remove("solving");
    }
  }

  /**
   * Trích xuất câu văn chứa ô trống (Blank / Dropdown) để gửi cho AI hiểu ngữ cảnh
   */
  function getSurroundingSentence(el) {
    if (!el) return "";
    let container = el.closest('p, .sentence, .q-text, .question-text, td, li, .item, tr, fieldset') || el.parentElement;

    while (container && container !== document.body && (container.innerText || "").length > 400 && container.parentElement) {
      const smaller = container.querySelector('p, .sentence, .q-text, div');
      if (smaller && smaller.contains(el)) {
        container = smaller;
      } else {
        break;
      }
    }
    if (!container || container === document.body) {
      container = el.parentElement || el;
    }

    try {
      const clone = container.cloneNode(true);
      clone.querySelectorAll('script, style, #ai-solver-toolbar, #ai-solver-card, [id^="ai-"], [class^="ai-"]').forEach(x => x.remove());

      const blanks = clone.querySelectorAll('select, input, [role="combobox"], .dropdown, .custom-select, [class*="combo" i], [class*="selectBox" i], .blank, .dropTarget, .ui-droppable');
      blanks.forEach((b, i) => {
        const span = document.createElement('span');
        span.textContent = ` [ Blank ${i + 1} ] `;
        b.parentNode?.replaceChild(span, b);
      });

      let sentence = (clone.innerText || "").replace(/\s+/g, ' ').trim();
      return sentence.length > 300 ? sentence.substring(0, 300) : sentence;
    } catch (e) {
      return (container.innerText || "").replace(/\s+/g, ' ').trim();
    }
  }

  /**
   * Trích xuất văn bản hiển thị chuẩn của lựa chọn radio (A, B, C, D kèm nội dung)
   * Tuyệt đối không để option có giá trị "on"
   */
  function extractRadioOptionText(r, oIdx) {
    let text = "";

    // 1. Thẻ label liên kết qua ID
    if (r.id) {
      const lbl = r.ownerDocument.querySelector(`label[for="${r.id}"]`);
      if (lbl) text = lbl.innerText.trim();
    }

    // 2. Thẻ label cha
    if (!text && r.parentElement && r.parentElement.tagName === 'LABEL') {
      text = r.parentElement.innerText.trim();
    }

    // 3. Phần tử cha tr, li, hoặc div chứa option (loại bỏ chính input)
    if (!text) {
      const row = r.closest('tr, li, .choice, .option');
      if (row) {
        const clone = row.cloneNode(true);
        clone.querySelectorAll('input, [id^="ai-"], [class^="ai-"]').forEach(x => x.remove());
        text = clone.innerText.trim();
      }
    }

    // 4. Nếu nằm trong <td> thì tìm <td> tiếp theo trong cùng <tr>
    if (!text) {
      const td = r.closest('td');
      if (td && td.nextElementSibling) {
        text = td.nextElementSibling.innerText.trim();
      }
    }

    // 5. Phần tử anh em kế tiếp (nextElementSibling)
    if (!text) {
      let next = r.nextElementSibling;
      while (next && !text) {
        if (!isAiElement(next)) {
          text = (next.innerText || "").trim();
        }
        next = next.nextElementSibling;
      }
    }

    // 6. Kiểm tra thuộc tính value
    const val = (r.value || "").trim();
    if (!text && val && val.toLowerCase() !== 'on' && val.toLowerCase() !== 'default') {
      text = val;
    }

    // 7. Tuyệt đối không để option là "on" hoặc rỗng
    if (!text || text.toLowerCase() === 'on') {
      const letter = String.fromCharCode(65 + oIdx);
      text = `(${letter})`;
    }

    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Quét tất cả radio buttons thực sự hiển thị trên màn hình bài tập
   */
  function getVisibleTestRadios() {
    const docs = getAllExerciseDocuments();
    const radios = [];
    const seenRadios = new Set();

    for (const doc of docs) {
      try {
        const win = doc.defaultView || window;
        if (win !== window && win.frameElement && !isIframeVisible(win.frameElement)) {
          continue; // Bỏ qua radio thuộc iframe đang bị ẩn hoặc clone
        }

        const allDocRadios = Array.from(doc.querySelectorAll('input[type="radio"]'));
        const docRadios = allDocRadios.filter(r => {
          if (isAiElement(r) || seenRadios.has(r)) return false;

          // Bắt buộc radio phải nằm trên màn hình hiển thị thực tế (chống iframe preload/off-screen)
          if (!isElementOnScreen(r)) return false;

          // 1. Radio có kích thước hiển thị trực tiếp
          const rect = r.getBoundingClientRect();
          if ((rect.width > 0 && rect.height > 0) || (r.offsetWidth > 0 && r.offsetHeight > 0)) {
            const style = win.getComputedStyle(r);
            if (style && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0') {
              seenRadios.add(r);
              return true;
            }
          }

          // 2. Radio custom style (opacity: 0 hoặc width: 0) nhưng nằm trong container hiển thị (tr, td, li, label, .choice, .option)
          const container = r.closest('tr, td, li, label, .choice, .option, table');
          if (container && !isAiElement(container) && isElementOnScreen(container)) {
            const cr = container.getBoundingClientRect();
            if (cr.width > 0 && cr.height > 0) {
              const cStyle = win.getComputedStyle(container);
              if (cStyle && cStyle.display !== 'none' && cStyle.visibility !== 'hidden' && cStyle.opacity !== '0') {
                seenRadios.add(r);
                return true;
              }
            }
          }

          return false;
        });
        radios.push(...docRadios);
      } catch (e) {}
    }

    // Sắp xếp các radio từ trên xuống dưới theo toạ độ màn hình tuyệt đối Y
    radios.sort((a, b) => {
      const ra = getElementScreenRect(a) || a.getBoundingClientRect();
      const rb = getElementScreenRect(b) || b.getBoundingClientRect();
      const yDiff = ra.top - rb.top;
      if (Math.abs(yDiff) > 8) return yDiff;
      return ra.left - rb.left;
    });

    return radios;
  }

  /**
   * Gom nhóm các nút Radio thành từng câu hỏi riêng biệt (chuẩn xác cho cả Part 1, 2, 3, 4, 5, 6, 7)
   */
  function groupRadioButtons() {
    const allRadios = getVisibleTestRadios();
    if (allRadios.length === 0) return [];

    // Nếu trang chỉ có <= 5 radio (chuẩn TOEIC 1 câu hỏi 4 lựa chọn A-B-C-D hoặc 3 lựa chọn A-B-C Part 2)
    if (allRadios.length <= 5) {
      return [allRadios];
    }

    // 0. KIỂM TRA SỐ CÂU THEO TIÊU ĐỀ TRANG (VD: "Question 71 - 73 of 200" -> ĐÚNG 3 CÂU)
    const allDocs = getAllExerciseDocuments();
    const fullText = (getCurrentQuestionTitle() || "") + "\n" + allDocs.map(d => d.body?.innerText || "").join("\n");
    const headerRange = fullText.match(/(?:Questions?|Câu)\s*(\d{1,3})\s*(?:[-–—to\s]|through)+\s*(\d{1,3})/i);
    if (headerRange) {
      const qStart = parseInt(headerRange[1], 10);
      const qEnd = parseInt(headerRange[2], 10);
      if (!isNaN(qStart) && !isNaN(qEnd) && qEnd >= qStart) {
        const expectedCount = qEnd - qStart + 1;
        if (expectedCount >= 1 && expectedCount <= 5) {
          const perQ = (allRadios.length === expectedCount * 3) ? 3 : 4;
          // Nếu có đúng expectedCount * perQ radio (hoặc bị dư do clone iframe)
          if (allRadios.length >= expectedCount * perQ) {
            const groups = [];
            for (let i = 0; i < expectedCount * perQ; i += perQ) {
              groups.push(allRadios.slice(i, i + perQ));
            }
            console.log(`[Content] 🎯 Nhận diện chuẩn xác ${expectedCount} câu hỏi từ dải tiêu đề "${headerRange[0]}":`, groups.length);
            return groups;
          }
        }
      }
    }

    // 1. Phân nhóm theo thuộc tính 'name' của radio nếu có các name rõ ràng (mỗi nhóm từ 2 đến 5 radio)
    const byName = {};
    allRadios.forEach(r => {
      const n = (r.name || "").trim();
      if (n && n !== 'default_group') {
        if (!byName[n]) byName[n] = [];
        byName[n].push(r);
      }
    });

    const nameGroups = Object.values(byName).filter(g => g.length >= 2 && g.length <= 5);
    const totalInNameGroups = nameGroups.reduce((acc, g) => acc + g.length, 0);
    if (nameGroups.length >= 2 && totalInNameGroups === allRadios.length) {
      nameGroups.sort((a, b) => a[0].getBoundingClientRect().top - b[0].getBoundingClientRect().top);
      return nameGroups;
    }

    // 2. Nhóm theo số câu hỏi đánh số trong văn bản trang (vd: "30. Why...", "31. What...", "32. What...")
    const numberedMatches = Array.from(fullText.matchAll(/(?:^|\n|\s)\s*(\d{1,3})\s*[\.\:\)]\s*[A-Z\?]/g));
    const numQuestions = numberedMatches.length;

    if (numQuestions >= 2 && allRadios.length % numQuestions === 0) {
      const perQ = allRadios.length / numQuestions;
      if (perQ >= 3 && perQ <= 5) {
        const groups = [];
        for (let i = 0; i < allRadios.length; i += perQ) {
          groups.push(allRadios.slice(i, i + perQ));
        }
        return groups;
      }
    }

    // 2b. Chuẩn hoá TOEIC Part 3 & 4 (mỗi đoạn audio có đúng 3 câu x 4 lựa chọn = 12 radio)
    if (allRadios.length === 12) {
      return [
        allRadios.slice(0, 4),
        allRadios.slice(4, 8),
        allRadios.slice(8, 12)
      ];
    }

    // 2c. Chuẩn hoá các đoạn văn có 2 câu (8 radio) hoặc 4 câu (16 radio)
    if (allRadios.length % 4 === 0 && allRadios.length >= 8) {
      const perQ = 4;
      const groups = [];
      for (let i = 0; i < allRadios.length; i += perQ) {
        groups.push(allRadios.slice(i, i + perQ));
      }
      return groups;
    }

    // 3. Phân nhóm thông minh theo chữ cái lựa chọn (A, B, C, D) và toạ độ Y
    const sorted = [...allRadios].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const groups = [];
    let currentGroup = [];

    for (let i = 0; i < sorted.length; i++) {
      const curr = sorted[i];
      const optText = extractRadioOptionText(curr, currentGroup.length).trim();
      const isOptionA = /^\(?A[\.\)\:\s]/i.test(optText) || optText === '(A)' || optText === 'A';

      let isNewQuestion = false;
      if (currentGroup.length > 0) {
        const prev = currentGroup[currentGroup.length - 1];
        const yDiff = curr.getBoundingClientRect().top - prev.getBoundingClientRect().top;
        if (currentGroup.length >= 2 && isOptionA) {
          isNewQuestion = true;
        } else if (currentGroup.length >= 4) {
          isNewQuestion = true;
        } else if (yDiff > 60 && currentGroup.length >= 3) {
          isNewQuestion = true;
        }
      }

      if (isNewQuestion) {
        groups.push(currentGroup);
        currentGroup = [curr];
      } else {
        currentGroup.push(curr);
      }
    }
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  function getQuestionPromptForGroup(radios, groupIndex) {
    const firstRadio = radios[0];
    const doc = firstRadio.ownerDocument || document;

    // 1. Tìm container chứa câu hỏi (bên ngoài table các lựa chọn)
    const qContainer = firstRadio.closest('.question, .question-card, .test-item, .quiz-item, [data-question-id], .reading-question, .listening-question');
    if (qContainer) {
      const titleEl = qContainer.querySelector('.question-title, .question-text, .prompt, h3, h4, legend, .q-text, p');
      if (titleEl && isElementVisible(titleEl)) {
        const t = titleEl.innerText.replace(/\s+/g, ' ').trim();
        if (t.length > 5) return t;
      }
    }

    // 2. Tìm khối văn bản có đánh số câu (ví dụ "16. We ask that customers...", "Question 16")
    const allTextEls = Array.from(doc.querySelectorAll('p, div, td, h3, h4, span, b, strong')).filter(el => {
      if (isAiElement(el) || !isElementVisible(el)) return false;
      if (radios.some(r => r.contains(el) || el.contains(r))) return false;
      const t = el.innerText.trim();
      return /\b\d+\s*[\.\:\)]\s*\w+/.test(t) && t.length >= 8 && t.length <= 400;
    });

    if (allTextEls.length > 0) {
      const rTop = firstRadio.getBoundingClientRect().top;
      const above = allTextEls.filter(el => el.getBoundingClientRect().bottom <= rTop + 10);
      if (above.length > 0) {
        above.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
        return above[0].innerText.replace(/\s+/g, ' ').trim();
      }
    }

    // 3. Tìm phần tử anh em phía trước của bảng radio
    let prev = (firstRadio.closest('table') || firstRadio.parentElement).previousElementSibling;
    while (prev) {
      if (!isAiElement(prev) && isElementVisible(prev)) {
        const t = prev.innerText.replace(/\s+/g, ' ').trim();
        if (t.length > 5) return t;
      }
      prev = prev.previousElementSibling;
    }

    return `Câu hỏi trắc nghiệm #${groupIndex + 1}`;
  }

  /**
   * Quét và trích xuất danh sách câu hỏi DOM (xuyên qua cả iframe)
   */
  async function scanDOMQuestions() {
    window._elementRefs.clear();
    const results = [];
    const allDocsText = getAllExerciseDocuments().map(d => d.body?.innerText || "").join(" ");

    // 1. Quét các khối câu hỏi có class rõ ràng
    const questionBlocks = queryAllInDocs(
      '.question, .quiz-question, .question-card, .test-item, .quiz-item, [data-question-id]'
    ).filter(b => !isAiElement(b) && isElementVisible(b));

    if (questionBlocks.length > 1) {
      questionBlocks.forEach((block, index) => {
        const id = block.getAttribute('data-question-id') || block.id || `q_${index + 1}`;
        const titleEl = block.querySelector('.question-title, .question-text, .prompt, h3, h4, legend, .q-text, p') || block;
        const text = titleEl.innerText.trim();

        const optionEls = Array.from(block.querySelectorAll('input[type="radio"], input[type="checkbox"], .option, .choice, label.btn, button.choice-btn'));
        const options = [];

        optionEls.forEach((opt, optIdx) => {
          let optText = opt.tagName === 'INPUT' ? extractRadioOptionText(opt, optIdx) : (opt.innerText || '').trim();
          options.push(optText || `Option ${optIdx + 1}`);
          window._elementRefs.set(`${id}_opt_${optIdx}`, opt);
        });

        const selectEl = block.querySelector('select');
        if (selectEl) {
          window._elementRefs.set(`${id}_select`, selectEl);
          const selOpts = Array.from(selectEl.options).filter(o => o.text.trim() && !o.disabled).map(o => o.text.trim());
          if (options.length === 0 && selOpts.length > 0) {
            options.push(...selOpts);
          }
        }

        const textInput = block.querySelector('input[type="text"], textarea, .fill-blank');
        if (textInput) window._elementRefs.set(`${id}_input`, textInput);

        results.push({
          id: id,
          text: text,
          options: options,
          target_type: (options.length > 0 && !selectEl) ? 'choice' : (selectEl ? 'dropdown' : 'text')
        });
      });
      return results;
    }

    // 2. Không có class chuẩn: Quét tất cả radio, select, custom dropdown và input xuyên iframe
    // A. Radio groups
    const radioGroups = groupRadioButtons();
    radioGroups.forEach((group, gIdx) => {
      const qPrompt = getQuestionPromptForGroup(group, gIdx);

      // 1. Tìm số câu chính xác từ prompt (VD: "38. What field..." -> 38)
      let parsedNum = null;
      const matchNum = qPrompt.match(/(?:^|\b)(\d{1,3})\s*[\.\:\)]/);
      if (matchNum) {
        const n = parseInt(matchNum[1], 10);
        if (n >= 1 && n <= 200) parsedNum = n;
      }

      // 2. Nếu prompt chưa có số, dựa vào dải số ở tiêu đề trang (VD: Question 38 - 40 -> 38 + gIdx)
      if (!parsedNum) {
        const headerRange = allDocsText.match(/(?:Question|Câu)\s*(\d{1,3})\s*[-–—to\s]+(\d{1,3})/i);
        if (headerRange) {
          const qStart = parseInt(headerRange[1], 10);
          if (!isNaN(qStart) && qStart >= 1) parsedNum = qStart + gIdx;
        }
      }

      const qNum = parsedNum || (gIdx + 1);
      const qId = `q_${qNum}`;
      const options = [];
      group.forEach((r, oIdx) => {
        const optText = extractRadioOptionText(r, oIdx);
        options.push(optText);
        window._elementRefs.set(`${qId}_opt_${oIdx}`, r);
        window._elementRefs.set(`radio_q_${gIdx + 1}_opt_${oIdx}`, r);
      });

      results.push({
        id: qId,
        question_number: qNum,
        text: qPrompt.startsWith(`${qNum}.`) ? qPrompt : `${qNum}. ${qPrompt}`,
        options: options,
        target_type: "choice"
      });
    });

    // B. Native select dropdowns
    const selects = queryAllInDocs("select").filter(s => !isAiElement(s) && isElementVisible(s));
    selects.forEach((sel, idx) => {
      const qId = `dropdown_${idx + 1}`;
      window._elementRefs.set(qId, sel);
      const sentence = getSurroundingSentence(sel);
      const options = Array.from(sel.options)
        .filter(o => o.text.trim() && !o.disabled && !/^(select|choose|--)/i.test(o.text.trim()))
        .map(o => o.text.trim());

      results.push({
        id: qId,
        text: sentence || `Menu lựa chọn thả xuống #${idx + 1}`,
        options: options,
        target_type: "dropdown",
        target_index: idx
      });
    });

    // C. DẠNG BÀI KÉO THẢ TỪ VÀO Ô TRỐNG (DRAG AND DROP)
    const isDragDropCandidate = (
      allDocsText.includes("Drag ") ||
      allDocsText.includes("drag ") ||
      allDocsText.includes("into place") ||
      allDocsText.includes("kéo thả") ||
      Boolean(queryAllInDocs(".ui-draggable, .draggable, [draggable='true']").length > 0)
    );

    if (isDragDropCandidate) {
      const bankItems = findDraggableBankItems();
      const bankOptions = bankItems.map(it => (it.innerText || "").trim()).filter(Boolean);
      console.log(`[Content] 🎯 Phát hiện dạng bài kéo thả! Ngân hàng từ (${bankOptions.length}):`, bankOptions);

      // Tìm các ô trống nhận đáp án trong câu văn (Drop Blanks)
      const dropBlanks = findDragDropBlanks(bankItems);
      console.log(`[Content] 🎯 Tìm thấy ${dropBlanks.length} ô trống nhận từ.`);

      if (dropBlanks.length > 0) {
        dropBlanks.forEach((blank, bIdx) => {
          const qId = `drag_drop_${bIdx + 1}`;
          window._elementRefs.set(qId, blank);
          const sentence = getSurroundingSentence(blank);

          results.push({
            id: qId,
            text: sentence || `Kéo thả từ vào ô trống #${bIdx + 1}`,
            options: bankOptions,
            target_type: "drag_drop",
            target_index: bIdx
          });
        });
        return results;
      } else if (bankOptions.length >= 2) {
        // CỰC KỲ QUAN TRỌNG: Có ngân hàng từ nhưng chưa bắt được thẻ DOM ô trống
        // VẪN PHẢI TẠO CÂU HỎI gửi AI, không được gửi 0 câu hỏi!
        console.log(`[Content] ⚠️ Ngân hàng từ sẵn sàng (${bankOptions.join(', ')}), đang trích xuất câu hỏi từ văn bản trang...`);
        const lines = combinedPageText.split("\n").map(l => l.trim()).filter(l => l.length > 8);
        const blankLines = lines.filter(l => /___|____|\bblank\b|looks as if|I wish|essential that|vital that|suggest that|recommend that|demand that/i.test(l));
        const questionText = blankLines.slice(0, 3).join("\n") || "Kéo từ thích hợp vào ô trống trong đoạn hội thoại.";

        const qId = `drag_drop_1`;
        results.push({
          id: qId,
          text: questionText,
          options: bankOptions,
          target_type: "drag_drop",
          target_index: 0
        });
        return results;
      }
    }

    // D. DẠNG BÀI MENU XỔ XUỐNG TÙY BIẾN (CUSTOM DROPDOWNS)
    let customDropdowns = queryAllInDocs(
      '[role="combobox"], [role="listbox"], .dropdown, .drop-down, .custom-select, .selectBox-dropdown, a.selectBox, span.selectBox, ' +
      'span.cbo, div.cbo, .combo-box, .combobox, .ui-selectmenu-button, span[id*="dd_"], div[id*="dd_"]'
    ).filter(el => {
      if (isAiElement(el)) return false;
      if (el.querySelector("select")) return false;
      if (el.tagName === 'DIV' && el.classList.contains('dropdown') && el.querySelector('[role="combobox"], span.cbo')) return false;
      const r = el.getBoundingClientRect();
      const win = el.ownerDocument?.defaultView || window;
      const inContent = r.top > 60 && r.bottom < win.innerHeight - 60;
      return inContent && r.width >= 20 && r.height >= 10 && r.width <= 350 && isElementVisible(el);
    });

    customDropdowns = customDropdowns.slice(0, 6);

    for (let i = 0; i < customDropdowns.length; i++) {
      const cd = customDropdowns[i];
      const qId = `custom_dropdown_${i + 1}`;
      window._elementRefs.set(qId, cd);

      let options = [];

      // 1. Kiểm tra options con bên trong cd
      const childOptions = Array.from(cd.querySelectorAll("li, [role='option'], .option, .dropdown-item, .item, a, div")).filter(o => {
        const t = (o.innerText || "").trim();
        return t && t.length < 50 && !isAiElement(o) && o.children.length === 0;
      });
      if (childOptions.length >= 2) {
        options = childOptions.map(o => o.innerText.trim());
      }

      // 2. Kiểm tra nếu có menu popup đang mở sẵn
      if (options.length === 0) {
        const popupMenus = queryAllInDocs(
          '.dropdown-menu, [role="listbox"], .ui-selectmenu-menu, .selectBox-dropdown-menu, ' +
          'div[class*="menu" i], div[class*="options" i], ul[class*="dropdown" i], div[class*="popup" i], div[class*="list" i]'
        ).filter(m => !isAiElement(m) && isElementVisible(m));

        for (const menu of popupMenus) {
          const items = Array.from(menu.querySelectorAll("li, div, a, span, [role='option']")).filter(it => {
            const t = (it.innerText || "").trim();
            return t && t.length < 50 && !isAiElement(it);
          });
          if (items.length >= 2 && items.length <= 10) {
            options = items.map(it => it.innerText.trim());
            break;
          }
        }
      }

      // 3. Click mở menu để đọc options nếu chưa có
      if (options.length === 0) {
        triggerSmartClick(cd);
        await sleep(200);
        const openedItems = queryAllInDocs(
          'li, [role="option"], .dropdown-item, div[class*="option" i], div[class*="item" i], div[class*="choice" i]'
        ).filter(it => {
          const t = (it.innerText || "").trim();
          return t && t.length < 50 && !isAiElement(it) && isElementVisible(it);
        });
        if (openedItems.length >= 2 && openedItems.length <= 10) {
          options = openedItems.map(it => it.innerText.trim());
        }
      }

      const sentence = getSurroundingSentence(cd);

      results.push({
        id: qId,
        text: sentence || `Menu thả xuống tùy biến #${i + 1}`,
        options: options,
        target_type: "custom_dropdown",
        target_index: i
      });
    }

    // D. Text inputs
    const textInputs = queryAllInDocs("input[type='text'], textarea, .fill-blank").filter(inp => {
      return !isAiElement(inp) && isElementVisible(inp) && !inp.readOnly && !inp.disabled;
    });
    textInputs.forEach((inp, idx) => {
      const qId = `input_${idx + 1}`;
      window._elementRefs.set(qId, inp);
      results.push({
        id: qId,
        text: getSurroundingSentence(inp) || `Ô điền từ #${idx + 1}`,
        options: [],
        target_type: "text",
        target_index: idx
      });
    });

    if (results.length === 0) {
      // 1. Quét tìm bất kỳ radio nào trên trang (kể cả không nhóm được)
      const rawRadios = queryAllInDocs('input[type="radio"]');
      if (rawRadios.length >= 2) {
        const qId = "q_1";
        const options = [];
        rawRadios.slice(0, 4).forEach((r, idx) => {
          window._elementRefs.set(`${qId}_opt_${idx}`, r);
          options.push(extractRadioOptionText(r, idx));
        });
        results.push({
          id: qId,
          text: "Listening/Reading Question: Choose the correct answer",
          options: options,
          target_type: "choice"
        });
        console.log(`[Content] 🎯 Đã nhận diện được câu hỏi từ danh sách radio:`, results[0]);
      } else {
        // 2. Dự phòng dựa trên text toàn trang (TOEIC Listening / Reading)
        const qNumMatch = allDocsText.match(/Question\s*(\d+)/i) || allDocsText.match(/(\d+)\.\s*\n*\s*\(A\)/i);
        const qNum = qNumMatch ? qNumMatch[1] : "1";
        const qId = `q_${qNum}`;
        results.push({
          id: qId,
          text: `Question ${qNum}: Look at the picture and audio, then choose the correct answer (A, B, C, D)`,
          options: ["(A)", "(B)", "(C)", "(D)"],
          target_type: "choice"
        });
        console.log(`[Content] 🎯 Đã khởi tạo câu hỏi dự phòng TOEIC từ nội dung trang:`, results[0]);
      }
    }

    // DEDUPLICATE: Loại bỏ triệt để câu hỏi trùng lặp do cloned / mirrored / preloaded iframes
    const seenSignatures = new Set();
    const uniqueResults = [];
    for (const q of results) {
      const optClean = (q.options || [])
        .map(o => (o || "").toLowerCase().replace(/^[a-d\(\)\.\s]+/g, "").trim())
        .filter(o => o.length > 2);

      const sig = optClean.length >= 2
        ? optClean.join("||")
        : ((q.text || "").replace(/\s+/g, " ").trim().toLowerCase());

      if (sig && seenSignatures.has(sig)) {
        console.warn(`[Content] ⚠️ Bỏ qua câu hỏi trùng lặp do iframe clone:`, q.id, sig);
        continue;
      }
      if (sig) seenSignatures.add(sig);
      uniqueResults.push(q);
    }

    return uniqueResults;
  }


  /**
   * Tìm chính xác các ô trống nhận đáp án trong câu văn (Drop Blanks)
   * Lọc chỉ lấy các phần tử con nhỏ (leaf element: width <= 320px, height <= 65px)
   * nằm phía trên thanh ngân hàng từ (above bankItems).
   */
  function findDragDropBlanks(bankItems = []) {
    let bankTop = Infinity;
    if (bankItems && bankItems.length > 0) {
      bankTop = Math.min(...bankItems.map(b => b.getBoundingClientRect().top));
    }
    const win = window;
    const maxTop = Number.isFinite(bankTop) && bankTop > 150 ? bankTop - 15 : win.innerHeight * 0.85;

    // 1. Tìm theo các selector thường dùng cho ô trống kéo thả
    const selectors = [
      '.ui-droppable:not(.ui-draggable):not([class*="bank" i])',
      '.droppable:not(.ui-draggable):not([class*="bank" i])',
      '.dropTarget:not(.ui-draggable)',
      '.drop-target:not(.ui-draggable)',
      'span.blank', 'div.blank', 'u.blank',
      'span[class*="drop" i]:not(.ui-draggable)',
      'div[class*="drop" i]:not(.ui-draggable):not([class*="bank" i])',
      'span[class*="target" i]:not(.ui-draggable)',
      'div[class*="target" i]:not(.ui-draggable):not([class*="bank" i])',
      'span[class*="slot" i]:not(.ui-draggable)',
      'div[class*="slot" i]:not(.ui-draggable):not([class*="bank" i])',
      'span[class*="dash" i]', 'div[class*="dash" i]',
      'span[id*="blank" i]', 'div[id*="blank" i]',
      'span[id*="drop" i]', 'div[id*="drop" i]'
    ];

    let found = [];
    for (const sel of selectors) {
      try {
        const matches = queryAllInDocs(sel).filter(el => {
          if (isAiElement(el) || !isElementVisible(el)) return false;
          if (el.closest('.bank, .words-bank, [class*="bank" i], .ui-draggable')) return false;
          const r = el.getBoundingClientRect();
          const aboveBank = r.bottom <= maxTop + 30 && r.top >= 40;
          const validSize = r.width >= 15 && r.width <= 320 && r.height <= 65;
          return aboveBank && validSize;
        });
        found.push(...matches);
      } catch (e) {}
    }

    // 2. Tìm theo thẻ underline <u> hoặc <span> chứa gạch dưới _____ hoặc border-bottom
    if (found.length === 0) {
      const underlineMatches = queryAllInDocs("p span, div span, p u, div u, span, u").filter(el => {
        if (isAiElement(el) || !isElementVisible(el)) return false;
        if (el.closest('.bank, .words-bank, [class*="bank" i], .ui-draggable')) return false;
        const r = el.getBoundingClientRect();
        const aboveBank = r.bottom <= maxTop + 30 && r.top >= 40;
        const validSize = r.width >= 15 && r.width <= 320 && r.height <= 60;
        if (!aboveBank || !validSize) return false;

        const t = (el.innerText || "").trim();
        const isUnderscore = /^_{2,}$/.test(t) || t === "" || t === "____" || t === "___" || t === "\u00a0";
        if (isUnderscore) return true;

        try {
          const style = (el.ownerDocument?.defaultView || window).getComputedStyle(el);
          const hasBorderBottom = style && style.borderBottomWidth && style.borderBottomWidth !== '0px' && style.borderBottomStyle !== 'none';
          const hasUnderline = style && style.textDecorationLine && style.textDecorationLine.includes('underline');
          if (hasBorderBottom || hasUnderline) return true;
        } catch (eStyle) {}

        return false;
      });
      found.push(...underlineMatches);
    }

    // 3. Fallback: Nếu có container .ui-droppable lớn nhưng không bắt được leaf, tìm leaf bên trong
    if (found.length === 0) {
      const bigDroppables = queryAllInDocs('.ui-droppable, .droppable, [class*="drop" i]').filter(el => {
        if (isAiElement(el) || !isElementVisible(el)) return false;
        if (el.closest('.bank, .words-bank, [class*="bank" i], .ui-draggable')) return false;
        const r = el.getBoundingClientRect();
        return r.bottom <= maxTop + 30 && r.top >= 40;
      });
      for (const bd of bigDroppables) {
        const innerLeaf = bd.querySelector('span, u, div:empty, input');
        if (innerLeaf && isElementVisible(innerLeaf)) {
          const r = innerLeaf.getBoundingClientRect();
          if (r.width >= 15 && r.width <= 320 && r.height <= 60) {
            found.push(innerLeaf);
          }
        } else {
          const r = bd.getBoundingClientRect();
          if (r.width >= 15 && r.width <= 320 && r.height <= 75) {
            found.push(bd);
          }
        }
      }
    }

    // Loại bỏ phần tử trùng lặp và phần tử con
    const unique = [];
    for (const el of found) {
      if (!unique.includes(el) && !unique.some(u => u.contains(el))) {
        unique.push(el);
      }
    }

    // Sắp xếp các ô trống từ trên xuống dưới, từ trái sang phải
    unique.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const yDiff = ra.top - rb.top;
      if (Math.abs(yDiff) > 15) return yDiff;
      return ra.left - rb.left;
    });

    return unique.slice(0, 6);
  }

  /**
   * Tìm danh sách các ô chữ trong ngân hàng từ kéo thả (Word Bank) xuyên qua các iframe
   */
  function findDraggableBankItems() {
    let candidates = queryAllInDocs(
      '.ui-draggable, .draggable, [draggable="true"], .token, .bank-item, .drag-item, ' +
      'div[class*="drag" i], span[class*="drag" i], [class*="word" i], [class*="token" i], [class*="choice" i], ' +
      '.bank > *, .words-bank > *, [id*="bank" i] > *, [class*="bank" i] > *'
    ).filter(el => {
      if (isAiElement(el)) return false;
      if (!isElementVisible(el)) return false;
      const t = (el.innerText || "").trim();
      const words = t.split(/\s+/).length;
      const r = el.getBoundingClientRect();
      return t && words >= 1 && words <= 6 && t.length < 50 && r.width >= 20 && r.height >= 15;
    });

    // Fallback: Tìm các button hoặc box nhỏ ở nửa dưới màn hình
    if (candidates.length < 2) {
      const bottomCandidates = queryAllInDocs("button, div, span, a, li").filter(el => {
        if (isAiElement(el)) return false;
        if (!isElementVisible(el)) return false;
        const r = el.getBoundingClientRect();
        const win = el.ownerDocument?.defaultView || window;
        const inBottom = r.top > win.innerHeight * 0.45 && r.bottom < win.innerHeight - 20;
        const t = (el.innerText || "").trim();
        const words = t.split(/\s+/).length;
        const hasSize = r.width >= 25 && r.height >= 15 && r.width <= 250 && r.height <= 80;
        return inBottom && hasSize && words >= 1 && words <= 5 && el.children.length <= 1;
      });
      if (bottomCandidates.length >= 2) {
        candidates = bottomCandidates;
      }
    }

    // Loại bỏ phần tử trùng lặp hoặc chứa nhau
    const unique = [];
    for (const c of candidates) {
      if (!unique.some(u => u === c || u.contains(c))) {
        unique.push(c);
      }
    }
    return unique;
  }

  /**
   * Tìm phần tử ô chữ kéo thả (Drag Source) ứng với giá trị đáp án targetVal
   * ĐẶC BIỆT: Ưu tiên khớp chính xác (Exact Match) để tránh lỗi 'stayed' bị chọn thay vì 'stay'
   */
  function findDragSourceForValue(targetVal) {
    if (!targetVal) return null;
    const norm = targetVal.toLowerCase().trim();
    const cleanNorm = norm.replace(/[^a-z0-9]/gi, "");

    const bankItems = findDraggableBankItems();

    // 1. ƯU TIÊN TUYỆT ĐỐI: Khớp chính xác hoàn toàn trong ngân hàng từ
    const exactBank = bankItems.find(el => (el.innerText || "").toLowerCase().trim() === norm);
    if (exactBank) return exactBank;

    // 2. Khớp sau khi loại bỏ dấu cách và ký tự đặc biệt (ví dụ "'ll stay" vs "ll stay")
    const cleanBank = bankItems.find(el => (el.innerText || "").toLowerCase().trim().replace(/[^a-z0-9]/gi, "") === cleanNorm);
    if (cleanBank) return cleanBank;

    // 3. Khớp chính xác trên toàn bộ văn bản của trang
    const allMatch = queryAllInDocs("div, span, button, a, p, li, b, strong").filter(el => {
      if (isAiElement(el)) return false;
      if (!isElementVisible(el)) return false;
      const t = (el.innerText || "").toLowerCase().trim();
      return t === norm && el.children.length <= 1;
    });

    if (allMatch.length > 0) {
      allMatch.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
      return allMatch[0];
    }

    // 4. Fuzzy match: Chỉ dùng khi không có bất kỳ exact match nào
    const fuzzy = bankItems.find(el => {
      const t = (el.innerText || "").toLowerCase().trim();
      return norm.length > 3 && (t.startsWith(norm) || norm.startsWith(t));
    });
    if (fuzzy) return fuzzy;

    return null;
  }

  /**
   * Tìm phần tử option hiển thị trên màn hình ứng với giá trị targetVal
   */
  function findVisibleOptionForValue(targetVal) {
    if (!targetVal) return null;
    const norm = targetVal.toLowerCase().trim();
    const cleanNorm = norm.replace(/[^a-z0-9]/gi, "");

    const candidates = queryAllInDocs('li, [role="option"], .dropdown-item, .option, a, div, span, p').filter(el => {
      if (isAiElement(el)) return false;
      if (!isElementVisible(el)) return false;
      const t = (el.innerText || "").trim().toLowerCase();
      return t.length > 0 && t.length < 80;
    });

    // 1. Exact match
    const exact = candidates.find(el => (el.innerText || "").trim().toLowerCase() === norm);
    if (exact) return exact;

    // 2. Clean match
    const clean = candidates.find(el => (el.innerText || "").trim().toLowerCase().replace(/[^a-z0-9]/gi, "") === cleanNorm);
    if (clean) return clean;

    // 3. Fuzzy match (bắt đầu bằng)
    if (norm.length > 3) {
      const fuzzy = candidates.find(el => {
        const t = (el.innerText || "").trim().toLowerCase();
        return t.startsWith(norm) || norm.startsWith(t);
      });
      if (fuzzy) return fuzzy;
    }

    return null;
  }

  function createSmartMouseEvent(type, x, y, win, opts = {}) {
    const scrollX = win.scrollX || win.pageXOffset || 0;
    const scrollY = win.scrollY || win.pageYOffset || 0;
    const pageX = x + scrollX;
    const pageY = y + scrollY;

    const evt = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: win,
      clientX: Math.round(x),
      clientY: Math.round(y),
      screenX: Math.round(x),
      screenY: Math.round(y),
      buttons: opts.buttons !== undefined ? opts.buttons : 1,
      button: opts.button !== undefined ? opts.button : 0,
      which: opts.which !== undefined ? opts.which : 1,
      ...opts
    });

    try {
      Object.defineProperty(evt, 'pageX', { get: () => pageX });
      Object.defineProperty(evt, 'pageY', { get: () => pageY });
      Object.defineProperty(evt, 'which', { get: () => opts.which !== undefined ? opts.which : 1 });
      Object.defineProperty(evt, 'button', { get: () => opts.button !== undefined ? opts.button : 0 });
    } catch (e) {}

    return evt;
  }

  function createSmartPointerEvent(type, x, y, win, opts = {}) {
    const scrollX = win.scrollX || win.pageXOffset || 0;
    const scrollY = win.scrollY || win.pageYOffset || 0;
    const pageX = x + scrollX;
    const pageY = y + scrollY;

    const evt = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      view: win,
      clientX: Math.round(x),
      clientY: Math.round(y),
      screenX: Math.round(x),
      screenY: Math.round(y),
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      buttons: opts.buttons !== undefined ? opts.buttons : 1,
      button: opts.button !== undefined ? opts.button : 0,
      which: opts.which !== undefined ? opts.which : 1,
      ...opts
    });

    try {
      Object.defineProperty(evt, 'pageX', { get: () => pageX });
      Object.defineProperty(evt, 'pageY', { get: () => pageY });
      Object.defineProperty(evt, 'which', { get: () => opts.which !== undefined ? opts.which : 1 });
      Object.defineProperty(evt, 'button', { get: () => opts.button !== undefined ? opts.button : 0 });
    } catch (e) {}

    return evt;
  }

  /**
   * Kích hoạt drop trực tiếp trong Page Context (nơi jQuery UI hoạt động)
   */
  function injectPageDrop(sourceEl, targetEl, endX, endY) {
    const doc = targetEl.ownerDocument || sourceEl.ownerDocument || document;
    const srcUid = 'ai_src_' + Math.random().toString(36).slice(2);
    const tgtUid = 'ai_tgt_' + Math.random().toString(36).slice(2);
    sourceEl.setAttribute('data-ai-src', srcUid);
    targetEl.setAttribute('data-ai-tgt', tgtUid);

    const scriptCode = `
      (function() {
        try {
          const $ = window.jQuery || window.$;
          const src = document.querySelector('[data-ai-src="${srcUid}"]');
          const tgt = document.querySelector('[data-ai-tgt="${tgtUid}"]');
          if (!src || !tgt) return;

          if ($) {
            const $src = $(src);
            const $tgt = $(tgt);

            // Tìm droppable instance trên tgt hoặc phần tử cha gần nhất
            let droppableTarget = $tgt;
            let inst = droppableTarget.data('ui-droppable') || droppableTarget.data('droppable');
            if (!inst) {
              const p = $tgt.closest('.ui-droppable, [class*="drop" i]');
              if (p.length) {
                droppableTarget = p;
                inst = p.data('ui-droppable') || p.data('droppable');
              }
            }

            const px = ${Math.round(endX)};
            const py = ${Math.round(endY)};
            const fakeUi = {
              draggable: $src,
              helper: $src,
              position: { top: py, left: px },
              offset: { top: py, left: px }
            };
            const dropEvt = $.Event('drop', {
              target: droppableTarget[0] || tgt,
              pageX: px,
              pageY: py,
              clientX: px,
              clientY: py
            });

            if (inst) {
              console.log('[AI Injected] Gọi droppable instance thành công:', droppableTarget[0]);
              if (typeof inst._drop === 'function') {
                inst._drop(dropEvt, fakeUi);
              } else if (inst.options && typeof inst.options.drop === 'function') {
                inst.options.drop.call(droppableTarget[0], dropEvt, fakeUi);
              }
            }
            droppableTarget.trigger(dropEvt, fakeUi);
            droppableTarget.trigger('change').trigger('input');
          }
        } catch(err) {
          console.warn('[AI Injected Drop Error]', err);
        }
      })();
    `;

    try {
      const scriptEl = doc.createElement('script');
      scriptEl.textContent = scriptCode;
      (doc.head || doc.documentElement || doc.body).appendChild(scriptEl);
      scriptEl.remove();
    } catch (e) {
      console.warn("[injectPageDrop]", e);
    }
  }

  /**
   * Kéo và thả một phần tử đáp án (sourceEl) vào ô trống (targetEl)
   * Kết hợp cả jQuery UI MouseEvent sequence mượt mà, Page Context direct drop, HTML5 DragEvent, và Click-to-place
   */
  async function performDragAndDrop(sourceEl, targetEl) {
    if (!sourceEl || !targetEl) return false;
    console.log("[DragDrop] 🚀 Đang kéo phần tử:", sourceEl, "-> thả vào:", targetEl);

    const win = sourceEl.ownerDocument?.defaultView || window;
    const doc = sourceEl.ownerDocument || document;
    const tgtWin = targetEl.ownerDocument?.defaultView || win;
    const tgtDoc = targetEl.ownerDocument || doc;

    try {
      sourceEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {}
    await sleep(60);

    const srcRect = sourceEl.getBoundingClientRect();
    const tgtRect = targetEl.getBoundingClientRect();

    const startX = srcRect.left + srcRect.width / 2;
    const startY = srcRect.top + srcRect.height / 2;
    const endX = tgtRect.left + tgtRect.width / 2;
    const endY = tgtRect.top + Math.max(tgtRect.height / 2, 8);

    console.log(`[DragDrop] 📍 Toạ độ kéo: (${Math.round(startX)}, ${Math.round(startY)}) -> (${Math.round(endX)}, ${Math.round(endY)})`);

    // 1. CHIẾN LƯỢC 1: MOUSE EVENT SEQUENCE HOÀN CHỈNH VỚI ĐỦ PAGE_X / PAGE_Y CHO JQUERY UI
    try {
      sourceEl.dispatchEvent(createSmartPointerEvent('pointerdown', startX, startY, win));
      sourceEl.dispatchEvent(createSmartMouseEvent('mousedown', startX, startY, win));

      await sleep(60);

      // Di chuyển chuột mượt mà 15 bước từ từ sang đích
      const steps = 15;
      for (let s = 1; s <= steps; s++) {
        const curX = startX + (endX - startX) * (s / steps);
        const curY = startY + (endY - startY) * (s / steps);

        doc.dispatchEvent(createSmartPointerEvent('pointermove', curX, curY, win));
        doc.dispatchEvent(createSmartMouseEvent('mousemove', curX, curY, win));
        if (tgtDoc !== doc) {
          tgtDoc.dispatchEvent(createSmartPointerEvent('pointermove', curX, curY, tgtWin));
          tgtDoc.dispatchEvent(createSmartMouseEvent('mousemove', curX, curY, tgtWin));
        }
        targetEl.dispatchEvent(createSmartMouseEvent('mousemove', curX, curY, tgtWin));
        await sleep(15);
      }

      // Giữ chuột 80ms tại vị trí ô trống để ddmanager kích hoạt hover / over
      await sleep(80);

      // Thả chuột trên ô trống và trên document
      targetEl.dispatchEvent(createSmartMouseEvent('mouseup', endX, endY, tgtWin, { buttons: 0, button: 0, which: 1 }));
      targetEl.dispatchEvent(createSmartPointerEvent('pointerup', endX, endY, tgtWin, { buttons: 0, button: 0, which: 1 }));
      doc.dispatchEvent(createSmartMouseEvent('mouseup', endX, endY, win, { buttons: 0, button: 0, which: 1 }));
      if (tgtDoc !== doc) {
        tgtDoc.dispatchEvent(createSmartMouseEvent('mouseup', endX, endY, tgtWin, { buttons: 0, button: 0, which: 1 }));
      }
    } catch (eMouse) {
      console.warn("[DragDrop] Lỗi mô phỏng MouseEvent:", eMouse);
    }

    await sleep(80);

    // 2. CHIẾN LƯỢC 2: INJECT VÀO MAIN WORLD ĐỂ KÍCH HOẠT JQUERY UI DROPPABLE INSTANCE
    injectPageDrop(sourceEl, targetEl, endX, endY);

    await sleep(80);

    // 3. CHIẾN LƯỢC 3: HTML5 DRAG & DROP EVENTS
    try {
      const dt = new DataTransfer();
      const val = (sourceEl.innerText || "").trim();
      dt.setData('text/plain', val);
      dt.setData('text/html', sourceEl.outerHTML);

      sourceEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: startX, clientY: startY, view: win }));
      await sleep(30);
      targetEl.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: endX, clientY: endY, view: tgtWin }));
      targetEl.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: endX, clientY: endY, view: tgtWin }));
      await sleep(30);
      targetEl.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: endX, clientY: endY, view: tgtWin }));
      sourceEl.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: endX, clientY: endY, view: win }));
    } catch (eH5) {}

    await sleep(80);

    // 4. CHIẾN LƯỢC 4: CLICK SOURCE RỒI CLICK TARGET (Click-to-place)
    try {
      triggerSmartClick(sourceEl);
      await sleep(80);
      triggerSmartClick(targetEl);
    } catch (eClick) {}

    highlightElement(targetEl);
    highlightElement(sourceEl);
    return true;
  }

  /**
   * Tự động điền và kích hoạt câu trả lời cho các loại bài tập
   */
  async function autoFillAnswers(solutions) {
    console.log(`[AutoFill] Bắt đầu tự động điền ${solutions.length} đáp án...`);
    const allDocsText = getAllExerciseDocuments().map(d => d.body?.innerText || "").join(" ");
    const radioGroups = groupRadioButtons();
    const allRadios = getVisibleTestRadios();

    for (let i = 0; i < solutions.length; i++) {
      const sol = solutions[i];
      const qId = sol.question_id || `q_${i + 1}`;
      const selectedIdx = (typeof sol.selected_index === "number" && sol.selected_index >= 0) ? sol.selected_index : 0;
      const selectedVal = (sol.selected_value || "").toLowerCase().trim();

      console.log(`[AutoFill] (${i + 1}/${solutions.length}) Điền ${qId} -> Đáp án: "${sol.selected_value}" (Index: ${selectedIdx})`);

      try {
        // A. XỬ LÝ CÂU HỎI TRẮC NGHIỆM RADIO (ĐẶC BIỆT LÀ TOEIC MULTI-QUESTION TRÊN CÙNG TRANG)
        let optNode = null;
        let letterIdx = selectedIdx;
        const letterMatch = selectedVal.match(/^\(?([A-D])\)?/i);
        if (letterMatch) {
          letterIdx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
        }

        // 1. Tìm theo exact key trong _elementRefs
        optNode = window._elementRefs.get(`${qId}_opt_${letterIdx}`) || window._elementRefs.get(`${qId}_opt_${selectedIdx}`);

        // 1b. Thử tìm với key fallback theo số thứ tự câu trên trang: radio_q_{i+1}_opt_{letterIdx}
        if (!optNode) {
          optNode = window._elementRefs.get(`radio_q_${i + 1}_opt_${letterIdx}`) || window._elementRefs.get(`radio_q_${i + 1}_opt_${selectedIdx}`);
        }

        // 2. Xác định nhóm radio của câu hỏi i trên màn hình (ĐẢM BẢO MỖI CÂU ĐƯỢC CHỌN ĐÚNG NHÓM RIÊNG)
        let grp = null;
        if (i < radioGroups.length) {
          grp = radioGroups[i];
        }

        // Nếu sol có question_number (ví dụ câu 72), thử tìm nhóm tương ứng theo offset từ headerRange
        const headerRangeMatch = allDocsText.match(/(?:Questions?|Câu)\s*(\d{1,3})\s*(?:[-–—to\s]|through)+\s*(\d{1,3})/i);
        if (sol.question_number && headerRangeMatch) {
          const qStart = parseInt(headerRangeMatch[1], 10);
          const offset = sol.question_number - qStart;
          if (offset >= 0 && offset < radioGroups.length) {
            grp = radioGroups[offset];
          }
        }

        if (!optNode && grp) {
          if (letterIdx >= 0 && letterIdx < grp.length) {
            optNode = grp[letterIdx];
          } else if (grp.length > 0) {
            optNode = grp[0];
          }
        }

        // 3. Fallback: Nếu không tìm thấy trong grp nhưng có allRadios, lấy radio trong cụm tương ứng của câu i
        if (!optNode && allRadios.length >= (i + 1) * 4) {
          const qChunk = allRadios.slice(i * 4, (i + 1) * 4);
          if (letterIdx >= 0 && letterIdx < qChunk.length) {
            optNode = qChunk[letterIdx];
          }
        }

        // 4. Fallback tìm theo nhãn (A), (B), (C), (D) TRONG PHẠM VI NHÓM grp CỦA CÂU NÀY (Tuyệt đối không tìm toàn trang)
        if (!optNode && grp && selectedVal) {
          const letter = letterMatch ? letterMatch[1].toUpperCase() : "";
          if (letter) {
            for (let rIdx = 0; rIdx < grp.length; rIdx++) {
              const r = grp[rIdx];
              const optText = extractRadioOptionText(r, rIdx);
              if (optText.startsWith(`(${letter})`) || optText.startsWith(letter)) {
                optNode = r;
                break;
              }
            }
          }
        }

        // QUAN TRỌNG: Nếu optNode không phải thẻ <input type="radio"> (mà là label hoặc container), truy ngược thẻ radio thật
        if (optNode && optNode.tagName !== "INPUT") {
          const doc = optNode.ownerDocument || document;
          const realRadio = (
            optNode.querySelector('input[type="radio"]') ||
            (optNode.htmlFor ? doc.getElementById(optNode.htmlFor) : null) ||
            optNode.closest('tr, td, li, label, .choice, .option, table')?.querySelector('input[type="radio"]')
          );
          if (realRadio) optNode = realRadio;
        }

        if (optNode) {
          await checkRadioButtonSafely(optNode);
          if (optNode.tagName === "INPUT" && optNode.type === "radio" && !optNode.checked) {
            optNode.checked = true;
            try { optNode.click(); } catch (e) {}
          }
          await sleep(120);
          continue;
        }


        // B. Nếu là thẻ <select> thật
        const selectNode = window._elementRefs.get(`${qId}_select`) || window._elementRefs.get(qId);
        if (selectNode && selectNode.tagName === "SELECT") {
          const opts = Array.from(selectNode.options);
          let matched = opts.find(o => o.text.toLowerCase().trim() === selectedVal || o.value.toLowerCase().trim() === selectedVal);
          if (!matched && selectedIdx >= 0 && selectedIdx < opts.length) {
            matched = opts[selectedIdx];
          }
          if (matched) {
            selectNode.value = matched.value;
            selectNode.selectedIndex = matched.index;
            selectNode.dispatchEvent(new Event("change", { bubbles: true }));
            selectNode.dispatchEvent(new Event("input", { bubbles: true }));
            try {
              const win = selectNode.ownerDocument?.defaultView || window;
              const $ = win.jQuery || win.$;
              if ($) $(selectNode).val(matched.value).trigger('change');
            } catch (e) {}
            highlightElement(selectNode);
            await sleep(150);
            continue;
          }
        }

        // C. KÉO THẢ (DRAG AND DROP) - Xử lý chuyên biệt cho bài tập kéo thả từ vào ô trống
        const isDragDropQuestion = (
          sol.target_type === "drag_drop" ||
          qId.includes("drag") ||
          allDocsText.includes("Drag ") ||
          allDocsText.includes("into place") ||
          Boolean(queryAllInDocs(".ui-draggable, .draggable, [draggable='true'], .dropTarget, .ui-droppable").length > 0)
        );

        const cdNode = window._elementRefs.get(qId);
        const dragSource = findDragSourceForValue(sol.selected_value);

        if (isDragDropQuestion && dragSource) {
          let dropTarget = cdNode;
          if (!dropTarget) {
            const bankItems = findDraggableBankItems();
            const blanks = findDragDropBlanks(bankItems);
            const targetIdx = sol.target_index ?? i;
            dropTarget = blanks[targetIdx] || blanks[0];
          }

          // Fallback cấp cao: Tìm chính xác câu văn hoặc gạch dưới chứa ô trống
          if (!dropTarget) {
            const candidateSentences = queryAllInDocs("p, div, li, span").filter(el => {
              if (isAiElement(el) || !isElementVisible(el)) return false;
              if (el.closest('.bank, .words-bank, [class*="bank" i], .ui-draggable')) return false;
              const t = (el.innerText || "").trim();
              return /___|____/.test(t) || (t.includes("-") && t.length > 15 && t.length < 150);
            });
            for (const sentEl of candidateSentences) {
              const leaf = sentEl.querySelector("span, u, div, input");
              if (leaf && isElementVisible(leaf)) {
                dropTarget = leaf;
                break;
              } else if (sentEl.children.length === 0) {
                dropTarget = sentEl;
                break;
              }
            }
          }

          if (dropTarget) {
            console.log(`[AutoFill] 🎯 Phát hiện dạng bài kéo thả! Thực hiện kéo "${sol.selected_value}" vào ô trống.`);
            await performDragAndDrop(dragSource, dropTarget);
            await sleep(250);
            continue;
          }
        }

        // D. Nếu là Custom Dropdown (như bài fill in the blank trên edtoeic.engdis.com)
        if (cdNode || qId.includes("dropdown") || qId.includes("custom_dropdown")) {
          console.log(`[AutoFill] 🔽 Đang xử lý câu hỏi dropdown: ${qId} -> "${sol.selected_value}"`);

          const win = cdNode?.ownerDocument?.defaultView || window;

          // 1. Kiểm tra nếu có thẻ <select> thật sự ẩn bên trong
          const selectInside = cdNode?.querySelector?.("select") || (cdNode?.tagName === "SELECT" ? cdNode : null);
          if (selectInside) {
            const opts = Array.from(selectInside.options);
            const matched = opts.find(o => o.text.trim().toLowerCase() === selectedVal || o.value.trim().toLowerCase() === selectedVal) || opts[selectedIdx];
            if (matched) {
              selectInside.value = matched.value;
              selectInside.selectedIndex = matched.index;
              selectInside.dispatchEvent(new Event("change", { bubbles: true }));
              selectInside.dispatchEvent(new Event("input", { bubbles: true }));
              try {
                const $ = win.jQuery || win.$;
                if ($) $(selectInside).val(matched.value).trigger('change');
              } catch (e) {}
            }
          }

          // 2. Kiểm tra xem option cần chọn đã hiển thị sẵn chưa
          let matchingOption = findVisibleOptionForValue(sol.selected_value);

          if (!matchingOption && cdNode) {
            // Chưa mở menu -> Click vào cdNode để mở popup menu
            console.log(`[AutoFill] Click mở dropdown menu:`, cdNode);
            triggerSmartClick(cdNode);
            await sleep(250);
            matchingOption = findVisibleOptionForValue(sol.selected_value);
          }

          if (matchingOption) {
            console.log(`[AutoFill] 🎯 Đã tìm thấy option dropdown:`, matchingOption);
            triggerSmartClick(matchingOption);
            highlightElement(matchingOption);
            if (cdNode) highlightElement(cdNode);
            await sleep(200);
            continue;
          }

          // 3. Fallback: Nếu không tìm thấy bằng text, thử tìm menu popup đang mở và click theo selectedIdx
          const openedMenu = queryAllInDocs('.dropdown-menu, [role="listbox"], .ui-selectmenu-menu, .selectBox-dropdown-menu, div[class*="menu" i], ul[class*="dropdown" i]')
            .find(m => !isAiElement(m) && isElementVisible(m));
          if (openedMenu) {
            const items = Array.from(openedMenu.querySelectorAll('li, [role="option"], a, div')).filter(it => isElementVisible(it) && !isAiElement(it));
            if (selectedIdx >= 0 && selectedIdx < items.length) {
              console.log(`[AutoFill] Click option index ${selectedIdx} trong menu popup:`, items[selectedIdx]);
              triggerSmartClick(items[selectedIdx]);
              highlightElement(items[selectedIdx]);
              if (cdNode) highlightElement(cdNode);
              await sleep(200);
              continue;
            }
          }
        }

        // E. Tìm input text để nhập từ
        const inputNode = window._elementRefs.get(`${qId}_input`) || window._elementRefs.get(qId) || queryAllInDocs("input[type='text'], textarea").find(inp => !isAiElement(inp) && isElementVisible(inp));
        if (inputNode && (inputNode.tagName === "INPUT" || inputNode.tagName === "TEXTAREA")) {
          inputNode.value = sol.selected_value;
          inputNode.dispatchEvent(new Event("input", { bubbles: true }));
          inputNode.dispatchEvent(new Event("change", { bubbles: true }));
          highlightElement(inputNode);
          await sleep(150);
          continue;
        }

        // F. Fallback: Quét toàn bộ documents tìm radio hoặc item có chữ tương ứng
        const fallbackItems = queryAllInDocs("label, input[type='radio'], button, li, div").filter(el => {
          if (isAiElement(el)) return false;
          if (!isElementVisible(el)) return false;
          const t = (el.innerText || el.value || "").trim().toLowerCase();
          return t === selectedVal;
        });

        if (fallbackItems.length > 0) {
          triggerSmartClick(fallbackItems[0]);
          highlightElement(fallbackItems[0]);
        }
      } catch (err) {
        console.warn(`[AutoFill] Lỗi khi điền:`, err);
      }
      await sleep(150);
    }

    // BẢO VỆ CHỐNG BỎ SÓT: Rà soát lại tất cả các nhóm câu hỏi trên màn hình
    const recheckGroups = groupRadioButtons();
    for (let g = 0; g < recheckGroups.length; g++) {
      const grp = recheckGroups[g];
      const hasSelected = grp.some(r => isRadioSelected(r));
      if (!hasSelected && grp.length > 0) {
        console.warn(`[AutoFill] ⚠️ Phát hiện nhóm câu hỏi ${g + 1} chưa được tích! Tự động chọn bổ sung...`);
        let pickIdx = 1;
        if (solutions[g] && typeof solutions[g].selected_index === 'number') {
          pickIdx = solutions[g].selected_index;
        }
        const pickRadio = grp[pickIdx] || grp[0];
        await checkRadioButtonSafely(pickRadio);
        await sleep(100);
      }
    }
  }

  function highlightElement(el) {
    const origOutline = el.style.outline;
    const origBoxShadow = el.style.boxShadow;
    el.style.outline = "2px solid #22c55e";
    el.style.boxShadow = "0 0 12px rgba(34, 197, 94, 0.8)";
    setTimeout(() => {
      el.style.outline = origOutline;
      el.style.boxShadow = origBoxShadow;
    }, 2500);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getCurrentQuestionTitle(solutions = [], questionsData = []) {
    const allDocsText = getAllExerciseDocuments().map(d => d.body?.innerText || "").join(" ");
    const partMatch = allDocsText.match(/(Listening Part\s*\d+|Reading Part\s*\d+|Part\s*\d+)/i);
    const part = partMatch ? partMatch[1] : "";

    // 1. Nếu questionsData hoặc solutions có số câu cụ thể (VD: Câu 38, Câu 40)
    const allNums = (questionsData.length > 0 ? questionsData : solutions)
      .map(q => q.question_number || (typeof q.question_id === "string" ? parseInt(q.question_id.replace(/\D/g, ""), 10) : null))
      .filter(n => n && n >= 1 && n <= 200);

    if (allNums.length > 0) {
      const minNum = Math.min(...allNums);
      const maxNum = Math.max(...allNums);
      const qText = (minNum !== maxNum) ? `Câu ${minNum} - ${maxNum}` : `Câu ${minNum}`;
      return part ? `${part} • ${qText}` : qText;
    }

    // 2. Dựa vào dải số câu trên trang (VD: Question 38 - 40 of 200)
    const rangeMatch = allDocsText.match(/(?:Question|Câu)\s*(\d{1,3})\s*(?:[-–—to\s]+(\d{1,3}))?(?:\s*of\s*\d+)?/i);
    let qText = "";
    if (rangeMatch) {
      const q1 = rangeMatch[1];
      const q2 = rangeMatch[2];
      qText = q2 ? `Câu ${q1} - ${q2}` : `Câu ${q1}`;
    }

    if (part && qText) return `${part} • ${qText}`;
    if (part) return part;
    if (qText) return qText;
    return "AI Đã Giải Xong";
  }

  function getQuestionItemTitle(index, sol, total, questionsData = []) {
    // 1. Số câu đã được gán trực tiếp từ quá trình scan
    if (sol?.question_number && typeof sol.question_number === "number") {
      return `Câu ${sol.question_number}`;
    }
    if (questionsData && questionsData[index]?.question_number) {
      return `Câu ${questionsData[index].question_number}`;
    }

    // 2. Trích xuất từ question_id (VD: "q_38", "question_39")
    const idMatch = String(sol?.question_id || "").match(/(?:q|câu|question)_?(\d{1,3})\b/i);
    if (idMatch) {
      const n = parseInt(idMatch[1], 10);
      if (n >= 1 && n <= 200 && !String(sol?.question_id).startsWith("radio_q_")) {
        return `Câu ${n}`;
      }
    }

    // 3. Trích xuất từ prompt/text của sol hoặc questionsData
    const textToCheck = `${sol?.prompt || ""} ${sol?.text || ""} ${questionsData[index]?.text || ""}`;
    const pMatch = textToCheck.match(/(?:^|\b)(\d{1,3})\s*[\.\:\)]/);
    if (pMatch) {
      const n = parseInt(pMatch[1], 10);
      if (n >= 1 && n <= 200) return `Câu ${n}`;
    }

    // 4. Dựa vào dải số câu trên trang (VD: Question 38 - 40 of 200)
    const allDocsText = getAllExerciseDocuments().map(d => d.body?.innerText || "").join(" ");
    const rangeMatch = allDocsText.match(/(?:Question|Câu)\s*(\d{1,3})\s*(?:[-–—to\s]+(\d{1,3}))?/i);
    if (rangeMatch) {
      const startNum = parseInt(rangeMatch[1], 10);
      if (!isNaN(startNum) && startNum >= 1 && startNum <= 200) {
        return `Câu ${startNum + index}`;
      }
    }

    return `Câu ${index + 1}`;
  }

  function showErrorCard(errorMsg) {
    if (isToolbarHidden) return;
    let card = document.getElementById("ai-solver-card");
    if (!card) {
      card = document.createElement("div");
      card.id = "ai-solver-card";
      document.body.appendChild(card);
    }
    const currentTitle = getCurrentQuestionTitle() || "Thông báo";
    card.innerHTML = `
      <div class="ai-card-header">
        <div class="ai-card-title"><span style="color:#ef4444;">⚠️</span> ${escapeHtml(currentTitle)}</div>
        <button class="ai-card-close" id="ai-btn-card-close" title="Đóng">&times;</button>
      </div>
      <div style="padding: 18px 14px; color: #f87171; font-size: 13px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px;">
        <div style="font-size: 24px;">⚠️</div>
        <div style="font-weight: 700; color: #fca5a5;">Chưa lấy được lời giải AI</div>
        <div style="font-size: 11.5px; color: #94a3b8; line-height: 1.4; word-break: break-word;">${escapeHtml(errorMsg)}</div>
      </div>
    `;
    const closeBtn = card.querySelector("#ai-btn-card-close");
    if (closeBtn) closeBtn.onclick = () => card.remove();
    setupDraggable(card);
    setupResizable(card);
    setTimeout(() => {
      const c = document.getElementById("ai-solver-card");
      if (c && c.innerHTML.includes("Chưa lấy được lời giải")) {
        c.remove();
      }
    }, 4500);
  }

  function showLoadingCard(message = "AI đang lắng nghe âm thanh & giải câu này...") {
    if (isToolbarHidden) return; // Chế độ tàng hình chống cảnh báo -> Không hiện bất kỳ thẻ nào trên web

    // Nếu đang ở trang chủ / chọn bài, TUYỆT ĐỐI KHÔNG mở thẻ loading
    if (window.location.hash.includes("home") || window.location.href.includes("#/home")) {
      const existing = document.getElementById("ai-solver-card");
      if (existing) existing.remove();
      return;
    }

    let card = document.getElementById("ai-solver-card");
    if (!card) {
      card = document.createElement("div");
      card.id = "ai-solver-card";
      document.body.appendChild(card);
    }
    const currentTitle = getCurrentQuestionTitle() || "Đang xử lý...";
    card.innerHTML = `
      <div class="ai-card-header">
        <div class="ai-card-title"><span>⏳</span> ${escapeHtml(currentTitle)}</div>
        <button class="ai-card-close" id="ai-btn-card-close" title="Đóng và dừng tiến trình">&times;</button>
      </div>
      <div style="padding: 24px 16px; color: #94a3b8; font-size: 13px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px;">
        <div style="font-size: 26px;">🎧</div>
        <div style="color: #38bdf8; font-weight: 600;">${escapeHtml(message)}</div>
        <div style="font-size: 11.5px; color: #64748b;">Đang tải âm thanh bài nghe của câu này, phân tích hình ảnh và phụ đề...</div>
      </div>
    `;

    setupDraggable(card);
    setupResizable(card);

    const closeBtn = card.querySelector("#ai-btn-card-close");
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        stopMasterAuto();
        stopAutoNextLoop();
        card.remove();
      };
    }
  }

  function showResultsCard(solutions, questionsData = [], conversationTranscript = "") {
    if (isToolbarHidden) return; // Chế độ tàng hình chống cảnh báo -> Không hiện bảng kết quả

    // Nếu đang ở trang chủ, không hiển thị thẻ kết quả
    if (window.location.hash.includes("home") || window.location.href.includes("#/home")) {
      const existing = document.getElementById("ai-solver-card");
      if (existing) existing.remove();
      return;
    }

    let card = document.getElementById("ai-solver-card");
    if (!card) {
      card = document.createElement("div");
      card.id = "ai-solver-card";
      document.body.appendChild(card);
    }

    const pageTitle = getCurrentQuestionTitle(solutions, questionsData);

    // 1. Đoạn hội thoại nghe được (Transcript) hiển thị ở TRÊN ĐẦU
    const audioTranscript = (
      conversationTranscript ||
      solutions.find(s => s.conversation_transcript)?.conversation_transcript ||
      solutions.map(s => s.transcript).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join("\n\n") ||
      ""
    ).trim();

    const transcriptBoxHtml = audioTranscript ? `
      <div class="ai-transcript-box" style="margin: 0 0 12px 0;">
        <div class="ai-transcript-title">
          <span class="ai-transcript-icon">🎧</span>
          <span>Đoạn hội thoại nghe được (Transcript):</span>
        </div>
        <div class="ai-transcript-text" style="max-height: 150px; overflow-y: auto;">
          ${escapeHtml(audioTranscript).replace(/\n/g, "<br>")}
        </div>
      </div>
    ` : "";

    // 2. Chi tiết đáp án từng câu ở PHÍA DƯỚI
    const itemsHtml = solutions.map((sol, i) => {
      const qNumText = getQuestionItemTitle(i, sol, solutions.length, questionsData);
      const conf = Math.round((sol.confidence || 0.98) * 100);

      return `
        <div class="ai-answer-item">
          <div class="ai-ans-num">
            <span>${escapeHtml(qNumText)}</span>
            <span style="font-size: 11px; opacity: 0.85;">Độ tin cậy: ${conf}%</span>
          </div>
          <div class="ai-ans-val">👉 <strong>Đáp án chọn:</strong> <span class="ai-ans-val-text">${escapeHtml(sol.selected_value || "N/A")}</span></div>
          ${sol.explanation ? `<div class="ai-ans-exp">💡 <strong>Giải thích:</strong> ${escapeHtml(sol.explanation)}</div>` : ""}
        </div>
      `;
    }).join("");

    const isListening = isCurrentInListeningSection();
    const listenFooterHtml = isListening ? `
      <div style="font-size: 11px; color: #38bdf8; text-align: center; margin-top: 8px; padding: 6px; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 6px; display: flex; align-items: center; justify-content: center; gap: 6px;">
        <span>⏳</span> <span>Đã chọn xong đáp án. Hệ thống sẽ <strong>tự động giải câu tiếp theo</strong> ngay khi hết audio!</span>
      </div>
    ` : "";

    card.innerHTML = `
      <div class="ai-card-header">
        <div class="ai-card-title"><span>✨</span> ${escapeHtml(pageTitle)} (${solutions.length} câu)</div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button class="ai-card-btn-history notranslate" id="ai-card-history-btn" title="Xem & tải toàn bộ lịch sử đáp án bài thi này (Phím tắt: Alt + L)">📜 Lịch Sử Bài</button>
          <button class="ai-card-close" id="ai-card-close-btn">&times;</button>
        </div>
      </div>
      ${transcriptBoxHtml}
      <div class="ai-answers-list">
        ${itemsHtml}
      </div>
      ${listenFooterHtml}
    `;

    setupDraggable(card);
    setupResizable(card);

    document.getElementById("ai-card-close-btn").addEventListener("click", () => {
      card.remove();
    });

    document.getElementById("ai-card-history-btn")?.addEventListener("click", () => {
      showHistoryModal();
    });
  }


  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Quét DOM, iframe và Performance Timeline để tìm file âm thanh của bài nghe (TOEIC Listening)
   */
  function findAudioUrl() {
    // 1. Thẻ audio, video, source chuẩn HTML5 trong tất cả frames/iframes (ƯU TIÊN SỐ 1)
    const mediaEls = queryAllInDocs("audio, audio source, video, video source");
    for (const el of mediaEls) {
      const src = el.currentSrc || el.src || el.getAttribute("src") || el.getAttribute("data-src");
      if (src && !src.startsWith("data:") && src !== "about:blank") {
        try {
          return new URL(src, el.ownerDocument?.location?.href || window.location.href).href;
        } catch {
          return src;
        }
      }
    }

    // 2. Bắt từ window.__capturedAudioUrl nếu vừa mới phát
    if (window.__capturedAudioUrl) {
      try {
        return new URL(window.__capturedAudioUrl, window.location.href).href;
      } catch {
        return window.__capturedAudioUrl;
      }
    }

    // 3. Kiểm tra Performance Timeline trên toàn bộ tài liệu & iframe
    try {
      const allDocs = getAllExerciseDocuments();
      const audioResources = [];
      for (const d of allDocs) {
        const win = d.defaultView || window;
        if (win.performance) {
          const res = win.performance.getEntriesByType("resource");
          for (let i = res.length - 1; i >= 0; i--) {
            const name = res[i].name;
            if (/\.(png|jpg|jpeg|gif|svg|webp|ico|js|css|html)($|\?)/i.test(name)) continue;
            const isAudioExt = /\.(mp3|wav|ogg|m4a|aac|opus|weba)($|\?)/i.test(name);
            const isAudioInitiator = res[i].initiatorType === "audio";
            if (isAudioExt || isAudioInitiator) {
              if (!audioResources.includes(name)) audioResources.push(name);
            }
          }
        }
      }

      if (audioResources.length > 0) {
        // Lấy số câu hỏi hiện tại trên màn hình (vd: Câu 3 hoặc Question 4)
        const qNumMatch = document.body?.innerText?.match(/(?:Question|Câu)\s*(\d+)/i);
        if (qNumMatch) {
          const qNum = qNumMatch[1];
          const padded = qNum.padStart(2, "0");
          // Ưu tiên file audio có chứa số câu tương ứng (vd: _03, q3, q03, 03.mp3)
          const matched = audioResources.find(url => {
            const u = url.toLowerCase();
            return u.includes(`_${padded}`) || u.includes(`q${padded}`) || u.includes(`_${qNum}`) || u.includes(`q${qNum}`) || u.includes(`/${qNum}.`) || u.includes(`/${padded}.`);
          });
          if (matched) {
            console.log(`[Content] 🎯 Đã tìm thấy audio chính xác cho câu ${qNum}:`, matched);
            return matched;
          }
        }
        // Nếu không có tên theo số, lấy file audio tải gần nhất
        console.log("[Content] 🎵 Bắt được audio mới nhất qua Performance Timeline:", audioResources[0]);
        return audioResources[0];
      }
    } catch (e) {}

    // 4. Thẻ có thuộc tính sound/audio/mp3/track trong tất cả frames
    const customMediaEls = queryAllInDocs("[data-sound], [data-audio], [data-src*='.mp3'], [data-url*='.mp3'], [src*='.mp3'], [href*='.mp3']");
    for (const el of customMediaEls) {
      const src = el.getAttribute("data-sound") || el.getAttribute("data-audio") || el.getAttribute("data-src") || el.getAttribute("data-url") || el.src || el.href;
      if (src) {
        try {
          return new URL(src, el.ownerDocument?.location?.href || window.location.href).href;
        } catch {
          return src;
        }
      }
    }

    // 5. Quét trong text/html của tất cả frames có chứa link đuôi .mp3, .wav, .m4a
    const allDocs = getAllExerciseDocuments();
    for (const d of allDocs) {
      const html = d.documentElement?.innerHTML || "";
      const mp3Match = html.match(/(?:src|href|url|sound|audio)=["']([^"']+\.(?:mp3|wav|m4a|ogg|aac)(?:\?[^"']*)?)["']/i);
      if (mp3Match && mp3Match[1]) {
        try {
          return new URL(mp3Match[1], d.location?.href || window.location.href).href;
        } catch {
          return mp3Match[1];
        }
      }
    }

    return null;
  }

  /**
   * Tải file âm thanh và chuyển sang chuỗi Base64
   */
  async function fetchAudioAsBase64(audioUrl) {
    if (!audioUrl) return null;
    try {
      console.log("[Content] 📥 Đang tải file âm thanh trực tiếp:", audioUrl);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(audioUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const blob = await res.blob();
      const mime = blob.type || (audioUrl.toLowerCase().includes(".wav") ? "audio/wav" : "audio/mp3");
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve({
            base64: reader.result,
            mime: mime
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.warn("[Content] Không thể tải audio qua fetch:", err.message);
      return null;
    }
  }

  /**
   * Kích hoạt nút Play của trình phát audio trên trang để nạp luồng phát âm thanh vào mạng
   */
  function tryTriggerAudioPlayback() {
    console.log("[Content] 🎧 Bắt đầu kiểm tra và tự động kích hoạt Play âm thanh...");

    // 1. Thử gọi play() trên tất cả các thẻ <audio> và <video> trong toàn bộ tài liệu và iframe
    const allAudios = queryAllInDocs("audio, video");
    for (const a of allAudios) {
      try {
        if (a.paused) {
          console.log("[Content] 🔊 Tìm thấy thẻ audio/video đang pause, thử gọi .play():", a);
          const playPromise = a.play();
          if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch((err) => {
              console.log("[Content] Autoplay policy chặn lệnh trực tiếp, tiếp tục click nút Play UI:", err.message);
            });
          }
        }
      } catch (e) {}
    }

    // 2. Tìm tất cả các nút hoặc phần tử Play trên giao diện (hỗ trợ cả iframe của ets.toeicolpc.com)
    // Bao gồm cả button, a, div, span, img, svg, input, i, label...
    const candidateElements = queryAllInDocs(
      "button, a, div, span, img, svg, input[type='button'], input[type='image'], i, label"
    ).filter(el => {
      if (isAiElement(el) || !isElementVisible(el)) return false;

      // Không bấm vào nút chuyển câu hay submit
      if (isDangerousSubmitButton(el)) return false;
      const text = (el.innerText || el.value || "").trim().toLowerCase();
      if (text.includes("submit") || text.includes("nộp bài") || text.includes("next") || text.includes("tiếp theo")) return false;

      const cl = (el.className || "").toString().toLowerCase();
      const id = (el.id || "").toLowerCase();
      const title = (el.getAttribute("title") || "").toLowerCase();
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      const role = (el.getAttribute("role") || "").toLowerCase();
      const src = (el.getAttribute("src") || "").toLowerCase();
      const href = (el.getAttribute("href") || "").toLowerCase();
      const onclickAttr = (el.getAttribute("onclick") || "").toLowerCase();

      // Nếu phần tử đang ở trạng thái pause/playing (nghĩa là đã đang phát) thì không bấm lại để tránh bị dừng
      if (cl.includes("playing") || cl.includes("pause") || text === "❚❚" || text === "||" || title.includes("pause")) {
        return false;
      }

      // Tiêu chí 1: Thuộc tính rõ ràng về Play / Sound / Audio / Speaker / Listen
      const hasPlayKeyword = (
        cl.includes("play") || id.includes("play") ||
        title.includes("play") || aria.includes("play") ||
        role.includes("play") || onclickAttr.includes("play") ||
        href.includes("play") || src.includes("play")
      );

      const hasSoundKeyword = (
        cl.includes("sound") || id.includes("sound") ||
        title.includes("sound") || aria.includes("sound") ||
        onclickAttr.includes("sound") || src.includes("sound") ||
        cl.includes("audio") || id.includes("audio") ||
        onclickAttr.includes("audio") || src.includes("audio") ||
        cl.includes("listen") || id.includes("listen") ||
        onclickAttr.includes("listen") || src.includes("listen") ||
        cl.includes("speaker") || id.includes("speaker")
      );

      // Tiêu chí 2: Ký tự tam giác Play
      const hasPlaySymbol = (
        text === "▶" || text === "►" || text === "▷" || text === "▸" ||
        text === "play" || text.startsWith("▶") || text.startsWith("►")
      );

      // Tiêu chí 3: Chứa thẻ SVG hoặc polygon (tam giác nút Play) bên trong
      const hasSvgPlay = Boolean(
        el.querySelector && el.querySelector("polygon, path[d*='M'], svg")
      );

      return hasPlayKeyword || hasSoundKeyword || hasPlaySymbol || (hasSvgPlay && (cl.includes("btn") || id.includes("btn") || role === "button"));
    });

    if (candidateElements.length > 0) {
      console.log(`[Content] 🎵 Tìm thấy ${candidateElements.length} ứng viên nút Play audio trên trang:`, candidateElements);
      // Ưu tiên nút nào có kích thước hợp lý (icon play khoảng 20px - 120px)
      const bestBtn = candidateElements.find(el => {
        const r = el.getBoundingClientRect();
        return r.width >= 20 && r.width <= 120 && r.height >= 20 && r.height <= 120;
      }) || candidateElements[0];

      console.log("[Content] 🎯 Kích hoạt nút Play của trình phát audio trên trang:", bestBtn);
      triggerSmartClick(bestBtn);
      return true;
    }

    // 3. Heuristic hình học cho TOEIC Part 1: Nút Play hình tròn nằm ngay phía trên bức tranh
    const testImages = queryAllInDocs("img").filter(img => {
      if (isAiElement(img) || !isElementVisible(img)) return false;
      const r = img.getBoundingClientRect();
      const s = (img.src || "").toLowerCase();
      return r.width > 120 && r.height > 80 && !s.includes("logo") && !s.includes("icon");
    });

    if (testImages.length > 0) {
      const mainImg = testImages[0];
      const imgRect = mainImg.getBoundingClientRect();
      const imgCenterX = imgRect.left + imgRect.width / 2;

      // Tìm phần tử nằm phía trên bức tranh (cách đỉnh ảnh không quá 120px) và căn gần giữa
      const potentialPlayIcons = queryAllInDocs("div, a, button, span, img, svg").filter(el => {
        if (isAiElement(el) || !isElementVisible(el)) return false;
        const r = el.getBoundingClientRect();
        const elCenterX = r.left + r.width / 2;
        const isAboveImg = (r.bottom <= imgRect.top + 15) && (r.top >= imgRect.top - 120);
        const isNearCenter = Math.abs(elCenterX - imgCenterX) < 120;
        const isSmallIcon = r.width >= 20 && r.width <= 90 && r.height >= 20 && r.height <= 90;
        return isAboveImg && isNearCenter && isSmallIcon;
      });

      if (potentialPlayIcons.length > 0) {
        console.log("[Content] 🎯 Tìm thấy nút Play hình học nằm phía trên bức tranh Part 1:", potentialPlayIcons[0]);
        triggerSmartClick(potentialPlayIcons[0]);
        return true;
      }
    }

    console.log("[Content] ℹ️ Không phát hiện thấy nút Play âm thanh riêng biệt nào.");
    return false;
  }

  /**
   * =========================================================================
   * CHỨC NĂNG DÒ LẠI BÀI THI & KIỂM TRA HOÀN THÀNH (REVIEW COMPLETION)
   * =========================================================================
   */
  async function runReviewAndCheckCompletion(autoFixMissing = true) {
    console.log("[Review] 🔍 Bắt đầu dò lại bài thi...");
    showReviewModal({ loading: true, message: "Đang rà soát và dò lại các câu hỏi trong bài thi..." });

    // 1. Quét các câu hỏi trắc nghiệm trên màn hình hiện tại
    const radioGroups = groupRadioButtons();
    const unansweredOnPage = [];

    radioGroups.forEach((g, idx) => {
      const isChecked = g.some(r => isRadioSelected(r));
      if (!isChecked) {
        unansweredOnPage.push({ index: idx, group: g });
      }
    });

    // 2. Nếu màn hình hiện tại có câu chưa làm:
    if (unansweredOnPage.length > 0) {
      console.log(`[Review] ⚠️ Phát hiện ${unansweredOnPage.length} câu chưa chọn đáp án trên trang hiện tại! Tự động giải ngay...`);
      showReviewModal({
        loading: true,
        message: `Phát hiện ${unansweredOnPage.length} câu chưa làm trên màn hình này. Đang tự động giải bù...`
      });

      try {
        await triggerScanAndSolve();
        await sleep(600);
      } catch (e) {
        console.warn("[Review] Lỗi khi giải bù câu trên trang:", e);
      }
    }

    // 3. Tìm nút "Item Review" / "Review" trên hệ thống bài thi để mở bảng danh sách câu hỏi tổng quan
    // CHÚ Ý: Trong phần thi Listening, hệ thống ETS không cho phép tua/nhảy bài, tuyệt đối không click Review làm tải lại bài!
    const inListening = isCurrentInListeningSection();
    let reviewBtn = null;
    if (!inListening) {
      reviewBtn = queryAllInDocs("button, a, input, div[role='button'], span").find(el => {
        if (isAiElement(el) || !isElementVisible(el)) return false;
        if (isDangerousSubmitButton(el)) return false;
        const t = (el.innerText || el.value || "").trim().toLowerCase();
        const id = (el.id || "").toLowerCase();
        const cl = (el.className || "").toString().toLowerCase();
        return (
          t === "item review" || t.includes("item review") ||
          t === "review test" || t === "review answers" ||
          t === "xem lại" || t === "danh sách câu hỏi" || t === "question list" ||
          id.includes("itemreview") || cl.includes("itemreview")
        );
      });
    }

    if (reviewBtn) {
      console.log("[Review] 📋 Đang mở màn hình Item Review của bài thi:", reviewBtn);
      triggerSmartClick(reviewBtn);
      await sleep(1800);
    }

    // 4. Quét bảng Review / Question Grid (các ô câu từ 1 -> 100)
    const reviewItems = scanReviewScreenItems();

    if (reviewItems.total > 0) {
      console.log(`[Review] 📊 Tổng câu: ${reviewItems.total}, Đã làm: ${reviewItems.answered.length}, Chưa làm: ${reviewItems.unanswered.length}`);
      showReviewModal({
        loading: false,
        total: reviewItems.total,
        answered: reviewItems.answered,
        unanswered: reviewItems.unanswered,
        items: reviewItems.items
      });

      // Tự động giải bù nếu có câu chưa làm và có cờ autoFixMissing
      if (autoFixMissing && reviewItems.unanswered.length > 0) {
        console.log(`[Review] 🚀 Tự động giải bù ${reviewItems.unanswered.length} câu còn thiếu...`);
        await autoFillAllMissingQuestions(reviewItems.items);
      } else if (reviewItems.unanswered.length === 0) {
        console.log("[Review] 🎉 Tất cả các câu hỏi đã được hoàn thành 100%!");
        if (isMasterAutoRunning) {
          console.log("[MasterAuto] 🚀 Đang ở chế độ Siêu Auto: Chuẩn bị tự động nộp bài (Submit Test)...");
          await sleep(2500);
          await submitCompletedTest();
        }
      }
    } else {
      // Tổng hợp kết quả các câu trên màn hình hiện tại
      const recheckedGroups = groupRadioButtons();
      const totalPage = recheckedGroups.length;
      let answeredPage = recheckedGroups.filter(g => g.some(r => isRadioSelected(r))).length;
      let unPage = totalPage - answeredPage;

      if (unPage > 0 && autoFixMissing) {
        console.log(`[Review] ⚠️ Còn ${unPage} câu chưa hoàn thành trên màn hình này! Tự động chọn bổ sung ngay...`);
        await ensureAnswerChecked();
        await sleep(300);
        const afterCheckGroups = groupRadioButtons();
        answeredPage = afterCheckGroups.filter(g => g.some(r => isRadioSelected(r))).length;
        unPage = totalPage - answeredPage;
      }

      const inListening = isCurrentInListeningSection();
      const sectionNotice = inListening ? " [Phần thi Listening - Không cho phép tua lại]" : "";

      showReviewModal({
        loading: false,
        total: totalPage,
        answeredCount: answeredPage,
        unansweredCount: unPage,
        isListening: inListening,
        message: unPage === 0
          ? `🎉 Tất cả các câu trên màn hình hiện tại đã được hoàn thành 100%!${sectionNotice}`
          : `⚠️ Còn ${unPage} câu chưa hoàn thành trên màn hình này!${sectionNotice}`
      });

      if (unPage === 0 && isMasterAutoRunning) {
        console.log("[MasterAuto] 🚀 Màn hình hiện tại đã chọn đủ 100%: Chuẩn bị nộp bài nếu là cuối bài...");
        const allDocsText = getAllExerciseDocuments().map(d => d.body?.innerText || "").join(" ");
        if (allDocsText.includes("100 of 100") || allDocsText.includes("Question 100") || allDocsText.includes("Câu 100")) {
          await sleep(2000);
          await submitCompletedTest();
        }
      }
    }
  }

  function scanReviewScreenItems() {
    const unanswered = [];
    const answered = [];
    const items = [];

    // A. Quét trong các bảng review (table tr) - Chỉ áp dụng khi có tối thiểu 10 hàng
    const rows = queryAllInDocs("table tr, .review-row, .question-row").filter(r => !isAiElement(r) && isElementVisible(r));
    const candidateRows = [];
    for (const r of rows) {
      const text = (r.innerText || "").trim();
      const numMatch = text.match(/(?:Question|Câu)?\s*(\d{1,3})\b/i);
      if (numMatch) {
        const qNum = parseInt(numMatch[1], 10);
        if (qNum >= 1 && qNum <= 200) {
          const isUnans = /not\s*answered|unanswered|chưa\s*(?:làm|trả\s*lời)|incomplete|chưa\s*chọn/i.test(text);
          const isAns = /answered|completed|đã\s*(?:làm|trả\s*lời)/i.test(text);
          if (isUnans || isAns) {
            candidateRows.push({ qNum, isUnans, isAns, el: r });
          }
        }
      }
    }

    if (candidateRows.length >= 10) {
      for (const row of candidateRows) {
        if (row.isUnans) {
          unanswered.push(row.qNum);
          items.push({ num: row.qNum, status: "unanswered", el: row.el });
        } else {
          answered.push(row.qNum);
          items.push({ num: row.qNum, status: "answered", el: row.el });
        }
      }
      return { total: answered.length + unanswered.length, answered, unanswered, items };
    }

    // B. Quét các ô số câu (palette / grid 1..100) - CHỈ ÁP DỤNG KHI CÓ TỐI THIỂU 15 NÚT
    const paletteBtns = queryAllInDocs("button, a, .q-box, .q-item, .item-num").filter(el => {
      if (isAiElement(el) || !isElementVisible(el)) return false;
      const t = (el.innerText || "").trim();
      return /^\d{1,3}$/.test(t) && parseInt(t, 10) >= 1 && parseInt(t, 10) <= 200;
    });

    if (paletteBtns.length >= 15) {
      paletteBtns.forEach(btn => {
        const qNum = parseInt(btn.innerText.trim(), 10);
        const cl = (btn.className || "").toString().toLowerCase();
        const isAns = cl.includes("answered") || cl.includes("done") || cl.includes("complete") || cl.includes("active");
        if (isAns) {
          answered.push(qNum);
          items.push({ num: qNum, status: "answered", el: btn });
        } else {
          unanswered.push(qNum);
          items.push({ num: qNum, status: "unanswered", el: btn });
        }
      });
      return { total: answered.length + unanswered.length, answered, unanswered, items };
    }

    // Nếu không phải màn hình review tổng quan bài thi (đang ở màn hình câu hỏi thông thường)
    return { total: 0, answered: [], unanswered: [], items: [] };
  }

  // =========================================================================
  // HỆ THỐNG LƯU TRỮ & XEM LỊCH SỬ ĐÁP ÁN BÀI THI (TEST ANSWER HISTORY)
  // =========================================================================
  let _currentTestSessionId = null;

  function getOrCreateTestSessionId() {
    if (!_currentTestSessionId) {
      try {
        const saved = sessionStorage.getItem("_toeic_active_session_id");
        if (saved) {
          _currentTestSessionId = saved;
        } else {
          _currentTestSessionId = "test_" + Date.now();
          sessionStorage.setItem("_toeic_active_session_id", _currentTestSessionId);
        }
      } catch (e) {
        _currentTestSessionId = "test_" + Date.now();
      }
    }
    return _currentTestSessionId;
  }

  async function recordTestAnswers(solutions, questionsData = []) {
    if (!solutions || solutions.length === 0) return;
    const sessionId = getOrCreateTestSessionId();
    const pageTitle = getCurrentQuestionTitle() || document.title || "Bài Thi TOEIC";
    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('vi-VN');

    try {
      const data = await chrome.storage.local.get(["toeic_test_history"]);
      let history = Array.isArray(data.toeic_test_history) ? data.toeic_test_history : [];

      let session = history.find(s => s.id === sessionId);
      if (!session) {
        session = {
          id: sessionId,
          title: pageTitle.length > 70 ? pageTitle.substring(0, 70) + "..." : pageTitle,
          url: window.location.href,
          createdAt: `${dateStr} ${timeStr}`,
          lastUpdated: `${dateStr} ${timeStr}`,
          answers: []
        };
        history.unshift(session);
      } else {
        session.lastUpdated = `${dateStr} ${timeStr}`;
      }

      solutions.forEach((sol, idx) => {
        const qData = questionsData.find(q => q.id === sol.question_id) || questionsData[idx];
        const qNum = sol.question_id && !sol.question_id.startsWith("q_")
          ? (isNaN(sol.question_id) ? sol.question_id : `Câu ${sol.question_id}`)
          : (pageTitle || `Câu ${session.answers.length + 1}`);

        const promptText = qData?.prompt || sol.question_text || "";
        const existingIdx = session.answers.findIndex(a =>
          (a.id && sol.question_id && a.id === sol.question_id) ||
          (a.questionNum === qNum && promptText && a.prompt === promptText)
        );

        const answerRecord = {
          id: sol.question_id || `q_${Date.now()}_${idx}`,
          questionNum: qNum,
          prompt: promptText,
          selectedAnswer: sol.selected_value || "N/A",
          explanation: sol.explanation || "",
          confidence: Math.round((sol.confidence || 0.98) * 100),
          transcript: sol.transcript || null,
          time: timeStr
        };

        if (existingIdx >= 0) {
          session.answers[existingIdx] = answerRecord;
        } else {
          session.answers.push(answerRecord);
        }
      });

      // Giới hạn lưu 30 bài thi gần nhất
      if (history.length > 30) {
        history = history.slice(0, 30);
      }

      await chrome.storage.local.set({ toeic_test_history: history });
      console.log(`[History] 📝 Đã lưu lịch sử: ${session.answers.length} câu hỏi cho bài thi [${session.title}]`);

      // 1. TỰ ĐỘNG ĐẨY LÊN SERVER CLOUD (Render / Backend)
      chrome.runtime.sendMessage({
        action: "sync_history_to_server",
        payload: session
      }).catch(() => {});

      // 2. TỰ ĐỘNG LƯU VÀO THƯ MỤC TRÊN MÁY TÍNH (Downloads/TOEIC_History/)
      const safeName = (session.title || "Dap_An_TOEIC").replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1EA0-\u1EF9]/g, "_").substring(0, 30);
      const txtContent = generateSessionTxtContent(session);
      chrome.runtime.sendMessage({
        action: "save_history_local_file",
        filename: `TOEIC_History/${safeName}.txt`,
        content: txtContent
      }).catch(() => {});
    } catch (err) {
      console.warn("[History] Lỗi khi lưu lịch sử đáp án:", err);
    }
  }

  function generateSessionTxtContent(session) {
    if (!session || !session.answers) return "";
    let content = `========================================================================\r\n`;
    content += `BẢNG ĐÁP ÁN BÀI THI: ${session.title}\r\n`;
    content += `Thời gian làm bài: ${session.createdAt || session.lastUpdated}\r\n`;
    content += `Đường dẫn bài thi: ${session.url}\r\n`;
    content += `Tổng số câu đã giải: ${session.answers.length} câu\r\n`;
    content += `========================================================================\r\n\r\n`;

    session.answers.forEach((ans, i) => {
      content += `[${i + 1}] ${ans.questionNum || `Câu ${i + 1}`}\r\n`;
      if (ans.prompt) content += `Đề bài: ${ans.prompt}\r\n`;
      content += `👉 ĐÁP ÁN CHỌN: ${ans.selectedAnswer}\r\n`;
      if (ans.confidence) content += `Độ tin cậy AI: ${ans.confidence}%\r\n`;
      if (ans.transcript) content += `Phụ đề nghe được (Transcript): ${ans.transcript}\r\n`;
      if (ans.explanation) content += `💡 Giải thích: ${ans.explanation}\r\n`;
      content += `------------------------------------------------------------------------\r\n\r\n`;
    });

    content += `Được tự động lưu vào máy tính & đồng bộ lên Server bởi TOEIC AI Solver\r\n`;
    return content;
  }

  function exportSessionToTxt(session) {
    if (!session || !session.answers || session.answers.length === 0) {
      showAiToast("⚠️ Chưa có đáp án nào để xuất file!");
      return;
    }

    const content = generateSessionTxtContent(session);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (session.title || "Dap_An_TOEIC").replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1EA0-\u1EF9]/g, "_").substring(0, 30);
    a.href = url;
    a.download = `${safeName}_Dap_An.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showAiToast(`💾 Đã xuất file TXT: ${session.answers.length} câu hỏi!`);
  }

  function exportSessionToJson(session) {
    if (!session || !session.answers || session.answers.length === 0) {
      showAiToast("⚠️ Chưa có đáp án nào để xuất file!");
      return;
    }
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (session.title || "Dap_An_TOEIC").replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1EA0-\u1EF9]/g, "_").substring(0, 30);
    a.href = url;
    a.download = `${safeName}_Dap_An.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showAiToast(`💾 Đã xuất file JSON thành công!`);
  }

  async function copySessionAnswers(session) {
    if (!session || !session.answers || session.answers.length === 0) {
      showAiToast("⚠️ Chưa có đáp án nào để sao chép!");
      return;
    }
    let text = `📋 ĐÁP ÁN ${session.title} (${session.answers.length} CÂU):\n`;
    session.answers.forEach((ans, i) => {
      text += `${ans.questionNum || `Câu ${i + 1}`}: ${ans.selectedAnswer}`;
      if (ans.explanation) text += ` — ${ans.explanation}`;
      text += `\n`;
    });
    try {
      await navigator.clipboard.writeText(text);
      showAiToast(`📋 Đã sao chép ${session.answers.length} đáp án vào bộ nhớ tạm!`);
    } catch (e) {
      showAiToast("⚠️ Không thể sao chép tự động!");
    }
  }

  async function showHistoryModal(targetSessionId = null) {
    let modal = document.getElementById("ai-history-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "ai-history-modal";
      modal.className = "notranslate";
      document.body.appendChild(modal);
    }

    const data = await chrome.storage.local.get(["toeic_test_history"]);
    const history = Array.isArray(data.toeic_test_history) ? data.toeic_test_history : [];

    if (history.length === 0) {
      modal.innerHTML = `
        <div class="ai-card-header">
          <div class="ai-card-title"><span>📜</span> Lịch Sử Đáp Án Bài Thi</div>
          <button class="ai-card-close" onclick="document.getElementById('ai-history-modal').remove()">&times;</button>
        </div>
        <div style="padding: 30px 16px; text-align: center; color: #94a3b8;">
          <div style="font-size: 32px; margin-bottom: 12px;">📂</div>
          <div style="font-size: 13.5px; color: #f8fafc; font-weight: 600; margin-bottom: 6px;">Chưa có lịch sử làm bài nào</div>
          <div style="font-size: 11.5px; color: #94a3b8; line-height: 1.4;">
            Khi bạn quét và giải câu hỏi (hoặc chạy Tự Động Next / Siêu Auto), toàn bộ đáp án và lời giải sẽ tự động được lưu lại tại đây!
          </div>
        </div>
      `;
      return;
    }

    // Lấy bài thi cần hiển thị (mặc định bài thi hiện tại hoặc bài thi gần nhất)
    const currentSessionId = getOrCreateTestSessionId();
    let activeSession = history.find(s => s.id === (targetSessionId || currentSessionId)) || history[0];

    // Tạo danh sách chọn bài thi
    const sessionOptionsHtml = history.map(s => {
      const isSelected = s.id === activeSession.id ? "selected" : "";
      const displayTitle = s.title.length > 25 ? s.title.substring(0, 25) + "..." : s.title;
      return `<option value="${s.id}" ${isSelected}>${escapeHtml(displayTitle)} (${s.answers?.length || 0} câu - ${s.lastUpdated || ""})</option>`;
    }).join("");

    const answersListHtml = (activeSession.answers && activeSession.answers.length > 0)
      ? activeSession.answers.map((ans, idx) => `
        <div class="ai-history-item">
          <div class="ai-history-header">
            <span class="ai-history-qnum">#${idx + 1}. ${escapeHtml(ans.questionNum || `Câu ${idx + 1}`)}</span>
            <span class="ai-history-badge">👉 Đáp án: ${escapeHtml(ans.selectedAnswer || "N/A")}</span>
          </div>
          ${ans.prompt ? `<div class="ai-history-prompt">📖 ${escapeHtml(ans.prompt)}</div>` : ""}
          ${ans.transcript ? `<div class="ai-history-prompt" style="color:#38bdf8;">🎧 Transcript: ${escapeHtml(ans.transcript)}</div>` : ""}
          <div class="ai-history-exp">💡 <strong>Giải thích:</strong> ${escapeHtml(ans.explanation || "Không có lời giải thích")}</div>
          <div style="font-size: 10px; color: #64748b; margin-top: 4px; text-align: right;">Độ tin cậy: ${ans.confidence || 98}% • ${ans.time || ""}</div>
        </div>
      `).join("")
      : `<div style="text-align:center;padding:20px;color:#94a3b8;font-size:12px;">Chưa có câu hỏi nào được lưu trong bài thi này.</div>`;

    modal.innerHTML = `
      <div class="ai-card-header">
        <div class="ai-card-title">
          <span>📜</span> Lịch Sử Đáp Án Bài Thi 
          <span style="font-size:11px;background:rgba(56,189,248,0.2);color:#38bdf8;padding:1px 6px;border-radius:10px;font-weight:700;">${activeSession.answers?.length || 0} câu</span>
        </div>
        <button class="ai-card-close" id="ai-history-close-btn">&times;</button>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px;">
        <span style="font-size:11.5px;color:#94a3b8;white-space:nowrap;">Chọn bài thi:</span>
        <select id="ai-history-session-select" class="ai-history-select">
          ${sessionOptionsHtml}
        </select>
      </div>

      <div class="ai-history-toolbar">
        <button id="ai-btn-copy-history" class="ai-history-btn" title="Sao chép toàn bộ đáp án vào clipboard">
          <span>📋</span> Sao Chép
        </button>
        <button id="ai-btn-export-txt" class="ai-history-btn" title="Tải về file text">
          <span>💾</span> Tải TXT
        </button>
        <button id="ai-btn-export-json" class="ai-history-btn" title="Tải về file JSON">
          <span>📥</span> Tải JSON
        </button>
        <button id="ai-btn-del-history" class="ai-history-btn danger" title="Xóa lịch sử bài thi này">
          <span>🗑️</span> Xóa Bài Này
        </button>
      </div>

      <div class="ai-history-list" id="ai-history-list">
        ${answersListHtml}
      </div>
    `;

    document.getElementById("ai-history-close-btn")?.addEventListener("click", () => {
      modal.remove();
    });

    document.getElementById("ai-history-session-select")?.addEventListener("change", (e) => {
      showHistoryModal(e.target.value);
    });

    document.getElementById("ai-btn-copy-history")?.addEventListener("click", () => {
      copySessionAnswers(activeSession);
    });

    document.getElementById("ai-btn-export-txt")?.addEventListener("click", () => {
      exportSessionToTxt(activeSession);
    });

    document.getElementById("ai-btn-export-json")?.addEventListener("click", () => {
      exportSessionToJson(activeSession);
    });

    document.getElementById("ai-btn-del-history")?.addEventListener("click", async () => {
      if (confirm(`Bạn có chắc chắn muốn xóa lịch sử đáp án của bài thi "${activeSession.title}" không?`)) {
        const d = await chrome.storage.local.get(["toeic_test_history"]);
        let h = Array.isArray(d.toeic_test_history) ? d.toeic_test_history : [];
        h = h.filter(s => s.id !== activeSession.id);
        await chrome.storage.local.set({ toeic_test_history: h });
        showAiToast("🗑️ Đã xóa bài thi khỏi lịch sử!");
        showHistoryModal();
      }
    });

    setupDraggable(modal);
    setupResizable(modal);
  }

  function showReviewModal(data) {
    let modal = document.getElementById("ai-review-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "ai-review-modal";
      document.body.appendChild(modal);
    }

    if (data.loading) {
      modal.innerHTML = `
        <div class="ai-card-header">
          <div class="ai-card-title"><span>🔍</span> Dò Lại Toàn Bộ Bài Thi</div>
          <button class="ai-card-close" onclick="document.getElementById('ai-review-modal').remove()">&times;</button>
        </div>
        <div style="padding: 24px 16px; text-align: center; color: #94a3b8;">
          <div style="font-size: 28px; margin-bottom: 12px;">⏳</div>
          <div style="font-size: 14px; color: #38bdf8; font-weight: 600;">${escapeHtml(data.message)}</div>
        </div>
      `;
      setupDraggable(modal);
      setupResizable(modal);
      return;
    }

    const is100Percent = (data.unanswered ? data.unanswered.length === 0 : data.unansweredCount === 0);
    const answeredCount = data.answered?.length ?? data.answeredCount ?? 0;
    const unansweredList = data.unanswered || [];
    const unCount = unansweredList.length || data.unansweredCount || 0;

    const badgeColor = is100Percent ? "#22c55e" : "#f59e0b";
    const statusText = is100Percent
      ? "🎉 Xuất sắc! Tất cả các câu hỏi đã được hoàn thành 100%!"
      : `⚠️ Phát hiện còn ${unCount} câu chưa làm xong!`;

    const unansweredHtml = unansweredList.length > 0 ? `
      <div style="margin-top: 12px; padding: 12px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px;">
        <div style="color: #f87171; font-weight: 600; font-size: 12.5px; margin-bottom: 6px;">Các câu còn sót:</div>
        <div style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 120px; overflow-y: auto;">
          ${unansweredList.map(n => `<span style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold;">Câu ${n}</span>`).join("")}
        </div>
      </div>
    ` : "";

    modal.innerHTML = `
      <div class="ai-card-header">
        <div class="ai-card-title"><span>📋</span> Kết Quả Dò Lại Bài Thi</div>
        <button class="ai-card-close" onclick="document.getElementById('ai-review-modal').remove()">&times;</button>
      </div>
      <div style="padding: 16px; font-size: 13px;">
        <div style="font-size: 14px; font-weight: 700; color: ${badgeColor}; margin-bottom: 12px;">
          ${escapeHtml(statusText)}
        </div>
        <div style="display: flex; gap: 12px; margin-bottom: 12px;">
          <div style="flex: 1; background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.4); padding: 10px; border-radius: 8px; text-align: center;">
            <div style="font-size: 22px; font-weight: 800; color: #4ade80;">${answeredCount}</div>
            <div style="font-size: 11px; color: #86efac; margin-top: 2px;">Đã Hoàn Thành</div>
          </div>
          <div style="flex: 1; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); padding: 10px; border-radius: 8px; text-align: center;">
            <div style="font-size: 22px; font-weight: 800; color: #fbbf24;">${unCount}</div>
            <div style="font-size: 11px; color: #fde68a; margin-top: 2px;">Chưa Làm / Còn Thiếu</div>
          </div>
        </div>

        ${unansweredHtml}

        <div style="margin-top: 16px; display: flex; gap: 8px; justify-content: flex-end;">
          ${!is100Percent ? `
            <button id="ai-btn-autofill-missing" style="background: linear-gradient(135deg, #0284c7, #38bdf8); color: #0f172a; border: none; padding: 8px 14px; border-radius: 20px; font-weight: 700; cursor: pointer; font-size: 12px;">
              ⚡ Tự Động Giải Bù
            </button>
          ` : `
            <button id="ai-btn-submit-test" style="background: linear-gradient(135deg, #16a34a, #22c55e); color: white; border: none; padding: 8px 16px; border-radius: 20px; font-weight: 700; cursor: pointer; font-size: 12px; box-shadow: 0 2px 8px rgba(34, 197, 94, 0.4);">
              🚀 Nộp Bài Thi (Submit Test)
            </button>
          `}
          <button id="ai-btn-re-review" style="background: #334155; color: #f8fafc; border: none; padding: 8px 14px; border-radius: 20px; font-weight: 600; cursor: pointer; font-size: 12px;">
            🔄 Dò Lại
          </button>
        </div>
      </div>
    `;

    setupDraggable(modal);
    setupResizable(modal);

    document.getElementById("ai-btn-re-review")?.addEventListener("click", () => {
      runReviewAndCheckCompletion();
    });

    document.getElementById("ai-btn-autofill-missing")?.addEventListener("click", async () => {
      await autoFillAllMissingQuestions(data.items);
    });

    document.getElementById("ai-btn-submit-test")?.addEventListener("click", async () => {
      await submitCompletedTest();
    });
  }

  async function autoFillAllMissingQuestions(reviewItems) {
    if (!reviewItems || reviewItems.length === 0) {
      await triggerScanAndSolve();
      await ensureAnswerChecked();
      await runReviewAndCheckCompletion(false);
      return;
    }

    const missing = reviewItems.filter(it => it.status === "unanswered");
    if (missing.length === 0) {
      await runReviewAndCheckCompletion(false);
      return;
    }

    for (let idx = 0; idx < missing.length; idx++) {
      const m = missing[idx];
      console.log(`[AutoFillMissing] 🚀 (${idx + 1}/${missing.length}) Nhảy vào câu ${m.num} để giải bù...`);
      showReviewModal({
        loading: true,
        message: `Đang nhảy vào Câu ${m.num} (${idx + 1}/${missing.length}) để tự động giải bù...`
      });

      triggerSmartClick(m.el);
      await sleep(1500);

      try {
        await triggerScanAndSolve();
        await sleep(500);
        if (!isCurrentQuestionAnswered()) {
          ensureAnswerChecked();
          await sleep(300);
        }
      } catch (e) {
        console.warn(`[AutoFillMissing] Lỗi khi giải bù câu ${m.num}:`, e);
      }

      // Nhấn lại nút Item Review để quay lại danh sách
      const reviewBtn = queryAllInDocs("button, a, input, div[role='button'], span").find(el => {
        if (isAiElement(el) || !isElementVisible(el)) return false;
        if (isDangerousSubmitButton(el)) return false;
        const t = (el.innerText || el.value || "").trim().toLowerCase();
        const id = (el.id || "").toLowerCase();
        const cl = (el.className || "").toString().toLowerCase();
        return (
          t === "item review" || t.includes("item review") ||
          t === "review" || t === "review test" || t === "review answers" ||
          id.includes("btnreview") || id.includes("itemreview") ||
          cl.includes("btnreview") || cl.includes("itemreview")
        );
      });

      if (reviewBtn) {
        triggerSmartClick(reviewBtn);
        await sleep(1500);
      }
    }

    // Sau khi giải bù hết tất cả câu còn thiếu, dò lại lần cuối để báo cáo 100%
    await runReviewAndCheckCompletion(false);
  }

  /**
   * Tự động nộp bài kiểm tra khi tất cả các câu đã được kiểm tra và hoàn thành 100%
   */
  async function submitCompletedTest() {
    console.log("[TestSubmit] 🚀 Đang tự động nộp bài thi (Submit Test)...");
    showReviewModal({
      loading: true,
      message: "🎉 Đã hoàn thành 100% câu hỏi! Đang tự động nộp bài kiểm tra (Submit Test)..."
    });

    // 1. Tìm nút Submit Test (bỏ qua isDangerousSubmitButton vì đây là hành động nộp bài chính thức)
    const submitBtn = queryAllInDocs("button, input[type='button'], input[type='submit'], a, div[role='button']").find(el => {
      if (isAiElement(el) || !isElementVisible(el)) return false;
      const t = (el.innerText || el.value || el.title || "").trim().toLowerCase();
      const id = (el.id || "").toLowerCase();
      const cl = (el.className || "").toString().toLowerCase();
      return (
        t === "submit test" || t.includes("submit test") ||
        t === "submit" || t === "nộp bài" || t === "finish test" || t === "end test" ||
        id.includes("submittest") || cl.includes("submittest") ||
        id.includes("btnsubmit") || cl.includes("btnsubmit")
      );
    });

    if (submitBtn) {
      console.log("[TestSubmit] 🎯 Đã tìm thấy nút Submit Test:", submitBtn);
      triggerSmartClick(submitBtn);
      await sleep(1500);

      // 2. Tự động xác nhận dialog / popup "Are you sure you want to submit?" nếu có
      dismissModals();
      await sleep(2000);

      // 3. Sau khi nộp bài, nếu xuất hiện nút Close trên popup tổng kết điểm thì đóng cửa sổ
      closeCompletedTestWindow();
      return true;
    } else {
      console.warn("[TestSubmit] Không tìm thấy nút Submit Test trên trang.");
      return false;
    }
  }

  function closeCompletedTestWindow(keepAutoRunning = false) {
    console.log("[TestSubmit] 🏁 Bài kiểm tra đã hoàn thành!");
    if (!keepAutoRunning) {
      stopAutoNextLoop();
      stopMasterAuto();
    }

    // Nếu trên trang web có popup/dialog điểm số chứa nút Close, bấm nút đó để đóng popup trong trang
    const closeBtn = queryAllInDocs("button, input[type='button'], a, div[role='button']").find(el => {
      if (isAiElement(el) || !isElementVisible(el)) return false;
      const t = (el.innerText || el.value || "").trim().toLowerCase();
      const id = (el.id || "").toLowerCase();
      return (t === "close" || t === "đóng" || id.includes("close")) && !id.includes("ai-");
    });

    if (closeBtn) {
      console.log("[TestSubmit] 🏁 Bấm nút Close đóng popup kết quả trong trang:", closeBtn);
      triggerSmartClick(closeBtn);
    }
  }
})();

