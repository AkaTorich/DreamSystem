// Разбор сна ИИ через сайт — те же шаги и события, что core\src\pipeline.rs:
// ai_analyze → (картина) ai_image → (нити) ai_links, затем нити по общей локации.
// Ход — `pipeline://step` {step, state, text}.
import * as http from '../lib/http.js';
import { requireLogin } from '../lib/session.js';
import * as cache from '../lib/dreams-cache.js';
import { linkByLocation, commitLinks } from '../lib/dream-links.js';
import { editDream, setImage, copyImage } from '../lib/dream-site.js';
import { emit, EV, dreamsChanged } from '../lib/events.js';
import { jx, shortLoc, sameLoc, dreamLocation, b64ToBytes, clone } from '../lib/util.js';

const step = (s, state, text) => emit(EV.PIPELINE_STEP, { step: s, state, text });
const msg = e => (e && e.message ? e.message : String(e));

async function siteAnalyze(text) {
  const j = await http.postJson('ai_analyze', { text });
  const o = j && j.analysis ? j.analysis : null;
  const a = {
    Summary: jx.str(o, 'summary'), Location: shortLoc(jx.str(o, 'location')),
    Characters: jx.strings(o, 'characters'), Emotions: jx.strings(o, 'emotions'),
    Symbols: jx.strings(o, 'symbols'), Motifs: jx.strings(o, 'motifs'),
  };
  return { a, prompt: jx.str(o, 'image_prompt') };
}

async function siteImage(prompt) {
  const j = await http.postJson('ai_image', { prompt });
  return b64ToBytes(jx.str(j, 'image').trim());
}

function brief(id, title, a) {
  const v = { title, summary: a.Summary, location: a.Location, characters: a.Characters,
    emotions: a.Emotions, symbols: a.Symbols, motifs: a.Motifs };
  if (id != null) v.id = id;
  return v;
}

async function siteLinks(d, all) {
  const others = all.filter(x => x.Id !== d.Id && x.Analysis).map(x => brief(x.Id, x.Title, x.Analysis));
  if (!others.length) return [];
  const j = await http.postJson('ai_links', { dream: brief(null, d.Title, d.Analysis), others });
  return jx.arr(j, 'links').map(l => ({ Id: jx.str(l, 'id'), Type: jx.str(l, 'type'), Reason: jx.str(l, 'reason') }));
}

async function dream_analyze({ id, forcedLocation, wantImage }) {
  requireLogin();
  await cache.load(0);
  const all = cache.listCopy();
  const d = clone(all.find(x => x.Id === id) || null);
  if (!d) throw new Error('Сон не найден');
  const sid = cache.siteIdOf(id);

  // 1) разбор
  if (!d.Analysis) {
    step('analysis', 'run', 'разбираю сон');
    try {
      const { a, prompt } = await siteAnalyze(d.Text);
      d.Analysis = a;
      d.ImagePrompt = prompt;
      step('analysis', 'ok', 'сон разобран');
    } catch (e) { step('analysis', 'fail', 'Анализ: ' + msg(e)); }
  } else {
    step('analysis', 'ok', 'разбор уже есть');
  }

  // выбранная прежняя локация: закрепляем её и наследуем её картину
  let donor = '';
  const loc = shortLoc(forcedLocation || '');
  if (loc && d.Analysis) {
    d.Analysis.Location = loc;
    if (!d.ImageFile) {
      const x = all.find(o => o.Id !== d.Id && sameLoc(dreamLocation(o), loc) && o.ImageFile);
      if (x) { d.ImageFile = x.ImageFile; donor = x.ImageFile; }
    }
  }

  // 2) картина локации — сразу на сайт
  if (!d.ImageFile && d.ImagePrompt && wantImage) {
    step('image', 'run', 'рисую локацию');
    try {
      if (sid == null) throw new Error('сна ещё нет на сайте');
      d.ImageFile = await setImage(id, sid, await siteImage(d.ImagePrompt));
      step('image', 'ok', 'картина готова');
    } catch (e) { step('image', 'fail', 'Картинка: ' + msg(e)); }
  } else {
    step('image', 'ok', d.ImageFile ? 'картина есть' : 'без картинки');
  }

  // 3) нити с прежними снами
  if (d.Analysis) {
    step('links', 'run', 'ищу связи с прежними снами');
    try {
      d.Links = await siteLinks(d, all);
      step('links', 'ok', 'связи найдены');
    } catch (e) { step('links', 'fail', 'Связи: ' + msg(e)); }
  }

  // записать: правим только то, что дал разбор (места на карте могли смениться)
  await cache.load(0);
  const base = cache.listCopy();
  const v = clone(base);
  const x = v.find(o => o.Id === id);
  if (!x) throw new Error('Сон удалён во время разбора');
  x.Analysis = d.Analysis;
  x.ImagePrompt = d.ImagePrompt;
  x.ImageFile = d.ImageFile;
  x.Links = d.Links || [];
  linkByLocation(v, id);   // сны одной локации всегда в одной сети
  if (sid != null) {
    try { await editDream(sid, x); } catch (e) { console.warn('edit_dream', e); }
    if (donor && cache.C.siteImg.get(id) !== donor) {
      try { x.ImageFile = await copyImage(id, sid, donor); } catch { x.ImageFile = cache.C.siteImg.get(id) || ''; }
    }
    try { await commitLinks(base, v, false); } catch (e) { console.warn('нити', e); }
  }
  if (x.Analysis) cache.overlaySet(id, x.Analysis, x.ImagePrompt);
  cache.markStale();
  dreamsChanged();
  return x;
}

export const commands = { dream_analyze };
