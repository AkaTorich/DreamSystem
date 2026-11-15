<?php
/* Восстановление доступа по почте.
   Письмо со ссылкой на reset.php; ссылка одноразовая и живёт час. В базе хранится только хеш
   ссылки — утечка базы не даёт войти. Ответ на запрос всегда одинаковый, чтобы по нему нельзя было
   узнать, есть ли такой аккаунт и указана ли у него почта. */
require_once __DIR__ . '/auth.php';

const RESET_LIFE = 3600;          // ссылка живёт час
const RESET_PAUSE = 180;          // одному аккаунту — не чаще письма в три минуты
const RESET_IP_HOUR = 5;          // с одного адреса — не больше пяти писем в час
const RESET_FROM = 'info@globthe.top';
const RESET_SITE = 'https://dream.globthe.top';

function email_clean(string $e): string {
    $e = mb_strtolower(trim($e));
    if ($e === '') return '';
    if (strlen($e) > 190 || !filter_var($e, FILTER_VALIDATE_EMAIL))
        throw new Exception('Почта записана с ошибкой');
    return $e;
}

// пустая строка — отвязать почту
function set_user_email(int $uid, string $email): void {
    $e = email_clean($email);
    if ($e !== '' && q('SELECT id FROM users WHERE email = ? AND id <> ?', [$e, $uid])->fetch())
        throw new Exception('Эта почта уже привязана к другому аккаунту');
    q('UPDATE users SET email = ? WHERE id = ?', [$e === '' ? null : $e, $uid]);
}

// $who — логин или почта; молча ничего не делает, если письмо отправлять некому или рано
function reset_request(string $who): void {
    $who = trim($who);
    if ($who === '') return;
    $u = q('SELECT id, login, email, banned FROM users WHERE login = ? OR email = ? LIMIT 1',
        [$who, mb_strtolower($who)])->fetch();
    if (!$u || !$u['email'] || (int)$u['banned'] === 1) return;
    if (q('SELECT id FROM pass_resets WHERE user_id = ? AND created_at > NOW() - INTERVAL ? SECOND LIMIT 1',
        [$u['id'], RESET_PAUSE])->fetch()) return;
    $ip = client_ip();
    $n = q('SELECT COUNT(*) c FROM pass_resets WHERE ip = ? AND created_at > NOW() - INTERVAL 1 HOUR', [$ip])->fetch();
    if ((int)$n['c'] >= RESET_IP_HOUR) return;

    $token = bin2hex(random_bytes(32));
    q('INSERT INTO pass_resets (user_id, token_hash, expires_at, ip) VALUES (?, ?, NOW() + INTERVAL ? SECOND, ?)',
        [$u['id'], hash('sha256', $token), RESET_LIFE, $ip]);
    reset_mail($u['email'], $u['login'], RESET_SITE . '/reset.php?t=' . $token);
}

function reset_mail(string $to, string $login, string $link): void {
    $subject = mb_encode_mimeheader('Карта снов — восстановление доступа', 'UTF-8', 'B');
    $body = "Здравствуйте!\n\n"
        . "Для аккаунта «{$login}» в «Карте снов» запрошен новый пароль.\n"
        . "Задать его можно по ссылке — она действует один час и только один раз:\n\n"
        . "{$link}\n\n"
        . "Если вы ничего не запрашивали, просто не открывайте ссылку: прежний пароль остаётся в силе.\n\n"
        . "— Карта снов, dream.globthe.top\n";
    $headers = implode("\r\n", [
        'From: ' . mb_encode_mimeheader('Карта снов', 'UTF-8', 'B') . ' <' . RESET_FROM . '>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
    ]);
    mail($to, $subject, $body, $headers, '-f' . RESET_FROM);
}

// задать новый пароль по ссылке; возвращает логин
function reset_confirm(string $token, string $pass): string {
    if (mb_strlen($pass) < 6) throw new Exception('Пароль от 6 символов');
    $r = q('SELECT r.user_id, u.login FROM pass_resets r JOIN users u ON u.id = r.user_id
            WHERE r.token_hash = ? AND r.used = 0 AND r.expires_at > NOW()',
        [hash('sha256', trim($token))])->fetch();
    if (!$r) throw new Exception('Ссылка устарела или уже использована — запросите новую');
    q('UPDATE users SET pass_hash = ? WHERE id = ?', [password_hash($pass, PASSWORD_DEFAULT), $r['user_id']]);
    q('UPDATE pass_resets SET used = 1 WHERE user_id = ?', [$r['user_id']]);   // и все прежние ссылки
    return $r['login'];
}
