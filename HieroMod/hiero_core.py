# -*- coding: utf-8 -*-
"""Логика Писца: конвертация, пагинация, порядок загрузки, сборка мода, самоустановка."""
import os, sys, json, glob, shutil, struct, ctypes, winreg
import esp_quest

def resource_dir():
    if getattr(sys, "frozen", False):
        return os.path.join(sys._MEIPASS, "assets")
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")

ESP_NAME = "HieroBooks.esp"
MOD_NAME = "Египетские иероглифы"
PEACE_MOD_NAME = "Мир без вражды"
PEACE_ESPS = ["No Hostility - Skyrim.esp", "No Hostility - Dawnguard.esp",
              "No Hostility - HearthFires.esp", "No Hostility - Dragonborn.esp"]

# ---------- автоопределение путей (универсально для любого ПК) ----------
import re

def _unescape_ini(v):
    v = v.strip()
    m = re.match(r"@ByteArray\((.*)\)\s*$", v, re.S)
    if m:
        v = m.group(1)
    return v.replace("\\\\", "\\").replace("/", "\\").strip()

def desktop_dir():
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders") as k:
            v = winreg.QueryValueEx(k, "Desktop")[0]
        return os.path.expandvars(v)
    except OSError:
        return os.path.join(os.environ.get("USERPROFILE", ""), "Desktop")

def _find_mo2():
    """Ищет инстанс MO2 для Skyrim SE: возвращает (base_dir, profile, game_path|None)."""
    root = os.path.join(os.environ.get("LOCALAPPDATA", ""), "ModOrganizer")
    best = None
    if os.path.isdir(root):
        for inst in os.listdir(root):
            ini = os.path.join(root, inst, "ModOrganizer.ini")
            if not os.path.exists(ini):
                continue
            txt = open(ini, encoding="utf-8", errors="replace").read()
            score = 2 if "Skyrim Special Edition" in txt else 0
            if best is None or score > best[0]:
                base = os.path.join(root, inst)
                m = re.search(r"^base_directory=(.+)$", txt, re.M)
                if m:
                    base = _unescape_ini(m.group(1))
                prof = "Default"
                m = re.search(r"^selected_profile=(.+)$", txt, re.M)
                if m:
                    prof = _unescape_ini(m.group(1))
                game = None
                m = re.search(r"^gamePath=(.+)$", txt, re.M)
                if m:
                    game = _unescape_ini(m.group(1))
                best = (score, base, prof, game)
    if best:
        return best[1], best[2], best[3]
    return None, "Default", None

def _find_game(hint):
    if hint and os.path.isdir(hint):
        return hint
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                r"SOFTWARE\WOW6432Node\Bethesda Softworks\Skyrim Special Edition") as k:
            v = winreg.QueryValueEx(k, "Installed Path")[0]
        if os.path.isdir(v):
            return v
    except OSError:
        pass
    for pf in (os.environ.get("ProgramFiles(x86)", ""), os.environ.get("ProgramFiles", "")):
        cand = os.path.join(pf, "Steam", "steamapps", "common", "Skyrim Special Edition")
        if os.path.isdir(cand):
            return cand
    return hint or ""

_BASE, PROFILE, _game_hint = _find_mo2()
GAME = _find_game(_game_hint)
if _BASE:
    MODS_DIR = os.path.join(_BASE, "mods")
    PROFILES_DIR = os.path.join(_BASE, "profiles")
else:  # MO2 не найден — работаем без него, кладём мод прямо в Data игры
    MODS_DIR = os.path.join(GAME, "Data") if GAME else ""
    PROFILES_DIR = ""
MOD = os.path.join(MODS_DIR, MOD_NAME) if _BASE else MODS_DIR
STORE = os.path.join(MOD, "books.json")

def paths_report():
    return (f"Игра:    {GAME or 'НЕ НАЙДЕНА'}\n"
            f"MO2:     {_BASE or 'не найден (мод пойдёт в Data игры)'}\n"
            f"Профиль: {PROFILE}\n"
            f"Мод:     {MOD}")

HIERO_BASE, HIERO_TOP, PUA_BASE = 0x13000, 0x1342E, 0xE000
MAX_CHARS_PER_VOLUME = 15000

def to_pua(text):
    out, dropped = [], 0
    for ch in text:
        cp = ord(ch)
        if HIERO_BASE <= cp <= HIERO_TOP:
            out.append(chr(PUA_BASE + cp - HIERO_BASE))
        elif PUA_BASE <= cp <= PUA_BASE + (HIERO_TOP - HIERO_BASE):
            out.append(ch)
        elif ch in "\r\n\t":
            if out and out[-1] != " ":
                out.append(" ")
        elif cp == 0x20 or ("0" <= ch <= "9") or ("A" <= ch <= "Z") or ("a" <= ch <= "z"):
            out.append(ch)  # пробел и латинская MdC-раскладка тоже есть в шрифте
        else:
            dropped += 1
    return "".join(out).strip(), dropped

def to_text(text):
    """Фильтр текстовых книг: буквы/цифры/пунктуация как есть, иероглифы -> PUA.
    Убираются только теги <> (ломают разметку книги) и управляющие символы."""
    out, dropped = [], 0
    for ch in text.replace("\r\n", "\n").replace("\r", "\n"):
        cp = ord(ch)
        if HIERO_BASE <= cp <= HIERO_TOP:
            out.append(chr(PUA_BASE + cp - HIERO_BASE))
        elif ch == "\n":
            out.append(ch)
        elif ch == "\t":
            out.append(" ")
        elif ch in "<>" or cp < 0x20 or cp > 0xFFFF:
            dropped += 1
        else:
            out.append(ch)
    return "".join(out).strip(), dropped

def paginate_mixed(txt, size, per_page):
    """Единая пагинация: PUA-иероглифы — шрифтом $HieroFont размера size,
    буквы/цифры/пунктуация — книжным шрифтом (size-12).
    Страница режется по ОЦЕНКЕ высоты и ширины строк (иероглифная строка выше
    текстовой): переполненную страницу движок книги рисует ПОВЕРХ следующей."""
    from itertools import groupby
    text_size = max(14, size - 12)
    is_h = lambda ch: PUA_BASE <= ord(ch) <= PUA_BASE + (HIERO_TOP - HIERO_BASE)
    PAGE_W, PAGE_H = 310.0, 540.0                 # консервативные размеры страницы
    H_W, T_W = 0.95 * size, 0.62 * text_size      # ширина знака
    H_LINE, T_LINE = 1.35 * size, 1.40 * text_size  # высота строки

    pages = []
    cur = []                    # символы текущей страницы
    line_w, line_hiero, height = 0.0, False, 0.0

    def line_h():
        return H_LINE if line_hiero else T_LINE

    def flush(mid_word):
        nonlocal cur, line_w, line_hiero, height
        s = "".join(cur).strip("\n")
        tail = ""
        if mid_word:  # не рвать слово на границе страниц
            cut = max(s.rfind(" "), s.rfind("\n"))
            if cut > len(s) * 0.5:
                s, tail = s[:cut], s[cut + 1:]
        if s:
            pages.append(s)
        cur = list(tail)
        line_w = sum(H_W if is_h(c) else T_W for c in tail)
        line_hiero = any(is_h(c) for c in tail)
        height = 0.0

    for ch in txt.strip():
        if ch == "\n":
            if height + line_h() + T_LINE > PAGE_H:
                flush(False)
            else:
                height += line_h()
                cur.append(ch)
                line_w, line_hiero = 0.0, False
            continue
        w = H_W if is_h(ch) else T_W
        if line_w + w > PAGE_W:                   # движок перенесёт строку
            if height + 2 * line_h() > PAGE_H:
                flush(True)
            else:
                height += line_h()
                line_w, line_hiero = 0.0, False
        if len(cur) >= per_page and line_w == 0.0:
            flush(False)
        cur.append(ch)
        line_w += w
        line_hiero = line_hiero or is_h(ch)
    flush(False)
    if not pages:
        pages = [""]

    def render(p):
        runs = []
        for h, grp in groupby(p, key=is_h):
            run = "".join(grp).replace("\n", "\r\n")
            if not h:  # в книжном шрифте русского Skyrim нет буквы «ё»
                run = run.replace("ё", "е").replace("Ё", "Е")
            runs.append("<font face='$HieroFont' size='%d'>%s</font>" % (size, run)
                        if h else "<font size='%d'>%s</font>" % (text_size, run))
        return "<p align='left'>\r\n%s\r\n</p>" % "".join(runs)
    return "\r\n[pagebreak]\r\n".join(render(p) for p in pages)

def suggested_pp_text(size):
    text_size = max(14, size - 12)
    per_line = max(10, int(460 / (0.45 * text_size)))
    lines = max(3, int(480 / (1.25 * size)))
    return per_line * lines

def paginate_voynich(txt, size, per_page, hand=False):
    """Английский текст письмом рукописи Войнича.

    Буквы, которые шрифт умеет, идут в $EVAFont; всё прочее (кириллица,
    редкие знаки) остаётся в обычном книжном шрифте, чтобы текст не терялся.
    """
    from itertools import groupby
    import voynich
    eva, _missing = voynich.to_eva(txt, hand)
    face = voynich.FONT_HAND if hand else voynich.FONT_MAIN

    pages, cur = [], []
    for ch in eva.strip():
        cur.append(ch)
        if len(cur) >= per_page and ch in " \n":
            pages.append("".join(cur))
            cur = []
    if cur:
        pages.append("".join(cur))
    if not pages:
        pages = [""]

    def render(page):
        runs = []
        # перевод строки не глиф — не разрывает прогон шрифта
        for is_eva, grp in groupby(page, key=lambda c: c in "\n\r" or
                                   voynich.is_eva(c, hand)):
            run = "".join(grp).replace("\n", "\r\n")
            runs.append("<font face='%s' size='%d'>%s</font>" % (face, size, run)
                        if is_eva else "<font size='%d'>%s</font>" % (max(14, size - 8), run))
        return "<p align='left'>\r\n%s\r\n</p>" % "".join(runs)

    return "\r\n[pagebreak]\r\n".join(render(p) for p in pages)

_MDC = None
def mdc_to_pua(text):
    """Явная конвертация латиницы в иероглифы по MdC-раскладке шрифта
    (assets\\mdc_map.json, создаётся генератором Алфавит_книга.py)."""
    global _MDC
    if _MDC is None:
        path = os.path.join(resource_dir(), "mdc_map.json")
        _MDC = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    return "".join(_MDC.get(ch, ch) for ch in text)

def paginate(pua, size, per_page):
    pages = [pua[i:i + per_page] for i in range(0, len(pua), per_page)] or [""]
    # [pagebreak] обязан стоять на отдельной строке (\r\n) — иначе игра считает его текстом
    return "\r\n[pagebreak]\r\n".join(
        "<p align='center'>\r\n<font face='$HieroFont' size='%d'>%s</font>\r\n</p>" % (size, p)
        for p in pages)

def suggested_pp(size):
    per_line = max(3, int(330 / (0.80 * size)))
    lines = max(2, int(480 / (1.25 * size)))
    return per_line * lines

def get_clipboard():
    CF_UNICODETEXT = 13
    u = ctypes.windll.user32
    k = ctypes.windll.kernel32
    # без явных типов 64-битные указатели обрезаются и буфер «пустеет»
    u.OpenClipboard.argtypes = [ctypes.c_void_p]
    u.GetClipboardData.restype = ctypes.c_void_p
    k.GlobalLock.argtypes = [ctypes.c_void_p]
    k.GlobalLock.restype = ctypes.c_void_p
    k.GlobalUnlock.argtypes = [ctypes.c_void_p]
    if not u.OpenClipboard(None):
        return ""
    try:
        h = u.GetClipboardData(CF_UNICODETEXT)
        if not h:
            return ""
        ptr = k.GlobalLock(h)
        if not ptr:
            return ""
        try:
            return ctypes.wstring_at(ptr)
        finally:
            k.GlobalUnlock(h)
    finally:
        u.CloseClipboard()

def plugin_index():
    def is_light(path):
        if path.lower().endswith(".esl"):
            return True
        with open(path, "rb") as f:
            head = f.read(24)
        return bool(struct.unpack_from("<I", head, 8)[0] & 0x200)
    order = ["Skyrim.esm", "Update.esm", "Dawnguard.esm", "HearthFires.esm", "Dragonborn.esm"]
    ccc = os.path.join(GAME, "Skyrim.ccc")
    if os.path.exists(ccc):
        order += [l.strip() for l in open(ccc, encoding="utf-8-sig") if l.strip()]
    prof = os.path.join(PROFILES_DIR, PROFILE, "plugins.txt") if PROFILES_DIR else ""
    if prof and os.path.exists(prof):
        for l in open(prof, encoding="utf-8-sig"):
            l = l.strip()
            if l.startswith("*") and l[1:] not in order:
                order.append(l[1:])
    idx = 0
    for name in order:
        p = os.path.join(GAME, "Data", name)
        if not os.path.exists(p):
            for m in os.listdir(MODS_DIR):
                cand = os.path.join(MODS_DIR, m, name)
                if os.path.exists(cand):
                    p = cand
                    break
        if not os.path.exists(p):
            continue
        if name == ESP_NAME:
            return idx
        if not is_light(p):
            idx += 1
    return idx

def load_store():
    if not os.path.exists(STORE):
        return []
    data = json.load(open(STORE, encoding="utf-8"))
    books = data if isinstance(data, list) else data.get("books", [])
    used = {b["num"] for b in books if "num" in b}
    nxt = 1
    for b in books:
        if "num" not in b:
            while nxt in used:
                nxt += 1
            b["num"] = nxt
            used.add(nxt)
    return books

def next_free(books):
    used = {b["num"] for b in books}
    n = 1
    while n in used:
        n += 1
    return n

def rebuild(books):
    books.sort(key=lambda b: b["num"])
    json.dump(books, open(STORE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    esp_books = [{
        "num": b["num"],
        "edid": "HieroBook%03d" % b["num"],
        "title": b["title"],
        # raw-книги (устаревшее) хранят готовую разметку — не пагинируем;
        # войнич — английский текст письмом рукописи;
        # остальные — единая смешанная пагинация (иероглифы + текст)
        "text": b["text"] if b.get("raw") else
                paginate_voynich(b["text"], b.get("size", 36), b.get("per_page", 600),
                                 b.get("script") == "voynich-hand")
                if str(b.get("script", "")).startswith("voynich") else
                paginate_mixed(b["text"], b.get("size", 36), b.get("per_page", 600)),
    } for b in books]
    # пары «папирус — перевод»: супруг(а) отдаёт вторую книгу через игровой час
    pairs = [{
        "num": b["num"],
        "edid": "HieroTrans%03d" % b["num"],
        "title": b["title"] + " — перевод",
        "text": paginate_mixed(to_text(b["translation"])[0], 26, suggested_pp_text(26)),
    } for b in books if (b.get("translation") or "").strip()]
    esp_quest.save_esp(os.path.join(MOD, ESP_NAME), esp_books, pairs)
    os.makedirs(os.path.join(MOD, "SEQ"), exist_ok=True)
    esp_quest.save_seq(os.path.join(MOD, "SEQ", ESP_NAME[:-4] + ".seq"))
    idx = plugin_index()
    for old in glob.glob(os.path.join(MOD, "book*.txt")):
        os.remove(old)
    with open(os.path.join(MOD, "books.txt"), "w", encoding="ascii") as f:
        for b in books:
            f.write("player.additem %02X%06X 1\n" % (idx, 0x800 + b["num"] - 1))
    for b in books:
        with open(os.path.join(MOD, "book%d.txt" % b["num"]), "w", encoding="ascii") as f:
            f.write("player.additem %02X%06X 1\n" % (idx, 0x800 + b["num"] - 1))
    return idx

# ---------- самоустановка всего комплекта ----------
def ensure_installed():
    """Разворачивает мод, шрифт Windows и включает мод в MO2. Возвращает список действий."""
    done = []
    res = resource_dir()

    # 1) файлы мода (шрифт для игры + конфиги)
    interface = os.path.join(MOD, "Interface")
    os.makedirs(interface, exist_ok=True)
    for fn in ("hiero_font.swf", "eva_font.swf", "fontconfig.txt", "fontconfig_ru.txt"):
        src = os.path.join(res, fn)
        dst = os.path.join(interface, fn)
        if not os.path.exists(dst):
            shutil.copy2(src, dst)
            done.append("мод: " + fn)
        elif fn.startswith("fontconfig"):
            # конфиг уже стоял со старой сборки — обновляем, если в нём
            # не перечислены все библиотеки шрифтов из комплекта
            need = [line.split('"')[1] for line
                    in open(src, encoding="utf-8", errors="replace")
                    if line.startswith("fontlib")]
            have = open(dst, encoding="utf-8", errors="replace").read()
            if any(lib not in have for lib in need):
                shutil.copy2(src, dst)
                done.append("мод: обновлён " + fn)

    # 2) плагин с книгами (+ книги комплекта: алфавит book0, каталог всех знаков)
    books = load_store()
    seed = os.path.join(res, "seed_books.json")
    added = []
    if os.path.exists(seed):
        have = {b.get("num") for b in books}
        for sb in json.load(open(seed, encoding="utf-8")):
            if sb["num"] not in have:
                books.append(sb)
                added.append("мод: книга «%s» (bat book%d)" % (sb["title"], sb["num"]))
    if added:
        rebuild(books)
        done += added
    elif not os.path.exists(os.path.join(MOD, ESP_NAME)):
        rebuild(books)
        done.append("мод: " + ESP_NAME)

    # 2б) скомпилированные Papyrus-скрипты квеста «Перевод папирусов»
    ssrc = os.path.join(res, "scripts")
    if os.path.isdir(ssrc):
        sdir = os.path.join(MOD, "Scripts")
        os.makedirs(sdir, exist_ok=True)
        for fn in os.listdir(ssrc):
            dst = os.path.join(sdir, fn)
            if not os.path.exists(dst):
                shutil.copy2(os.path.join(ssrc, fn), dst)
                done.append("мод: Scripts\\" + fn)

    # 2в) конфиг OpenRouter (ключ пользователь вписывает сам, в раздачу не входит)
    import hiero_translate
    if not os.path.exists(hiero_translate.CONFIG):
        hiero_translate.ensure_config()
        done.append("конфиг: openrouter.json — впишите api_key OpenRouter")

    # 3) шрифты Windows (для предпросмотра в Писце)
    fdir = os.path.join(os.environ["LOCALAPPDATA"], "Microsoft", "Windows", "Fonts")
    for fname, title in (("SkyrimHiero.ttf", "SkyrimHiero"),
                         ("EVA-Hand1.ttf", "EVA Hand 1"),
                         ("EVA2.ttf", "EVA2")):
        src = os.path.join(res, fname)
        fdst = os.path.join(fdir, fname)
        if os.path.exists(fdst) or not os.path.exists(src):
            continue
        os.makedirs(fdir, exist_ok=True)
        shutil.copy2(src, fdst)
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                            r"Software\Microsoft\Windows NT\CurrentVersion\Fonts",
                            0, winreg.KEY_SET_VALUE) as k:
            winreg.SetValueEx(k, "%s (TrueType)" % title, 0, winreg.REG_SZ, fdst)
        done.append("шрифт Windows: " + title)

    # 4) мод «Мир без вражды» (агрессия 0 всем NPC)
    peace_dir = os.path.join(MODS_DIR, PEACE_MOD_NAME) if PROFILES_DIR else MODS_DIR
    peace_src = os.path.join(res, "peace")
    if os.path.isdir(peace_src):
        os.makedirs(peace_dir, exist_ok=True)
        for esp in PEACE_ESPS:
            dst = os.path.join(peace_dir, esp)
            if not os.path.exists(dst):
                shutil.copy2(os.path.join(peace_src, esp), dst)
                done.append("мир: " + esp)

    # 5) включение в профиле MO2
    prof = os.path.join(PROFILES_DIR, PROFILE) if PROFILES_DIR else ""
    ml = os.path.join(prof, "modlist.txt") if prof else ""
    if ml and os.path.exists(ml):
        lines = open(ml, encoding="utf-8-sig").read().splitlines()
        changed = False
        for mod_name in (MOD_NAME, PEACE_MOD_NAME):
            if ("+" + mod_name) not in lines and ("-" + mod_name) not in lines:
                lines.insert(1, "+" + mod_name)
                changed = True
                done.append("MO2: мод «%s» включён" % mod_name)
        if changed:
            open(ml, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    pl = os.path.join(prof, "plugins.txt") if prof else ""
    if pl and os.path.exists(pl):
        content = open(pl, encoding="utf-8-sig", errors="replace").read()
        add = [e for e in [ESP_NAME] + PEACE_ESPS if e not in content]
        if add:
            # имена только латиницей — plugins.txt читается в ANSI
            with open(pl, "a", encoding="ascii") as f:
                for e in add:
                    f.write("*" + e + "\n")
            done.append("MO2: плагины включены (%d)" % len(add))
    return done
