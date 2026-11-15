// Вошедший пользователь сайта. В браузере сессия — cookie страницы; здесь — только память о ней.
import { hooks, SiteError } from './http.js';

// undefined — ещё не спрашивали сайт; null — входа нет; объект — пользователь из ответа сайта
export const session = { user: undefined };

hooks.unauthorized = () => { session.user = null; };

export const loggedIn = () => !!session.user;

// для правок: без входа — та же ошибка, что у ядра
export function requireLogin() {
  if (session.user === null) throw new SiteError('Сначала войдите на сайт', 401);
}

// «нужен вход» (401) — для чтения это пустой ответ, а не ошибка
export function isAuthError(e) {
  return !!e && (e.status === 401 || session.user === null);
}

// логин → имя профиля (как sanitize_login ядра): у каждого аккаунта своя память в localStorage
export function profile() {
  const l = session.user && session.user.login ? String(session.user.login) : '';
  return l.trim().toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, '_') || 'local';
}
