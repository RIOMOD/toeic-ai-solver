import time
import logging
from typing import Optional, Dict, Any, List
from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page, ElementHandle
from ai_solver import EnglishAISolver
from audio_interceptor import AudioInterceptor
import config

logger = logging.getLogger("EnglishBotAgent")

class EnglishBotAgent:
    def __init__(self, cdp_url: Optional[str] = None):
        self.cdp_url = cdp_url
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.audio_interceptor: Optional[AudioInterceptor] = None
        self.ai_solver = EnglishAISolver()

    def start(self, target_url: Optional[str] = None):
        """Khởi động trình duyệt hoặc kết nối với Chrome đang mở."""
        self.playwright = sync_playwright().start()

        if self.cdp_url:
            logger.info(f"Đang kết nối vào Chrome thật tại {self.cdp_url}...")
            try:
                self.browser = self.playwright.chromium.connect_over_cdp(self.cdp_url)
                self.context = self.browser.contexts[0] if self.browser.contexts else self.browser.new_context()
                self.auto_select_best_tab()
                logger.info(f"Kết nối Chrome thành công! Tab hiện tại: '{self.page.title()}' ({self.page.url})")
            except Exception as e:
                logger.error(f"Không thể kết nối Chrome qua CDP: {e}")
                raise ConnectionError(f"Không thể kết nối vào Chrome qua {self.cdp_url}. Hãy chắc chắn Chrome đã được bật với cổng Debug 9222.")
        else:
            self._launch_new_browser()

        self.audio_interceptor = AudioInterceptor(self.page)

        if target_url:
            logger.info(f"Đang mở trang web: {target_url}")
            self.page.goto(target_url, wait_until="domcontentloaded", timeout=config.BROWSER_TIMEOUT)
            self.page.wait_for_timeout(2000)

    def _launch_new_browser(self):
        """Mở một trình duyệt Chromium mới."""
        self.browser = self.playwright.chromium.launch(
            headless=config.HEADLESS,
            args=[
                "--start-maximized",
                "--autoplay-policy=no-user-gesture-required",  # Cho phép web tự phát audio bài nghe
            ]
        )
        self.context = self.browser.new_context(
            no_viewport=True,
            permissions=["microphone", "camera"]
        )
        self.page = self.context.new_page()

    def get_open_tabs(self) -> List[Dict[str, Any]]:
        """Lấy danh sách tất cả các tab đang mở trong Chrome."""
        tabs = []
        if self.context:
            for idx, p in enumerate(self.context.pages):
                try:
                    tabs.append({
                        "index": idx,
                        "title": p.title() or "Không có tiêu đề",
                        "url": p.url,
                        "page": p
                    })
                except Exception:
                    pass
        return tabs

    def auto_select_best_tab(self):
        """Tự động chọn tab đang mở bài tập (bỏ qua tab trống hoặc chrome://)."""
        tabs = self.get_open_tabs()
        chosen = None
        for t in tabs:
            url = t["url"].lower()
            if not url.startswith(("chrome://", "chrome-extension://", "about:blank")) and url != "":
                chosen = t["page"]
                break
        
        self.page = chosen or (self.context.pages[0] if self.context.pages else self.context.new_page())
        if self.audio_interceptor:
            self.audio_interceptor = AudioInterceptor(self.page)

    def switch_to_tab(self, index: int) -> bool:
        """Chuyển sang tab theo số thứ tự (0-indexed)."""
        if self.context and 0 <= index < len(self.context.pages):
            self.page = self.context.pages[index]
            self.audio_interceptor = AudioInterceptor(self.page)
            logger.info(f"Đã chuyển sang tab #{index + 1}: '{self.page.title()}' ({self.page.url})")
            return True
        return False

    def scan_page_questions(self) -> List[Dict[str, Any]]:
        """
        Quét trang web để tìm các câu hỏi bài tập tiếng Anh:
        Hỗ trợ nhận diện form câu hỏi trắc nghiệm, ô điền từ, bài nghe.
        """
        if not self.page:
            return []

        # Chạy script JavaScript trên trang để thu thập cấu trúc câu hỏi một cách thông minh
        js_scan_code = """
        () => {
            const results = [];
            
            // Tìm các khối câu hỏi theo selector thông dụng
            const questionBlocks = Array.from(document.querySelectorAll(
                '.question, .quiz-question, .question-card, .test-item, .quiz-item, fieldset, [data-question-id]'
            ));

            if (questionBlocks.length > 0) {
                questionBlocks.forEach((block, index) => {
                    const id = block.getAttribute('data-question-id') || block.id || `q_${index + 1}`;
                    
                    // Lấy tiêu đề / nội dung câu hỏi
                    const titleEl = block.querySelector(
                        '.question-title, .question-text, .prompt, h3, h4, legend, .q-text, p'
                    ) || block;
                    const questionText = titleEl.innerText.trim();

                    // Tìm các đáp án lựa chọn (radio hoặc button/label)
                    const optionEls = Array.from(block.querySelectorAll('input[type="radio"], input[type="checkbox"], .option, .choice, label.btn'));
                    const options = [];
                    const optionSelectors = [];

                    optionEls.forEach((opt, optIdx) => {
                        let text = opt.innerText || '';
                        if (!text && opt.id) {
                            const lbl = document.querySelector(`label[for="${opt.id}"]`);
                            if (lbl) text = lbl.innerText;
                        }
                        if (!text && opt.parentElement && opt.parentElement.tagName === 'LABEL') {
                            text = opt.parentElement.innerText;
                        }
                        options.push(text.trim() || `Option ${optIdx + 1}`);
                    });

                    // Tìm các ô điền từ (input text)
                    const textInput = block.querySelector('input[type="text"], textarea, .fill-blank');

                    // Kiểm tra có thẻ audio/video bài nghe trong khối này không
                    const hasAudio = !!block.querySelector('audio, .audio-player, button.play-btn');

                    // Kiểm tra có hình ảnh minh họa không
                    const imgEl = block.querySelector('img');
                    const imgSrc = imgEl ? imgEl.src : null;

                    results.push({
                        id: id,
                        index: index,
                        text: questionText,
                        type: (options.length > 0) ? 'choice' : (textInput ? 'text' : 'unknown'),
                        options: options,
                        hasInput: !!textInput,
                        hasAudio: hasAudio,
                        imgSrc: imgSrc
                    });
                });
            } else {
                // Fallback: Nếu web không có class chuẩn, tìm các radio group hoặc input
                const radioGroups = {};
                document.querySelectorAll('input[type="radio"]').forEach(r => {
                    const name = r.name || 'default_group';
                    if (!radioGroups[name]) radioGroups[name] = [];
                    let labelText = '';
                    if (r.id) {
                        const lbl = document.querySelector(`label[for="${r.id}"]`);
                        if (lbl) labelText = lbl.innerText;
                    }
                    if (!labelText && r.parentElement) labelText = r.parentElement.innerText;
                    radioGroups[name].push({
                        value: r.value,
                        text: labelText.trim() || r.value
                    });
                });

                let gIdx = 1;
                for (const [name, opts] of Object.entries(radioGroups)) {
                    results.push({
                        id: `group_${name}_${gIdx}`,
                        index: gIdx - 1,
                        text: `Câu hỏi trắc nghiệm nhóm: ${name}`,
                        type: 'choice',
                        options: opts.map(o => o.text),
                        radioName: name
                    });
                    gIdx++;
                }
            }

            return results;
        }
        """

        try:
            questions = self.page.evaluate(js_scan_code)
            logger.info(f"Đã phát hiện {len(questions)} câu hỏi trên trang web.")
            return questions
        except Exception as e:
            logger.error(f"Lỗi khi quét câu hỏi trên DOM: {e}")
            return []

    def solve_current_page(self) -> List[Dict[str, Any]]:
        """
        Quy trình xử lý hoàn chỉnh:
        1. Bắt audio + chụp màn hình bài tập
        2. Quét dữ liệu câu hỏi từ DOM
        3. Gửi sang Gemini AI xử lý
        4. Tự động click chọn đáp án hoặc điền từ vào trang web
        """
        if not self.page:
            logger.error("Chưa có trang web nào được mở.")
            return []

        # 1. Chụp màn hình trang web làm ngữ cảnh ảnh (Multimodal Vision)
        screenshot_bytes = None
        try:
            screenshot_bytes = self.page.screenshot(full_page=False)
        except Exception as e:
            logger.warning(f"Không thể chụp ảnh màn hình: {e}")

        # 2. Lấy dữ liệu âm thanh bài nghe gần nhất nếu có
        audio_info = self.audio_interceptor.get_latest_audio() if self.audio_interceptor else None
        audio_bytes = audio_info["data"] if audio_info else None
        audio_mime = audio_info.get("mime_type", "audio/mp3") if audio_info else "audio/mp3"

        # 3. Quét câu hỏi trên trang
        questions = self.scan_page_questions()
        if not questions:
            logger.info("⚡ Không tìm thấy câu hỏi theo mã HTML thông thường. Tự động kích hoạt AI Vision đọc trực tiếp ảnh chụp trang web...")
            return self.solve_via_vision(screenshot_bytes, audio_bytes, audio_mime)

        # 4. Gửi dữ liệu sang AI Solver
        logger.info("Đang gửi câu hỏi tới AI phân tích...")
        ai_answers = self.ai_solver.solve(
            questions_data=questions,
            screenshot_bytes=screenshot_bytes,
            audio_bytes=audio_bytes,
            audio_mime_type=audio_mime
        )

        # 5. Thực thi tự động trên giao diện web
        self.apply_answers(questions, ai_answers)

        return ai_answers

    def solve_via_vision(self, screenshot_bytes: Optional[bytes], audio_bytes: Optional[bytes], audio_mime: str) -> List[Dict[str, Any]]:
        """
        Dùng Gemini Multimodal Vision đọc trực tiếp ảnh chụp trang web khi trang web dùng cấu trúc đặc biệt (Canvas, iFrame, Div...).
        Xác định tọa độ click chuột trên tab trình duyệt và tự động click/gõ phím.
        """
        import json
        from google.genai import types

        if not screenshot_bytes:
            try:
                screenshot_bytes = self.page.screenshot(full_page=False)
            except Exception as e:
                logger.error(f"Không thể chụp màn hình trang web: {e}")
                return []

        viewport = self.page.evaluate("() => ({ width: window.innerWidth, height: window.innerHeight })")
        vp_w = viewport.get("width", 1280)
        vp_h = viewport.get("height", 800)

        prompt = f"""
Đây là ảnh chụp toàn bộ trang bài tập tiếng Anh đang mở trên tab trình duyệt (Kích thước hiển thị: {vp_w}x{vp_h} px).

NHIỆM VỤ:
1. Đọc và nhận diện TẤT CẢ các câu hỏi tiếng Anh, bài tập, câu trắc nghiệm (A, B, C, D) hoặc ô điền từ trên trang này.
2. Nếu có file âm thanh đính kèm, nghe và giải câu hỏi nghe hiểu.
3. Giải chính xác tất cả các câu hỏi.
4. XÁC ĐỊNH TỌA ĐỘ CLICK:
   - Với câu trắc nghiệm: Xác định tọa độ tâm (x, y) theo PHẦN TRĂM (0.0% đến 100.0%) của nút radio, checkbox hoặc dòng chữ đáp án đúng để click chuột.
   - Với câu điền từ: Xác định tọa độ (x, y) theo PHẦN TRĂM của ô nhập liệu để click và gõ từ.
5. BẮT BUỘC trả về đúng cấu trúc JSON:
{{
  "answers": [
    {{
      "id": "câu_1",
      "type": "choice",
      "selected_option_text": "B. played",
      "click_point_pct": {{ "x": 38.5, "y": 42.0 }},
      "input_value": null,
      "explanation": "Thì quá khứ đơn vì có yesterday"
    }},
    {{
      "id": "câu_2",
      "type": "text",
      "selected_option_text": null,
      "click_point_pct": {{ "x": 45.0, "y": 60.5 }},
      "input_value": "went",
      "explanation": "Cần điền động từ ở dạng quá khứ"
    }}
  ]
}}
"""
        contents = []
        if audio_bytes and len(audio_bytes) > 0:
            contents.append(types.Part.from_bytes(data=audio_bytes, mime_type=audio_mime))
        contents.append(types.Part.from_bytes(data=screenshot_bytes, mime_type="image/png"))
        contents.append(prompt)

        models_to_try = [config.GEMINI_MODEL, "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash"]
        seen = set()
        models_to_try = [m for m in models_to_try if not (m in seen or seen.add(m))]

        answers = []
        for model_name in models_to_try:
            try:
                logger.info(f"Đang gửi ảnh tab trang web tới Gemini Vision ({model_name})...")
                response = self.ai_solver.client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.1
                    )
                )
                parsed = json.loads(response.text.strip())
                answers = parsed.get("answers", []) if isinstance(parsed, dict) else parsed
                break
            except Exception as e:
                logger.warning(f"Lỗi với model {model_name}: {e}. Thử model khác...")
                continue

        if not answers:
            logger.warning("AI không tìm thấy hoặc không giải được câu hỏi từ ảnh trang web.")
            return []

        logger.info(f"AI Vision đã giải xong {len(answers)} câu hỏi từ ảnh trang web!")

        # Thực thi click chuột thật trên tab trình duyệt
        for ans in answers:
            q_id = ans.get("id", "câu")
            opt_text = ans.get("selected_option_text") or ans.get("input_value")
            pt = ans.get("click_point_pct", {})
            exp = ans.get("explanation", "")

            logger.info(f"--- Đang thao tác [{q_id}]: Đáp án -> {opt_text} ---")
            if exp:
                logger.info(f"Giải thích: {exp}")

            if pt and "x" in pt and "y" in pt:
                real_x = int((pt["x"] / 100.0) * vp_w)
                real_y = int((pt["y"] / 100.0) * vp_h)
                logger.info(f"-> Click chuột vào tọa độ trang web: ({real_x}, {real_y}) [X:{pt['x']}%, Y:{pt['y']}%]")
                try:
                    self.page.mouse.click(real_x, real_y)
                    time.sleep(0.3)
                    if ans.get("type") == "text" and ans.get("input_value"):
                        self.page.keyboard.type(str(ans["input_value"]), delay=50)
                    time.sleep(config.ACTION_DELAY_MS / 1000.0)
                except Exception as e:
                    logger.warning(f"Lỗi khi click tọa độ: {e}")

        return answers

    def apply_answers(self, questions: List[Dict[str, Any]], answers: List[Dict[str, Any]]):
        """Tự động tương tác với giao diện trang web: Click chọn đáp án và Điền từ."""
        if not self.page:
            return

        for ans in answers:
            q_id = ans.get("id")
            ans_type = ans.get("type", "choice")
            selected_idx = ans.get("selected_option_index")
            selected_text = ans.get("selected_option_text")
            input_val = ans.get("input_value")
            explanation = ans.get("explanation", "")

            logger.info(f"--- Đang xử lý câu [{q_id}] ---")
            if explanation:
                logger.info(f"Giải thích AI: {explanation}")

            try:
                if ans_type == "choice":
                    self._click_choice(q_id, selected_idx, selected_text)
                elif ans_type == "text" and input_val:
                    self._fill_text(q_id, str(input_val))
                
                time.sleep(config.ACTION_DELAY_MS / 1000.0)
            except Exception as e:
                logger.error(f"Lỗi khi thực hiện thao tác câu {q_id}: {e}")

    def _click_choice(self, q_id: str, option_index: Optional[int], option_text: Optional[str]):
        """Click chọn đáp án trắc nghiệm."""
        js_click_code = """
        ({ qId, optIndex, optText }) => {
            // 1. Tìm block câu hỏi
            let block = document.querySelector(`[data-question-id="${qId}"]`) || document.getElementById(qId);
            let root = block || document;

            // 2. Tìm tất cả option/radio trong khối này
            const options = Array.from(root.querySelectorAll(
                'input[type="radio"], input[type="checkbox"], .option, .choice, label.btn, button.choice-btn'
            ));

            let target = null;
            if (optIndex !== null && optIndex !== undefined && options[optIndex]) {
                target = options[optIndex];
            } else if (optText) {
                target = options.find(o => (o.innerText || o.value || '').includes(optText));
            }

            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                target.click();
                // Kích hoạt thêm sự kiện change nếu là input radio
                if (target.tagName === 'INPUT') {
                    target.dispatchEvent(new Event('change', { bubbles: true }));
                }
                return true;
            }
            return false;
        }
        """
        success = self.page.evaluate(js_click_code, {
            "qId": q_id,
            "optIndex": option_index,
            "optText": option_text
        })
        if success:
            logger.info(f"-> Đã chọn đáp án: [{option_text or f'Vị trí #{option_index}'}]")
        else:
            logger.warning(f"-> Không tìm thấy phần tử để click cho câu {q_id}")

    def _fill_text(self, q_id: str, text_value: str):
        """Điền từ vào ô input text."""
        js_fill_code = """
        ({ qId, textValue }) => {
            let block = document.querySelector(`[data-question-id="${qId}"]`) || document.getElementById(qId);
            let root = block || document;
            const input = root.querySelector('input[type="text"], textarea, .fill-blank');
            if (input) {
                input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                input.value = textValue;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
            return false;
        }
        """
        success = self.page.evaluate(js_fill_code, {
            "qId": q_id,
            "textValue": text_value
        })
        if success:
            logger.info(f"-> Đã điền giá trị: '{text_value}'")
        else:
            logger.warning(f"-> Không tìm thấy ô nhập liệu cho câu {q_id}")

    def stop(self):
        """Đóng phiên làm việc."""
        try:
            # QUAN TRỌNG: Nếu kết nối qua CDP (Chrome đang mở của người dùng),
            # TUYỆT ĐỐI KHÔNG gọi self.browser.close() vì Playwright sẽ gửi lệnh tắt luôn trình duyệt của user!
            if self.browser and not self.cdp_url:
                self.browser.close()
            if self.playwright:
                self.playwright.stop()
            logger.info("Đã ngắt kết nối / đóng phiên làm việc.")
        except Exception as e:
            logger.debug(f"Lỗi khi đóng: {e}")
