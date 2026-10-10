import logging
from typing import Optional, List, Dict, Any
from playwright.sync_api import Page, Response

logger = logging.getLogger("AudioInterceptor")

class AudioInterceptor:
    """
    Module giám sát và thu thập âm thanh trên trang web bài tập tiếng Anh.
    Hỗ trợ bắt trực tiếp qua Network requests (MP3/WAV/AAC) và quét thẻ <audio> trong DOM.
    """
    def __init__(self, page: Page):
        self.page = page
        self.captured_audios: List[Dict[str, Any]] = []
        self._setup_interception()

    def _setup_interception(self):
        def on_response(response: Response):
            try:
                url = response.url
                headers = response.headers
                content_type = headers.get("content-type", "").lower()

                # Kiểm tra xem có phải định dạng âm thanh không
                is_audio = (
                    "audio/" in content_type or
                    url.endswith((".mp3", ".wav", ".m4a", ".ogg", ".aac"))
                )

                if is_audio and response.status == 200:
                    try:
                        audio_data = response.body()
                        if audio_data and len(audio_data) > 512:  # Bỏ qua file rỗng hoặc quá nhỏ
                            logger.info(f"Đã bắt được file âm thanh từ web: {url} ({len(audio_data)} bytes)")
                            self.captured_audios.append({
                                "url": url,
                                "mime_type": content_type if "audio/" in content_type else "audio/mp3",
                                "data": audio_data
                            })
                    except Exception as e:
                        # Một số response có thể là stream hoặc bị hủy
                        pass
            except Exception:
                pass

        self.page.on("response", on_response)

    def scan_dom_audio(self) -> List[Dict[str, Any]]:
        """Quét tìm các thẻ <audio> hoặc <source> trên trang web."""
        from urllib.parse import urljoin, urlparse
        import urllib.request

        try:
            audio_elements = self.page.query_selector_all("audio, audio source")
            current_url = self.page.url

            for el in audio_elements:
                src = el.get_attribute("src")
                if not src:
                    continue

                full_url = urljoin(current_url, src)

                # Nếu chưa có trong danh sách đã bắt
                if not any(a["url"] == full_url for a in self.captured_audios):
                    try:
                        data = None
                        if full_url.startswith("file://"):
                            local_path = urllib.request.url2pathname(urlparse(full_url).path)
                            with open(local_path, "rb") as f:
                                data = f.read()
                        else:
                            resp = self.page.request.get(full_url)
                            if resp.status == 200:
                                data = resp.body()

                        if data and len(data) > 0:
                            mime = "audio/wav" if full_url.endswith(".wav") else "audio/mp3"
                            self.captured_audios.append({
                                "url": full_url,
                                "mime_type": mime,
                                "data": data
                            })
                            logger.info(f"Đã tải thành công audio từ thẻ DOM: {full_url} ({len(data)} bytes)")
                    except Exception as e:
                        logger.debug(f"Không thể tải audio từ {full_url}: {e}")
        except Exception as e:
            logger.debug(f"Lỗi khi quét thẻ audio: {e}")

        return self.captured_audios

    def get_latest_audio(self) -> Optional[Dict[str, Any]]:
        """Lấy file âm thanh bài nghe gần nhất được phát trên web."""
        if self.captured_audios:
            return self.captured_audios[-1]
        
        # Thử quét DOM nếu chưa bắt được qua network
        self.scan_dom_audio()
        return self.captured_audios[-1] if self.captured_audios else None

    def clear(self):
        """Xóa danh sách âm thanh đã thu thập (dùng khi chuyển sang câu mới)."""
        self.captured_audios.clear()
