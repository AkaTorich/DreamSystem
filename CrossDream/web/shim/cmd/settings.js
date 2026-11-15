// Настройки (app\src\commands\settings.rs): отдаются без пароля; правка — наложением присланных полей
// на сохранённые (можно прислать и часть). Хранятся в localStorage; правка вида карты и палитры
// уходит на сайт — как у ядра.
import { loadSettings, editSettings } from '../lib/store.js';
import { loggedIn } from '../lib/session.js';
import { pushView, pushColors } from '../lib/viewsync.js';
import { SERVER } from '../lib/http.js';
import { nowStamp } from '../lib/util.js';

// поля, которые ведёт «ядро»: интерфейс их не меняет
const PROTECTED = ['SiteLogin', 'SitePass', 'Profile', 'ViewTime', 'ColorsDirty'];

function settings_get() {
  const s = loadSettings();
  if (!s.ServerUrl) s.ServerUrl = SERVER;   // в браузере сервер — тот, с которого открыта страница
  return s;
}

async function settings_set({ settings }) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Настройки — не объект');
  const { moved, recolored } = editSettings(cur => {
    const old = JSON.parse(JSON.stringify(cur));
    for (const [k, v] of Object.entries(settings)) if (!PROTECTED.includes(k)) cur[k] = v;
    const moved = Math.abs((+old.MapZoom || 0) - (+cur.MapZoom || 0)) > 1e-9
      || Math.abs((+old.MapPanX || 0) - (+cur.MapPanX || 0)) > 1e-9
      || Math.abs((+old.MapPanY || 0) - (+cur.MapPanY || 0)) > 1e-9;
    if (moved) cur.ViewTime = nowStamp();   // сайт потом поставит свой штамп
    const recolored = JSON.stringify(old.Colors ?? null) !== JSON.stringify(cur.Colors ?? null);
    if (recolored) cur.ColorsDirty = true;  // снимется, когда палитра доедет до сайта
    return { moved, recolored };
  });
  if (loggedIn()) {
    if (moved) await pushView().catch(() => {});
    if (recolored) await pushColors().catch(() => {});
  }
  return null;
}

export const commands = { settings_get, settings_set };
