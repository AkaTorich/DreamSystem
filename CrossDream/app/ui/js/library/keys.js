// Ключи трактовки берутся из самой книги «Ключи к трактовке»:
// строки «Название — пояснение», заголовки разделов оканчиваются двоеточием.
import { puaToUni, stripTags } from './seals.js';

// → [{label, clause, header}] ; первым — «без ключа»
export function keysFromBooks(books) {
  const out = [{ label: '— без ключа (прямой перевод) —', clause: '' }];
  const kb = (books || []).find(b => (b.title || '').toLowerCase().includes('ключи к трактовке'));
  if (!kb) return out;
  for (const raw of puaToUni(stripTags(kb.text)).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.endsWith(':')) {
      out.push({ label: '— ' + line.replace(/:+$/, '').trim() + ' —', clause: null, header: true });
      continue;
    }
    const dash = line.indexOf(' — ');
    if (dash <= 0) continue;
    out.push({ label: line.slice(0, dash).trim(), clause: line });
  }
  return out;
}
