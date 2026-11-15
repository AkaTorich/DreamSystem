// Текст книг иероглифов: шрифт Писца (PUA) → юникод, теги прочь, печати скилла скрыты.
// Печати в читальне НЕ показываются (в books.json и на сайте остаются — оракул их видит):
// зал Огдоады, тройные печати, пары, одиночный жанровый знак на первой строке, блок перстня 𓀀𓊽…𓊽𓀀.

const CP = (...cps) => String.fromCodePoint(...cps);

const SIG_START = CP(0x13000, 0x132BD);
const SIG_END = CP(0x132BD, 0x13000);
const SEAL_HALL = CP(0x1305F, 0x13217, 0x131EF, 0x13068, 0x13190, 0x131F0, 0x131F9, 0x13069, 0x13199);
const SEALS3 = [
  CP(0x132F9, 0x1305F, 0x13177),   // Великое Делание
  CP(0x132F9, 0x133DB, 0x13285),   // хроника Кереса
  CP(0x132F9, 0x131FC, 0x131EF),   // звёздное знамение
];
const SEALS2 = [
  CP(0x1305F, 0x13050), CP(0x1305F, 0x13000), CP(0x1305F, 0x13177),
  CP(0x13050, 0x1305F), CP(0x13000, 0x1305F), CP(0x13177, 0x1305F),
  CP(0x13066, 0x13014), CP(0x132A8, 0x13014), CP(0x133DB, 0x13285),
];
const SEALS1 = [
  0x132F9, 0x13123, 0x133DE, 0x131F3, 0x13014, 0x132B9, 0x13146, 0x1315D, 0x1305F, 0x130FB,
  0x1315E, 0x13177, 0x131A3, 0x13001, 0x13139, 0x131AB, 0x1335D, 0x13040, 0x1317D, 0x133E2,
].map(c => CP(c));

export function puaToUni(s) {
  return (s || '').replace(/[-]/g, c => CP(0x13000 + c.charCodeAt(0) - 0xE000));
}

export function stripTags(s) {
  return (s || '').replace(/<[^>]+>/g, '');
}

// печать в записи шрифта Писца
function puaForm(uniSeal) {
  return [...uniSeal].map(ch => String.fromCharCode(0xE000 + ch.codePointAt(0) - 0x13000)).join('');
}

export function stripSeals(t) {
  if (!t) return t || '';
  let i;
  while ((i = t.indexOf(SIG_START)) >= 0) {
    const j = t.indexOf(SIG_END, i + SIG_START.length);
    if (j < 0) break;
    t = t.slice(0, i) + t.slice(j + SIG_END.length);
  }
  const out = [];
  t.split('\n').forEach((line, li) => {
    const lt = line.trimStart();
    let cut = lt.startsWith(SEAL_HALL) ? SEAL_HALL : null;
    if (!cut) cut = SEALS3.find(s => lt.startsWith(s)) || null;
    if (!cut) cut = SEALS2.find(s => lt.startsWith(s)) || null;
    if (cut) { out.push(lt.slice(cut.length).trimStart()); return; }
    if (li === 0 && SEALS1.includes(lt.trim())) return;   // первая строка — одинокая жанровая печать
    out.push(line);
  });
  return out.join('\n');
}

// печать с первой строки (юникод или PUA): {seal, stripped}; seal = '' — печати нет
export function extractLeadingSeal(text) {
  const res = { seal: '', stripped: text || '' };
  if (!text) return res;
  const lines = text.split('\n');
  const first = lines[0].trimStart();
  for (const s of [SEAL_HALL, ...SEALS3, ...SEALS2]) {
    for (const form of [s, puaForm(s)]) {
      if (!first.startsWith(form)) continue;
      const rest = first.slice(form.length).trimStart();
      const lo = lines.slice();
      if (rest === '') lo.shift(); else lo[0] = rest;
      return { seal: s, stripped: lo.join('\n') };
    }
  }
  for (const s of SEALS1) {
    for (const form of [s, puaForm(s)]) {
      if (first.trim() !== form) continue;
      return { seal: s, stripped: lines.slice(1).join('\n') };
    }
  }
  return res;
}

// после доставки печатей на сайт местные тексты чистятся; true — что-то поменялось
export function stripLocalSeals(books) {
  let changed = false;
  for (const b of books || []) {
    const r = extractLeadingSeal(b.text || '');
    if (r.seal) { b.text = r.stripped; changed = true; }
  }
  return changed;
}

// текст читальни: иероглифы — отдельными кусками (крупнее), остальное как есть
export function hieroRuns(body) {
  const re = /[\u{13000}-\u{1342F}]+|[^\u{13000}-\u{1342F}]+/gu;
  return (body.match(re) || []).map(v => ({ text: v, hiero: /^[\u{13000}-\u{1342F}]/u.test(v) }));
}
