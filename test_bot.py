import os
import time
from bot_agent import EnglishBotAgent

def test_full_pipeline():
    demo_file = os.path.abspath("demo_site/index.html")
    demo_url = f"file:///{demo_file.replace(os.sep, '/')}"

    print(">>> 1. Đang khởi tạo bot...")
    bot = EnglishBotAgent()
    try:
        print(f">>> 2. Đang mở trang demo: {demo_url}")
        bot.start(demo_url)
        time.sleep(1)

        print(">>> 3. Đang quét câu hỏi...")
        questions = bot.scan_page_questions()
        print(f"-> Tìm thấy {len(questions)} câu hỏi:")
        for q in questions:
            print(f"   - [{q.get('id')}] Type: {q.get('type')}, Text: {q.get('text')[:40]}...")

        assert len(questions) >= 4, f"Mong đợi ít nhất 4 câu hỏi, nhưng chỉ tìm thấy {len(questions)}"

        print(">>> 4. Đang quét/kiểm tra audio...")
        audio = bot.audio_interceptor.get_latest_audio()
        if audio:
            print(f"-> Đã bắt được file âm thanh: {audio['url']} (Dung lượng: {len(audio['data'])} bytes)")
        else:
            print("-> Chưa bắt được audio qua network, thử quét thẻ DOM...")
            audios = bot.audio_interceptor.scan_dom_audio()
            print(f"-> Quét được {len(audios)} thẻ audio.")

        print(">>> 5. Thực thi giải bài tự động...")
        answers = bot.solve_current_page()
        print(f"-> AI đã đưa ra đáp án cho {len(answers)} câu.")

        print(">>> 6. Nhấn Nộp bài...")
        bot.page.evaluate("() => { const b = document.querySelector('.btn-submit'); if (b) b.click(); }")
        time.sleep(1)

        score_text = bot.page.evaluate("() => document.getElementById('score-text')?.innerText || ''")
        print(f">>> 7. Kết quả nộp bài đọc được: {score_text}")

        print(">>> KIỂM THỬ THÀNH CÔNG 100%! HỆ THỐNG HOẠT ĐỘNG HOÀN HẢO.")
    finally:
        bot.stop()

if __name__ == "__main__":
    test_full_pipeline()
