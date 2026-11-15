<?php
require_once __DIR__ . '/db.php';

// «Запомнить устройство»: сессия живёт до 90 дней. Без галочки cookie — сеансовая
// (исчезает при закрытии браузера), но сервер держит сессию столько же.
const SESSION_LIFE = 7776000;   // 90 суток
ini_set('session.gc_maxlifetime', SESSION_LIFE);
session_set_cookie_params([
    'lifetime' => 0,            // по умолчанию — сеансовая; продлеваем при «запомнить»
    'path' => '/',
    'httponly' => true,
    'samesite' => 'Lax',
    'secure' => !empty($_SERVER['HTTPS']),
]);
session_start();

// продлить cookie этого устройства на 90 дней (вызывается при входе с галочкой)
function remember_device() {
    setcookie(session_name(), session_id(), [
        'expires' => time() + SESSION_LIFE,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => !empty($_SERVER['HTTPS']),
    ]);
}

// адрес, с которого пришёл запрос (сервер стоит без прокси — REMOTE_ADDR правдив)
function client_ip(): string {
    return substr(trim($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}

function current_user() {
    static $u = false;
    if ($u === false) {
        $u = null;
        if (!empty($_SESSION['uid'])) {
            $u = q('SELECT id, login, email, role, banned, openrouter_key, key_issued, text_model, image_model, gen_images, colors, map_view, view_time, last_ip
                    FROM users WHERE id = ?', [$_SESSION['uid']])->fetch() ?: null;
            if ($u && (int)$u['banned'] === 1) { session_destroy(); $u = null; }
            // след посетителя: хранится ТОЛЬКО последний адрес, обновляется при каждом визите
            $ip = client_ip();
            if ($u && $ip !== '' && $u['last_ip'] !== $ip) {
                q('UPDATE users SET last_ip = ? WHERE id = ?', [$ip, $u['id']]);
                $u['last_ip'] = $ip;
            }
        }
    }
    return $u;
}

/* Модели ИИ выбирает только владелец — остальные работают ими же.
   Возвращает пользователя с подменёнными моделями хозяина сайта. */
function with_owner_models(array $u): array {
    if ($u['role'] === 'owner') return $u;
    $o = q('SELECT text_model, image_model FROM users WHERE role = "owner" ORDER BY id LIMIT 1')->fetch();
    if ($o) { $u['text_model'] = $o['text_model']; $u['image_model'] = $o['image_model']; }
    return $u;
}

/* наружу пользователь уходит БЕЗ ключа и БЕЗ следа IP: они живут только в базе */
function user_out(array $u): array {
    $u['has_key'] = $u['openrouter_key'] !== '';
    unset($u['openrouter_key'], $u['last_ip']);
    return $u;
}

function require_login() {
    $u = current_user();
    if (!$u) fail('Нужен вход', 401);
    return $u;
}

/* Иерархия: владелец (4) > админ (3) > модер (2) > сновидец (1).
   Управлять можно только теми, кто строго ниже рангом. */
function role_rank($role): int {
    $r = ['user' => 1, 'moder' => 2, 'admin' => 3, 'owner' => 4];
    return $r[$role] ?? 0;
}

/* ===== род: кто кого привёл ===== */

/* карта родства: id => parent_id (читается один раз за запрос) */
function kin_map(): array {
    static $m = null;
    if ($m === null) {
        $m = [];
        foreach (q('SELECT id, parent_id FROM users')->fetchAll() as $r)
            $m[(int)$r['id']] = $r['parent_id'] === null ? 0 : (int)$r['parent_id'];
    }
    return $m;
}

/* растёт ли $id из ветки $ancestor (по цепочке приведших) */
function is_descendant(int $ancestor, int $id): bool {
    if ($ancestor === $id) return false;
    $m = kin_map();
    $seen = [];
    $cur = $m[$id] ?? 0;
    while ($cur && !isset($seen[$cur])) {   // защита от кольца в родстве
        if ($cur === $ancestor) return true;
        $seen[$cur] = true;
        $cur = $m[$cur] ?? 0;
    }
    return false;
}

/* Право управлять: ниже рангом И из моей ветки. Владелец — корень, ему открыты все. */
function can_manage(array $u, array $t): bool {
    if ((int)$u['id'] === (int)$t['id']) return false;
    if (role_rank($u['role']) <= role_rank($t['role'])) return false;
    if ($u['role'] === 'owner') return true;
    return is_descendant((int)$u['id'], (int)$t['id']);
}

function require_admin() {
    $u = require_login();
    if (role_rank($u['role']) < 3) fail('Только для админов', 403);
    return $u;
}

function require_moder() {
    $u = require_login();
    if (role_rank($u['role']) < 2) fail('Только для модераторов', 403);
    return $u;
}

function auth_register(string $login, string $pass, string $invite = ''): array {
    $login = trim($login);
    if (mb_strlen($login) < 3) throw new Exception('Логин от 3 символов');
    if (mb_strlen($pass) < 6) throw new Exception('Пароль от 6 символов');
    if (q('SELECT id FROM users WHERE login = ?', [$login])->fetch())
        throw new Exception('Логин занят');
    // первый зарегистрированный становится владельцем и инвайт ему не нужен
    $isFirst = !q('SELECT id FROM users LIMIT 1')->fetch();
    $inv = null;
    if (!$isFirst) {
        $inv = q('SELECT * FROM invites WHERE code = ? AND used_by IS NULL', [trim($invite)])->fetch();
        if (!$inv) throw new Exception('Нужен действующий инвайт-код');
    }
    // приведший становится родителем: сновидец растёт из ветки того, кто выдал инвайт
    $parent = $inv ? (int)$inv['created_by'] : null;
    q('INSERT INTO users (login, pass_hash, role, parent_id) VALUES (?,?,?,?)',
        [$login, password_hash($pass, PASSWORD_DEFAULT), $isFirst ? 'owner' : 'user', $parent]);
    $uid = (int)db()->lastInsertId();
    if ($inv)  // ник храним прямо в инвайте — история переживёт удаление сновидца
        q('UPDATE invites SET used_by = ?, used_login = ?, used_at = NOW() WHERE id = ?',
            [$uid, $login, $inv['id']]);
    $_SESSION['uid'] = $uid;
    return current_user();
}

function auth_login(string $login, string $pass): array {
    $u = q('SELECT * FROM users WHERE login = ?', [trim($login)])->fetch();
    if (!$u || !password_verify($pass, $u['pass_hash']))
        throw new Exception('Неверный логин или пароль');
    if ((int)$u['banned'] === 1)
        throw new Exception('Аккаунт заблокирован');
    $_SESSION['uid'] = (int)$u['id'];
    return current_user();
}
