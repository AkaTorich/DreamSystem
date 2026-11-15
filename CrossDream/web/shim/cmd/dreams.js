// Сны: список, запись, удаление, картина и её миниатюра — как app\src\commands\dreams.rs,
// только хранилище — сайт. Разбор ИИ — pipeline.js.
import * as http from '../lib/http.js';
import { requireLogin, isAuthError } from '../lib/session.js';
import * as cache from '../lib/dreams-cache.js';
import { linkByLocation, relinkLocation, commitLinks } from '../lib/dream-links.js';
import { editDream, setImage, copyImage, importDream } from '../lib/dream-site.js';
import { dreamsChanged } from '../lib/events.js';
import { shortLoc, today, newDreamId, clone, b64ToBytes, dreamLocation } from '../lib/util.js';

const RECENT = 10000;   // правке довольно ответа сайта не старше 10 с (после своих правок он свежий)

// сон из интерфейса → полная форма, как её принимает ядро
function shape(x) {
  const d = clone(x || {});
  const a = d.Analysis && typeof d.Analysis === 'object' ? d.Analysis : null;
  const list = v => (Array.isArray(v) ? v.map(String) : []);
  return {
    Id: String(d.Id ?? '').trim(),
    Title: String(d.Title ?? '').trim(),
    Date: String(d.Date ?? '').trim(),
    Text: String(d.Text ?? '').trim(),
    Analysis: a ? { ...a, Summary: String(a.Summary ?? ''), Location: String(a.Location ?? ''),
      Characters: list(a.Characters), Emotions: list(a.Emotions), Symbols: list(a.Symbols), Motifs: list(a.Motifs) } : null,
    ImagePrompt: String(d.ImagePrompt ?? ''),
    ImageFile: String(d.ImageFile ?? ''),
    Links: (Array.isArray(d.Links) ? d.Links : []).filter(l => l && l.Id)
      .map(l => ({ Id: String(l.Id), Type: String(l.Type ?? ''), Reason: String(l.Reason ?? '') })),
    PosX: d.PosX ?? null, PosY: d.PosY ?? null, PosZ: d.PosZ ?? null, PosTime: d.PosTime ?? null,
  };
}

async function dreams_list() {
  try { await cache.load(0); } catch (e) { if (isAuthError(e)) return []; throw e; }
  return cache.listCopy();
}

// картина в записи сменилась на картину другого сна — та же картина копией на сайт
async function followImage(saved, sid) {
  const site = cache.C.siteImg.get(saved.Id) || '';
  if (!saved.ImageFile) {
    if (site) cache.imageCleared.add(saved.Id);   // сайт стереть не умеет — ждём новую
    return;
  }
  if (saved.ImageFile === site) return;
  try { saved.ImageFile = await copyImage(saved.Id, sid, saved.ImageFile); }
  catch { saved.ImageFile = site; }   // такой картины на сайте нет
}

// записать сон: новый получает Id и уходит на сайт; у прежнего места на карте не трогаются
async function dream_save({ dream }) {
  requireLogin();
  const d = shape(dream);
  if (!d.Text) throw new Error('Запись не может быть пустой');
  if (!d.Title) d.Title = 'Сон без имени';
  if (!d.Date) d.Date = today();
  if (d.Analysis) d.Analysis.Location = shortLoc(d.Analysis.Location);
  if (!d.Id) d.Id = newDreamId();
  await cache.load(RECENT);
  const before = cache.listCopy();
  const v = clone(before);
  const i = v.findIndex(x => x.Id === d.Id);

  if (i >= 0) {   // прежний сон
    const x = v[i];
    const locChanged = dreamLocation(x).toLowerCase() !== dreamLocation(d).toLowerCase();
    v[i] = { ...d, PosX: x.PosX, PosY: x.PosY, PosZ: x.PosZ, PosTime: x.PosTime };
    if (locChanged) relinkLocation(v, d.Id);
    const saved = v.find(y => y.Id === d.Id);
    const sid = cache.siteIdOf(d.Id);
    if (sid != null) {
      await editDream(sid, saved);
      await followImage(saved, sid);
      await commitLinks(before, v, true);   // снятые и новые нити — и на сайте
    }
    cache.markStale();
    return saved;
  }

  // новый сон: нити по общей локации, затем import (как синхронизация ядра) и нити — add_links
  v.push(d);
  linkByLocation(v, d.Id);
  const saved = v.find(y => y.Id === d.Id);
  await importDream(saved);
  await cache.load(0);   // новому сну нужен его номер на сайте
  const sid = cache.siteIdOf(saved.Id);
  if (sid == null) throw new Error('Сон не записался');
  try { await commitLinks(before, v, false); } catch (e) { console.warn('нити', e); }
  if (saved.PosX != null && saved.PosY != null && saved.PosZ != null) {
    try {
      const r = await http.postJson('save_positions', { items: [{ id: sid, x: saved.PosX, y: saved.PosY, z: saved.PosZ }] });
      saved.PosTime = (r && r.time) || saved.PosTime;
    } catch (e) { console.warn('место сна', e); }
  }
  if (saved.ImageFile) {   // имя картины из старой программы на сайте не найдётся — тогда без неё
    try { saved.ImageFile = await copyImage(saved.Id, sid, saved.ImageFile); } catch { saved.ImageFile = ''; }
  }
  cache.markStale();
  return saved;
}

// удалить сон на сайте (картинка и миниатюра — если больше ни у кого: это делает сайт)
async function dream_delete({ id }) {
  requireLogin();
  await cache.load(RECENT);
  const sid = cache.siteIdOf(id);
  if (sid != null) await http.postJson('del_dream', { id: sid });
  cache.imageCleared.delete(id);
  cache.markStale();
  dreamsChanged();
}

async function imageOf(id) {
  try { await cache.load(RECENT); } catch { return null; }
  const d = cache.find(id);
  return d && d.ImageFile ? d : null;
}

// путь картинки — адрес api.php (convertFileSrc отдаёт его как есть)
async function dream_image({ id }) {
  const d = await imageOf(id);
  return d ? cache.imgUrl(d.ImageFile) : null;
}

// миниатюра 160×160 WebP: сайт печёт её сам при первом запросе (&s=1)
async function dream_thumb({ id }) {
  const d = await imageOf(id);
  return d ? cache.imgUrl(d.ImageFile, true) : null;
}

// своя картина сну: сразу на сайт (с заменой прежней)
async function dream_set_image({ id, bytesB64 }) {
  requireLogin();
  const bytes = b64ToBytes(bytesB64);
  await cache.load(RECENT);
  const d = cache.find(id);
  const sid = cache.siteIdOf(id);
  if (!d || sid == null) throw new Error('Сон не найден');
  const out = clone(d);
  out.ImageFile = await setImage(id, sid, bytes);
  return out;
}

export const commands = { dreams_list, dream_save, dream_delete, dream_image, dream_thumb, dream_set_image };
