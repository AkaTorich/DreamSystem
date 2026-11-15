# -*- coding: utf-8 -*-
"""Перевод иероглифических книг на русский через OpenRouter API.

Ритуал повторяет скил hieroglyph-oracle: анализ знаков локальным скриптом,
затем модель составляет ГОЛЫЙ построчный перевод (без пояснений).
Ключ и модель — в openrouter.json рядом с books.json (в раздачу не входит).
"""
import os, sys, io, json, urllib.request, importlib.util

import hiero_core

CONFIG = os.path.join(hiero_core.MOD, "openrouter.json")
DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"
PUA_LO = 0xE000
PUA_SPAN = hiero_core.HIERO_TOP - hiero_core.HIERO_BASE  # 0x42E

def ensure_config():
    if not os.path.exists(CONFIG):
        os.makedirs(os.path.dirname(CONFIG), exist_ok=True)
        json.dump({"api_key": "", "model": DEFAULT_MODEL, "skill_dir": ""},
                  open(CONFIG, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return CONFIG

def load_config():
    ensure_config()
    return json.load(open(CONFIG, encoding="utf-8"))

def _skill_dir(cfg):
    cands = [cfg.get("skill_dir", ""),
             os.path.join(hiero_core.resource_dir(), "oracle")]
    for d in cands:
        if d and os.path.exists(os.path.join(d, "SKILL.md")):
            return d
    return None

def to_hiero(pua_text):
    """PUA игры -> настоящие кодпойнты U+13000+ (текст оставляем как есть)."""
    out = []
    for ch in pua_text:
        cp = ord(ch)
        if PUA_LO <= cp <= PUA_LO + PUA_SPAN:
            out.append(chr(hiero_core.HIERO_BASE + cp - PUA_LO))
        else:
            out.append(ch)
    return "".join(out)

def _analyze(skill, glyphs):
    """Отчёт анализатора знаков; при любой ошибке — пустая строка.
    Импортируем скрипт напрямую (работает и в замороженном exe, где нет python).
    Скрипт печатает в sys.stdout и на входе оборачивает sys.stdout.buffer —
    подставляем свой буфер (в GUI-режиме stdout может быть вовсе None)."""
    script = os.path.join(skill, "scripts", "analyze_signs.py")
    if not os.path.exists(script):
        return ""
    class _Raw(io.BytesIO):
        def close(self):        # скрипт пересоздаёт обёртку stdout; старая при
            pass                # сборке мусора закрыла бы наш буфер — запрещаем
    old = sys.stdout
    raw = _Raw()
    wrapper = io.TextIOWrapper(raw, encoding="utf-8")
    sys.stdout = wrapper
    try:
        spec = importlib.util.spec_from_file_location("hb_analyze_signs", script)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        mod.analyze(glyphs)
        sys.stdout.flush()
        return raw.getvalue().decode("utf-8", "replace")
    except Exception:
        return ""
    finally:
        sys.stdout = old

def _system_prompt(skill):
    parts = []
    for fn in ("SKILL.md", os.path.join("references", "genres.md"),
               os.path.join("references", "phonetic_alphabet.md"),
               os.path.join("references", "reading_real_text.md"),
               os.path.join("references", "stela_formulas.md")):
        p = os.path.join(skill, fn)
        if os.path.exists(p):
            parts.append("### %s\n%s" % (fn, open(p, encoding="utf-8").read()))
    parts.append(
        "### Роль\nТы — оракул из скила выше; следуй ЕГО правилам во всём: "
        "печати (включая ТЗ-свиток и хронику памяти), блок перстня, "
        "фонетический алфавит Трансмутатора для имён, жанровые режимы, "
        "правило «голый ответ». Шаг 1 (анализатор) выполнен за тебя — отчёт "
        "приложен к сообщению; сверь число знаков сам. Видимый ответ — только "
        "то, что разрешает скил: перевод по-русски, без приветствий, "
        "пояснений и оговорок.")
    return "\n\n".join(parts)

def translate(pua_text, title=""):
    """Возвращает русский перевод текста книги (может занять минуты)."""
    cfg = load_config()
    key = (cfg.get("api_key") or "").strip()
    if not key:
        raise RuntimeError("В %s не указан api_key OpenRouter" % CONFIG)
    skill = _skill_dir(cfg)
    if not skill:
        raise RuntimeError("Не найден скил hieroglyph-oracle (skill_dir в конфиге)")

    glyphs = to_hiero(pua_text)
    report = _analyze(skill, glyphs)
    user = "Свиток «%s»:\n\n%s" % (title or "Папирус", glyphs)
    if report:
        user += "\n\n### Отчёт анализатора знаков\n" + report

    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps({
            "model": cfg.get("model") or DEFAULT_MODEL,
            "messages": [{"role": "system", "content": _system_prompt(skill)},
                         {"role": "user", "content": user}],
        }).encode("utf-8"),
        headers={"Authorization": "Bearer " + key,
                 "Content-Type": "application/json",
                 "X-Title": "HieroBooks"})
    with urllib.request.urlopen(req, timeout=600) as resp:
        data = json.load(resp)
    try:
        return data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError):
        raise RuntimeError("Неожиданный ответ OpenRouter: %s" % str(data)[:300])
