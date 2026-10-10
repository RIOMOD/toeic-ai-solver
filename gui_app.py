import sys
import os
import time
import threading
import tkinter as tk
from tkinter import ttk, messagebox
import pyautogui
from desktop_agent import DesktopScreenAgent
from bot_agent import EnglishBotAgent
import config

class EnglishSolverGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("🎯 AI English Auto Solver - Bảng Điều Khiển")
        self.root.geometry("640x520")
        self.root.minsize(580, 480)
        self.root.configure(bg="#0f172a")

        self.desktop_agent = DesktopScreenAgent()
        self.bot_agent = None

        self.setup_styles()
        self.create_widgets()

    def setup_styles(self):
        style = ttk.Style()
        style.theme_use("clam")

        style.configure(".", background="#0f172a", foreground="#f8fafc", font=("Segoe UI", 10))
        style.configure("TNotebook", background="#0f172a", borderwidth=0)
        style.configure("TNotebook.Tab", background="#1e293b", foreground="#94a3b8", padding=[16, 8], font=("Segoe UI", 10, "bold"))
        style.map("TNotebook.Tab", background=[("selected", "#0284c7")], foreground=[("selected", "#ffffff")])

        style.configure("TButton", background="#38bdf8", foreground="#0f172a", font=("Segoe UI", 10, "bold"), borderwidth=0, padding=8)
        style.map("TButton", background=[("active", "#0284c7")])

        style.configure("TLabel", background="#0f172a", foreground="#f8fafc")
        style.configure("Header.TLabel", font=("Segoe UI", 14, "bold"), foreground="#38bdf8")
        style.configure("Card.TFrame", background="#1e293b", relief="flat")

    def create_widgets(self):
        # Header
        header_frame = tk.Frame(self.root, bg="#0f172a", pady=12)
        header_frame.pack(fill="x")
        
        lbl_title = tk.Label(
            header_frame, 
            text="🤖 AI ENGLISH AUTO SOLVER", 
            font=("Segoe UI", 16, "bold"), 
            fg="#38bdf8", 
            bg="#0f172a"
        )
        lbl_title.pack()

        lbl_sub = tk.Label(
            header_frame, 
            text="Chọn cửa sổ hoặc tab Chrome đang mở để chỉ định AI tự động giải", 
            font=("Segoe UI", 9), 
            fg="#94a3b8", 
            bg="#0f172a"
        )
        lbl_sub.pack()

        # Tabs
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill="both", expand=True, padx=16, pady=8)

        # Tab 1: Chỉ định Màn hình / Cửa sổ Chrome đang mở (Dễ nhất & Không cần đăng nhập lại)
        self.tab_screen = ttk.Frame(self.notebook, padding=14)
        self.notebook.add(self.tab_screen, text="🖥️ Chỉ Định Cửa Sổ Màn Hình")
        self.setup_tab_screen()

        # Tab 2: Chọn Tab Chrome trực tiếp (CDP)
        self.tab_cdp = ttk.Frame(self.notebook, padding=14)
        self.notebook.add(self.tab_cdp, text="📑 Danh Sách Tab Chrome")
        self.setup_tab_cdp()

        # Thanh trạng thái dưới cùng
        self.status_var = tk.StringVar(value="Sẵn sàng hoạt động.")
        status_bar = tk.Label(
            self.root, 
            textvariable=self.status_var, 
            bg="#1e293b", 
            fg="#38bdf8", 
            font=("Segoe UI", 9), 
            anchor="w", 
            padx=12, 
            pady=6
        )
        status_bar.pack(fill="x", side="bottom")

    def setup_tab_screen(self):
        desc = tk.Label(
            self.tab_screen,
            text="👉 CÁCH DÙNG: Bấm nút dưới đây, chuyển sang cửa sổ Chrome đang mở bài thi của bạn.\n"
                 "AI sẽ tự động nhận diện câu hỏi trên màn hình đó và di chuột thật để click chọn đáp án!",
            font=("Segoe UI", 9),
            fg="#cbd5e1",
            bg="#0f172a",
            justify="left"
        )
        desc.pack(anchor="w", pady=(0, 14))

        btn_solve_screen = tk.Button(
            self.tab_screen,
            text="🚀 BẮT ĐẦU: Chuyển Sang Cửa Sổ Chrome & Tự Động Giải (3 giây)",
            bg="#38bdf8",
            fg="#0f172a",
            font=("Segoe UI", 11, "bold"),
            relief="flat",
            padx=16,
            pady=10,
            cursor="hand2",
            command=self.start_screen_solve_thread
        )
        btn_solve_screen.pack(fill="x", pady=8)

        # Bảng hiển thị kết quả giải
        lbl_res = tk.Label(self.tab_screen, text="📋 Danh sách các câu đã phát hiện & giải:", font=("Segoe UI", 10, "bold"), fg="#f8fafc", bg="#0f172a")
        lbl_res.pack(anchor="w", pady=(12, 4))

        columns = ("no", "text", "ans", "coords")
        self.tree_screen = ttk.Treeview(self.tab_screen, columns=columns, show="headings", height=8)
        self.tree_screen.heading("no", text="Câu")
        self.tree_screen.heading("text", text="Nội dung câu hỏi")
        self.tree_screen.heading("ans", text="Đáp án AI")
        self.tree_screen.heading("coords", text="Vị trí click")

        self.tree_screen.column("no", width=60, anchor="center")
        self.tree_screen.column("text", width=250)
        self.tree_screen.column("ans", width=120)
        self.tree_screen.column("coords", width=90, anchor="center")
        self.tree_screen.pack(fill="both", expand=True)

    def setup_tab_cdp(self):
        desc = tk.Label(
            self.tab_cdp,
            text="Danh sách các Tab đang mở trong Chrome kết nối qua cổng Debug (9222):\n"
                 "Hãy nhấp chọn Tab bài tập của bạn và bấm 'Giải Tab Này'.",
            font=("Segoe UI", 9),
            fg="#cbd5e1",
            bg="#0f172a",
            justify="left"
        )
        desc.pack(anchor="w", pady=(0, 10))

        btn_frame = tk.Frame(self.tab_cdp, bg="#0f172a")
        btn_frame.pack(fill="x", pady=6)

        btn_refresh = tk.Button(
            btn_frame,
            text="🔄 Quét Danh Sách Tab Chrome",
            bg="#1e293b",
            fg="#38bdf8",
            font=("Segoe UI", 9, "bold"),
            relief="flat",
            padx=12,
            pady=6,
            cursor="hand2",
            command=self.refresh_cdp_tabs
        )
        btn_refresh.pack(side="left", padx=(0, 8))

        btn_solve_tab = tk.Button(
            btn_frame,
            text="🎯 GIẢI TAB ĐÃ CHỌN",
            bg="#22c55e",
            fg="#0f172a",
            font=("Segoe UI", 9, "bold"),
            relief="flat",
            padx=16,
            pady=6,
            cursor="hand2",
            command=self.solve_selected_cdp_tab
        )
        btn_solve_tab.pack(side="left")

        # Listbox các tab Chrome
        self.tabs_listbox = tk.Listbox(
            self.tab_cdp,
            bg="#1e293b",
            fg="#f8fafc",
            font=("Segoe UI", 10),
            selectbackground="#0284c7",
            selectforeground="#ffffff",
            relief="flat",
            highlightthickness=1,
            highlightcolor="#38bdf8"
        )
        self.tabs_listbox.pack(fill="both", expand=True, pady=8)

    def start_screen_solve_thread(self):
        threading.Thread(target=self.run_screen_solve, daemon=True).start()

    def run_screen_solve(self):
        # 1. Tự động thu nhỏ cửa sổ ứng dụng để lộ màn hình bài tập bên dưới
        self.root.iconify()

        # Đếm ngược 3 giây để người dùng chuyển sang Chrome
        for sec in range(3, 0, -1):
            self.status_var.set(f"⏳ Hãy chuyển sang cửa sổ bài thi của bạn ngay... ({sec}s)")
            time.sleep(1)

        self.status_var.set("📸 Đang chụp màn hình & gửi Gemini Vision phân tích...")
        res = self.desktop_agent.scan_and_solve_fullscreen()

        # Khôi phục lại cửa sổ ứng dụng sau khi đã chụp xong
        self.root.deiconify()

        if "error" in res:
            self.status_var.set(f"Lỗi: {res['error']}")
            messagebox.showerror("Lỗi", res['error'])
            return

        if isinstance(res, list):
            questions = res
        elif isinstance(res, dict):
            questions = res.get("detected_questions") or res.get("answers") or res.get("questions") or []
        else:
            questions = []

        if not questions:
            self.status_var.set("⚠️ Không phát hiện câu hỏi bài tập tiếng Anh nào trên màn hình hiện tại.")
            messagebox.showwarning("Thông báo", "Không tìm thấy câu hỏi bài tập trên màn hình đang mở.")
            return

        # Đổ vào bảng Treeview
        for item in self.tree_screen.get_children():
            self.tree_screen.delete(item)

        for q in questions:
            pt = q.get("click_point_pct", {})
            pt_str = f"{pt.get('x')}%, {pt.get('y')}%" if pt else "N/A"
            self.tree_screen.insert("", "end", values=(
                q.get("question_number", ""),
                q.get("question_text", "")[:40] + "...",
                q.get("correct_answer", ""),
                pt_str
            ))

        self.status_var.set(f"🤖 Đang tự động di chuột và click giải {len(questions)} câu...")
        self.desktop_agent.execute_actions(questions, auto_click=True)
        self.status_var.set(f"✅ Đã hoàn thành tự động giải {len(questions)} câu trên màn hình!")

    def refresh_cdp_tabs(self):
        self.status_var.set("Đang quét các Tab Chrome kết nối cổng 9222...")
        try:
            if not self.bot_agent:
                self.bot_agent = EnglishBotAgent(cdp_url=config.CDP_URL)
                self.bot_agent.start()

            tabs = self.bot_agent.get_open_tabs()
            self.tabs_listbox.delete(0, tk.END)

            if not tabs:
                self.tabs_listbox.insert(tk.END, "Không tìm thấy tab nào. Hãy mở Chrome qua open_chrome_debug.bat!")
                self.status_var.set("Không tìm thấy tab Chrome.")
                return

            for idx, t in enumerate(tabs):
                self.tabs_listbox.insert(tk.END, f"[{idx + 1}] {t['title']} ({t['url']})")

            self.tabs_listbox.select_set(0)
            self.status_var.set(f"Đã tìm thấy {len(tabs)} Tab Chrome.")
        except Exception as e:
            self.status_var.set(f"Không thể kết nối Chrome: {e}")
            messagebox.showinfo(
                "Chưa bật Chrome Debug",
                "Chưa phát hiện Chrome mở cổng 9222.\n\n"
                "👉 Bạn có thể dùng Tab '🖥️ Chỉ Định Cửa Sổ Màn Hình' để giải ngay trên Chrome thường mà không cần cổng 9222!"
            )

    def solve_selected_cdp_tab(self):
        sel = self.tabs_listbox.curselection()
        if not sel or not self.bot_agent:
            messagebox.showwarning("Cảnh báo", "Vui lòng chọn 1 Tab Chrome trong danh sách!")
            return

        tab_idx = sel[0]
        self.bot_agent.switch_to_tab(tab_idx)
        
        threading.Thread(target=self.run_cdp_solve, daemon=True).start()

    def run_cdp_solve(self):
        self.status_var.set(f"Đang phân tích và giải trên Tab #{self.bot_agent.page.title()}...")
        try:
            answers = self.bot_agent.solve_current_page()
            self.status_var.set(f"✅ Đã giải và click thành công {len(answers)} câu trên Tab Chrome!")
            messagebox.showinfo("Thành công", f"Đã tự động giải xong {len(answers)} câu trên Tab được chọn!")
        except Exception as e:
            self.status_var.set(f"Lỗi khi giải Tab: {e}")
            messagebox.showerror("Lỗi", str(e))

def main():
    root = tk.Tk()
    app = EnglishSolverGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()
