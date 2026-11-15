# -*- coding: utf-8 -*-
"""Писец — книги для Skyrim: иероглифы, русский и английский в одном редакторе."""
import os, sys, json, threading
import tkinter as tk
from tkinter import ttk, messagebox, simpledialog

if getattr(sys, "frozen", False):
    HERE = os.path.dirname(sys.executable)
else:
    HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from hiero_core import (to_text, mdc_to_pua, get_clipboard, suggested_pp,
                        suggested_pp_text, load_store, next_free, rebuild,
                        ensure_installed, MAX_CHARS_PER_VOLUME)
import hiero_translate
import voynich

try:
    _installed = ensure_installed()
except Exception as e:
    _installed = []
    tk.Tk().withdraw()
    messagebox.showerror("Писец", f"Ошибка установки комплекта:\n{e}")
    raise SystemExit

PUA_LO, PUA_HI = 0xE000, 0xE42E

root = tk.Tk()
root.title("Писец — книги для Skyrim (иероглифы + текст)")
root.geometry("1280x720")
root.state("zoomed")  # окно на весь экран

# ===== ночная тема в духе «Карты снов» =====
BG      = "#0f0b24"   # фон
PANEL   = "#141029"   # панели/кнопки
INPUT   = "#0d0a1f"   # поля ввода
TEXT    = "#e9e4fa"   # основной текст
DIM     = "#9a90c9"   # приглушённый
ACCENT  = "#8b7cf8"   # фиолетовый акцент
ACCENT2 = "#6d5bd0"   # главные кнопки
BORDER  = "#3a2f6e"

root.configure(bg=BG)
style = ttk.Style(root)
style.theme_use("clam")
style.configure(".", background=BG, foreground=TEXT, font=("Segoe UI", 10))
style.configure("TFrame", background=BG)
style.configure("TLabel", background=BG, foreground=DIM)
style.configure("TButton", background=PANEL, foreground=TEXT, bordercolor=BORDER,
                lightcolor=PANEL, darkcolor=PANEL, focusthickness=0, padding=(12, 6))
style.map("TButton", background=[("active", "#2a2058")], bordercolor=[("active", ACCENT)])
style.configure("Primary.TButton", background=ACCENT2, bordercolor=ACCENT,
                lightcolor=ACCENT2, darkcolor=ACCENT2, foreground="#ffffff")
style.map("Primary.TButton", background=[("active", "#7d6ae0")])
style.configure("TCheckbutton", background=BG, foreground=DIM, focuscolor=BG)
style.map("TCheckbutton", background=[("active", BG)], foreground=[("active", TEXT)])
style.configure("TEntry", fieldbackground=INPUT, foreground=TEXT, insertcolor=TEXT,
                bordercolor=BORDER, lightcolor=INPUT, darkcolor=INPUT)
style.configure("TSpinbox", fieldbackground=INPUT, foreground=TEXT, insertcolor=TEXT,
                arrowcolor=DIM, background=PANEL, bordercolor=BORDER,
                lightcolor=INPUT, darkcolor=INPUT)
style.configure("Vertical.TScrollbar", background=PANEL, troughcolor=BG,
                bordercolor=BG, arrowcolor=DIM)

hdr = tk.Label(root, text="☾ Писец — книги Скайрима", bg=BG, fg="#cabefc",
               font=("Georgia", 15, "italic"))
hdr.pack(anchor="w", padx=14, pady=(8, 0))

frm = ttk.Frame(root, padding=10)
frm.pack(fill="both", expand=True)
frm.columnconfigure(1, weight=1)
frm.rowconfigure(2, weight=1)

ttk.Label(frm, text="Название книги:").grid(row=0, column=0, sticky="w")
title_var = tk.StringVar(value="Папирус")
ent_title = ttk.Entry(frm, textvariable=title_var, width=36)
ent_title.grid(row=0, column=1, sticky="we", padx=6)

ttk.Label(frm, text="Номер (bat bookN):").grid(row=0, column=2, sticky="e")
num_var = tk.IntVar(value=1)
ttk.Spinbox(frm, from_=1, to=999, textvariable=num_var, width=5).grid(row=0, column=3, padx=(0, 8))

ttk.Label(frm, text="Размер знаков:").grid(row=1, column=2, sticky="e")
size_var = tk.IntVar(value=36)
ttk.Spinbox(frm, from_=20, to=72, textvariable=size_var, width=5).grid(row=1, column=3, padx=(0, 8))

ttk.Label(frm, text="Знаков на страницу:").grid(row=1, column=0, sticky="w")
ppf = ttk.Frame(frm)
ppf.grid(row=1, column=1, sticky="w", padx=6)
pp_var = tk.IntVar(value=600)
pp_spin = ttk.Spinbox(ppf, from_=20, to=2000, increment=1, textvariable=pp_var, width=6)
pp_spin.pack(side="left")
auto_var = tk.BooleanVar(value=False)

# единый редактор: текст — обычным шрифтом, иероглифы — шрифтом игры (тег)
text_box = tk.Text(frm, wrap="word", height=12, font=("Segoe UI", 13),
                   bg=INPUT, fg=TEXT, insertbackground=TEXT,
                   selectbackground=ACCENT2, selectforeground="#ffffff",
                   relief="flat", highlightthickness=1,
                   highlightbackground=BORDER, highlightcolor=ACCENT, padx=10, pady=8)
text_box.grid(row=2, column=0, columnspan=4, sticky="nsew", pady=8)
text_box.tag_configure("hiero", font=("SkyrimHiero", 22), foreground="#e0d6ff")

# перевод: эту книгу супруг(а) отдаст игроку через игровой час после папируса
ttk.Label(frm, text="Перевод (отдаст супруг или супруга в игре):").grid(
    row=3, column=0, columnspan=4, sticky="w")
trans_box = tk.Text(frm, wrap="word", height=6, font=("Segoe UI", 12),
                    bg=INPUT, fg="#c4bbea", insertbackground=TEXT,
                    selectbackground=ACCENT2, selectforeground="#ffffff",
                    relief="flat", highlightthickness=1,
                    highlightbackground=BORDER, highlightcolor=ACCENT, padx=10, pady=8)
trans_box.grid(row=4, column=0, columnspan=4, sticky="nsew", pady=(2, 6))

def retag(_event=None):
    """Подсвечивает PUA-иероглифы шрифтом SkyrimHiero прямо среди текста."""
    text_box.tag_remove("hiero", "1.0", "end")
    txt = text_box.get("1.0", "end-1c")
    start = None
    for i, ch in enumerate(txt):
        h = PUA_LO <= ord(ch) <= PUA_HI
        if h and start is None:
            start = i
        elif not h and start is not None:
            text_box.tag_add("hiero", f"1.0+{start}c", f"1.0+{i}c")
            start = None
    if start is not None:
        text_box.tag_add("hiero", f"1.0+{start}c", f"1.0+{len(txt)}c")

def hiero_share():
    txt = text_box.get("1.0", "end-1c")
    if not txt:
        return 0.0
    pua = sum(1 for c in txt if PUA_LO <= ord(c) <= PUA_HI)
    return pua / len(txt)

def apply_auto(*_):
    if auto_var.get():
        try:
            f = suggested_pp if hiero_share() > 0.5 else suggested_pp_text
            pp_var.set(f(max(20, size_var.get())))
        except Exception:
            pass
    pp_spin.configure(state="disabled" if auto_var.get() else "normal")

ttk.Checkbutton(ppf, text="авто", variable=auto_var, command=apply_auto).pack(side="left", padx=4)

# каким письмом книга ляжет в игру
SCRIPTS = [("Иероглифы", "hiero"),
           ("Войнич", "voynich"),
           ("Войнич рукописный", "voynich-hand")]
ttk.Label(ppf, text="Письмо:").pack(side="left", padx=(14, 4))
script_var = tk.StringVar(value=SCRIPTS[0][0])
cmb_script = ttk.Combobox(ppf, textvariable=script_var, state="readonly", width=18,
                          values=[s[0] for s in SCRIPTS])
cmb_script.pack(side="left")

def script_code():
    return dict(SCRIPTS).get(script_var.get(), "hiero")

def on_script(*_):
    if script_code() == "hiero":
        status.set("Иероглифы: пишите знаками из Hermes или жмите «Латиница → иероглифы».")
    else:
        bad = voynich.unsupported_report(text_box.get("1.0", "end-1c"),
                                         script_code() == "voynich-hand")
        note = (" Нет глифов для: " + " ".join(bad)) if bad else ""
        status.set("Войнич: пишите по-английски, в игре текст станет письмом рукописи."
                   " w пишется двумя v и читается обратно как w." + note)

cmb_script.bind("<<ComboboxSelected>>", on_script)

side = ttk.Frame(frm)
side.grid(row=0, column=4, rowspan=6, sticky="nsew", padx=(10, 0))
ttk.Label(side, text="Книги в моде:").pack(anchor="w")
lst = tk.Listbox(side, width=128, height=22,
                 bg=INPUT, fg=TEXT, selectbackground=ACCENT2, selectforeground="#ffffff",
                 relief="flat", highlightthickness=1,
                 highlightbackground=BORDER, highlightcolor=ACCENT,
                 font=("Segoe UI", 10))
lst.pack(fill="both", expand=True)
lst.bind("<<ListboxSelect>>", lambda e: open_selected())

status = tk.StringVar(value="Пишите текст, вставляйте иероглифы из Hermes — всё в одном окне.")
ttk.Label(frm, textvariable=status, wraplength=680).grid(row=6, column=0, columnspan=4, sticky="w")

def refresh_list():
    books = load_store()
    lst.delete(0, "end")
    for b in books:
        lst.insert("end", f'book {b["num"]}  —  {b["title"]}')
    num_var.set(next_free(books))

def refresh_stats(*_):
    t = text_box.get("1.0", "end-1c")
    try:
        per = max(20, pp_var.get())
    except Exception:
        per = 220
    pages = (len(t) + per - 1) // per if t else 0
    vols = (len(t) + MAX_CHARS_PER_VOLUME - 1) // MAX_CHARS_PER_VOLUME if t else 0
    status.set(f"Знаков: {len(t)} | страниц: ~{pages}" + (f" | томов: {vols}" if vols > 1 else ""))

def paste_clip():
    raw = get_clipboard()
    if not raw:
        messagebox.showwarning("Писец", "Буфер обмена пуст.")
        return
    txt, dropped = to_text(raw)
    if not txt:
        messagebox.showwarning("Писец", "В буфере не нашлось текста.")
        return
    text_box.insert("insert", txt)
    retag()
    refresh_stats()
    if dropped:
        status.set(status.get() + f" | пропущено символов: {dropped}")

def mdc_convert():
    """Латиница -> иероглифы по раскладке шрифта (выделенное или весь текст)."""
    try:
        a, b = text_box.index("sel.first"), text_box.index("sel.last")
    except tk.TclError:
        a, b = "1.0", "end-1c"
    piece = text_box.get(a, b)
    if not piece:
        return
    text_box.delete(a, b)
    text_box.insert(a, mdc_to_pua(piece))
    retag()
    refresh_stats()

current = {"num": None}   # номер книги, открытой на редактирование

def make_book():
    txt, _ = to_text(text_box.get("1.0", "end-1c"))
    title = title_var.get().strip() or "Папирус"
    if not txt:
        messagebox.showwarning("Писец", "Сначала введите текст.")
        return
    if script_code() != "hiero":
        bad = voynich.unsupported_report(txt, script_code() == "voynich-hand")
        if bad:
            show = " ".join("%r U+%04X" % (c, ord(c)) for c in bad[:12])
            if not messagebox.askyesno(
                    "Писец",
                    "Для этих знаков в шрифте Войнича нет глифов — в игре на их\n"
                    "месте будут чёрные квадраты:\n\n" + show +
                    "\n\nВсё равно сохранить?"):
                return
    books = load_store()
    n = num_var.get()
    chunks = [txt[i:i + MAX_CHARS_PER_VOLUME] for i in range(0, len(txt), MAX_CHARS_PER_VOLUME)]
    needed = list(range(n, n + len(chunks)))
    busy = [m for m in needed if any(b["num"] == m for b in books)]
    ask = [m for m in busy if m != current["num"]]  # свою открытую книгу сохраняем молча
    if ask:
        if not messagebox.askyesno("Писец", f"Номер(а) {ask} уже заняты. Заменить?"):
            return
    books = [b for b in books if b["num"] not in busy]
    trans = trans_box.get("1.0", "end-1c").strip()
    for vi, chunk in enumerate(chunks):
        t = title if len(chunks) == 1 else f"{title} — том {vi + 1}"
        books.append({"num": needed[vi], "title": t, "text": chunk,
                      "size": size_var.get(), "per_page": pp_var.get(),
                      "script": script_code(),
                      "translation": trans if vi == 0 else ""})
    rebuild(books)
    current["num"] = needed[0]
    btn_save.config(text="Сохранить книгу")
    refresh_list()
    names = ", ".join("bat book%d" % m for m in needed)
    extra = ("\n\nПеревод записан: отдайте папирус супругу или супруге —\n"
             "перевод вернётся через час игрового времени."
             if trans else "")
    messagebox.showinfo("Писец", f"Сохранено!\n\nВ игре в консоли (~):\n  {names}\n"
                        f"или  bat books  — все книги сразу.{extra}")
    refresh_stats()

def open_selected(_event=None):
    sel = lst.curselection()
    if not sel:
        return
    books = load_store()
    if sel[0] >= len(books):
        return
    b = books[sel[0]]
    current["num"] = b["num"]
    btn_save.config(text="Сохранить книгу")
    title_var.set(b["title"])
    num_var.set(b["num"])
    auto_var.set(False)
    size_var.set(b.get("size", 36))
    pp_var.set(b.get("per_page", 220))
    code = b.get("script", "hiero")
    script_var.set(next((n for n, c in SCRIPTS if c == code), SCRIPTS[0][0]))
    apply_auto()
    text_box.delete("1.0", "end")
    text_box.insert("1.0", b["text"])
    trans_box.delete("1.0", "end")
    trans_box.insert("1.0", b.get("translation", ""))
    retag()
    refresh_stats()
    status.set(f'Открыта «{b["title"]}» (book {b["num"]}) — правьте и жмите '
               f'«Сохранить книгу».')

def new_book():
    current["num"] = None
    btn_save.config(text="Создать книгу")
    title_var.set("Папирус")
    num_var.set(next_free(load_store()))
    script_var.set(SCRIPTS[0][0])
    text_box.delete("1.0", "end")
    trans_box.delete("1.0", "end")
    refresh_stats()
    status.set("Новая книга: пишите текст и жмите «Создать книгу».")

def delete_selected():
    sel = lst.curselection()
    if not sel:
        return
    books = load_store()
    b = books[sel[0]]
    if messagebox.askyesno("Писец", f'Удалить «{b["title"]}» (book {b["num"]})?\n'
                           "Книга исчезнет и из игры."):
        books.remove(b)
        rebuild(books)
        refresh_list()

ttk.Button(side, text="Удалить выбранную", command=delete_selected).pack(pady=4, fill="x")

def translate_now():
    """Перевод текущего текста через OpenRouter по правилам скила-оракула."""
    txt, _ = to_text(text_box.get("1.0", "end-1c"))
    if not any(PUA_LO <= ord(c) <= PUA_HI for c in txt):
        messagebox.showwarning("Писец", "В тексте нет иероглифов — переводить нечего.")
        return
    cfg = hiero_translate.load_config()
    if not (cfg.get("api_key") or "").strip():
        key = simpledialog.askstring(
            "Писец", "Для перевода нужен ключ OpenRouter API (sk-or-...).\n"
            "Он сохранится в openrouter.json рядом с books.json:", parent=root)
        if not (key and key.strip()):
            status.set("Перевод отменён: нет ключа OpenRouter.")
            return
        cfg["api_key"] = key.strip()
        json.dump(cfg, open(hiero_translate.CONFIG, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
    btn_translate.config(state="disabled")
    status.set("Оракул читает знаки (OpenRouter)… это может занять пару минут.")
    def work():
        try:
            tr, err = hiero_translate.translate(txt, title_var.get().strip()), None
        except Exception as e:
            tr, err = None, str(e)
        def done():
            btn_translate.config(state="normal")
            if err:
                status.set("Перевод не удался: " + err)
            else:
                trans_box.delete("1.0", "end")
                trans_box.insert("1.0", tr)
                status.set("Перевод готов — сохраните книгу, чтобы он попал в игру.")
        root.after(0, done)
    threading.Thread(target=work, daemon=True).start()

btns = ttk.Frame(frm)
btns.grid(row=5, column=0, columnspan=4, pady=4, sticky="we")
ttk.Button(btns, text="Новая книга", command=new_book).pack(side="left", padx=4)
ttk.Button(btns, text="Вставить из буфера", command=paste_clip).pack(side="left", padx=4)
ttk.Button(btns, text="Латиница → иероглифы", command=mdc_convert).pack(side="left", padx=4)
btn_translate = ttk.Button(btns, text="Перевести (OpenRouter)", command=translate_now)
btn_translate.pack(side="left", padx=4)
btn_save = ttk.Button(btns, text="Создать книгу", command=make_book, style="Primary.TButton")
btn_save.pack(side="left", padx=4)

def on_paste(_event=None):
    paste_clip()  # своя вставка: понимает иероглифы U+13000+ и чистит текст
    return "break"

# Ctrl+C/V/X/A по КОДАМ клавиш — работают в любой раскладке (рус/англ);
# стандартные привязки Tk на Windows срабатывают только в латинице
def ctrl_keys(widget, paste_fn):
    def handler(e):
        if e.keycode == 86:                      # V — вставить
            paste_fn()
            return "break"
        if e.keycode == 67:                      # C — копировать
            widget.event_generate("<<Copy>>")
            return "break"
        if e.keycode == 88:                      # X — вырезать
            widget.event_generate("<<Cut>>")
            root.after(1, lambda: (retag(), refresh_stats()))
            return "break"
        if e.keycode == 65:                      # A — выделить всё
            widget.event_generate("<<SelectAll>>")
            return "break"
    widget.bind("<Control-KeyPress>", handler)

ctrl_keys(text_box, paste_clip)
ctrl_keys(ent_title, lambda: ent_title.event_generate("<<Paste>>"))
ctrl_keys(trans_box, lambda: trans_box.event_generate("<<Paste>>"))

pp_var.trace_add("write", refresh_stats)
size_var.trace_add("write", apply_auto)
text_box.bind("<KeyRelease>", lambda e: (retag(), refresh_stats()))
text_box.bind("<<Paste>>", on_paste)
apply_auto()
refresh_list()
if _installed:
    status.set("Установлено: " + ", ".join(_installed))

root.mainloop()
