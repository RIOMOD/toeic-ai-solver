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

  // H. Lắng nghe CustomEvent từ Content Script để thực hiện Click chân thực và đầy đủ quyền hạn trong MAIN WORLD
  // Hỗ trợ tuyệt đối cho ASP.NET WebForms (__doPostBack), inline onclick, href="javascript:...", jQuery trigger và các nút chuyển tiếp Section (Start Section)
  window.addEventListener('ai_trigger_click', function(e) {
    try {
      const detail = e.detail || {};
      let el = null;
      if (detail.uid) {
        el = document.querySelector(`[data-ai-click="${detail.uid}"]`);
      }
      if (!el && detail.selector) {
        try { el = document.querySelector(detail.selector); } catch(ex) {}
      }
      if (!el && detail.text) {
        const textToFind = detail.text.trim().toLowerCase();
        const allCandidates = document.querySelectorAll("button, a, input, div, span, [role='button']");
        for (const cand of allCandidates) {
          const t = (cand.innerText || cand.value || "").trim().toLowerCase();
          if (t === textToFind || t.includes(textToFind)) {
            el = cand;
            break;
          }
        }
      }

      if (!el) return;

      const target = el.closest('button, a, input, [role="button"]') || el;
      const rect = target.getBoundingClientRect();
      const cx = (rect.width > 0 && rect.left >= 0) ? (rect.left + rect.width / 2) : 150;
      const cy = (rect.height > 0 && rect.top >= 0) ? (rect.top + rect.height / 2) : 150;

      const evtInit = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        detail: 1,
        screenX: Math.round(window.screenX + cx),
        screenY: Math.round(window.screenY + cy),
        clientX: Math.round(cx),
        clientY: Math.round(cy),
        pageX: Math.round(window.scrollX + cx),
        pageY: Math.round(window.scrollY + cy),
        which: 1,
        button: 0,
        buttons: 1
      };

      // 1. Dispatch chuỗi sự kiện chuột/pointer chân thực với tọa độ chính xác
      [target, el].forEach(elem => {
        if (!elem) return;
        try { elem.dispatchEvent(new PointerEvent('pointerover', { ...evtInit, buttons: 0 })); } catch(e) {}
        try { elem.dispatchEvent(new MouseEvent('mouseover', { ...evtInit, buttons: 0 })); } catch(e) {}
        try { elem.dispatchEvent(new PointerEvent('pointerenter', { ...evtInit, buttons: 0 })); } catch(e) {}
        try { elem.dispatchEvent(new PointerEvent('pointerdown', evtInit)); } catch(e) {}
        try { elem.dispatchEvent(new MouseEvent('mousedown', evtInit)); } catch(e) {}
        try { if (typeof elem.focus === 'function') elem.focus(); } catch(e) {}
        try { elem.dispatchEvent(new PointerEvent('pointerup', { ...evtInit, buttons: 0 })); } catch(e) {}
        try { elem.dispatchEvent(new MouseEvent('mouseup', { ...evtInit, buttons: 0 })); } catch(e) {}
        try { elem.dispatchEvent(new MouseEvent('click', { ...evtInit, buttons: 0 })); } catch(e) {}
      });

      // 2. Kích hoạt trực tiếp native click()
      try {
        if (typeof target.click === 'function') target.click();
        else if (typeof el.click === 'function') el.click();
      } catch(e) {}

      // 3. Nếu là ASP.NET WebForms hoặc có inline onclick
      const onclickAttr = target.getAttribute('onclick') || el.getAttribute('onclick');
      if (onclickAttr) {
        try {
          new Function('event', onclickAttr).call(target, new MouseEvent('click', evtInit));
        } catch(e) {
          try { (0, eval)(onclickAttr); } catch(ex) {}
        }
      }
      if (typeof target.onclick === 'function') {
        try { target.onclick.call(target, new MouseEvent('click', evtInit)); } catch(e) {}
      }

      // 4. Kiểm tra href="javascript:..."
      const href = target.getAttribute('href') || el.getAttribute('href');
      if (href && /^javascript:/i.test(href)) {
        const jsCode = decodeURIComponent(href.replace(/^javascript:/i, ''));
        try {
          new Function(jsCode)();
        } catch(e) {
          try { (0, eval)(jsCode); } catch(ex) {}
        }
      }

      // 5. Kiểm tra ASP.NET __doPostBack trực tiếp
      if (typeof window.__doPostBack === 'function') {
        const nameOrId = target.getAttribute('name') || target.id || el.getAttribute('name') || el.id;
        if (nameOrId && (href?.includes('__doPostBack') || onclickAttr?.includes('__doPostBack') || /start|section|btn/i.test(nameOrId))) {
          try {
            console.log("[AI Shield] ⚡ Kích hoạt trực tiếp window.__doPostBack cho:", nameOrId);
            window.__doPostBack(nameOrId, '');
          } catch(e) {}
        }
      }

      // 6. Kích hoạt thông qua jQuery nếu trang có nạp jQuery
      const $ = window.jQuery || window.$;
      if ($) {
        try {
          $(target).trigger('click');
          if (target !== el) $(el).trigger('click');
        } catch(e) {}
      }

      // 7. Đặc thù Start Section trên ETS Test
      if (detail.text && /start\s*section/i.test(detail.text)) {
        try {
          if (typeof window.startSection === 'function') window.startSection();
          if (typeof window.StartSection === 'function') window.StartSection();
          if (typeof window.NextSection === 'function') window.NextSection();
          if (typeof window.doNext === 'function') window.doNext();
          if (typeof window.btnStartSection_Click === 'function') window.btnStartSection_Click();
        } catch (exFunc) {}
      }

      console.log("[AI Shield] 🎯 Đã thực hiện Full Main World Click thành công cho phần tử:", target);
    } catch (err) {
      console.warn('[AI Shield Click Error]', err);
    } finally {
      if (detail && detail.uid) {
        const marked = document.querySelectorAll(`[data-ai-click="${detail.uid}"]`);
        marked.forEach(m => m.removeAttribute('data-ai-click'));
      }
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

  try {
    const origFetch = window.fetch;
    if (typeof origFetch === "function") {
      window.fetch = function(resource, init) {
        if (typeof resource === "string") {
          notifyCapturedAudio(resource);
        } else if (resource && resource.url) {
          notifyCapturedAudio(resource.url);
        }
        return origFetch.apply(this, arguments);
      };
    }
  } catch (eFetch) {}

  console.log("[AI Shield] 🛡️ Lá chắn chống cảnh báo hệ thống tiếng Anh & bộ bắt audio đã sẵn sàng!");
})();
