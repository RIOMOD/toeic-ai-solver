// AI English Auto Solver - Popup Settings Script
const DEFAULT_BACKEND_URL = "http://localhost:5000";

document.addEventListener("DOMContentLoaded", () => {
  const backendInput = document.getElementById("backendUrl");
  const badge = document.getElementById("backendBadge");
  const btnCheckHealth = document.getElementById("btnCheckHealth");

  const chkRun247 = document.getElementById("chkRun247");
  const chkAutoNext = document.getElementById("chkAutoNext");

  const btnToggleToolbar = document.getElementById("btnToggleToolbar");
  const btnModeBubble = document.getElementById("btnModeBubble");
  const btnModeToolbar = document.getElementById("btnModeToolbar");

  // 1. Tải toàn bộ cấu hình đã lưu trong chrome.storage
  chrome.storage.local.get(
    ["backendUrl", "run247Mode", "autoNextMode", "ai_toolbar_hidden", "ai_toolbar_minimized"],
    (res) => {
      // Backend URL
      backendInput.value = res.backendUrl || DEFAULT_BACKEND_URL;
      checkBackendHealth(backendInput.value);

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
});
