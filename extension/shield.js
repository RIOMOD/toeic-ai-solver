// AI English Auto Solver - Main World Shield (Anti-Warning & Anti-Blur Guard)
// Chạy trực tiếp trong ngữ cảnh trang web (Main World), không vi phạm Content Security Policy (CSP).
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
    if (e) {
      e.stopImmediatePropagation();
      e.stopPropagation();
    }
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

  try {
    Object.defineProperty(window, 'onvisibilitychange', {
      get: () => null,
      set: () => { console.log('[AI Shield] 🛡️ Đã chặn website gán window.onvisibilitychange!'); },
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

  // F. Lắng nghe CustomEvent từ Content Script để thực hiện Drop an toàn qua jQuery UI (CSP Compliant)
  window.addEventListener('ai_trigger_drop', function(e) {
    try {
      const detail = e.detail;
      if (!detail) return;
      const { srcUid, tgtUid, endX, endY } = detail;
      const $ = window.jQuery || window.$;
      const src = document.querySelector(`[data-ai-src="${srcUid}"]`);
      const tgt = document.querySelector(`[data-ai-tgt="${tgtUid}"]`);
      if (!src || !tgt) return;

      if ($) {
        const $src = $(src);
        const $tgt = $(tgt);
        let droppableTarget = $tgt;
        let inst = droppableTarget.data('ui-droppable') || droppableTarget.data('droppable');
        if (!inst) {
          const p = $tgt.closest('.ui-droppable, [class*="drop" i]');
          if (p.length) {
            droppableTarget = p;
            inst = p.data('ui-droppable') || p.data('droppable');
          }
        }

        const px = Math.round(endX);
        const py = Math.round(endY);
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
          if (typeof inst._drop === 'function') {
            inst._drop(dropEvt, fakeUi);
          } else if (inst.options && typeof inst.options.drop === 'function') {
            inst.options.drop.call(droppableTarget[0], dropEvt, fakeUi);
          }
        }
        droppableTarget.trigger(dropEvt, fakeUi);
        droppableTarget.trigger('change').trigger('input');
      }
    } catch (err) {
      console.warn('[AI Shield Drop Error]', err);
    }
  });

  // G. Bắt tức thì URL âm thanh bài nghe (Audio Capture) ở Main World
  function notifyCapturedAudio(url) {
    if (!url || typeof url !== "string") return;
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    if (/\.(png|jpg|jpeg|gif|svg|webp|ico|js|css|html|aspx)($|\?)/i.test(url)) return;
    if (/\.(mp3|wav|ogg|m4a|aac|opus|weba)($|\?)/i.test(url) || url.includes("/audio/") || url.includes("sound")) {
      window.__capturedAudioUrl = url;
      window.dispatchEvent(new CustomEvent("ai_audio_captured", { detail: { url } }));
      console.log("[AI Shield] 🎵 Bắt được trực tiếp URL âm thanh bài nghe:", url);
    }
  }

  try {
    const origAudio = window.Audio;
    if (origAudio) {
      window.Audio = function(src) {
        const inst = new origAudio(src);
        if (src) notifyCapturedAudio(src);
        const origPlay = inst.play;
        inst.play = function() {
          notifyCapturedAudio(inst.src || inst.currentSrc);
          return origPlay.apply(this, arguments);
        };
        return inst;
      };
      window.Audio.prototype = origAudio.prototype;
    }
  } catch (eAudio) {}

  try {
    const playDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'play');
    if (playDesc && playDesc.value) {
      const origPlay = playDesc.value;
      playDesc.value = function() {
        notifyCapturedAudio(this.src || this.currentSrc);
        return origPlay.apply(this, arguments);
      };
      Object.defineProperty(HTMLMediaElement.prototype, 'play', playDesc);
    }
  } catch (eMedia) {}

  try {
    const origXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      notifyCapturedAudio(url);
      return origXhrOpen.apply(this, arguments);
    };
  } catch (eXhr) {}

  console.log("[AI Shield] 🛡️ Lá chắn chống cảnh báo hệ thống tiếng Anh & bộ bắt audio đã sẵn sàng!");
})();
