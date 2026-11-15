#!/usr/bin/env python3
"""Analyze a string of Unicode Egyptian hieroglyphs.

Usage: python analyze_signs.py <file-with-glyphs>
       python analyze_signs.py --text "𓀀𓀁..."   (may break on some shells)

Prints per-line sign inventory (Gardiner code, category theme, curated meaning)
and overall statistics with a plausibility verdict:
is this real Egyptian text or a random/decorative sign soup?
"""
import sys
import io
import unicodedata
from collections import Counter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

HIERO_RANGES = [(0x13000, 0x1342F), (0x13460, 0x143FF)]  # base block + Extended-A

CATEGORY_THEMES = {
    "A": "man, his occupations", "B": "woman", "C": "deities",
    "D": "parts of the human body", "E": "mammals", "F": "parts of mammals",
    "G": "birds", "H": "parts of birds", "I": "reptiles, amphibia",
    "K": "fish", "L": "invertebrates", "M": "trees and plants",
    "N": "sky, earth, water", "O": "buildings", "P": "ships",
    "Q": "furniture", "R": "temple furniture, emblems", "S": "crowns, dress, staves",
    "T": "warfare, hunting", "U": "agriculture, crafts", "V": "rope, baskets",
    "W": "vessels of stone and pottery", "X": "bread, loaves", "Y": "writing, games, music",
    "Z": "strokes, geometric figures", "AA": "unclassified",
    "NL": "nomes of Lower Egypt", "NU": "nomes of Upper Egypt",
}

# High-frequency signs that dominate any real Egyptian text
# (top phonograms, determinatives and strokes).
COMMON_SIGNS = {
    "N035": "n (water ripple)", "X001": "t (bread loaf)", "G017": "m (owl)",
    "D021": "r (mouth)", "M017": "i (reed leaf)", "G043": "w (quail chick)",
    "D036": "a / arm", "Q003": "p (stool)", "S029": "s (folded cloth)",
    "O034": "z (door bolt)", "V031": "k (basket)", "G001": "3 (vulture)",
    "D058": "b (foot)", "N029": "q (hill slope)", "I009": "f (horned viper)",
    "V028": "h (wick)", "O004": "h (shelter)", "F032": "kh (animal belly)",
    "Aa001": "kh (placenta?)", "N037": "sh (pool)", "D046": "d (hand)",
    "I010": "dj (cobra)", "V013": "tj (tethering rope)", "G038": "gb-goose",
    "Z001": "stroke determinative", "Z002": "plural strokes", "A001": "seated man",
    "B001": "seated woman", "G007": "falcon on standard", "M023": "swt sedge",
    "X008": "conical loaf (di, 'give')", "N005": "sun / day", "V030": "nb (basket, 'lord/all')",
    "R004": "htp (offering table)", "R008": "netjer (god)", "S034": "ankh (life)",
    "F035": "nefer (good/beautiful)", "N036": "canal", "D004": "ir (eye)",
    "G026": "ibis (Thoth)", "E023": "rw (lion, 'l')", "V004": "w3 (lasso)",
    "H008": "egg (fem. names det.)", "G039": "s3 (pintail duck)", "U007": "mr (hoe)",
}

# Curated notable signs worth anchoring a pseudo-translation to.
NOTABLE = {
    "V010": "cartouche (closed) 𓍷", "V011A": "cartouche opener 𓍹",
    "V011B": "cartouche closer 𓍺", "V011C": "cartouche closer variant 𓍻",
    "S034": "ankh — life", "U028": "djed? / fire-drill (wedja — prosper)",
    "S042": "was-sceptre — power", "I006": "km — 'black' (Kemet, Egypt)",
    "E014": "dog/jackal — Anubis", "E015": "recumbent jackal — Anubis",
    "G005": "falcon — Horus", "G026": "ibis — Thoth", "I003": "crocodile — Sobek",
    "D004": "eye — 'to do/make', Osiris in combos", "D040": "striking arm — force",
    "D044": "arm with sceptre", "A040": "seated god", "A041": "king with uraeus",
    "C010": "Maat with feather", "N005": "sun disc — Ra / day",
    "M009": "lotus flower", "M012": "lotus/1000 — kha", "K001": "tilapia fish",
    "P001": "boat on water", "P002": "ship under sail", "O001": "house — per",
    "O036": "wall", "O011": "palace", "R004": "offering table — hetep",
    "F034": "heart — ib", "D054": "walking legs — go/come", "D056": "leg",
    "E001": "bull — strength, 'mighty bull'", "F001": "ox head",
    "E017": "jackal", "G040": "flying duck — pa", "M004": "palm branch — year/renpet",
    "W022": "beer jug", "W001": "oil jar", "X002": "tall loaf",
    "S012": "gold collar — nebu, 'gold of honour'", "N035A": "three ripples — water",
    "A017": "child with hand to mouth", "B003": "woman giving birth",
    "E034": "desert hare — wn ('exist')", "G053": "ba-bird — soul",
}


# Uniliteral (alphabetic) signs: char -> transliteration. Used for phonetic
# salvage and for composing a plausible protagonist name from signs present.
UNILITERALS = {
    "𓄿": "a", "𓇋": "i", "𓏭": "y", "𓂝": "a'", "𓅱": "w", "𓏲": "w",
    "𓃀": "b", "𓊪": "p", "𓆑": "f", "𓅓": "m", "𓈖": "n", "𓂋": "r",
    "𓉔": "h", "𓎛": "h.", "𓐍": "kh", "𓄡": "kh", "𓋴": "s", "𓊃": "s",
    "𓈙": "sh", "𓈎": "q", "𓎡": "k", "𓎼": "g", "𓏏": "t", "𓍿": "tj",
    "𓂧": "d", "𓆓": "dj", "𓃭": "l", "𓍯": "wa",
}

# Egyptian numerals: char -> value. Weave exact quantities into the composed text.
NUMERALS = {
    "𓏺": 1, "𓎆": 10, "𓎇": 20, "𓎈": 30, "𓎉": 40, "𓎊": 50,
    "𓎋": 60, "𓎌": 70, "𓎍": 80, "𓎎": 90, "𓍢": 100,
    "𓆼": 1000, "𓂭": 10000, "𓆐": 100000, "𓁨": 1000000,
}

# Dialogue seals: a run of signs at the START of a line is a seal of the dialogue
# with Thoth (stamped by the user's Transmutator app). Thoth 𓁟 first = his answer;
# asker first = the question to him. Seals take precedence over single MODE_SIGNS,
# and are matched LONGEST-FIRST: the nine-sign hall of the Ogdoad also opens with 𓁟,
# so a shortest-first match would mistake it for a pair. See references/genres.md.
OGDOAD_SEAL = "𓁟𓈗𓇯𓁨𓆐𓇰𓇹𓁩𓆙"
DIALOGUE_SEALS = {
    OGDOAD_SEAL: "THE HALL OF THE OGDOAD (Thoth leads Tat through the corridors of "
                 "knowledge; the FIRST teacher-sign met in the line answers his "
                 "question — the eight are called TEACHERS, never gods)",
    "𓁟𓁐": "THOTH ANSWERS A WOMAN (dialogue seal: Thoth speaks, woman addressed)",
    "𓁟𓀀": "THOTH ANSWERS A MAN (dialogue seal: Thoth speaks, man addressed)",
    "𓁟𓅷": "THOTH ANSWERS TAT (dialogue seal: the rebirth discourse, CH XIII)",
    "𓁐𓁟": "A WOMAN ASKS THOTH (reversed seal: the asker faces Thoth)",
    "𓀀𓁟": "A MAN ASKS THOTH (reversed seal: the asker faces Thoth)",
    "𓅷𓁟": "TAT ASKS THOTH (reversed seal: the son pleads for the secret)",
    "𓁦𓀔": "TALES OF MAAT (seal without Thoth: the goddess of truth tells a child "
            "a parable; it closes at the scales)",
    "𓊨𓀔": "TALES OF ISIS (seal without Thoth: the mother tells the infant Horus "
            "a magic tale of the marshes)",
    "𓋹𓏛𓊅": "THE CHRONICLE OF MEMORY, SEAL OF THE HERIHEB (life, then the lector's "
              "roll and the tomb wall). The rest of the FIRST line is the name of the "
              "buried one, written letter by letter in the Transmutator's phonetic "
              "alphabet — decode it with references/phonetic_alphabet.md. Everything "
              "below is the chronicle SEALED by that name and laid down as signs by "
              "the Transmutator's cipher: not readable as letters. Answer in the voice "
              "of the lector priest — see genres.md §0d",
    "𓏛𓊅": "THE CHRONICLE OF MEMORY, SEAL OF THE HERIHEB (without the ankh — the same "
            "seal as 𓋹𓏛𓊅; see genres.md §0d)",
    "𓋹𓁟𓅷": "THE GREAT WORK (the ankh laid before Thoth the Architect, Tat the "
              "builder-son third: the answer is not a translation but a brief "
              "spec/ТЗ for a new esoteric program, in the alchemical key — see "
              "genres.md §0b)",
    "𓋹𓇼𓇯": "THE STARRY OMEN (the ankh laid beneath the star and the sky of Nut: "
              "the text is an astrological omen addressed to the asker, valid for "
              "an UNKNOWN time — never name the hour. Unfold it line by line into "
              "ONE allegorical story through the key of allegories — see "
              "genres.md §0e)",
}

# Seal lengths in signs, longest first — the order seals must be tried in.
SEAL_LENGTHS = sorted({len(s) for s in DIALOGUE_SEALS}, reverse=True)

# The eight teachers of Hermopolis, in the canonical order they sit in the hall
# of learning. The FIRST teacher-sign in the BODY of an Ogdoad-sealed line marks
# the teacher who answers; in the translation they are «учителя», never «боги».
OGDOAD_TEACHERS = {
    "𓈗": "Нун — учитель первозданных вод (the unformed source, beginnings)",
    "𓇯": "Наунет — учительница опрокинутого неба (the mirror: as above, so below)",
    "𓁨": "Хух — учитель бесконечности (duration without end, 'не ныне')",
    "𓆐": "Хаухет — учительница неисчислимого (multitude beyond counting)",
    "𓇰": "Кук — учитель тьмы прежде света (not-knowing as the womb of knowledge)",
    "𓇹": "Каукет — учительница луны во тьме (measures, seasons, the right hour)",
    "𓁩": "Амон — учитель сокрытого (the hidden name, the unseen cause)",
    "𓆙": "Амаунет — учительница сокрытого (the veil: what must not be uttered)",
}


def match_seal(chars):
    """Longest seal standing at the start of `chars`, or (0, None)."""
    for length in SEAL_LENGTHS:
        if len(chars) >= length:
            seal = "".join(chars[:length])
            if seal in DIALOGUE_SEALS:
                return length, seal
    return 0, None

# Mode signs: a sign at the START of a line switches that line's (or the whole
# text's) genre. See references/genres.md.
MODE_SIGNS = {
    "𓋹": "BLESSING (ankh — protective/well-wishing formula)",
    "𓄣": "LOVE SONG (heart — New Kingdom love poetry)",
    "𓏞": "LETTER (scribe's kit — administrative letter/report)",
    "𓇳": "HYMN (sun disc — solar hymn)",
    "𓀔": "TEACHING (child — sebayt, instruction of a father to his son)",
    "𓊹": "PROPHECY (netjer 'god' — oracle pronouncement / Neferti-style prophecy)",
    "𓅆": "PROPHECY (falcon on standard, divine determinative — same as netjer)",
    "𓅝": "THOTH TEACHING (ibis of Thoth — Book of Thoth, hermetic master-disciple dialogue)",
    "𓁟": "THOTH TEACHING (ibis-headed Thoth — same genre)",
    "𓃻": "THOTH TEACHING (baboon, Thoth's animal — same genre)",
    "𓅞": "THOTH TO HIS CHILDREN (plain ibis, G26A — Hermes/Thoth paternally instructing "
          "his son Tat / his children; warmer than the riddling Book of Thoth)",
    "𓅷": "THOTH TO TAT (duckling G47, reads *tja* 'nestling' — the MOST intimate register: "
          "the secret discourse on the second birth, CH XIII; sworn to silence)",
    "𓆣": "BOOK OF THE DEAD (scarab Khepri — rebirth spell, negative confession)",
    "𓀁": "TALE (man with hand to mouth, 'to tell' — Sinuhe-style adventure narrative)",
    "𓄹": "MEDICAL (piece of flesh — Ebers/Smith papyrus: examination, diagnosis, remedy)",
    "𓆫": "PROTECTIVE SPELL (scorpion — Metternich stela, anti-venom incantation)",
    "𓍝": "COURT PROTOCOL (scales — testimony, oaths, verdict of the tribunal)",
    "𓁀": "DREAM BOOK (man on bed — Chester Beatty III: 'if a man sees himself in a dream…')",
    "𓅽": "LAMENT (ba-bird — dialogue of a man with his soul, Ipuwer-style world-upside-down)",
    "𓏢": "HARPER'S SONG (harp — carpe diem song from the tombs)",
}

# Category-statistics genre hints when no mode sign is present.
GENRE_HINTS = [
    ("T", "victory annals / campaign report (warfare signs dominate)"),
    ("P", "expedition log / voyage narrative (ship signs dominate)"),
    ("N", "hymn to celestial gods (sky/earth/water signs dominate)"),
    ("W", "temple inventory / offering list (vessel signs dominate)"),
    ("X", "temple inventory / offering list (bread signs dominate)"),
    ("Y", "didactic instruction / sebayt (writing signs dominate)"),
    ("C", "oracle / prophecy (deity signs dominate)"),
]


def gardiner_code(ch: str):
    """Return e.g. 'A001', 'AA008', 'V011A' from the Unicode name, or None."""
    cp = ord(ch)
    if not any(lo <= cp <= hi for lo, hi in HIERO_RANGES):
        return None
    try:
        name = unicodedata.name(ch)
    except ValueError:
        return f"U+{cp:04X}"
    # 'EGYPTIAN HIEROGLYPH A001' / 'EGYPTIAN HIEROGLYPH AA008' / '... V011A'
    return name.replace("EGYPTIAN HIEROGLYPH ", "").replace(" ", "")


def category_of(code: str):
    # leading letters only ('A001' -> 'A', 'Aa008' -> 'AA')
    i = 0
    while i < len(code) and code[i].isalpha():
        i += 1
    return code[:i].upper()


def norm(code: str):
    """Normalize like 'Aa001' -> 'AA001' key handling."""
    return code.upper()


def analyze(text: str):
    lines = [ln for ln in text.splitlines() if any(gardiner_code(c) for c in ln)]
    if not lines:
        print("No Egyptian hieroglyphs found in input.")
        return

    all_codes = []
    common_lookup = {norm(k): v for k, v in COMMON_SIGNS.items()}
    notable_lookup = {norm(k): v for k, v in NOTABLE.items()}

    all_chars = []
    mode_lines = []
    for idx, ln in enumerate(lines, 1):
        codes = [(c, gardiner_code(c)) for c in ln if gardiner_code(c)]

        # The seal is stamped by the app, not written by the user: it is never an
        # anchor, and counting it would skew the plausibility statistics — badly so
        # for the nine-sign Ogdoad seal repeated on every line. Strip it first.
        seal_len, seal = match_seal([c for c, _ in codes])
        codes = codes[seal_len:]

        all_codes.extend(code for _, code in codes)
        all_chars.extend(c for c, _ in codes)
        print(f"\n=== Line {idx} ({len(codes)} signs"
              + (f", + {seal_len}-sign seal" if seal else "") + ") ===")
        if seal:
            print(f"  DIALOGUE SEAL at line start: {seal} -> {DIALOGUE_SEALS[seal]}")
            mode_lines.append((idx, DIALOGUE_SEALS[seal]))
            if seal == OGDOAD_SEAL:
                body = [c for c, _ in codes]
                first = next((i for i, c in enumerate(body)
                              if c in OGDOAD_TEACHERS), None)
                if first is not None:
                    if first > 0:
                        print(f"  CORRIDORS OF KNOWLEDGE ({first} sign(s) before the "
                              "teacher — Thoth leads Tat through them): "
                              + "".join(body[:first]))
                    teacher = body[first]
                    print(f"  TEACHER ANSWERING (the first met in the hall): "
                          f"{teacher}  {OGDOAD_TEACHERS[teacher]}")
                    silent = [c for c in dict.fromkeys(body[first + 1:])
                              if c in OGDOAD_TEACHERS and c != teacher]
                    if silent:
                        print("  Present but silent (deeper in the line, glimmer "
                              "without voice): " + " ".join(silent))
                else:
                    print("  TEACHER ANSWERING: none met — the corridors end in "
                          "the dark empty hall; the eight answer in unison, one "
                          "short heavy voice out of the silence")
        elif codes and codes[0][0] in MODE_SIGNS:
            print(f"  MODE SIGN at line start: {codes[0][0]} -> {MODE_SIGNS[codes[0][0]]}")
            mode_lines.append((idx, MODE_SIGNS[codes[0][0]]))
        for ch, code in codes:
            cat = category_of(code)
            theme = CATEGORY_THEMES.get(cat, "?")
            extra = []
            if ch in UNILITERALS:
                extra.append("PHONO: " + UNILITERALS[ch])
            if ch in NUMERALS:
                extra.append(f"NUMERAL: {NUMERALS[ch]}")
            if norm(code) in common_lookup:
                extra.append("COMMON: " + common_lookup[norm(code)])
            if norm(code) in notable_lookup:
                extra.append("NOTABLE: " + notable_lookup[norm(code)])
            extra_s = ("  [" + "; ".join(extra) + "]") if extra else ""
            print(f"  {ch}  {code:<7} {theme}{extra_s}")
        # Phonetic skeleton: uniliterals as letters, everything else as a dot.
        skeleton = " ".join(UNILITERALS.get(c, "·") for c, _ in codes)
        if any(c in UNILITERALS for c, _ in codes):
            print(f"  Phonetic skeleton: {skeleton}")
        nums = [(c, NUMERALS[c]) for c, _ in codes if c in NUMERALS]
        if nums:
            print("  Numerals in line: " + ", ".join(f"{c}={v}" for c, v in nums))

    total = len(all_codes)
    counts = Counter(norm(c) for c in all_codes)
    common_hits = sum(v for k, v in counts.items() if k in common_lookup)
    common_ratio = common_hits / total
    unique_ratio = len(counts) / total
    cats = Counter(category_of(c) for c in all_codes)

    print("\n=== Statistics ===")
    print(f"Total signs: {total}, unique: {len(counts)} (unique ratio {unique_ratio:.2f})")
    print(f"Common-phonogram share: {common_ratio:.1%} "
          f"(real Egyptian prose is typically 40-70%; random strings ~2-6%)")
    print(f"Category spread: {len(cats)} categories: "
          + ", ".join(f"{k}:{v}" for k, v in cats.most_common()))
    cartouche = sum(counts.get(k, 0) for k in ("V010", "V011A", "V011B", "V011C"))
    if cartouche:
        print(f"Cartouche signs present: {cartouche} — check for a royal name!")

    print("\n=== Composition material ===")
    unis = sorted({UNILITERALS[c] for c in all_chars if c in UNILITERALS})
    if unis:
        print(f"Uniliteral letters present (for naming the protagonist): {', '.join(unis)}")
    else:
        print("No uniliteral signs — invent no names, use titles ('почтенный', 'писец').")
    total_nums = [(c, NUMERALS[c]) for c in all_chars if c in NUMERALS]
    if total_nums:
        print("Numerals present (use these EXACT values in offering lists): "
              + ", ".join(f"{c}={v}" for c, v in total_nums))
    if mode_lines:
        for idx, mode in mode_lines:
            print(f"Genre override from mode sign (line {idx}): {mode}")
    else:
        top_cat = cats.most_common(1)[0][0] if cats else ""
        hint = next((g for c, g in GENRE_HINTS if c == top_cat), None)
        if hint:
            print(f"Genre suggestion from statistics: {hint}")
        else:
            print("Genre suggestion: classic stela biography (no dominant category).")

    print("\n=== Verdict ===")
    if total <= 8:
        print("Very short string — statistics unreliable. Judge by formulae/names "
              "(see references/reading_real_text.md).")
    elif common_ratio >= 0.35 and unique_ratio < 0.75:
        print("PLAUSIBLY REAL Egyptian text: common phonograms dominate and signs repeat. "
              "Attempt an honest reading.")
    elif common_ratio >= 0.15:
        print("AMBIGUOUS: some real-text features. Look for formulae before deciding.")
    else:
        print("ALMOST CERTAINLY RANDOM/decorative: signs sampled across the whole "
              "catalogue, few common phonograms, little repetition. "
              "Not readable Egyptian -> honest disclaimer + stela-style pseudo-translation.")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--text":
        analyze(" ".join(sys.argv[2:]))
    elif len(sys.argv) == 2:
        with open(sys.argv[1], encoding="utf-8") as f:
            analyze(f.read())
    else:
        print(__doc__)
        sys.exit(1)
