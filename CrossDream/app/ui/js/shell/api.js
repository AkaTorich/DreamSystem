// Мост к Rust (Tauri 2, withGlobalTauri). Все области зовут ядро только отсюда.
const T = window.__TAURI__;

export function invoke(cmd, args = {}) {
  return T.core.invoke(cmd, args);
}

// любой вызов api.php сайта через вошедшую сессию: site('dreams'), site('add_link', {a, b, type})
export function site(action, body = undefined, method = body === undefined ? 'GET' : 'POST') {
  return T.core.invoke('site_call', { action, method, body: body ?? null });
}

// подписка на события ядра: sync://progress, sync://done, pipeline://step
export function listen(event, cb) {
  return T.event.listen(event, e => cb(e.payload));
}

// путь файла на диске → адрес для <img src>
export function fileSrc(path) {
  return path ? T.core.convertFileSrc(path) : '';
}

export const dialog = () => T.dialog;
export const platform = () => (navigator.userAgent.match(/Android|iPhone|iPad|Mac|Linux|Windows/) || ['?'])[0];
