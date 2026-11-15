# -*- coding: utf-8 -*-
"""Лёгкий установщик программы «Карта снов»: в пару кликов кладёт её
в %LOCALAPPDATA%\\DreamMap, ставит ярлыки на рабочий стол
и в меню Пуск (программа и её папка), предлагает запустить.
Данные пользователя (сны, книги, профили) не трогает — только файлы программы."""
import os, sys, shutil, subprocess
import tkinter as tk
from tkinter import messagebox

SILENT = "-s" in sys.argv
RES = sys._MEIPASS if getattr(sys, "frozen", False) else os.path.dirname(os.path.abspath(__file__))
APPDIR = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "DreamMap")


def install():
    src = os.path.join(RES, "dreammap")
    # закрыть запущенную копию, иначе файлы заняты
    for p in ("DreamMap.exe", "КартаСнов.exe"):
        subprocess.run(["taskkill", "/f", "/im", p],
                       creationflags=0x08000000, capture_output=True)
    # ЧИСТАЯ переустановка: сносим старые файлы программы целиком, чтобы не осталось
    # рассогласованного набора (exe одной сборки + dll другой). Данные пользователя
    # лежат отдельно в %APPDATA%\DreamMap и НЕ трогаются.
    if os.path.isdir(APPDIR):
        shutil.rmtree(APPDIR, ignore_errors=True)
    os.makedirs(APPDIR, exist_ok=True)
    for f in os.listdir(src):
        s = os.path.join(src, f)
        d = os.path.join(APPDIR, f)
        if os.path.isdir(s):
            shutil.copytree(s, d, dirs_exist_ok=True)
        else:
            shutil.copy2(s, d)
    exe = os.path.join(APPDIR, "DreamMap.exe")
    # Ярлыки: на рабочем столе (в т.ч. OneDrive) и в меню Пуск — своей папкой,
    # где лежит и сама программа, и вход в её папку с файлами.
    ps = ("$ws=New-Object -ComObject WScript.Shell;"
          "$dt=$ws.SpecialFolders('Desktop');"
          "$l=$ws.CreateShortcut(\"$dt\Карта снов.lnk\");"
          f"$l.TargetPath='{exe}';$l.WorkingDirectory='{APPDIR}';"
          f"$l.IconLocation='{exe}';$l.Description='Дневник снов';$l.Save();"
          "$pr=$ws.SpecialFolders('Programs');"
          "$dir=Join-Path $pr 'Карта снов';"
          "New-Item -ItemType Directory -Force -Path $dir | Out-Null;"
          "$a=$ws.CreateShortcut((Join-Path $dir 'Карта снов.lnk'));"
          f"$a.TargetPath='{exe}';$a.WorkingDirectory='{APPDIR}';"
          f"$a.IconLocation='{exe}';$a.Description='Дневник снов';$a.Save();"
          "$b=$ws.CreateShortcut((Join-Path $dir 'Папка программы.lnk'));"
          f"$b.TargetPath='{APPDIR}';$b.WorkingDirectory='{APPDIR}';"
          "$b.Description='Где лежат файлы программы';$b.Save()")
    subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                   creationflags=0x08000000)
    return exe


if __name__ == "__main__":
    try:
        exe = install()
        if SILENT:
            print("установлено:", exe)
        else:
            root = tk.Tk(); root.withdraw()
            run = messagebox.askyesno(
                "Карта снов установлена",
                "Программа «Карта снов» установлена.\n"
                "Ярлык — на рабочем столе.\n\nЗапустить сейчас?")
            root.destroy()
            if run:
                os.startfile(exe)
    except Exception as e:
        if SILENT:
            print("ОШИБКА:", e); sys.exit(1)
        root = tk.Tk(); root.withdraw()
        messagebox.showerror("Установка «Карты снов»", f"Не удалось установить:\n{e}")
        sys.exit(1)
