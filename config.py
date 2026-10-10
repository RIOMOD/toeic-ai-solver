import os
from dotenv import load_dotenv

load_dotenv()

# Gemini AI Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

# Browser Configuration
HEADLESS = os.getenv("HEADLESS", "false").lower() == "true"
BROWSER_TIMEOUT = int(os.getenv("BROWSER_TIMEOUT", "30000"))
ACTION_DELAY_MS = int(os.getenv("ACTION_DELAY_MS", "1000"))

# Default URL for testing or target website
DEFAULT_URL = os.getenv("TARGET_URL", "")

# Chrome Remote Debugging (để kết nối Chrome có sẵn của bạn)
# Ví dụ chạy Chrome bằng: chrome.exe --remote-debugging-port=9222
CDP_URL = os.getenv("CDP_URL", "http://localhost:9222")
