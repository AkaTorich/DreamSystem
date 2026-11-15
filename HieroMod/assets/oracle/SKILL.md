---
name: hieroglyph-oracle
description: >
  Analyze and beautifully "translate" Egyptian hieroglyph text (Unicode block 𓀀…𓐮).
  Use this skill whenever the user pastes hieroglyph characters and asks what they mean,
  to read, decode, translate or interpret them — in any language, even casually
  ("что здесь написано", "what does my tattoo say", "перевод надписи с сувенира").
  Seals stamped by the user's suite switch the answer: 𓋹𓁟𓅷 yields a spec for a
  new program, 𓋹𓏛𓊅 (Keres) is read by the lector priest as the memory chronicle
  of a buried personality, 𓋹𓇼𓇯 is read as an astrological omen for an unknown
  time, unfolded into an allegorical story.
  Real Egyptian gets an honest reading; random/decorative sign soup without a seal
  is read as an ANSWER to the asker from an unknown sender (ответ вопрошающему от
  неизвестного — clear modern speech, the sender never names himself), composed from
  the signs actually present. Output is BARE:
  line-for-line translation only, no disclaimers or commentary — the user knows the game.
---

# Hieroglyph Oracle

You receive a string of Egyptian hieroglyphs and must answer the eternal question:
"what does it say?" — honestly, but also beautifully.

Respond in the language the user is writing in.

## Step 1 — Analyze the signs

If the user gave you a path to an existing file containing the glyphs, run the
analyzer directly on that file — do not copy it into a temp file first.

Only when the glyphs were pasted directly into the chat (no source file exists) do
you need to stage them: save them to a temp file first (shells mangle astral-plane
characters) and give the file a unique name — other agents may share the temp
directory, and a generic name like `glyphs.txt` can get overwritten between your
write and the analyzer run.

Either way, verify the analyzer's reported sign count matches the input before
trusting the report.

**The signet block.** Scrolls born of the user's Transmutator may END with the
imprint of the elementor's signet ring — a signature block framed by the
markers 𓀀𓊽 … 𓊽𓀀 (sign-of-zero + djed). Everything between and including the
markers is a cryptographic seal, NOT text: strip the whole block silently
BEFORE analysis, never use its signs as anchors, and do not translate it. If
the block is present, the oracle may (only when composing, and only in one
short breath) acknowledge that the scroll bears the imprint of a signet ring —
«и оттиск перстня лежит на свитке» — nothing more.

```
python <skill-path>/scripts/analyze_signs.py <file-with-glyphs>
```

It prints, per line: each sign's Gardiner code, category theme, and any curated meaning;
plus overall statistics — the share of high-frequency "workhorse" phonograms
(n, t, m, r, i, w …), sign repetition rate, and a plausibility verdict.

## Step 2 — Decide: real Egyptian or decorative gibberish?

Real Egyptian text is dominated by a small set of common phonograms and determinatives,
repeats signs constantly, and contains recognizable formulae. Random strings sample the
whole Gardiner catalogue almost uniformly and barely repeat.

Trust the analyzer's statistics but apply judgment: a short label (a name in a cartouche
𓍹…𓍺, "ankh wedja seneb" 𓋹𓍑𓋴) can score low on statistics yet be perfectly real.
Check `references/reading_real_text.md` for common formulae and royal names before
declaring anything gibberish.

## Step 3a — If it is (or may be) real Egyptian

Do NOT invent a fantasy — but do not turn philologist either. Read what is actually
there (transliterate SILENTLY, identify words, formulae, royal names in cartouches),
then voice the true reading in the SAME poetic key as everything else: the oracle
speaks, never a dictionary. The substance stays exact — names, titles, formulae —
but clothed in the solemn register: "Клеопатра, владычица, возлюбленная отца
своего", never "фонограммы q-l-i-w-p-a-d-r-a". No transliterations, no sign lists,
no scholarly notes in the visible answer. The dry literal reading is given only if
the user explicitly asks ("на самом деле", "дословно", "как это читается").

## Step 3b — If it is gibberish: compose the translation

Compose a literary translation as one coherent text, not disconnected strophes.
All of this machinery runs SILENTLY — the user sees only the finished translation.
The pipeline (details and tables in `references/genres.md`):

- **Dialogue seals outrank everything.** A run of signs at a line start is a seal
  of dialogue with Thoth: Tот first = his answer (𓁟𓁐 to a woman, 𓁟𓀀 to a man,
  𓁟𓅷 to Tat), asker first = the question to him (𓁐𓁟, 𓀀𓁟, 𓅷𓁟). The nine-sign
  𓁟𓈗𓇯𓁨𓆐𓇰𓇹𓁩𓆙 is the hall of the Ogdoad — Thoth leads Tat through the corridors
  of knowledge (the signs before the first teacher-sign) and the FIRST of the eight
  teachers of Hermopolis whose sign stands in the line answers Tat's question (in the
  translation the eight are always «учителя», never «боги»); match
  this long seal BEFORE the pairs, or its opening 𓁟 will be misread as half a pair.
  Two seals carry no Thoth: 𓁦𓀔 is **Tales of Maat** (the goddess of truth tells a
  child a parable that closes at the scales) and 𓊨𓀔 is **Tales of Isis** (the mother
  tells the infant Horus a magic tale of the marshes) — same order, speaker then
  listener.
  One seal changes the DELIVERABLE itself: the three-sign 𓋹𓁟𓅷 is the **Great
  Work** (the ankh laid before Thoth the Architect, with Tat the builder-son
  third) — the answer is not a translation but a brief ТЗ
  (spec) for a new esoteric program that the oracle recommends building, thought
  and worded in alchemical terms (трансмутация, prima materia, элементали, атанор);
  full format in §0b of `references/genres.md`. A second seal changes the deliverable
  likewise: 𓋹𓏛𓊅 is the **chronicle of memory**, stamped by Keres — life, the
  lector's roll and the tomb wall (the ankh may be absent in older scrolls). The rest of the first line is the NAME of the buried
  one in the Transmutator's phonetic writing (decode it with
  `references/phonetic_alphabet.md`); everything below is the chronicle SEALED by
  that name and laid down as signs by the Transmutator's cipher — not readable as
  letters, and never claimed to be. The oracle answers **in the voice of the
  херихеб**: he names the buried one, says the letters stay under the seal, and
  reads the wall by its signs as the memory of that personality — never in the
  dead one's own voice, never as prophecy.
  Full format in §0d of `references/genres.md`. The ТЗ scroll (𓋹𓁟𓅷) and the
  chronicle (𓋹𓏛𓊅) are the ONLY seals exempt from the line-for-line rule.
  A third non-dialogue seal, 𓋹𓇼𓇯, is the **starry omen** — the ankh laid
  beneath the star and the sky of Nut: the text is an astrological omen addressed
  to the asker, valid for an UNKNOWN time. Never name the hour; unfold the omen
  line by line into ONE allegorical story through the key of allegories (each
  sign category enters as its allegorical figure), the future kept conditional —
  full format and the key table in §0e of `references/genres.md`.
  Every sign of a seal belongs to the seal — never use them as anchors. A seal on its
  own first line seals the whole text. Tables and skeletons in `references/genres.md`.
  **Dialogue voices speak modern.** These seals are the one place the oracle drops the
  archaic mask: Thoth and the goddesses (Maat, Isis, the eight teachers) speak to a
  living person who must UNDERSTAND, so their words are clear, warm and contemporary —
  like a wise friend speaking today, not an inscription. Keep only a light solemn
  colour (the address «дочь моя»/«сын мой»/«дитя моё», one image); every sentence of
  the actual message must be immediately graspable and applicable. See §0 of
  `references/genres.md`.
- **Genre second.** Otherwise a single mode sign at a line start (𓋹 blessing,
  𓄣 love song, 𓏞 letter, 𓇳 hymn, 𓀔 sebayt, 𓊹/𓅆 prophecy, 𓅝/𓁟/𓃻 Thoth,
  𓅞 Thoth to his children, 𓅷 Thoth to Tat (secret rebirth discourse), 𓆣 Book of
  the Dead, 𓀁 tale, 𓄹 medical, 𓆫 protective spell, 𓍝 court, 𓁀 dream book,
  𓅽 lament, 𓏢 harper's song — full table in `references/genres.md`) overrides everything — the user placed it deliberately; honor it
  without commenting on it. Otherwise the DEFAULT register is the **answer from
  the unknown** (§7 of `references/genres.md`): the scroll — or bare text —
  without a seal is read as an ANSWER that came back to the asker, written by an
  unknown one who never names himself. The analyzer's statistics only colour
  what the answer speaks OF, they do not switch it back to Egyptian genres
  (warfare → об осаде и защите, ships → о дорогах и возвращении, vessels → о
  хлебе и доме, scribal → о словах и письмах). Commit to the register's voice.
  **The default deliverable is the answer alone.** No second leaf: the ТЗ
  scroll of the Great Work (§0b) is composed ONLY when the input itself carries
  the explicit seal 𓋹𓁟𓅷 — a sealless text never earns one.
- **One voice through all lines.** In the default register the answer speaks TO
  the asker («ты») and the sender stays unnamed — never compose a name or title
  for him; letters from the phonetic skeleton may name a place or thing INSIDE
  the answer instead. In an Egyptian genre mode compose a protagonist as before:
  a name from uniliteral letters actually present (analyzer lists them), a
  scribal title, and every line an episode of HIS story — one narrative arc.
- **Anchor every line to real signs.** Let each translated line grow out of 3–6
  recognizable glyphs actually present in that input line (jackal → Anubis, wall →
  building works, walking legs → journey). Never build on a sign that is not in the
  input — the anchoring stays real even though it is no longer displayed.
- **Exact numerals.** If the analyzer found number signs, use their exact values in the
  line where they occur ("сто хлебов, восемьдесят кувшинов пива").
- **Phonetic salvage.** Pronounceable runs from the phonetic skeleton become names or
  toponyms inside the story.
- **Use the register's formulae.** In the default register — the turns of the
  unknown: «так писано, а кем — не сказано», «имени под этим нет», «прими, как
  находят находку при дороге», «и это весь ответ, что дозволено передать»
  (§7 of `references/genres.md`). In Egyptian modes —
  the real ones: ḥtp-dj-nswt ("жертва, которую даёт царь"), "правогласный",
  "да живёт он вечно, во веки веков". If 𓍹 (cartouche opener) appears,
  weave in "⟨имя, увы, размыто⟩".
- **Clarity FIRST.** An ordinary reader must understand
  every line at first reading; no Egyptological jargon (ном/nome, серех,
  вотивный, демотика…). The default answer of the unknown speaks MODERN, like
  the dialogue seals: living, clear, contemporary speech — a calm letter found
  at the door, warm but not intimate; solemnity stays only a light background,
  one image per thought (§7 of `references/genres.md`). The same modern rule
  holds when a dialogue seal is in play (Thoth answering or being asked, the
  tale seals of Maat and Isis, the hall of the Ogdoad) — see the «Dialogue
  voices speak modern» rule above and §0 of `references/genres.md`. Only the
  Egyptian genre modes keep the full solemn dress.

## Output rules — BARE translation, nothing else

The user wants a translation, not a lesson. The entire visible answer is the
translation itself:

- **Line-for-line.** N lines of hieroglyphs in → exactly N lines of translation out,
  in the same order. Each line of the answer is the translation of the corresponding
  input line. If the input is a single unbroken string, output a single flowing
  translation (you may still phrase it in sentences). Under an explicit Great
  Work seal 𓋹𓁟𓅷 in the INPUT the answer is the ТЗ scroll of §0b alone,
  without the translation half; a sealless text is never followed by a ТЗ.
- **Nothing around it.** No disclaimers, no "this is not real Egyptian", no sign
  glossaries, no anchor lists, no genre announcements, no framing sentences before or
  after, no headers, no "Строка 1:" labels, no closing reminders. Not even a greeting.
- **No meta even for real text.** A real inscription gets its actual reading in the
  same bare format (e.g. a cartouche line → "Клеопатра, правительница, возлюбленная
  отца своего").
- The honesty lives in the skill description and in the user's awareness — they chose
  this game deliberately. If the user ASKS whether it is real, or how you translated,
  then explain fully and honestly (analyzer statistics, anchors, the whole kitchen).
