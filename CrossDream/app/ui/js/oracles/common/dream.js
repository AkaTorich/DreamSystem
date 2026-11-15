// Что гадания берут из сна (как в старой карточке сна DreamMap):
// день сна — из Date, образ — место из разбора, иначе первый символ, иначе заголовок.

export function dreamDay(dream) {
  if (!dream || !dream.Date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dream.Date);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

export function dreamImage(dream) {
  if (!dream) return '';
  const a = dream.Analysis;
  if (a && a.Location && a.Location.trim()) return a.Location;
  if (a && Array.isArray(a.Symbols) && a.Symbols.length) return a.Symbols[0];
  return dream.Title || '';
}

// в шину может прийти сам сон или его Id — тогда сон ищется среди своих
export async function resolveDream(api, dream) {
  if (dream == null || typeof dream === 'object') return dream || null;
  try {
    const list = await api.invoke('dreams_list');
    return list.find(d => String(d.Id) === String(dream)) || null;
  } catch {
    return null;
  }
}
