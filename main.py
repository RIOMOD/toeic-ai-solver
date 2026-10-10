import os
import sys
import time
import logging
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.prompt import Prompt
from bot_agent import EnglishBotAgent
import config

# Cấu hình logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

console = Console()

def print_banner():
    console.print(Panel.fit(
        "[bold cyan]🤖 AI ENGLISH SOLVER BOT - AGENT TỰ ĐỘNG GIẢI BÀI TẬP TIẾNG ANH[/bold cyan]\n"
        "[dim]Tự động đọc màn hình, phân tích hình ảnh, bắt âm thanh bài nghe & click giải bài[/dim]",
        border_style="cyan"
    ))

def show_config_status():
    api_key = config.GEMINI_API_KEY
    has_key = bool(api_key and api_key != "your_gemini_api_key_here")
    
    table = Table(title="Trạng thái cấu hình hệ thống", show_header=True, header_style="bold magenta")
    table.add_column("Thuộc tính", style="cyan")
    table.add_column("Giá trị", style="green" if has_key else "yellow")

    table.add_row("Gemini API Key", "✅ Đã cấu hình" if has_key else "⚠️ Chưa nhập (Đang dùng Mock Test)")
    table.add_row("Model AI", config.GEMINI_MODEL)
    table.add_row("Chế độ hiển thị (Headless)", str(config.HEADLESS))
    table.add_row("Tốc độ thao tác (Delay)", f"{config.ACTION_DELAY_MS} ms")
    console.print(table)

    if not has_key:
        console.print("[yellow]💡 Mẹo: Bạn có thể lấy Gemini API Key miễn phí tại: [bold underline]https://aistudio.google.com/[/bold underline][/yellow]\n")

def run_demo():
    console.print("\n[bold green]🚀 Đang khởi động trang thử nghiệm bài tập mẫu...[/bold green]")
    demo_file = os.path.abspath("demo_site/index.html")
    demo_url = f"file:///{demo_file.replace(os.sep, '/')}"

    bot = EnglishBotAgent()
    try:
        bot.start(demo_url)
        console.print("[cyan]Trình duyệt đã mở. Đang phân tích bài tập...[/cyan]")
        time.sleep(2)

        # Chạy quy trình giải
        answers = bot.solve_current_page()

        console.print("\n[bold green]✨ KẾT QUẢ PHÂN TÍCH TỪ AI:[/bold green]")
        res_table = Table(show_header=True, header_style="bold green")
        res_table.add_column("Câu hỏi", style="cyan")
        res_table.add_column("Đáp án được chọn", style="bold yellow")
        res_table.add_column("Giải thích từ AI", style="white")

        for a in answers:
            ans_val = a.get('selected_option_text') or a.get('input_value') or 'N/A'
            res_table.add_row(
                str(a.get('id')),
                str(ans_val),
                str(a.get('explanation', ''))
            )
        console.print(res_table)

        # Tự động click nút Submit để chấm điểm
        console.print("\n[cyan]Đang bấm nộp bài để xem điểm số...[/cyan]")
        time.sleep(1)
        bot.page.evaluate("() => { const b = document.querySelector('.btn-submit'); if (b) b.click(); }")
        time.sleep(2)

        # Đọc điểm số
        score_text = bot.page.evaluate("() => document.getElementById('score-text')?.innerText || ''")
        if score_text:
            console.print(Panel(f"[bold green]🎉 KẾT QUẢ ĐẠT ĐƯỢC: {score_text}[/bold green]", border_style="green"))

        Prompt.ask("\n[bold yellow]Nhấn Enter để đóng trình duyệt kết thúc phiên[/bold yellow]")
    finally:
        bot.stop()

def run_custom_url(url: str):
    console.print(f"\n[bold green]🚀 Đang kết nối tới URL: {url}[/bold green]")
    bot = EnglishBotAgent()
    try:
        bot.start(url)
        console.print("[cyan]Trang web đã được mở trong trình duyệt.[/cyan]")
        
        while True:
            console.print("\n[bold cyan]Lệnh điều khiển:[/bold cyan]")
            console.print("  [bold green][1][/bold green] 🎯 Quét và tự động giải trang hiện tại")
            console.print("  [bold yellow][2][/bold yellow] 🔄 Tải lại trang web")
            console.print("  [bold red][3][/bold red] ❌ Thoát")
            choice = Prompt.ask("Chọn thao tác", choices=["1", "2", "3"], default="1")

            if choice == "1":
                console.print("[yellow]Đang chụp màn hình, phân tích câu hỏi và âm thanh...[/yellow]")
                answers = bot.solve_current_page()
                console.print(f"[green]Đã hoàn thành thao tác {len(answers)} câu![/green]")
            elif choice == "2":
                bot.page.reload()
                console.print("[cyan]Đã tải lại trang.[/cyan]")
            elif choice == "3":
                break
    finally:
        bot.stop()

def run_connect_chrome():
    console.print("\n[bold cyan]🔌 Kết nối với trình duyệt Chrome thật đang mở sẵn trên máy[/bold cyan]")
    
    # Kiểm tra cổng 9222 có đang mở không
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    is_port_open = (sock.connect_ex(('127.0.0.1', 9222)) == 0)
    sock.close()

    if not is_port_open:
        console.print("[yellow]⚠️ Chưa thấy Chrome mở cổng 9222. Đang tự động khởi chạy Chrome Debug cho bạn...[/yellow]")
        import subprocess
        chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
        if not os.path.exists(chrome_path):
            chrome_path = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
        
        user_data_dir = os.path.abspath("chrome_debug_profile")
        try:
            subprocess.Popen([
                chrome_path,
                "--remote-debugging-port=9222",
                f"--user-data-dir={user_data_dir}",
                "--no-first-run",
                "--no-default-browser-check"
            ])
            console.print("[green]Đã mở cửa sổ Chrome Debug! Vui lòng chờ 2 giây...[/green]")
            time.sleep(2.5)
        except Exception as e:
            console.print(f"[red]Không thể tự động mở Chrome: {e}[/red]")
            console.print("[yellow]Bạn có thể chạy file open_chrome_debug.bat để mở thủ công.[/yellow]")
            return

    bot = EnglishBotAgent(cdp_url=config.CDP_URL)
    try:
        bot.start()
        
        while True:
            # Hiển thị thông tin tab đang được chọn (bọc an toàn tránh lỗi tab đã đóng)
            current_title = "Chưa có tab"
            current_url = ""
            try:
                if bot.page:
                    current_title = bot.page.title()
                    current_url = bot.page.url
            except Exception:
                bot.auto_select_best_tab()
                try:
                    if bot.page:
                        current_title = bot.page.title()
                        current_url = bot.page.url
                except Exception:
                    pass

            console.print(f"\n[bold green]📌 Tab Chrome đang chọn:[/bold green] [bold yellow]'{current_title}'[/bold yellow]")
            console.print(f"[dim]URL: {current_url}[/dim]")

            console.print("\n[bold cyan]Lệnh điều khiển Chrome:[/bold cyan]")
            console.print("  [bold green][1][/bold green] 🎯 Quét và tự động giải tab này (Hỗ trợ cả Vision và DOM)")
            console.print("  [bold yellow][2][/bold yellow] 📑 Xem danh sách & chuyển sang tab Chrome khác")
            console.print("  [bold red][3][/bold red] ❌ Ngắt kết nối")
            choice = Prompt.ask("Chọn thao tác", choices=["1", "2", "3"], default="1")

            if choice == "1":
                console.print(f"[yellow]Đang chụp và giải bài tập trên tab '{current_title}'...[/yellow]")
                answers = bot.solve_current_page()
                console.print(f"[green]✅ Đã hoàn thành xử lý {len(answers)} câu trên tab Chrome![/green]")
            elif choice == "2":
                tabs = bot.get_open_tabs()
                console.print("\n[bold magenta]📑 DANH SÁCH CÁC TAB CHROME ĐANG MỞ:[/bold magenta]")
                for t in tabs:
                    idx = t["index"] + 1
                    is_active = (bot.page == t["page"])
                    mark = "👉 [bold green](Đang chọn)[/bold green]" if is_active else ""
                    console.print(f"  [{idx}] {t['title'][:50]} - [dim]{t['url'][:60]}[/dim] {mark}")
                
                if tabs:
                    t_choice = Prompt.ask("Nhập số thứ tự tab muốn chuyển sang (hoặc Enter để giữ nguyên)", default="")
                    if t_choice.isdigit():
                        t_idx = int(t_choice) - 1
                        if 0 <= t_idx < len(tabs):
                            bot.switch_to_tab(t_idx)
                            console.print(f"[green]Đã chuyển sang tab #{t_choice}![/green]")
            else:
                break
    finally:
        bot.stop()

def run_desktop_fullscreen():
    from desktop_agent import DesktopScreenAgent
    console.print("\n[bold magenta]🖥️ CHẾ ĐỘ QUÉT VÀ GIẢI TOÀN BỘ MÀN HÌNH MÁY TÍNH[/bold magenta]")
    console.print("[dim]Hỗ trợ giải bài tập trên mọi cửa sổ: Trình duyệt, Phần mềm thi, PDF, Word...[/dim]")
    
    agent = DesktopScreenAgent()
    while True:
        console.print("\n[bold cyan]Lệnh điều khiển toàn màn hình:[/bold cyan]")
        console.print("  [bold green][1][/bold green] 📸 Chụp màn hình và giải bài tập ngay (Đếm ngược 3 giây)")
        console.print("  [bold red][2][/bold red] 🔙 Quay lại menu chính")
        choice = Prompt.ask("Chọn thao tác", choices=["1", "2"], default="1")

        if choice == "1":
            console.print("[yellow]⏳ Bạn có 3 giây để chuyển sang cửa sổ bài tập trên màn hình...[/yellow]")
            for sec in range(3, 0, -1):
                console.print(f"[bold cyan]{sec}...[/bold cyan]")
                time.sleep(1)

            console.print("[green]📸 Tách! Đã chụp toàn bộ màn hình. Đang gửi ảnh cho Gemini Vision phân tích...[/green]")
            result = agent.scan_and_solve_fullscreen()

            if "error" in result:
                console.print(f"[red]Lỗi: {result['error']}[/red]")
                continue

            if isinstance(result, list):
                questions = result
            elif isinstance(result, dict):
                questions = result.get("detected_questions") or result.get("answers") or result.get("questions") or []
            else:
                questions = []

            if not questions:
                console.print("[yellow]Không phát hiện câu hỏi bài tập tiếng Anh nào trên màn hình hiện tại.[/yellow]")
                continue

            # Hiển thị bảng đáp án
            table = Table(title="✨ KẾT QUẢ PHÂN TÍCH TỪ MÀN HÌNH", show_header=True, header_style="bold green")
            table.add_column("Số câu", style="cyan")
            table.add_column("Nội dung", style="white")
            table.add_column("Đáp án AI chọn", style="bold yellow")
            table.add_column("Tọa độ click (%)", style="magenta")
            table.add_column("Giải thích", style="dim")

            for q in questions:
                pt = q.get("click_point_pct", {})
                pt_str = f"X: {pt.get('x')}%, Y: {pt.get('y')}%" if pt else "N/A"
                table.add_row(
                    str(q.get("question_number", "")),
                    str(q.get("question_text", ""))[:45] + "...",
                    str(q.get("correct_answer", "")),
                    pt_str,
                    str(q.get("explanation", ""))
                )
            console.print(table)

            # Hỏi người dùng có muốn bot tự động click không
            auto_click = Prompt.ask(
                "\n[bold yellow]Bạn có muốn bot tự động di chuột và click chọn đáp án thật trên màn hình không?[/bold yellow]",
                choices=["y", "n"],
                default="y"
            )

            if auto_click.lower() == "y":
                console.print("[bold green]🤖 Đang tự động di chuột và thực hiện thao tác... (Di chuột nhanh vào 4 góc màn hình nếu muốn hủy khẩn cấp)[/bold green]")
                agent.execute_actions(questions, auto_click=True)
                console.print("[green]✅ Đã hoàn thành tất cả thao tác trên màn hình![/green]")
        else:
            break

def main():
    while True:
        os.system('cls' if os.name == 'nt' else 'clear')
        print_banner()
        show_config_status()

        console.print("[bold]Vui lòng chọn chế độ hoạt động:[/bold]")
        console.print("  [bold green][1][/bold green] 🎯 Chạy thử nghiệm trên Đề Mẫu (Demo Test có âm thanh + ảnh + điền từ)")
        console.print("  [bold cyan][2][/bold cyan] 🌐 Mở trang web bài tập tiếng Anh bất kỳ (Nhập URL)")
        console.print("  [bold yellow][3][/bold yellow] 🔌 Kết nối vào Google Chrome đang mở sẵn trên máy (CDP 9222)")
        console.print("  [bold magenta][4][/bold magenta] 🖥️ Quét & Tự động giải TOÀN BỘ MÀN HÌNH máy tính (Desktop / Mọi ứng dụng)")
        console.print("  [bold red][0][/bold red] 🚪 Thoát")

        action = Prompt.ask("\nNhập lựa chọn của bạn", choices=["0", "1", "2", "3", "4"], default="1")

        if action == "1":
            run_demo()
        elif action == "2":
            url = Prompt.ask("Nhập URL trang web bài tập (ví dụ: https://...)")
            if url:
                run_custom_url(url)
        elif action == "3":
            run_connect_chrome()
        elif action == "4":
            run_desktop_fullscreen()
        elif action == "0":
            console.print("[cyan]Cảm ơn bạn đã sử dụng. Hẹn gặp lại![/cyan]")
            break

if __name__ == "__main__":
    main()
