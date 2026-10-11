// AI English Auto Solver - Popup Settings Script
const DEFAULT_BACKEND_URL = "https://toeic-ai-solver.onrender.com";

document.addEventListener("DOMContentLoaded", () => {
  const backendInput = document.getElementById("backendUrl");
  const badge = document.getElementById("backendBadge");
  const btnCheckHealth = document.getElementById("btnCheckHealth");

  const apiKeyInput = document.getElementById("geminiApiKey");
  const btnSaveApiKey = document.getElementById("btnSaveApiKey");

  const chkRun247 = document.getElementById("chkRun247");
  const chkAutoNext = document.getElementById("chkAutoNext");

  const btnToggleToolbar = document.getElementById("btnToggleToolbar");
  const btnModeBubble = document.getElementById("btnModeBubble");
  const btnModeToolbar = document.getElementById("btnModeToolbar");

  // 1. Tải toàn bộ cấu hình đã lưu trong chrome.storage
  chrome.storage.local.get(
    ["backendUrl", "geminiApiKey", "run247Mode", "autoNextMode", "ai_toolbar_hidden", "ai_toolbar_minimized"],
    (res) => {
      // Backend URL
      let url = res.backendUrl || DEFAULT_BACKEND_URL;
      backendInput.value = url;
      checkBackendHealth(url);

      // Gemini API Key
      if (apiKeyInput && res.geminiApiKey) {
        apiKeyInput.value = res.geminiApiKey;
      }

      // 24/7 Mode (Mặc định bật true)
      if (chkRun247) {
        chkRun247.checked = res.run247Mode !== false;
      }

      // Auto Next Mode
      if (chkAutoNext) {
        chkAutoNext.checked = Boolean(res.autoNextMode);
      }

      // Ẩn / Hiện bong bóng trên web
      updateToolbarVisibilityBtn(Boolean(res.ai_toolbar_hidden));

      // Dạng hiển thị: Bong bóng tròn hay Thanh công cụ
      updateBubbleModeDisplay(Boolean(res.ai_toolbar_minimized));
    }
  );

  // 2. Kiểm tra kết nối tới Backend Service
  async function checkBackendHealth(url) {
    badge.className = "badge-status";
    badge.innerText = "⏳ Đang kiểm tra...";
    try {
      const resp = await fetch(`${url}/api/health`, { method: "GET" });
      if (resp.ok) {
        badge.className = "badge-status";
        badge.innerText = "🟢 Online (Sẵn sàng)";
        badge.title = "Backend AI đang hoạt động bình thường. Bấm để kiểm tra lại.";
      } else {
        throw new Error();
      }
    } catch (e) {
      badge.className = "badge-status disconnected";
      badge.innerText = "🔴 Offline (Chưa bật)";
      badge.title = "Không kết nối được Backend. Hãy chạy start_backend.bat";
    }
  }

  if (btnCheckHealth) {
    btnCheckHealth.addEventListener("click", () => {
      const val = backendInput.value.trim().replace(/\/$/, "");
      chrome.storage.local.set({ backendUrl: val });
      checkBackendHealth(val);
    });
  }

  if (badge) {
    badge.addEventListener("click", () => {
      const val = backendInput.value.trim().replace(/\/$/, "");
      checkBackendHealth(val);
    });
  }

  backendInput.addEventListener("change", () => {
    const val = backendInput.value.trim().replace(/\/$/, "");
    chrome.storage.local.set({ backendUrl: val });
    checkBackendHealth(val);
  });

  // Lưu Gemini API Key
  if (btnSaveApiKey && apiKeyInput) {
    btnSaveApiKey.addEventListener("click", () => {
      const keyVal = apiKeyInput.value.trim();
      chrome.storage.local.set({ geminiApiKey: keyVal }, () => {
        const origText = btnSaveApiKey.innerText;
        btnSaveApiKey.innerText = "✓ Đã lưu";
        btnSaveApiKey.style.borderColor = "#22c55e";
        btnSaveApiKey.style.color = "#22c55e";
        setTimeout(() => {
          btnSaveApiKey.innerText = origText;
          btnSaveApiKey.style.borderColor = "#38bdf8";
          btnSaveApiKey.style.color = "#38bdf8";
        }, 1500);
      });
    });

    apiKeyInput.addEventListener("change", () => {
      const keyVal = apiKeyInput.value.trim();
      chrome.storage.local.set({ geminiApiKey: keyVal });
    });
  }

  // 3. Cài đặt chế độ 24/24
  if (chkRun247) {
    chkRun247.addEventListener("change", () => {
      chrome.storage.local.set({ run247Mode: chkRun247.checked });
    });
  }

  // 4. Cài đặt tự động Next câu
  if (chkAutoNext) {
    chkAutoNext.addEventListener("change", async () => {
      const enabled = chkAutoNext.checked;
      await chrome.storage.local.set({ autoNextMode: enabled });

      // Đồng bộ tới tab hiện tại
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          action: enabled ? "start_auto_next" : "stop_auto_next"
        }).catch(() => {});
      }
    });
  }

  // 5. Cài đặt Ẩn/Hiện Bong bóng màn hình
  function updateToolbarVisibilityBtn(isHidden) {
    if (!btnToggleToolbar) return;
    if (isHidden) {
      btnToggleToolbar.style.borderColor = "#ef4444";
      btnToggleToolbar.style.color = "#f87171";
      btnToggleToolbar.style.background = "rgba(239, 68, 68, 0.15)";
      btnToggleToolbar.innerText = "🛡️ Đang Ẩn";
      btnToggleToolbar.title = "Đang ở chế độ tàng hình. Bấm để hiển thị bong bóng trên web.";
    } else {
      btnToggleToolbar.style.borderColor = "#38bdf8";
      btnToggleToolbar.style.color = "#38bdf8";
      btnToggleToolbar.style.background = "rgba(56, 189, 248, 0.15)";
      btnToggleToolbar.innerText = "👁️ Đang Hiện";
      btnToggleToolbar.title = "Bong bóng đang hiện trên web. Bấm để ẩn tàng hình.";
    }
  }

  if (btnToggleToolbar) {
    btnToggleToolbar.addEventListener("click", async () => {
      const storage = await chrome.storage.local.get(["ai_toolbar_hidden"]);
      const nextHidden = !storage.ai_toolbar_hidden;
      await chrome.storage.local.set({ ai_toolbar_hidden: nextHidden });
      updateToolbarVisibilityBtn(nextHidden);

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          action: "set_toolbar_state",
          hidden: nextHidden
        }).catch(() => {});
      }
    });
  }

  // 6. Cài đặt dạng hiển thị (Bong bóng tròn 🤖 vs Thanh công cụ ⚡)
  function updateBubbleModeDisplay(isMinimized) {
    if (!btnModeBubble || !btnModeToolbar) return;
    if (isMinimized) {
      btnModeBubble.classList.add("active");
      btnModeToolbar.classList.remove("active");
    } else {
      btnModeToolbar.classList.add("active");
      btnModeBubble.classList.remove("active");
    }
  }

  if (btnModeBubble) {
    btnModeBubble.addEventListener("click", async () => {
      await chrome.storage.local.set({ ai_toolbar_minimized: true });
      updateBubbleModeDisplay(true);

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          action: "set_toolbar_state",
          minimized: true
        }).catch(() => {});
      }
    });
  }

  if (btnModeToolbar) {
    btnModeToolbar.addEventListener("click", async () => {
      await chrome.storage.local.set({ ai_toolbar_minimized: false });
      updateBubbleModeDisplay(false);

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          action: "set_toolbar_state",
          minimized: false
        }).catch(() => {});
      }
    });
  }

  // 7. Quản lý và hiển thị Lịch sử Đáp án Bài thi
  const historySummaryText = document.getElementById("historySummaryText");
  const popupHistoryList = document.getElementById("popupHistoryList");
  const btnExportAllTxt = document.getElementById("btnExportAllTxt");
  const btnClearAllHistory = document.getElementById("btnClearAllHistory");

  async function loadAndRenderHistory() {
    const data = await chrome.storage.local.get(["toeic_test_history"]);
    const history = Array.isArray(data.toeic_test_history) ? data.toeic_test_history : [];

    if (!historySummaryText || !popupHistoryList) return;

    if (history.length === 0) {
      historySummaryText.innerText = "0 bài thi đã lưu";
      popupHistoryList.innerHTML = `
        <div style="color: #64748b; font-size: 11px; text-align: center; padding: 8px;">
          Chưa có bài thi nào được lưu lại.
        </div>
      `;
      return;
    }

    historySummaryText.innerText = `${history.length} bài thi đã lưu`;
    popupHistoryList.innerHTML = history.map((session, idx) => {
      const qCount = session.answers?.length || 0;
      const title = session.title?.length > 28 ? session.title.substring(0, 28) + "..." : (session.title || "Bài Thi");
      return `
        <div style="background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 6px 8px; display: flex; align-items: center; justify-content: space-between; gap: 6px;">
          <div style="overflow: hidden; flex: 1;">
            <div style="font-size: 11px; font-weight: 600; color: #f8fafc; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;" title="${session.title || ''}">
              ${title}
            </div>
            <div style="font-size: 10px; color: #94a3b8; display: flex; gap: 6px; margin-top: 2px;">
              <span style="color: #38bdf8; font-weight: bold;">${qCount} câu</span>
              <span>•</span>
              <span>${session.lastUpdated || ""}</span>
            </div>
          </div>
          <div style="display: flex; gap: 4px; flex-shrink: 0;">
            <button class="btn-sm btn-export-session" data-idx="${idx}" style="padding: 3px 6px; font-size: 10px;" title="Tải về file TXT">
              📥 TXT
            </button>
            <button class="btn-sm btn-copy-session" data-idx="${idx}" style="padding: 3px 6px; font-size: 10px;" title="Sao chép đáp án">
              📋
            </button>
          </div>
        </div>
      `;
    }).join("");

    // Gắn sự kiện tải từng bài
    popupHistoryList.querySelectorAll(".btn-export-session").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        const s = history[idx];
        if (s) downloadSessionTxt(s);
      });
    });

    // Gắn sự kiện copy từng bài
    popupHistoryList.querySelectorAll(".btn-copy-session").forEach(btn => {
      btn.addEventListener("click", async () => {
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        const s = history[idx];
        if (s && s.answers) {
          let text = `📋 ĐÁP ÁN: ${s.title} (${s.answers.length} câu):\n`;
          s.answers.forEach((ans, i) => {
            text += `${ans.questionNum || `Câu ${i + 1}`}: ${ans.selectedAnswer}`;
            if (ans.explanation) text += ` — ${ans.explanation}`;
            text += `\n`;
          });
          await navigator.clipboard.writeText(text);
          btn.innerText = "✅";
          setTimeout(() => { btn.innerText = "📋"; }, 1500);
        }
      });
    });
  }

  function downloadSessionTxt(session) {
    if (!session || !session.answers || session.answers.length === 0) {
      alert("Bài thi này chưa có đáp án nào!");
      return;
    }
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

    content += `Xuất tự động bởi TOEIC AI Auto Solver\r\n`;

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
  }

  if (btnExportAllTxt) {
    btnExportAllTxt.addEventListener("click", async () => {
      const data = await chrome.storage.local.get(["toeic_test_history"]);
      const history = Array.isArray(data.toeic_test_history) ? data.toeic_test_history : [];
      if (history.length > 0) {
        downloadSessionTxt(history[0]);
      } else {
        alert("Chưa có lịch sử làm bài nào để xuất!");
      }
    });
  }

  if (btnClearAllHistory) {
    btnClearAllHistory.addEventListener("click", async () => {
      if (confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử đáp án các bài thi đã làm không?")) {
        await chrome.storage.local.set({ toeic_test_history: [] });
        loadAndRenderHistory();
      }
    });
  }

  // Khởi tạo hiển thị lịch sử khi mở popup
  loadAndRenderHistory();
});
