// Правки одного сна на сайте: текст и разбор (edit_dream), картина (set_image), новый сон (import).
import * as http from './http.js';
import { C, imgUrl, imageCleared, markStale } from './dreams-cache.js';
import { randName, imageExt, imageMime, jx } from './util.js';

// edit_dream: сайт сейчас берёт title, text, summary, location. Остальное (дата, списки разбора,
// образ картины) шлётся тоже — сайт, научившись, сохранит; пока он это молча пропускает.
export async function editDream(sid, d) {
  const a = d.Analysis || {};
  await http.postJson('edit_dream', {
    id: sid, title: d.Title, text: d.Text, summary: a.Summary || '', location: a.Location || '',
    date: d.Date, characters: a.Characters || [], emotions: a.Emotions || [], symbols: a.Symbols || [],
    motifs: a.Motifs || [], image_prompt: d.ImagePrompt || '',
  });
}

// своя картина сну на сайте (с заменой прежней); ответ — имя файла на сайте
export async function setImage(lid, sid, bytes) {
  const name = randName(imageExt(bytes));
  const r = await http.upload('set_image', [{ field: 'image', name, data: bytes, mime: imageMime(name) }],
    { id: String(sid), replace: '1' });
  const site = jx.str(r, 'image_file') || name;
  imageCleared.delete(lid);
  C.siteImg.set(lid, site);
  markStale();
  return site;
}

// картина другого сна (по имени на сайте) — копией этому сну; ответ — новое имя на сайте
export async function copyImage(lid, sid, name) {
  const blob = await http.download(imgUrl(name));
  return setImage(lid, sid, new Uint8Array(await blob.arrayBuffer()));
}

// новый сон — на сайт тем же import, каким его шлёт синхронизация ядра (с ext_id = своим Id)
export async function importDream(d) {
  const json = new Blob([JSON.stringify([d])], { type: 'application/json' });
  const r = await http.upload('import', [{ field: 'dreams', name: 'dreams.json', data: json }], {});
  markStale();
  return r;
}
