import json
import logging
from typing import Optional, Dict, Any, List
from google import genai
from google.genai import types
import config

logger = logging.getLogger("EnglishAISolver")

class EnglishAISolver:
    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or config.GEMINI_API_KEY
        self.model = model or config.GEMINI_MODEL
        self.client = None
        if self.api_key and self.api_key != "your_gemini_api_key_here":
            try:
                self.client = genai.Client(api_key=self.api_key)
                logger.info(f"Đã khởi tạo Gemini AI Client với model {self.model}")
            except Exception as e:
                logger.error(f"Lỗi khởi tạo Gemini Client: {e}")
        else:
            logger.warning("Chưa cấu hình GEMINI_API_KEY. Sẽ sử dụng chế độ mô phỏng (Mock Solver).")

    def solve(
        self,
        questions_data: List[Dict[str, Any]],
        screenshot_bytes: Optional[bytes] = None,
        audio_bytes: Optional[bytes] = None,
        audio_mime_type: str = "audio/mp3"
    ) -> List[Dict[str, Any]]:
        """
        Giải các câu hỏi bài tập tiếng Anh bằng Gemini AI (hỗ trợ Text, Ảnh, Âm thanh nghe).
        """
        if not self.client:
            return self._mock_solve(questions_data)

        # Chuẩn bị nội dung gửi cho Gemini
        prompt = self._build_prompt(questions_data)
        contents = []

        # Đính kèm âm thanh bài nghe nếu có
        if audio_bytes and len(audio_bytes) > 0:
            logger.info(f"Đang đính kèm file âm thanh ({len(audio_bytes)} bytes) vào AI...")
            contents.append(
                types.Part.from_bytes(data=audio_bytes, mime_type=audio_mime_type)
            )

        # Đính kèm ảnh chụp màn hình bài tập nếu có
        if screenshot_bytes and len(screenshot_bytes) > 0:
            logger.info("Đang đính kèm ảnh chụp bài tập vào AI...")
            contents.append(
                types.Part.from_bytes(data=screenshot_bytes, mime_type="image/png")
            )

        contents.append(prompt)

        candidate_models = [self.model, "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash"]
        # Loại bỏ trùng lặp giữ nguyên thứ tự
        seen = set()
        models_to_try = [m for m in candidate_models if not (m in seen or seen.add(m))]

        for model_name in models_to_try:
            try:
                logger.info(f"Đang gọi Gemini model: {model_name}...")
                response = self.client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.1,  # Nhiệt độ thấp để trả về kết quả chính xác nhất
                        system_instruction=(
                            "Bạn là một chuyên gia khảo thí và giáo viên Tiếng Anh hàng đầu. "
                            "Nhiệm vụ của bạn là giải chính xác 100% tất cả các câu hỏi bài tập tiếng Anh được cung cấp, "
                            "bao gồm trắc nghiệm ngữ pháp, từ vựng, đọc hiểu, điền từ vào chỗ trống, "
                            "và nghe hiểu (dựa trên file audio đính kèm nếu có). "
                            "BẮT BUỘC chỉ trả về định dạng JSON hợp lệ theo đúng cấu trúc được yêu cầu."
                        )
                    )
                )

                raw_text = response.text.strip()
                parsed = json.loads(raw_text)
                
                # Chuẩn hóa kết quả trả về
                if isinstance(parsed, dict) and "answers" in parsed:
                    return parsed["answers"]
                elif isinstance(parsed, list):
                    return parsed
                else:
                    return [parsed]

            except Exception as e:
                logger.warning(f"Model {model_name} gặp sự cố: {e}. Thử model tiếp theo...")
                continue

        logger.error("Tất cả các model Gemini đều không khả dụng. Chuyển sang Mock Solver.")
        return self._mock_solve(questions_data)

    def _build_prompt(self, questions_data: List[Dict[str, Any]]) -> str:
        data_str = json.dumps(questions_data, ensure_ascii=False, indent=2)
        return f"""
Hãy phân tích và giải các câu hỏi bài tập tiếng Anh sau:

DỮ LIỆU CÂU HỎI TỪ TRANG WEB:
{data_str}

LƯU Ý QUAN TRỌNG:
1. Nếu có file âm thanh đính kèm, hãy nghe kỹ nội dung để trả lời các câu hỏi nghe (Listening).
2. Nếu có ảnh chụp màn hình đính kèm, đối chiếu vị trí và nội dung ảnh nếu câu hỏi yêu cầu.
3. Đối với dạng trắc nghiệm (choice):
   - Chọn đúng phương án chính xác nhất.
   - Trả về 'selected_option_index' (số nguyên, 0-indexed tương ứng với vị trí trong mảng options).
   - Trả về 'selected_option_text' (chính xác chuỗi văn bản của đáp án).
4. Đối với dạng điền từ (text/input):
   - Trả về 'input_value' là từ hoặc cụm từ cần điền (đúng ngữ pháp, thì, số ít/nhiều).
5. Kèm theo giải thích ngắn gọn bằng tiếng Việt trong trường 'explanation'.

BẮT BUỘC trả về đúng cấu trúc JSON:
{{
  "answers": [
    {{
      "id": "q1",
      "type": "choice",
      "selected_option_index": 1,
      "selected_option_text": "B. played",
      "input_value": null,
      "explanation": "Câu ở thì quá khứ đơn vì có trạng từ 'yesterday' nên động từ play thêm ed."
    }},
    {{
      "id": "q2",
      "type": "text",
      "selected_option_index": null,
      "selected_option_text": null,
      "input_value": "beautiful",
      "explanation": "Cần một tính từ đứng trước danh từ flower."
    }}
  ]
}}
"""

    def _mock_solve(self, questions_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Mock fallback khi chưa có API key để kiểm thử quy trình click tự động."""
        results = []
        for q in questions_data:
            q_id = q.get("id", "q")
            q_type = q.get("type", "choice")
            options = q.get("options", [])
            
            if q_type == "choice" and options:
                results.append({
                    "id": q_id,
                    "type": "choice",
                    "selected_option_index": 0,
                    "selected_option_text": options[0],
                    "input_value": None,
                    "explanation": "[Mock/Chưa có API key] Chọn đáp án đầu tiên để thử nghiệm bot."
                })
            else:
                results.append({
                    "id": q_id,
                    "type": "text",
                    "selected_option_index": None,
                    "selected_option_text": None,
                    "input_value": "sample answer",
                    "explanation": "[Mock/Chưa có API key] Điền mẫu để thử nghiệm bot."
                })
        return results
