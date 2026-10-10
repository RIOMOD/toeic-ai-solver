import io
import os
import time
import json
import logging
from typing import Optional, Dict, Any, List
import mss
from PIL import Image
import pyautogui
from google import genai
from google.genai import types
import config

logger = logging.getLogger("DesktopScreenAgent")

# Cấu hình an toàn cho PyAutoGUI
pyautogui.FAILSAFE = True  # Kéo chuột vào 4 góc màn hình để dừng khẩn cấp
pyautogui.PAUSE = 0.5

class DesktopScreenAgent:
    """
    Agent chụp và đọc TOÀN BỘ MÀN HÌNH máy tính Windows (Desktop, mọi phần mềm, web, PDF...).
    Sử dụng Gemini Multimodal Vision để đọc câu hỏi, tính toán tọa độ pixel và tự động di chuột click.
    """
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or config.GEMINI_API_KEY
        self.client = genai.Client(api_key=self.api_key) if self.api_key else None
        self.sct = mss.mss()

    def capture_screen(self) -> bytes:
        """Chụp toàn bộ màn hình chính của máy tính và trả về dạng PNG bytes."""
        # Cách 1: Sử dụng PIL ImageGrab
        try:
            from PIL import ImageGrab
            img = ImageGrab.grab(all_screens=False)
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            data = buffer.getvalue()
            if data and len(data) > 1024:
                logger.info(f"Đã chụp toàn màn hình qua ImageGrab ({img.size[0]}x{img.size[1]} px, {len(data)} bytes)")
                return data
        except Exception as e:
            logger.debug(f"ImageGrab không chụp được: {e}")

        # Cách 2: Sử dụng MSS
        try:
            monitor = self.sct.monitors[1]
            screenshot = self.sct.grab(monitor)
            img = Image.frombytes("RGB", screenshot.size, screenshot.bgra, "raw", "BGRX")
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            data = buffer.getvalue()
            if data and len(data) > 1024:
                logger.info(f"Đã chụp toàn màn hình qua MSS ({screenshot.width}x{screenshot.height} px, {len(data)} bytes)")
                return data
        except Exception as e:
            logger.debug(f"MSS không chụp được: {e}")

        # Cách 3: Dự phòng qua PowerShell .NET CopyFromScreen
        try:
            import subprocess
            temp_path = os.path.abspath("temp_desktop_screenshot.png")
            ps_cmd = (
                "$s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; "
                "$b = New-Object System.Drawing.Bitmap $s.Width, $s.Height; "
                "$g = [System.Drawing.Graphics]::FromImage($b); "
                "$g.CopyFromScreen(0, 0, 0, 0, $s.Size); "
                f"$b.Save('{temp_path}'); "
                "$g.Dispose(); $b.Dispose();"
            )
            subprocess.run([
                "powershell", "-NoProfile", "-Command",
                f"Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; {ps_cmd}"
            ], check=True, timeout=10)
            
            if os.path.exists(temp_path):
                with open(temp_path, "rb") as f:
                    data = f.read()
                os.remove(temp_path)
                logger.info(f"Đã chụp màn hình qua PowerShell .NET ({len(data)} bytes)")
                return data
        except Exception as e:
            logger.error(f"Lỗi chụp màn hình: {e}")

        raise RuntimeError("Không thể chụp ảnh màn hình máy tính. Hãy chắc chắn máy tính đang mở và không bị khóa màn hình.")

    def scan_and_solve_fullscreen(self) -> Dict[str, Any]:
        """
        1. Chụp ảnh toàn màn hình hiện tại.
        2. Dùng Gemini Vision phân tích tất cả bài tập tiếng Anh đang hiển thị.
        3. Xác định vị trí tọa độ phần trăm (x%, y%) để click chọn đáp án.
        """
        if not self.client:
            logger.error("Chưa cấu hình GEMINI_API_KEY.")
            return {"error": "Thiếu API Key"}

        png_bytes = self.capture_screen()
        screen_w, screen_h = pyautogui.size()

        prompt = f"""
Đây là ảnh chụp toàn bộ màn hình máy tính của tôi (Độ phân giải: {screen_w}x{screen_h}).
Trên màn hình đang mở bài tập tiếng Anh (ví dụ bài thi TOEIC, bài tập ngữ pháp, bài nghe...).

NHIỆM VỤ CỦA BẠN:
1. Đọc và nhận diện TẤT CẢ các câu hỏi tiếng Anh trên màn hình:
   - Dạng menu thả xuống (Drop-down list [ v ]): Đọc ngữ cảnh (đoạn văn, bài thoại bên cạnh), tìm từ/cụm từ cần chọn trong dropdown.
   - Dạng trắc nghiệm (A, B, C, D hoặc nút chọn).
   - Dạng điền từ vào ô trống.
2. Giải đúng 100% tất cả các câu hỏi đó (Ngữ pháp, modal verbs, thì quá khứ, từ vựng...).
3. XÁC ĐỊNH TỌA ĐỘ CLICK:
   - Với menu thả xuống (dropdown): Xác định tọa độ tâm (x, y) theo PHẦN TRĂM (0.0% đến 100.0%) của hộp dropdown `[ v ]` trên màn hình.
   - Với câu trắc nghiệm: Xác định tọa độ tâm của đáp án đúng.
   - Với câu điền từ: Xác định tọa độ của ô nhập liệu.

BẮT BUỘC TRẢ VỀ ĐỊNH DẠNG JSON NHƯ SAU:
{{
  "detected_questions": [
    {{
      "question_number": "Câu 1",
      "question_text": "It's great, but I [ ... ] a few weeks to buy it...",
      "correct_answer": "should have waited",
      "action_type": "dropdown", 
      "click_point_pct": {{
        "x": 62.5,
        "y": 30.2
      }},
      "text_to_type": null,
      "explanation": "Quá khứ của modal verbs diễn tả sự tiếc nuối: should have + V3"
    }}
  ]
}}
"""

        models_to_try = [config.GEMINI_MODEL, "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash"]
        seen = set()
        models_to_try = [m for m in models_to_try if not (m in seen or seen.add(m))]

        for model_name in models_to_try:
            try:
                logger.info(f"Đang gửi ảnh toàn màn hình tới Gemini ({model_name})...")
                response = self.client.models.generate_content(
                    model=model_name,
                    contents=[
                        types.Part.from_bytes(data=png_bytes, mime_type="image/png"),
                        prompt
                    ],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.1
                    )
                )

                parsed = json.loads(response.text.strip())
                if isinstance(parsed, list):
                    return {"detected_questions": parsed}
                elif isinstance(parsed, dict):
                    if "detected_questions" not in parsed:
                        for k in ["answers", "questions", "items", "results"]:
                            if k in parsed and isinstance(parsed[k], list):
                                parsed["detected_questions"] = parsed[k]
                                break
                    if "detected_questions" not in parsed:
                        parsed["detected_questions"] = [parsed]
                    return parsed
            except Exception as e:
                logger.warning(f"Lỗi với model {model_name}: {e}. Thử model khác...")
                continue
            except Exception as e:
                logger.warning(f"Lỗi với model {model_name}: {e}. Thử model khác...")
                continue

        return {"error": "Không thể phân tích màn hình qua các model Gemini."}

    def execute_actions(self, questions: List[Dict[str, Any]], auto_click: bool = True):
        """Di chuyển chuột thật và tự động click/gõ phím trên màn hình Windows."""
        screen_w, screen_h = pyautogui.size()

        for q in questions:
            q_num = q.get("question_number", "Câu hỏi")
            ans = q.get("correct_answer", "")
            action = q.get("action_type", "click_choice")
            pt = q.get("click_point_pct", {})
            text_type = q.get("text_to_type")
            exp = q.get("explanation", "")

            logger.info(f"\n[XỬ LÝ TRÊN MÀN HÌNH] {q_num}: Đáp án -> {ans}")
            if exp:
                logger.info(f"💡 Giải thích: {exp}")

            if not pt or "x" not in pt or "y" not in pt:
                continue

            # Quy đổi từ phần trăm sang tọa độ pixel thực tế của máy tính
            real_x = int((pt["x"] / 100.0) * screen_w)
            real_y = int((pt["y"] / 100.0) * screen_h)

            logger.info(f"🎯 Tọa độ màn hình: ({real_x}, {real_y}) [X:{pt['x']}%, Y:{pt['y']}%]")

            if auto_click:
                # Di chuột mượt mà tới vị trí đáp án trên màn hình
                pyautogui.moveTo(real_x, real_y, duration=0.4)
                pyautogui.click()
                time.sleep(0.3)

                # Nếu là ô nhập liệu cần gõ từ
                if action == "fill_text" and text_type:
                    logger.info(f"⌨️ Đang gõ từ: '{text_type}'")
                    pyautogui.write(str(text_type), interval=0.05)
                
                time.sleep(config.ACTION_DELAY_MS / 1000.0)
