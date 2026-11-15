<?php
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/lib/ai.php';
require_once __DIR__ . '/lib/oracle.php';
require_once __DIR__ . '/lib/reset.php';
require_once __DIR__ . '/lib/libops.php';

$action = $_REQUEST['action'] ?? '';
$in = json_decode(file_get_contents('php://input'), true) ?: [];

// любая непойманная ошибка (сбой ИИ, сети) — понятным ответом, а не пустым «HTTP 500»
set_exception_handler(function (Throwable $e) { fail($e->getMessage(), 502); });

/* имена файлов на диске — криптослучайные: подобрать перебором нельзя */
function rand_name(string $ext = ''): string {
    return bin2hex(random_bytes(16)) . ($ext !== '' ? '.' . $ext : '');
}

/* папка-родитель из запроса: null — полка; иначе своя папка того же рода */
function folder_parent_arg(array $u, $raw, string $kind): ?int {
    if ($raw === null || $raw === '' || (int)$raw <= 0) return null;
    $p = q('SELECT id FROM folders WHERE id = ? AND user_id = ? AND kind = ?', [(int)$raw, $u['id'], $kind])->fetch();
    if (!$p) fail('Папка-родитель не ваша или другого рода', 403);
    return (int)$p['id'];
}

/* имя занято другой папкой того же уровня */
function folder_name_taken(array $u, string $kind, ?int $parent, string $name, int $except): bool {
    return (bool)q('SELECT id FROM folders WHERE user_id = ? AND kind = ? AND name = ? AND id <> ?
                    AND parent_id ' . ($parent === null ? 'IS NULL' : '= ' . (int)$parent),
        [$u['id'], $kind, $name, $except])->fetch();
}

/* обложка PDF лежит рядом с файлом книги: uploads/pdfcovers/<имя файла>.webp */
function pdf_cover_path(string $file): string {
    return cfg()['uploads'] . '/pdfcovers/' . basename($file) . '.webp';
}

/* испечь обложку новой книги сразу: первая страница → WebP 160 точек, ~2 КБ (Ghostscript + ImageMagick) */
function pdf_cover_bake(string $file): void {
    $src = cfg()['uploads'] . '/pdf/' . basename($file);
    $out = pdf_cover_path($file);
    if (!is_file($src) || is_file($out)) return;
    if (!is_dir(dirname($out))) @mkdir(dirname($out), 0777, true);
    $png = tempnam(sys_get_temp_dir(), 'cov');
    @shell_exec('timeout 60 gs -q -dSAFER -dBATCH -dNOPAUSE -dFirstPage=1 -dLastPage=1 -sDEVICE=png16m -r48'
        . ' -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -o ' . escapeshellarg($png) . ' ' . escapeshellarg($src) . ' 2>/dev/null'
        . ' && convert ' . escapeshellarg($png) . " -resize '160x>' -strip -quality 70 " . escapeshellarg($out) . ' 2>/dev/null');
    @unlink($png);
}

function dream_row_out(array $d): array {
    foreach (['characters', 'emotions', 'symbols', 'motifs'] as $k)
        $d[$k] = json_decode($d[$k] ?: '[]', true) ?: [];
    return $d; // ext_id нужен программе для синхронизации без дублей
}

function dreams_of(int $uid): array {
    $dreams = array_map('dream_row_out',
        q('SELECT * FROM dreams WHERE user_id = ? ORDER BY dream_date, id', [$uid])->fetchAll());
    $ids = array_column($dreams, 'id');
    $links = [];
    if ($ids) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $links = q("SELECT * FROM links WHERE dream_a IN ($ph) AND dream_b IN ($ph)",
            array_merge($ids, $ids))->fetchAll();
    }
    return ['dreams' => $dreams, 'links' => $links,
            'planets' => q('SELECT loc_key, x, y, z, pos_time FROM planet_positions
                            WHERE user_id = ?', [$uid])->fetchAll()];
}

/* строго выше всех ЧУЖИХ владельцев затронутых карт (свои карты не в счёт) */
function over_owners(array $u, array $uids): bool {
    $uids = array_diff(array_unique(array_map('intval', $uids)), [(int)$u['id']]);
    if (!$uids) return true;
    if (role_rank($u['role']) < 2) return false;
    $ph = implode(',', array_fill(0, count($uids), '?'));
    foreach (q("SELECT role FROM users WHERE id IN ($ph)", array_values($uids))->fetchAll() as $r)
        if (!can_manage($u, $r)) return false;
    return true;
}

function can_touch_dream(array $u, array $d): bool {
    return (int)$d['user_id'] === (int)$u['id'] || over_owners($u, [(int)$d['user_id']]);
}

function target_user(int $id): array {
    $t = q('SELECT id, login, role FROM users WHERE id = ?', [$id])->fetch();
    if (!$t) fail('Пользователь не найден', 404);
    return $t;
}

/* действие разрешено только над тем, кто строго ниже рангом */
function require_over(array $u, array $target) {
    if (!can_manage($u, $target))
        fail('Нет прав', 403);
}

/* Печать книги: снимается с первой строки текста и хранится ТОЛЬКО на сервере.
   Возвращает печать и вычищает её из $text. */
function seal_extract(string &$text): string {
    $hall = '𓁟𓈗𓇯𓁨𓆐𓇰𓇹𓁩𓆙';
    $s3 = ['𓋹𓁟𓅷', '𓋹𓏛𓊅', '𓋹𓇼𓇯'];
    $s2 = ['𓁟𓁐', '𓁟𓀀', '𓁟𓅷', '𓁐𓁟', '𓀀𓁟', '𓅷𓁟', '𓁦𓀔', '𓊨𓀔', '𓏛𓊅'];
    $s1 = ['𓋹', '𓄣', '𓏞', '𓇳', '𓀔', '𓊹', '𓅆', '𓅝', '𓁟', '𓃻', '𓅞', '𓅷',
           '𓆣', '𓀁', '𓄹', '𓆫', '𓍝', '𓁀', '𓅽', '𓏢'];
    $lines = explode("\n", $text);
    $first = ltrim($lines[0] ?? '');
    foreach (array_merge([$hall], $s3, $s2) as $s) {
        if (strpos($first, $s) === 0) {
            $rest = ltrim(mb_substr($first, mb_strlen($s)));
            if ($rest === '') array_shift($lines); else $lines[0] = $rest;
            $text = implode("\n", $lines);
            return $s;
        }
    }
    if (in_array(trim($first), $s1, true)) {
        $seal = trim($first);
        array_shift($lines);
        $text = implode("\n", $lines);
        return $seal;
    }
    return '';
}

/* связь доверия между двумя сновидцами (в любом порядке) */
function trust_between(int $x, int $y) {
    return q('SELECT * FROM trusts WHERE (a_user = ? AND b_user = ?) OR (a_user = ? AND b_user = ?)',
        [$x, $y, $y, $x])->fetch() ?: null;
}

/* материализация принятого дара: копия вещи на полку получателя; возвращает id копии */
function gift_copy_item(string $type, array $item, int $toId): int {
    if ($type === 'book') {
        $num = (int)q('SELECT COALESCE(MAX(num),0)+1 n FROM books WHERE user_id=?', [$toId])->fetch()['n'];
        q('INSERT INTO books (user_id, num, title, text, translation, seal, location)
           VALUES (?,?,?,?,?,?,?)', [$toId, $num, $item['title'], $item['text'],
            $item['translation'], $item['seal'], $item['location']]);
    } elseif ($type === 'pdf') {
        q('INSERT INTO pdf_books (user_id, ext_id, title, file) VALUES (?,"",?,?)',
            [$toId, $item['title'], $item['file']]);
    } else {
        q('INSERT INTO suite_files (user_id, title, file, size, icon, descr) VALUES (?,?,?,?,?,?)',
            [$toId, $item['title'], $item['file'], $item['size'],
             $item['icon'] ?? '', $item['descr'] ?? '']);
    }
    return (int)db()->lastInsertId();
}

/* чёрная дыра: копия дара исчезает с полки получателя без следа */
function gift_devour_copy(array $g): void {
    if (!$g['copy_id']) return;
    $cid = (int)$g['copy_id'];
    if ($g['item_type'] === 'book') {
        $b = q('SELECT * FROM books WHERE id = ? AND user_id = ?', [$cid, (int)$g['to_user']])->fetch();
        if (!$b) return;
        q('DELETE FROM books WHERE id = ?', [$cid]);
        q('DELETE FROM book_links WHERE (a_type="book" AND a_id=?) OR (b_type="book" AND b_id=?)', [$cid, $cid]);
    } elseif ($g['item_type'] === 'pdf') {
        $b = q('SELECT * FROM pdf_books WHERE id = ? AND user_id = ?', [$cid, (int)$g['to_user']])->fetch();
        if (!$b) return;
        q('DELETE FROM pdf_books WHERE id = ?', [$cid]);
        q('DELETE FROM book_links WHERE (a_type="pdf" AND a_id=?) OR (b_type="pdf" AND b_id=?)', [$cid, $cid]);
        // сам файл остаётся на сервере: стереть его может только владелец сайта (lib_purge)
    } else {
        $b = q('SELECT * FROM suite_files WHERE id = ? AND user_id = ?', [$cid, (int)$g['to_user']])->fetch();
        if (!$b) return;
        q('DELETE FROM suite_files WHERE id = ?', [$cid]);
    }
}

/* предложение дара: со своей полки, доверенному или нижестоящему; автоприём у доверенных */
function gift_offer(array $u, string $type, array $item, int $toId, string $message): array {
    if ((int)$item['user_id'] !== (int)$u['id'])
        fail('Дарить можно только со своей полки');
    $to = target_user($toId);
    if ((int)$to['id'] === (int)$u['id']) fail('Себе дарят молча');
    $t = trust_between((int)$u['id'], (int)$to['id']);
    $trusted = $t && $t['status'] === 'accepted';
    if (!$trusted && !can_manage($u, $to))
        fail('Этому сновидцу подарить нельзя — предложите доверие');
    q('INSERT INTO gifts (from_user, to_user, item_type, item_id, message) VALUES (?,?,?,?,?)',
        [$u['id'], $to['id'], $type, $item['id'], $message]);
    $gid = (int)db()->lastInsertId();
    $auto = false;
    if ($trusted) {
        $recvAuto = (int)$t['a_user'] === (int)$to['id'] ? (int)$t['auto_a'] : (int)$t['auto_b'];
        if ($recvAuto === 1) {
            $cid = gift_copy_item($type, $item, (int)$to['id']);
            q('UPDATE gifts SET status = "accepted", decided_at = NOW(), copy_id = ? WHERE id = ?',
                [$cid, $gid]);
            $auto = true;
        }
    }
    return ['ok' => true, 'to' => $to['login'], 'auto' => $auto];
}

function gift_item_title(string $type, int $id): string {
    $tbl = $type === 'book' ? 'books' : ($type === 'pdf' ? 'pdf_books' : 'suite_files');
    $r = q("SELECT title FROM $tbl WHERE id = ?", [$id])->fetch();
    return $r ? $r['title'] : '(вещь удалена)';
}

/* чем дар выглядит в ларце: описание и есть ли своя иконка */
function gift_item_look(string $type, int $id): array {
    if ($type === 'file') {
        $r = q('SELECT descr, icon, size FROM suite_files WHERE id = ?', [$id])->fetch();
        if (!$r) return ['descr' => '', 'icon' => 0, 'note' => ''];
        return ['descr' => $r['descr'], 'icon' => $r['icon'] !== '' ? 1 : 0,
                'note' => round($r['size'] / 1048576, 1) . ' МБ'];
    }
    if ($type === 'book') {
        $r = q('SELECT num, text, translation, location FROM books WHERE id = ?', [$id])->fetch();
        if (!$r) return ['descr' => '', 'icon' => 0, 'note' => ''];
        $plain = trim(preg_replace('/\s+/u', ' ', $r['text']));
        return ['descr' => mb_substr($plain, 0, 160) . (mb_strlen($plain) > 160 ? '…' : ''),
                'icon' => 0,
                'note' => 'том ' . $r['num']
                    . ($r['translation'] !== '' ? ' · истолкована' : '')
                    . ($r['location'] !== '' ? ' · фундамент: ' . $r['location'] : '')];
    }
    $r = q('SELECT title FROM pdf_books WHERE id = ?', [$id])->fetch();
    return ['descr' => '', 'icon' => 0, 'note' => $r ? 'PDF' : ''];
}

function gift_decorate(array $rows): array {
    foreach ($rows as &$g) {
        $g['title'] = gift_item_title($g['item_type'], (int)$g['item_id']);
        $look = gift_item_look($g['item_type'], (int)$g['item_id']);
        $g['descr'] = $look['descr'];
        $g['note'] = $look['note'];
        $g['has_icon'] = $look['icon'];
    }
    return $rows;
}

/* книга (иероглифы или PDF) с проверкой доступа по иерархии: своя или нижестоящего */
/* род в связях: книга иероглифов, PDF или сон */
function bl_type($s): string { return in_array($s, ['book', 'pdf', 'dream'], true) ? $s : 'book'; }
function bl_table(string $type): string { return $type === 'pdf' ? 'pdf_books' : ($type === 'dream' ? 'dreams' : 'books'); }

function bl_item(array $u, string $type, int $id): array {
    $tbl = bl_table($type);
    $b = q("SELECT * FROM $tbl WHERE id = ?", [$id])->fetch();
    if (!$b) fail($type === 'dream' ? 'Сон не найден' : 'Книга не найдена', 404);
    if ((int)$b['user_id'] !== (int)$u['id']) {
        $owner = target_user((int)$b['user_id']);
        if (!can_manage($u, $owner))
            fail('Нет доступа к этой книге', 403);
    }
    return $b;
}

function add_location_links(int $dreamId, int $userId, string $location, ?int $by) {
    if (trim($location) === '') return;
    $others = q('SELECT id FROM dreams WHERE user_id = ? AND id <> ? AND LOWER(TRIM(location)) = LOWER(TRIM(?))',
        [$userId, $dreamId, $location])->fetchAll();
    foreach ($others as $o) {
        $a = min($dreamId, (int)$o['id']); $b = max($dreamId, (int)$o['id']);
        q('INSERT IGNORE INTO links (dream_a, dream_b, type, reason, created_by)
           VALUES (?,?,?,?,?)', [$a, $b, 'локация', 'та же локация — ' . trim($location), $by]);
    }
}

function run_pipeline(array $u, int $dreamId, ?string $forcedLoc, bool $wantImage): array {
    $errors = [];
    $d = q('SELECT * FROM dreams WHERE id = ?', [$dreamId])->fetch();
    if (!$d) fail('Сон не найден', 404);
    $owner = q('SELECT * FROM users WHERE id = ?', [$d['user_id']])->fetch();
    // ключ берём у того, у кого он есть; модели — всегда владельца сайта
    $aiUser = with_owner_models($u['openrouter_key'] ? $u : $owner);

    // 1. анализ
    if (!$d['summary'] && $aiUser['openrouter_key']) {
        try {
            $a = ai_analyze($aiUser, $d['text']);
            q('UPDATE dreams SET summary=?, location=?, characters=?, emotions=?, symbols=?, motifs=?, image_prompt=?
               WHERE id=?', [
                $a['summary'] ?? '', $a['location'] ?? '',
                json_encode($a['characters'] ?? [], JSON_UNESCAPED_UNICODE),
                json_encode($a['emotions'] ?? [], JSON_UNESCAPED_UNICODE),
                json_encode($a['symbols'] ?? [], JSON_UNESCAPED_UNICODE),
                json_encode($a['motifs'] ?? [], JSON_UNESCAPED_UNICODE),
                $a['image_prompt'] ?? '', $dreamId,
            ]);
        } catch (Exception $e) { $errors[] = 'Анализ: ' . $e->getMessage(); }
        $d = q('SELECT * FROM dreams WHERE id = ?', [$dreamId])->fetch();
    }

    // выбранная пользователем локация: закрепляем и наследуем картину
    if ($forcedLoc) {
        q('UPDATE dreams SET location=? WHERE id=?', [$forcedLoc, $dreamId]);
        $d['location'] = $forcedLoc;
        if (!$d['image_file']) {
            $donor = q('SELECT image_file FROM dreams WHERE user_id=? AND id<>? AND image_file<>""
                        AND LOWER(TRIM(location))=LOWER(TRIM(?)) LIMIT 1',
                [$d['user_id'], $dreamId, $forcedLoc])->fetch();
            if ($donor) {
                q('UPDATE dreams SET image_file=? WHERE id=?', [$donor['image_file'], $dreamId]);
                $d['image_file'] = $donor['image_file'];
            }
        }
    }

    // 2. картинка
    if ($wantImage && !$d['image_file'] && $d['image_prompt'] && $aiUser['openrouter_key']) {
        try {
            $file = rand_name('jpg');
            ai_image($aiUser, $d['image_prompt'], cfg()['uploads'] . '/' . $file);
            q('UPDATE dreams SET image_file=? WHERE id=?', [$file, $dreamId]);
        } catch (Exception $e) { $errors[] = 'Картинка: ' . $e->getMessage(); }
    }

    // 3. связи
    $d = q('SELECT * FROM dreams WHERE id = ?', [$dreamId])->fetch();
    if ($d['summary'] && $aiUser['openrouter_key']) {
        try {
            $others = q('SELECT id, title, summary, location, characters, emotions, symbols, motifs
                         FROM dreams WHERE user_id=? AND id<>? AND summary<>""', [$d['user_id'], $dreamId])->fetchAll();
            $links = ai_links($aiUser, [
                'title' => $d['title'], 'summary' => $d['summary'], 'location' => $d['location'],
                'characters' => json_decode($d['characters'] ?: '[]', true),
                'emotions' => json_decode($d['emotions'] ?: '[]', true),
                'symbols' => json_decode($d['symbols'] ?: '[]', true),
                'motifs' => json_decode($d['motifs'] ?: '[]', true),
            ], array_map(function ($o) {
                foreach (['characters', 'emotions', 'symbols', 'motifs'] as $k)
                    $o[$k] = json_decode($o[$k] ?: '[]', true);
                return $o;
            }, $others));
            foreach ($links as $l) {
                $a = min($dreamId, $l['id']); $b = max($dreamId, $l['id']);
                q('INSERT IGNORE INTO links (dream_a, dream_b, type, reason, created_by)
                   VALUES (?,?,?,?,?)', [$a, $b, $l['type'], $l['reason'], $u['id']]);
            }
        } catch (Exception $e) { $errors[] = 'Связи: ' . $e->getMessage(); }
    }
    add_location_links($dreamId, (int)$d['user_id'], $d['location'], (int)$u['id']);
    return $errors;
}

switch ($action) {

case 'register':
    try {
        $mail = email_clean($in['email'] ?? '');   // почта необязательна; с ошибкой — до создания аккаунта
        $u = auth_register($in['login'] ?? '', $in['pass'] ?? '', $in['invite'] ?? '');
        if ($mail !== '') { set_user_email((int)$u['id'], $mail); $u['email'] = $mail; }
        if (!empty($in['remember'])) remember_device();
        json_out(['user' => user_out($u)]);
    }
    catch (Exception $e) { fail($e->getMessage()); }

/* ===== восстановление доступа по почте (lib/reset.php) ===== */
case 'reset_request':
    reset_request((string)($in['who'] ?? ''));
    json_out(['ok' => true, 'message' => 'Если такой аккаунт есть и у него указана почта, письмо со ссылкой '
        . 'уже в пути. Ссылка действует один час. Письма нет — загляните в «Спам».']);

case 'reset_confirm':
    try { json_out(['ok' => true, 'login' => reset_confirm((string)($in['token'] ?? ''), (string)($in['pass'] ?? ''))]); }
    catch (Exception $e) { fail($e->getMessage()); }

case 'set_email': {
    $u = require_login();
    try { set_user_email((int)$u['id'], (string)($in['email'] ?? '')); json_out(['ok' => true]); }
    catch (Exception $e) { fail($e->getMessage()); }
}

case 'login':
    try {
        $u = user_out(auth_login($in['login'] ?? '', $in['pass'] ?? ''));
        if (!empty($in['remember'])) remember_device();
        json_out(['user' => $u]);
    }
    catch (Exception $e) { fail($e->getMessage()); }

case 'logout':
    session_destroy();
    json_out(['ok' => true]);

case 'me': {
    $u = current_user();
    json_out(['user' => $u ? user_out($u) : null]);
}

case 'save_settings': {
    $u = require_login();
    // пользователь вписал свой ключ — это уже не выданный админом
    if (isset($in['openrouter_key']) && trim($in['openrouter_key']) !== '')
        q('UPDATE users SET openrouter_key = ?, key_issued = 0 WHERE id = ?',
            [trim($in['openrouter_key']), $u['id']]);
    // обновляем только то, что прислали — иначе частичное сохранение затрёт модели
    // модели задаёт только владелец — они общие для всего сайта
    if ($u['role'] === 'owner') {
        if (array_key_exists('text_model', $in) && trim($in['text_model']) !== '')
            q('UPDATE users SET text_model = ? WHERE id = ?', [trim($in['text_model']), $u['id']]);
        if (array_key_exists('image_model', $in) && trim($in['image_model']) !== '')
            q('UPDATE users SET image_model = ? WHERE id = ?', [trim($in['image_model']), $u['id']]);
    }
    if (array_key_exists('gen_images', $in))
        q('UPDATE users SET gen_images = ? WHERE id = ?', [empty($in['gen_images']) ? 0 : 1, $u['id']]);
    if (array_key_exists('colors', $in)) { // личная палитра нитей и сфер
        $cj = $in['colors'] ? json_encode($in['colors'], JSON_UNESCAPED_UNICODE) : null;
        if ($cj !== null && strlen($cj) > 800) fail('Слишком длинная палитра');
        q('UPDATE users SET colors = ? WHERE id = ?', [$cj, $u['id']]);
    }
    json_out(['ok' => true]);
}

/* ===== ИИ для программы: ключ живёт ТОЛЬКО на сервере и никуда не отдаётся ===== */

case 'ai_analyze': {
    $u = require_login();
    if (!$u['openrouter_key']) fail('Нет доступа к ИИ: впишите ключ на сайте или получите доступ у админа');
    $text = trim($in['text'] ?? '');
    if ($text === '') fail('Пустой сон');
    json_out(['analysis' => ai_analyze(with_owner_models($u), $text)]);
}

case 'ai_links': { // связи нового сна с прежними; id снов — строки программы
    $u = require_login();
    if (!$u['openrouter_key']) fail('Нет доступа к ИИ: впишите ключ на сайте или получите доступ у админа');
    $dream = $in['dream'] ?? null; $others = $in['others'] ?? [];
    if (!$dream || !is_array($others)) fail('Нужны сон и список прежних снов');
    if (!$others) json_out(['links' => []]);
    $sys = "Ты сопоставляешь новый сон с прежними снами человека. Найди ОСМЫСЛЕННЫЕ связи "
        . "(общая или похожая локация, тот же персонаж, та же эмоция, тот же символ, продолжение/похожий сюжет). "
        . "Не выдумывай связи ради количества — если их нет, верни пустой список. Верни ТОЛЬКО JSON:\n"
        . '{"links":[{"id":"id прежнего сна","type":"локация|персонаж|эмоция|символ|сюжет","reason":"кратко почему, по-русски"}]}';
    $mu = with_owner_models($u);   // модель — та, что выбрал владелец сайта
    $j = or_chat($u['openrouter_key'], [
        'model' => $mu['text_model'], 'temperature' => 0.2,
        'messages' => [
            ['role' => 'system', 'content' => $sys],
            ['role' => 'user', 'content' => json_encode(
                ['new_dream' => $dream, 'previous_dreams' => $others], JSON_UNESCAPED_UNICODE)],
        ],
    ]);
    $o = loose_json($j['choices'][0]['message']['content']);
    $valid = ['локация', 'персонаж', 'эмоция', 'символ', 'сюжет'];
    $ids = array_map('strval', array_column($others, 'id'));
    $res = [];
    foreach (($o['links'] ?? []) as $l)
        if (isset($l['id'], $l['type']) && in_array($l['type'], $valid, true)
            && in_array((string)$l['id'], $ids, true) && count($res) < 12)
            $res[] = ['id' => (string)$l['id'], 'type' => $l['type'], 'reason' => $l['reason'] ?? ''];
    json_out(['links' => $res]);
}

case 'ai_image': { // картинка локации: сервер рисует и отдаёт готовый jpeg
    $u = require_login();
    if (!$u['openrouter_key']) fail('Нет доступа к ИИ: впишите ключ на сайте или получите доступ у админа');
    $prompt = trim($in['prompt'] ?? '');
    if ($prompt === '') fail('Пустой промпт');
    $tmp = tempnam(sys_get_temp_dir(), 'dmimg');
    try { ai_image(with_owner_models($u), $prompt, $tmp); }
    catch (Exception $e) { @unlink($tmp); fail($e->getMessage()); }
    $img = base64_encode(file_get_contents($tmp));
    @unlink($tmp);
    json_out(['image' => $img]);
}

case 'img': { // картинки снов — только владельцу сна и вышестоящим, прямых ссылок нет
    $u = require_login();
    $f = basename($_GET['f'] ?? '');
    if (!preg_match('/^[A-Za-z0-9_.-]+\.(jpe?g|png|webp|gif)$/i', $f)) fail('Нет файла', 404);
    $d = q('SELECT user_id FROM dreams WHERE image_file = ? LIMIT 1', [$f])->fetch();
    if (!$d) fail('Нет файла', 404);
    if ((int)$d['user_id'] !== (int)$u['id'] && !over_owners($u, [(int)$d['user_id']]))
        fail('Нет доступа', 403);
    $p = cfg()['uploads'] . '/' . $f;
    if (!is_file($p)) fail('Нет файла', 404);
    if (!empty($_GET['s'])) {           // карте — маленькая копия; нет её — сделаем сейчас
        $t = make_thumb($p);
        if ($t !== '') { $p = $t; $f = basename($t); }
    }
    $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
    $mime = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png',
             'webp' => 'image/webp', 'gif' => 'image/gif'][$ext] ?? 'application/octet-stream';
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($p));
    header('Cache-Control: private, max-age=31536000, immutable');
    readfile($p);
    exit;
}

case 'dreams': {
    $u = require_login();
    $uid = (int)($_GET['uid'] ?? $u['id']);
    if ($uid !== (int)$u['id']) require_over($u, target_user($uid)); // чужая карта — вышестоящим
    json_out(dreams_of($uid));
}

case 'locations': {
    $u = require_login();
    $uid = (int)($_GET['uid'] ?? $u['id']);
    if ($uid !== (int)$u['id']) require_over($u, target_user($uid)); // чужая карта — вышестоящим
    json_out(['locations' => q(
        'SELECT TRIM(location) loc, COUNT(*) n FROM dreams
         WHERE user_id=? AND TRIM(location)<>"" GROUP BY LOWER(TRIM(location)) ORDER BY n DESC', [$uid])->fetchAll()]);
}

case 'add_dream': {
    $u = require_login();
    $uid = (int)($in['uid'] ?? $u['id']);
    if ($uid !== (int)$u['id']) require_over($u, target_user($uid)); // чужая карта — вышестоящим
    $text = trim($in['text'] ?? '');
    if ($text === '') fail('Опишите сон');
    q('INSERT INTO dreams (user_id, title, dream_date, text) VALUES (?,?,?,?)', [
        $uid, trim($in['title'] ?? '') ?: 'Сон без имени',
        $in['date'] ?? date('Y-m-d'), $text,
    ]);
    $id = (int)db()->lastInsertId();
    $errors = run_pipeline($u, $id, short_loc($in['location'] ?? '') ?: null, !empty($in['want_image']));
    json_out(['id' => $id, 'errors' => $errors]);
}

case 'redo_dream': {
    $u = require_login();
    $d = q('SELECT * FROM dreams WHERE id = ?', [(int)($in['id'] ?? 0)])->fetch();
    if (!$d) fail('Сон не найден', 404);
    if (!can_touch_dream($u, $d)) fail('Нет прав', 403);
    json_out(['errors' => run_pipeline($u, (int)$d['id'], null, !empty($in['want_image']))]);
}

case 'edit_dream': {
    $u = require_login();
    $d = q('SELECT * FROM dreams WHERE id = ?', [(int)($in['id'] ?? 0)])->fetch();
    if (!$d) fail('Сон не найден', 404);
    if (!can_touch_dream($u, $d)) fail('Нет прав', 403);
    q('UPDATE dreams SET title=?, text=?, summary=?, location=? WHERE id=?', [
        trim($in['title'] ?? $d['title']), $in['text'] ?? $d['text'],
        $in['summary'] ?? $d['summary'], short_loc($in['location'] ?? $d['location']), $d['id'],
    ]);
    // разбор сна целиком (персонажи, эмоции, символы, мотивы, образ картины, дата) — если прислали
    foreach (['characters', 'emotions', 'symbols', 'motifs'] as $k)
        if (array_key_exists($k, $in) && is_array($in[$k]))
            q("UPDATE dreams SET $k = ? WHERE id = ?",
                [json_encode(array_values(array_map('strval', $in[$k])), JSON_UNESCAPED_UNICODE), $d['id']]);
    if (array_key_exists('image_prompt', $in))
        q('UPDATE dreams SET image_prompt = ? WHERE id = ?', [(string)$in['image_prompt'], $d['id']]);
    if (!empty($in['dream_date']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$in['dream_date']))
        q('UPDATE dreams SET dream_date = ? WHERE id = ?', [$in['dream_date'], $d['id']]);
    json_out(['ok' => true]);
}

case 'del_dream': {
    $u = require_login();
    $d = q('SELECT * FROM dreams WHERE id = ?', [(int)($in['id'] ?? 0)])->fetch();
    if (!$d) fail('Сон не найден', 404);
    if (!can_touch_dream($u, $d)) fail('Нет прав', 403);
    q('DELETE FROM dreams WHERE id = ?', [$d['id']]);
    q('DELETE FROM book_links WHERE (a_type="dream" AND a_id=?) OR (b_type="dream" AND b_id=?)', [$d['id'], $d['id']]);
    if ($d['image_file'] && !q('SELECT id FROM dreams WHERE image_file=? LIMIT 1', [$d['image_file']])->fetch()) {
        @unlink(cfg()['uploads'] . '/' . $d['image_file']);
        @unlink(cfg()['uploads'] . '/thumbs/' . $d['image_file']);
        @unlink(cfg()['uploads'] . '/thumbs/' . $d['image_file'] . '.webp');
    }
    json_out(['ok' => true]);
}

case 'set_image': { // дослать картину к уже существующему сну (синхронизация из программы)
    $u = require_login();
    $d = q('SELECT * FROM dreams WHERE id = ?', [(int)($_POST['id'] ?? 0)])->fetch();
    if (!$d) fail('Сон не найден', 404);
    if (!can_touch_dream($u, $d)) fail('Нет прав', 403);
    if (empty($_FILES['image']) || !is_uploaded_file($_FILES['image']['tmp_name']))
        fail('Нет файла картины');
    if ($d['image_file'] !== '' && empty($_POST['replace'])) json_out(['ok' => true, 'kept' => true]);
    $file = rand_name('jpg');
    save_image_resized(file_get_contents($_FILES['image']['tmp_name']), cfg()['uploads'] . '/' . $file);
    $old = $d['image_file'];
    q('UPDATE dreams SET image_file=? WHERE id=?', [$file, $d['id']]);
    // прежний файл убираем, если на него больше никто не ссылается
    if ($old !== '' && !q('SELECT id FROM dreams WHERE image_file=? LIMIT 1', [$old])->fetch())
        @unlink(cfg()['uploads'] . '/' . $old); @unlink(cfg()['uploads'] . '/thumbs/' . $old); @unlink(cfg()['uploads'] . '/thumbs/' . $old . '.webp');
    json_out(['ok' => true, 'image_file' => $file]);
}

case 'add_link': {
    $u = require_login();
    $a = q('SELECT * FROM dreams WHERE id = ?', [(int)($in['a'] ?? 0)])->fetch();
    $b = q('SELECT * FROM dreams WHERE id = ?', [(int)($in['b'] ?? 0)])->fetch();
    if (!$a || !$b || $a['id'] === $b['id']) fail('Нужны два разных сна');
    $cross = (int)$a['user_id'] !== (int)$b['user_id'];
    if ($cross && !over_owners($u, [(int)$a['user_id'], (int)$b['user_id']]))
        fail('Нет прав наводить этот мост', 403);
    if (!$cross && !can_touch_dream($u, $a)) fail('Нет прав', 403);
    $type = in_array($in['type'] ?? '', ['локация', 'персонаж', 'эмоция', 'символ', 'сюжет'], true)
        ? $in['type'] : 'сюжет';
    q('INSERT IGNORE INTO links (dream_a, dream_b, type, reason, created_by) VALUES (?,?,?,?,?)', [
        min($a['id'], $b['id']), max($a['id'], $b['id']), $type, trim($in['reason'] ?? ''), $u['id'],
    ]);
    json_out(['ok' => true]);
}

case 'add_links': { // нити пачкой (синхронизация из программы): те же проверки, что у add_link
    $u = require_login();
    $added = 0;
    $types = ['локация', 'персонаж', 'эмоция', 'символ', 'сюжет'];
    foreach (array_slice((array)($in['items'] ?? []), 0, 500) as $it) {
        $a = q('SELECT * FROM dreams WHERE id = ?', [(int)($it['a'] ?? 0)])->fetch();
        $b = q('SELECT * FROM dreams WHERE id = ?', [(int)($it['b'] ?? 0)])->fetch();
        if (!$a || !$b || $a['id'] === $b['id']) continue;
        $cross = (int)$a['user_id'] !== (int)$b['user_id'];
        if ($cross && !over_owners($u, [(int)$a['user_id'], (int)$b['user_id']])) continue;
        if (!$cross && !can_touch_dream($u, $a)) continue;
        $type = in_array($it['type'] ?? '', $types, true) ? $it['type'] : 'сюжет';
        $added += q('INSERT IGNORE INTO links (dream_a, dream_b, type, reason, created_by) VALUES (?,?,?,?,?)', [
            min($a['id'], $b['id']), max($a['id'], $b['id']), $type, trim($it['reason'] ?? ''), $u['id'],
        ])->rowCount();
    }
    json_out(['ok' => true, 'added' => $added]);
}

case 'del_link': {
    $u = require_login();
    $l = q('SELECT l.*, da.user_id ua, db_.user_id ub FROM links l
            JOIN dreams da ON da.id=l.dream_a JOIN dreams db_ ON db_.id=l.dream_b
            WHERE l.id = ?', [(int)($in['id'] ?? 0)])->fetch();
    if (!$l) fail('Связь не найдена', 404);
    $mine = (int)$l['ua'] === (int)$u['id'] && (int)$l['ub'] === (int)$u['id'];
    if (!$mine && !over_owners($u, [(int)$l['ua'], (int)$l['ub']])) fail('Нет прав', 403);
    q('DELETE FROM links WHERE id = ?', [$l['id']]);
    json_out(['ok' => true]);
}

case 'import': {
    $u = require_login();
    if (empty($_FILES['dreams'])) fail('Нет файла dreams.json');
    $raw = file_get_contents($_FILES['dreams']['tmp_name']);
    if (substr($raw, 0, 3) === "\xEF\xBB\xBF") $raw = substr($raw, 3); // BOM
    $data = json_decode($raw, true);
    if (!is_array($data)) fail('Файл не читается как JSON');
    $map = []; $added = 0;
    foreach ($data as $d) {
        if (empty($d['Id']) || empty($d['Text'])) continue;
        if (strpos($d['Id'], 'skybook') === 0) continue; // книги — в библиотеке, не на карте
        $row = q('SELECT id FROM dreams WHERE user_id=? AND ext_id=?', [$u['id'], $d['Id']])->fetch();
        if ($row) { $map[$d['Id']] = (int)$row['id']; continue; }
        $a = $d['Analysis'] ?? null;
        q('INSERT INTO dreams (user_id, ext_id, title, dream_date, text, summary, location,
            characters, emotions, symbols, motifs, image_prompt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [
            $u['id'], $d['Id'], $d['Title'] ?? 'Сон без имени', $d['Date'] ?? null, $d['Text'],
            $a['Summary'] ?? '', short_loc($a['Location'] ?? ''),
            json_encode($a['Characters'] ?? [], JSON_UNESCAPED_UNICODE),
            json_encode($a['Emotions'] ?? [], JSON_UNESCAPED_UNICODE),
            json_encode($a['Symbols'] ?? [], JSON_UNESCAPED_UNICODE),
            json_encode($a['Motifs'] ?? [], JSON_UNESCAPED_UNICODE),
            $d['ImagePrompt'] ?? '',
        ]);
        $newId = (int)db()->lastInsertId();
        $map[$d['Id']] = $newId; $added++;
        // картинка из папки программы: ищем среди загруженных файлов по имени
        if (!empty($d['ImageFile']) && !empty($_FILES['images'])) {
            foreach ($_FILES['images']['name'] as $i => $name) {
                if ($name === $d['ImageFile'] && is_uploaded_file($_FILES['images']['tmp_name'][$i])) {
                    $file = rand_name('jpg');
                    save_image_resized(file_get_contents($_FILES['images']['tmp_name'][$i]),
                        cfg()['uploads'] . '/' . $file);
                    q('UPDATE dreams SET image_file=? WHERE id=?', [$file, $newId]);
                }
            }
        }
    }
    // связи вторым проходом, когда все id известны
    foreach ($data as $d) {
        if (empty($d['Links']) || empty($map[$d['Id']])) continue;
        foreach ($d['Links'] as $l) {
            if (empty($map[$l['Id']])) continue;
            $a = min($map[$d['Id']], $map[$l['Id']]); $b = max($map[$d['Id']], $map[$l['Id']]);
            q('INSERT IGNORE INTO links (dream_a, dream_b, type, reason, created_by) VALUES (?,?,?,?,?)',
                [$a, $b, $l['Type'] ?? 'сюжет', $l['Reason'] ?? '', $u['id']]);
        }
    }
    json_out(['added' => $added, 'total' => count($map)]);
}

case 'cosmos': { // космос: сновидцы и мосты между их картами
    $u = require_moder();
    // в небе видны только свои: сам сновидец и те, кто вырос из его ветки приглашений
    $all = q('SELECT u.id, u.login, u.role, u.parent_id,
                (SELECT COUNT(*) FROM dreams d WHERE d.user_id = u.id) n
              FROM users u ORDER BY u.id')->fetchAll();
    $users = []; $visible = [];
    foreach ($all as $usr) {
        if ((int)$usr['id'] === (int)$u['id'] || can_manage($u, $usr)) {
            $users[] = $usr;
            $visible[(int)$usr['id']] = true;
        }
    }
    // мост показываем лишь когда обе его карты видимы смотрящему
    $bridges = array_values(array_filter(
        q('SELECT l.id, l.type, l.reason, da.user_id ua, db_.user_id ub
           FROM links l JOIN dreams da ON da.id = l.dream_a
           JOIN dreams db_ ON db_.id = l.dream_b
           WHERE da.user_id <> db_.user_id')->fetchAll(),
        function ($b) use ($visible) {
            return isset($visible[(int)$b['ua']]) && isset($visible[(int)$b['ub']]);
        }));
    json_out(['users' => $users, 'bridges' => $bridges]);
}

case 'user_map': { // карта одного сновидца — себе или строго вышестоящим
    $u = require_moder();
    $t = target_user((int)($_GET['uid'] ?? 0));
    if ((int)$t['id'] !== (int)$u['id'] && !can_manage($u, $t))
        fail('Эта карта вам недоступна', 403);
    $out = dreams_of((int)$t['id']);
    $out['user'] = $t;
    $out['founded'] = array_column(q('SELECT DISTINCT LOWER(TRIM(location)) k FROM books
        WHERE user_id = ? AND TRIM(location) <> ""', [$t['id']])->fetchAll(), 'k');
    json_out($out);
}

/* ===== библиотеки (у каждого своя; иерархия видит нижестоящих и передаёт вниз) ===== */

case 'books_list': {
    $u = require_login();
    $uid = (int)($_GET['uid'] ?? $u['id']);
    if ($uid !== (int)$u['id']) {
        $t = target_user($uid);
        if (!can_manage($u, $t))
            fail('Чужая библиотека вам недоступна', 403);
    }
    json_out(['books' => q('SELECT id, user_id, num, title, text, translation, location, folder_id, updated_at
                            FROM books WHERE user_id = ? ORDER BY num', [$uid])->fetchAll()]);
}

case 'books_import': { // импорт мода — в СВОЮ библиотеку, доступен всем
    $u = require_login();
    if (empty($_FILES['books'])) fail('Нет файла books.json');
    $raw = file_get_contents($_FILES['books']['tmp_name']);
    if (substr($raw, 0, 3) === "\xEF\xBB\xBF") $raw = substr($raw, 3);
    $data = json_decode($raw, true);
    if (!is_array($data)) fail('Файл не читается как JSON');
    $n = 0;
    foreach ($data as $b) {
        if (!isset($b['num'], $b['title'])) continue;
        $text = pua_to_uni(preg_replace('/<[^>]+>/u', '', $b['text'] ?? ''));
        $seal = seal_extract($text);   // печать остаётся только на сервере и не меняется
        q('INSERT INTO books (user_id, num, title, text, translation, seal) VALUES (?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE title=VALUES(title), text=VALUES(text),
             translation=IF(VALUES(translation)<>"", VALUES(translation), translation),
             seal=IF(seal="", VALUES(seal), seal)', [
            $u['id'], (int)$b['num'], $b['title'], $text, $b['translation'] ?? '', $seal,
        ]);
        $n++;
    }
    json_out(['imported' => $n]);
}

case 'book_add': {
    $u = require_login();
    $title = trim($in['title'] ?? '');
    if ($title === '') fail('Нужно название книги');
    $num = (int)q('SELECT COALESCE(MAX(num),0)+1 n FROM books WHERE user_id=?', [$u['id']])->fetch()['n'];
    $text = $in['text'] ?? '';
    $seal = seal_extract($text);
    q('INSERT INTO books (user_id, num, title, text, translation, seal) VALUES (?,?,?,?,"",?)',
        [$u['id'], $num, $title, $text, $seal]);
    json_out(['id' => (int)db()->lastInsertId(), 'num' => $num]);
}

case 'book_edit': case 'book_del': case 'book_give': case 'book_interpret': {
    $u = require_login();
    $b = q('SELECT * FROM books WHERE id = ?', [(int)($in['id'] ?? 0)])->fetch();
    if (!$b) fail('Книга не найдена', 404);
    // доступ: своя книга, либо владелец книги ниже меня по иерархии
    if ((int)$b['user_id'] !== (int)$u['id']) {
        $owner = target_user((int)$b['user_id']);
        if (!can_manage($u, $owner))
            fail('Нет доступа к этой книге', 403);
    }
    if ($action === 'book_edit') {
        $newText = array_key_exists('text', $in) ? $in['text'] : $b['text'];
        // печать неизменяема: новая печать в тексте вычищается; поставить можно
        // только если книги была без печати; убрать — только удалив книгу
        $incoming = seal_extract($newText);
        $seal = $b['seal'] !== '' ? $b['seal'] : $incoming;
        q('UPDATE books SET title=?, text=?, translation=?, seal=?, location=? WHERE id=?', [
            trim($in['title'] ?? $b['title']) ?: $b['title'],
            $newText,
            array_key_exists('translation', $in) ? $in['translation'] : $b['translation'],
            $seal,
            array_key_exists('location', $in) ? trim($in['location']) : $b['location'],
            $b['id'],
        ]);
        json_out(['ok' => true]);
    }
    if ($action === 'book_del') {
        q('DELETE FROM books WHERE id = ?', [$b['id']]);
        q('DELETE FROM book_links WHERE (a_type="book" AND a_id=?) OR (b_type="book" AND b_id=?)',
            [$b['id'], $b['id']]);
        json_out(['ok' => true]);
    }
    if ($action === 'book_give') {
        json_out(gift_offer($u, 'book', $b, (int)($in['to'] ?? 0), trim($in['message'] ?? '')));
    }
    // book_interpret — полный ритуал оракула; печать с сервера подкладывается в свиток
    if (!$u['openrouter_key']) fail('Нет доступа к ИИ: нужен ключ (свой или выданный админом)');
    $scroll = ($b['seal'] !== '' ? $b['seal'] . "\n" : '') . $b['text'];
    try { $tr = oracle_translate(with_owner_models($u), $scroll, $b['title'], trim($in['key_clause'] ?? '')); }
    catch (Exception $e) { fail('Трактовка: ' . $e->getMessage()); }
    $kc = trim($in['key_clause'] ?? '');
    if ($kc !== '') {
        $kname = trim(explode(' — ', $kc)[0]);
        $tr = 'Ключ трактовки: ' . $kname . "\n\n" . $tr;
    }
    q('UPDATE books SET translation = ? WHERE id = ?', [$tr, $b['id']]);
    json_out(['translation' => $tr]);
}

/* ===== оракул иероглифов: произвольный свиток ===== */

case 'oracle': {
    $u = require_login();
    if (!$u['openrouter_key']) fail('Нет доступа к ИИ: нужен ключ (свой или выданный админом)');
    $text = trim($in['text'] ?? '');
    if ($text === '') fail('Пустой свиток');
    try { $tr = oracle_translate(with_owner_models($u), $text, trim($in['title'] ?? ''), trim($in['key_clause'] ?? '')); }
    catch (Exception $e) { fail('Оракул: ' . $e->getMessage()); }
    json_out(['translation' => $tr]);
}

/* ===== файлы сюиты «Гермес»: выкладывает владелец, передаются вниз ===== */

case 'files_list': {
    $u = require_login();
    $uid = (int)($_GET['uid'] ?? $u['id']);
    if ($uid !== (int)$u['id']) {
        $t = target_user($uid);
        if (!can_manage($u, $t))
            fail('Чужие полки вам недоступны', 403);
    }
    json_out(['files' => q('SELECT id, user_id, title, file, size, icon, descr, folder_id, created_at
                            FROM suite_files WHERE user_id = ? ORDER BY id', [$uid])->fetchAll()]);
}

case 'file_add': { // исходники сюиты на сайт не попадают — только скомпилированное, и только владелец
    $u = require_login();
    if ($u['role'] !== 'owner') fail('Файлы сюиты выкладывает только владелец', 403);
    if (empty($_FILES['bin'])) fail('Нет файла');
    $title = trim($_POST['title'] ?? '') ?: $_FILES['bin']['name'];
    q('INSERT INTO suite_files (user_id, title, file, size, descr) VALUES (?,?,"",?,?)',
        [$u['id'], $title, (int)$_FILES['bin']['size'], trim($_POST['descr'] ?? '')]);
    $id = (int)db()->lastInsertId();
    $dir = cfg()['uploads'] . '/files';
    if (!is_dir($dir)) mkdir($dir, 0777, true);
    $ext = preg_replace('/[^A-Za-z0-9.]/', '', pathinfo($_FILES['bin']['name'], PATHINFO_EXTENSION));
    $file = rand_name($ext);
    move_uploaded_file($_FILES['bin']['tmp_name'], $dir . '/' . $file);
    $icon = '';
    if (!empty($_FILES['icon']) && is_uploaded_file($_FILES['icon']['tmp_name'])) {
        $iext = strtolower(preg_replace('/[^A-Za-z0-9]/', '',
            pathinfo($_FILES['icon']['name'], PATHINFO_EXTENSION)));
        if (in_array($iext, ['ico', 'png'], true)) {
            if (!is_dir($dir . '/icons')) mkdir($dir . '/icons', 0777, true);
            $icon = rand_name($iext);
            move_uploaded_file($_FILES['icon']['tmp_name'], $dir . '/icons/' . $icon);
        }
    }
    q('UPDATE suite_files SET file = ?, icon = ? WHERE id = ?', [$file, $icon, $id]);
    json_out(['id' => $id]);
}

case 'file_edit': { // правка продукта: название, описание, замена иконки и файла — только владелец
    $u = require_login();
    if ($u['role'] !== 'owner') fail('Файлы сюиты правит только владелец', 403);
    $b = q('SELECT * FROM suite_files WHERE id = ? AND user_id = ?',
        [(int)($_POST['id'] ?? 0), $u['id']])->fetch();
    if (!$b) fail('Файл не найден', 404);
    $dir = cfg()['uploads'] . '/files';
    $title = trim($_POST['title'] ?? '') ?: $b['title'];
    $descr = trim($_POST['descr'] ?? '');
    $file = $b['file']; $size = (int)$b['size']; $icon = $b['icon'];
    if (!empty($_FILES['bin']) && is_uploaded_file($_FILES['bin']['tmp_name'])) {
        $ext = preg_replace('/[^A-Za-z0-9.]/', '', pathinfo($_FILES['bin']['name'], PATHINFO_EXTENSION));
        $file = rand_name($ext);
        move_uploaded_file($_FILES['bin']['tmp_name'], $dir . '/' . $file);
        $size = (int)$_FILES['bin']['size'];
        // прежний файл остаётся на сервере — файлы копятся, стирает только lib_purge
    }
    if (!empty($_FILES['icon']) && is_uploaded_file($_FILES['icon']['tmp_name'])) {
        $iext = strtolower(preg_replace('/[^A-Za-z0-9]/', '',
            pathinfo($_FILES['icon']['name'], PATHINFO_EXTENSION)));
        if (in_array($iext, ['ico', 'png'], true)) {
            if (!is_dir($dir . '/icons')) mkdir($dir . '/icons', 0777, true);
            $icon = rand_name($iext);
            move_uploaded_file($_FILES['icon']['tmp_name'], $dir . '/icons/' . $icon);
        }
    }
    q('UPDATE suite_files SET title=?, descr=?, file=?, size=?, icon=? WHERE id=?',
        [$title, $descr, $file, $size, $icon, $b['id']]);
    json_out(['ok' => true]);
}

case 'file_icon': { // иконка продукта — доступ тот же, что к самой полке
    $u = require_login();
    $b = q('SELECT * FROM suite_files WHERE id = ?', [(int)($_GET['id'] ?? 0)])->fetch();
    if (!$b || $b['icon'] === '') fail('Нет иконки', 404);
    if ((int)$b['user_id'] !== (int)$u['id']) {
        $owner = target_user((int)$b['user_id']);
        if (!can_manage($u, $owner)) fail('Нет доступа', 403);
    }
    $path = cfg()['uploads'] . '/files/icons/' . $b['icon'];
    if (!is_file($path)) fail('Нет иконки', 404);
    header('Content-Type: ' . (substr($b['icon'], -4) === '.png' ? 'image/png' : 'image/x-icon'));
    header('Cache-Control: private, max-age=86400');
    readfile($path);
    exit;
}

case 'file_get': case 'file_del': case 'file_give': {
    $u = require_login();
    $b = q('SELECT * FROM suite_files WHERE id = ?', [(int)($_REQUEST['id'] ?? $in['id'] ?? 0)])->fetch();
    if (!$b) fail('Файл не найден', 404);
    if ((int)$b['user_id'] !== (int)$u['id']) {
        $owner = target_user((int)$b['user_id']);
        if (!can_manage($u, $owner))
            fail('Нет доступа', 403);
    }
    if ($action === 'file_get') {
        $path = cfg()['uploads'] . '/files/' . $b['file'];
        if (!is_file($path)) fail('Файл потерян', 404);
        // имя при скачивании: настоящее имя файла из скобок названия, иначе название + расширение
        $dl = $b['title'];
        if (preg_match('/\(([^()]+\.[A-Za-z0-9]{1,5})\)\s*$/u', $b['title'], $m)) $dl = $m[1];
        elseif (($ext = pathinfo($b['file'], PATHINFO_EXTENSION)) &&
                !preg_match('/\.' . preg_quote($ext, '/') . '$/i', $dl)) $dl .= '.' . $ext;
        header('Content-Type: application/octet-stream');
        header('Content-Length: ' . filesize($path));
        header('Content-Disposition: attachment; filename="' . rawurlencode($dl) . '"');
        // большие файлы (установщик Таро — 1,6 ГБ) не должны обрываться пределом времени PHP
        set_time_limit(0);
        while (ob_get_level() > 0) ob_end_clean();
        readfile($path);
        exit;
    }
    if ($action === 'file_del') {   // убрать из библиотеки; сам файл остаётся на сервере
        q('DELETE FROM suite_files WHERE id = ?', [$b['id']]);
        json_out(['ok' => true]);
    }
    // file_give: предложение дара (с согласием получателя)
    json_out(gift_offer($u, 'file', $b, (int)($in['to'] ?? 0), trim($in['message'] ?? '')));
}

/* ===== PDF-библиотеки: та же иерархия; в игру не попадают ===== */

case 'pdfs_list': {
    $u = require_login();
    $uid = (int)($_GET['uid'] ?? $u['id']);
    if ($uid !== (int)$u['id']) {
        $t = target_user($uid);
        if (!can_manage($u, $t))
            fail('Чужая библиотека вам недоступна', 403);
    }
    $rows = q('SELECT id, user_id, ext_id, title, folder_id, last_page, created_at, file
               FROM pdf_books WHERE user_id = ? ORDER BY id', [$uid])->fetchAll();
    foreach ($rows as &$r) {   // размер — для полосы хода при скачивании; обложка — готовая на сайте
        $p = cfg()['uploads'] . '/pdf/' . $r['file'];
        $r['size'] = is_file($p) ? filesize($p) : 0;
        $r['has_cover'] = $r['file'] !== '' && is_file(pdf_cover_path($r['file'])) ? 1 : 0;
        unset($r['file']);
    }
    unset($r);
    json_out(['pdfs' => $rows]);
}

case 'pdf_page': {  // запомнить последнюю открытую страницу этого PDF у этого читателя
    $u = require_login();
    $page = max(0, (int)($in['page'] ?? 0));
    $ext = trim($in['ext_id'] ?? '');
    $id = (int)($in['id'] ?? 0);
    if ($ext !== '')
        $n = q('UPDATE pdf_books SET last_page = ? WHERE user_id = ? AND ext_id = ?',
            [$page, $u['id'], $ext])->rowCount();
    else
        $n = q('UPDATE pdf_books SET last_page = ? WHERE id = ? AND user_id = ?',
            [$page, $id, $u['id']])->rowCount();
    json_out(['ok' => true, 'saved' => $n]);
}

case 'pdf_add': {
    $u = require_login();
    if (empty($_FILES['pdf'])) fail('Нет PDF-файла');
    $tmp = $_FILES['pdf']['tmp_name'];
    if (substr(file_get_contents($tmp, false, null, 0, 5), 0, 5) !== '%PDF-')
        fail('Это не PDF-файл');
    $title = trim($_POST['title'] ?? '') ?: preg_replace('/\.pdf$/i', '', $_FILES['pdf']['name']);
    $ext = trim($_POST['ext_id'] ?? '');
    if ($ext !== '' && q('SELECT id FROM pdf_books WHERE user_id=? AND ext_id=?', [$u['id'], $ext])->fetch())
        json_out(['ok' => true, 'dup' => true]);
    q('INSERT INTO pdf_books (user_id, ext_id, title, file) VALUES (?,?,?,"")',
        [$u['id'], $ext, $title]);
    $id = (int)db()->lastInsertId();
    $dir = cfg()['uploads'] . '/pdf';
    if (!is_dir($dir)) mkdir($dir, 0777, true);
    $file = rand_name('pdf');
    move_uploaded_file($tmp, $dir . '/' . $file);
    q('UPDATE pdf_books SET file = ? WHERE id = ?', [$file, $id]);
    pdf_cover_bake($file);   // обложка готова сразу — устройствам рисовать её не нужно
    json_out(['id' => $id]);
}

case 'pdf_file': case 'pdf_del': case 'pdf_give': case 'pdf_cover': case 'pdf_cover_set': {
    $u = require_login();
    $b = q('SELECT * FROM pdf_books WHERE id = ?', [(int)($_REQUEST['id'] ?? $in['id'] ?? 0)])->fetch();
    if (!$b) fail('PDF не найден', 404);
    if ((int)$b['user_id'] !== (int)$u['id']) {
        $owner = target_user((int)$b['user_id']);
        if (!can_manage($u, $owner))
            fail('Нет доступа', 403);
    }
    // обложка — первая страница маленькой картинкой; общая для всех копий одного файла
    if ($action === 'pdf_cover') {
        $cp = pdf_cover_path($b['file']);
        if ($b['file'] === '' || !is_file($cp)) fail('Обложки нет', 404);
        header('Content-Type: image/webp');
        header('Content-Length: ' . filesize($cp));
        header('Cache-Control: private, max-age=86400');
        readfile($cp);
        exit;
    }
    if ($action === 'pdf_cover_set') {
        if (empty($_FILES['cover']) || $b['file'] === '') fail('Нет картинки');
        $tmp = $_FILES['cover']['tmp_name'];
        if (filesize($tmp) > 300 * 1024) fail('Обложка слишком большая');
        if (file_get_contents($tmp, false, null, 0, 3) !== "\xFF\xD8\xFF") fail('Обложка — только JPEG');
        $cp = pdf_cover_path($b['file']);
        if (!is_dir(dirname($cp))) mkdir(dirname($cp), 0777, true);
        // присланный JPEG — в лёгкий WebP, как и испечённые сайтом
        @shell_exec('convert ' . escapeshellarg($tmp) . " -resize '160x>' -strip -quality 70 webp:" . escapeshellarg($cp) . ' 2>/dev/null');
        if (!is_file($cp)) fail('Обложка не сохранилась', 500);
        json_out(['ok' => true]);
    }
    if ($action === 'pdf_file') { // отдаём файл только своим/вышестоящим — прямых ссылок нет
        $path = cfg()['uploads'] . '/pdf/' . $b['file'];
        if (!is_file($path)) fail('Файл потерян', 404);
        $size = filesize($path);
        header('Content-Type: application/pdf');
        header('Content-Disposition: inline');
        header('X-Content-Type-Options: nosniff');
        header('Accept-Ranges: bytes');
        // кусками по Range: читалка сперва берёт только то, что нужно первым страницам
        if (preg_match('/^bytes=(\d*)-(\d*)$/', $_SERVER['HTTP_RANGE'] ?? '', $m) && ($m[1] !== '' || $m[2] !== '')) {
            $a = $m[1] === '' ? max(0, $size - (int)$m[2]) : (int)$m[1];
            $z = ($m[1] === '' || $m[2] === '') ? $size - 1 : min((int)$m[2], $size - 1);
            if ($a > $z || $a >= $size) { http_response_code(416); header("Content-Range: bytes */$size"); exit; }
            http_response_code(206);
            header("Content-Range: bytes $a-$z/$size");
            header('Content-Length: ' . ($z - $a + 1));
            set_time_limit(0);
            $fh = fopen($path, 'rb'); fseek($fh, $a);
            for ($left = $z - $a + 1; $left > 0 && !feof($fh); $left -= 65536) echo fread($fh, min(65536, $left));
            fclose($fh);
            exit;
        }
        header('Content-Length: ' . $size);
        set_time_limit(0);
        readfile($path);
        exit;
    }
    if ($action === 'pdf_del') {   // убрать из библиотеки; сам файл остаётся на сервере
        q('DELETE FROM pdf_books WHERE id = ?', [$b['id']]);
        q('DELETE FROM book_links WHERE (a_type="pdf" AND a_id=?) OR (b_type="pdf" AND b_id=?)',
            [$b['id'], $b['id']]);
        json_out(['ok' => true]);
    }
    // pdf_give: предложение дара (с согласием получателя)
    json_out(gift_offer($u, 'pdf', $b, (int)($in['to'] ?? 0), trim($in['message'] ?? '')));
}

/* ===== глобальные связи книг (иероглифы + PDF, доступ по иерархии) ===== */

case 'book_links_list': {
    $u = require_login();
    $type = bl_type($_GET['type'] ?? '');
    $item = bl_item($u, $type, (int)($_GET['id'] ?? 0));
    $rows = q('SELECT * FROM book_links
               WHERE (a_type = ? AND a_id = ?) OR (b_type = ? AND b_id = ?)',
        [$type, $item['id'], $type, $item['id']])->fetchAll();
    $out = [];
    foreach ($rows as $l) {
        $ot = ($l['a_type'] === $type && (int)$l['a_id'] === (int)$item['id'])
            ? [$l['b_type'], (int)$l['b_id']] : [$l['a_type'], (int)$l['a_id']];
        $tbl = bl_table($ot[0]);
        $b = q("SELECT b.*, u.login FROM $tbl b JOIN users u ON u.id = b.user_id WHERE b.id = ?", [$ot[1]])->fetch();
        if (!$b) continue;
        $out[] = ['id' => (int)$l['id'], 'type' => $ot[0], 'bid' => (int)$b['id'],
                  'title' => $b['title'], 'owner_id' => (int)$b['user_id'],
                  'owner' => $b['login'], 'reason' => $l['reason'],
                  'ext_id' => $b['ext_id'] ?? '', 'num' => isset($b['num']) ? (int)$b['num'] : null];
    }
    json_out(['links' => $out]);
}

case 'book_link_add': {
    $u = require_login();
    $at = bl_type($in['a_type'] ?? '');
    $bt = bl_type($in['b_type'] ?? '');
    $a = bl_item($u, $at, (int)($in['a_id'] ?? 0));   // доступ нужен к ОБОИМ концам
    $b = bl_item($u, $bt, (int)($in['b_id'] ?? 0));
    if ($at === $bt && (int)$a['id'] === (int)$b['id']) fail('Нельзя связать с самим собой');
    if ($at === 'dream' && $bt === 'dream') fail('Сны связываются нитями на карте');
    // нормализуем порядок, чтобы пара была уникальна в любом направлении
    $ka = $at . ':' . $a['id']; $kb = $bt . ':' . $b['id'];
    if (strcmp($ka, $kb) > 0) { $tmp = [$at, $a]; $at = $bt; $a = $b; $bt = $tmp[0]; $b = $tmp[1]; }
    q('INSERT IGNORE INTO book_links (a_type, a_id, b_type, b_id, reason, created_by)
       VALUES (?,?,?,?,?,?)', [$at, $a['id'], $bt, $b['id'], trim($in['reason'] ?? ''), $u['id']]);
    json_out(['ok' => true]);
}

case 'book_link_del': {
    $u = require_login();
    $l = q('SELECT * FROM book_links WHERE id = ?', [(int)($in['id'] ?? 0)])->fetch();
    if (!$l) fail('Связь не найдена', 404);
    bl_item($u, $l['a_type'], (int)$l['a_id']);   // развязать может тот, кому доступны обе
    bl_item($u, $l['b_type'], (int)$l['b_id']);
    q('DELETE FROM book_links WHERE id = ?', [$l['id']]);
    json_out(['ok' => true]);
}

/* ===== доверие и дары: единственная дверь в чужой космос ===== */

case 'trusts_list': {
    $u = require_login();
    $rows = q('SELECT t.*, ua.login a_login, ub.login b_login FROM trusts t
               JOIN users ua ON ua.id = t.a_user JOIN users ub ON ub.id = t.b_user
               WHERE t.a_user = ? OR t.b_user = ?', [$u['id'], $u['id']])->fetchAll();
    $out = [];
    foreach ($rows as $t) {
        $iAmA = (int)$t['a_user'] === (int)$u['id'];
        $out[] = [
            'id' => (int)$t['id'],
            'other' => $iAmA ? $t['b_login'] : $t['a_login'],
            'status' => $t['status'],
            'incoming' => !$iAmA && $t['status'] === 'pending',
            'my_auto' => (int)($iAmA ? $t['auto_a'] : $t['auto_b']),
        ];
    }
    json_out(['trusts' => $out]);
}

case 'trust_request': {
    $u = require_login();
    $to = q('SELECT id, login FROM users WHERE login = ?', [trim($in['login'] ?? '')])->fetch();
    if (!$to) fail('Сновидец с таким логином не найден');
    if ((int)$to['id'] === (int)$u['id']) fail('Себе доверять можно и без записи');
    if (trust_between((int)$u['id'], (int)$to['id'])) fail('Связь доверия уже есть или предложена');
    q('INSERT INTO trusts (a_user, b_user) VALUES (?,?)', [$u['id'], $to['id']]);
    json_out(['ok' => true, 'to' => $to['login']]);
}

case 'trust_decide': {
    $u = require_login();
    $t = q('SELECT * FROM trusts WHERE id = ? AND b_user = ? AND status = "pending"',
        [(int)($in['id'] ?? 0), $u['id']])->fetch();
    if (!$t) fail('Предложение не найдено', 404);
    if (!empty($in['accept'])) q('UPDATE trusts SET status = "accepted" WHERE id = ?', [$t['id']]);
    else q('DELETE FROM trusts WHERE id = ?', [$t['id']]);
    json_out(['ok' => true]);
}

case 'trust_revoke': { // доверие отзывается любой стороной в любой момент
    $u = require_login();
    q('DELETE FROM trusts WHERE id = ? AND (a_user = ? OR b_user = ?)',
        [(int)($in['id'] ?? 0), $u['id'], $u['id']]);
    json_out(['ok' => true]);
}

case 'trust_auto': { // «я автоматически принимаю дары от него»
    $u = require_login();
    $t = q('SELECT * FROM trusts WHERE id = ? AND status = "accepted"
            AND (a_user = ? OR b_user = ?)', [(int)($in['id'] ?? 0), $u['id'], $u['id']])->fetch();
    if (!$t) fail('Связь доверия не найдена', 404);
    $col = (int)$t['a_user'] === (int)$u['id'] ? 'auto_a' : 'auto_b';
    q("UPDATE trusts SET $col = ? WHERE id = ?", [empty($in['auto']) ? 0 : 1, $t['id']]);
    json_out(['ok' => true]);
}

case 'gift_recipients': { // кому я могу предложить дар: доверенные + нижестоящие
    $u = require_login();
    $res = [];
    foreach (q('SELECT id, login, role FROM users WHERE id <> ? ORDER BY login', [$u['id']])->fetchAll() as $r) {
        $t = trust_between((int)$u['id'], (int)$r['id']);
        $trusted = $t && $t['status'] === 'accepted';
        $over = can_manage($u, $r);
        if ($trusted || $over)
            $res[] = ['id' => (int)$r['id'], 'login' => $r['login'],
                      'how' => $trusted ? 'доверие' : 'подопечный'];
    }
    json_out(['users' => $res]);
}

case 'gift_send': {
    $u = require_login();
    $type = in_array($in['type'] ?? '', ['book', 'pdf', 'file'], true) ? $in['type'] : 'book';
    $tbl = $type === 'book' ? 'books' : ($type === 'pdf' ? 'pdf_books' : 'suite_files');
    $item = q("SELECT * FROM $tbl WHERE id = ? AND user_id = ?",
        [(int)($in['id'] ?? 0), $u['id']])->fetch();
    if (!$item) fail('Дарить можно только со своей полки');
    json_out(gift_offer($u, $type, $item, (int)($in['to'] ?? 0), trim($in['message'] ?? '')));
}

case 'gifts_list': {
    $u = require_login();
    $inc = q('SELECT g.*, uf.login from_login FROM gifts g
              JOIN users uf ON uf.id = g.from_user
              WHERE g.to_user = ? AND g.status = "pending" ORDER BY g.id DESC', [$u['id']])->fetchAll();
    $inc = gift_decorate($inc);
    // принятые дары — их ещё можно скормить чёрной дыре
    $acc = q('SELECT g.*, uf.login from_login FROM gifts g
              JOIN users uf ON uf.id = g.from_user
              WHERE g.to_user = ? AND g.status = "accepted" AND g.copy_id IS NOT NULL
              ORDER BY g.id DESC LIMIT 20', [$u['id']])->fetchAll();
    $acc = array_values(array_filter($acc, function ($g) {
        $tbl = $g['item_type'] === 'book' ? 'books' : ($g['item_type'] === 'pdf' ? 'pdf_books' : 'suite_files');
        return (bool)q("SELECT id FROM $tbl WHERE id = ? AND user_id = ?",
            [(int)$g['copy_id'], (int)$g['to_user']])->fetch();
    }));
    $acc = gift_decorate($acc);
    $out = gift_decorate(q('SELECT g.*, ut.login to_login FROM gifts g
              JOIN users ut ON ut.id = g.to_user
              WHERE g.from_user = ? ORDER BY g.id DESC LIMIT 15', [$u['id']])->fetchAll());
    json_out(['incoming' => $inc, 'accepted' => $acc, 'outgoing' => $out, 'count' => count($inc)]);
}

case 'gift_icon': { // иконка дара — видна дарителю и получателю, пока дар жив
    $u = require_login();
    $g = q('SELECT * FROM gifts WHERE id = ? AND (to_user = ? OR from_user = ?)',
        [(int)($_GET['id'] ?? 0), $u['id'], $u['id']])->fetch();
    if (!$g || $g['item_type'] !== 'file') fail('Нет иконки', 404);
    $f = q('SELECT icon FROM suite_files WHERE id = ?', [(int)$g['item_id']])->fetch();
    if (!$f || $f['icon'] === '') fail('Нет иконки', 404);
    $path = cfg()['uploads'] . '/files/icons/' . $f['icon'];
    if (!is_file($path)) fail('Нет иконки', 404);
    header('Content-Type: ' . (substr($f['icon'], -4) === '.png' ? 'image/png' : 'image/x-icon'));
    header('Cache-Control: private, max-age=3600');
    readfile($path);
    exit;
}

case 'gift_decide': { // согласие получателя — единственный путь дара в космос
    $u = require_login();
    $g = q('SELECT * FROM gifts WHERE id = ? AND to_user = ? AND status = "pending"',
        [(int)($in['id'] ?? 0), $u['id']])->fetch();
    if (!$g) fail('Дар не найден', 404);
    if (!empty($in['accept'])) {
        $tbl = $g['item_type'] === 'book' ? 'books' : ($g['item_type'] === 'pdf' ? 'pdf_books' : 'suite_files');
        $item = q("SELECT * FROM $tbl WHERE id = ?", [(int)$g['item_id']])->fetch();
        if (!$item) fail('Дар растаял: вещь уже удалена дарителем');
        $cid = gift_copy_item($g['item_type'], $item, (int)$u['id']);
        q('UPDATE gifts SET status = "accepted", decided_at = NOW(), copy_id = ? WHERE id = ?',
            [$cid, $g['id']]);
        json_out(['ok' => true, 'accepted' => true]);
    }
    q('UPDATE gifts SET status = "declined", decided_at = NOW() WHERE id = ?', [$g['id']]);
    json_out(['ok' => true, 'accepted' => false]);
}

case 'gift_devour': { // чёрная дыра: нейтрализация неугодного дара получателем
    $u = require_login();
    $g = q('SELECT * FROM gifts WHERE id = ? AND to_user = ? AND status IN ("pending","accepted")',
        [(int)($in['id'] ?? 0), $u['id']])->fetch();
    if (!$g) fail('Дар не найден', 404);
    if ($g['status'] === 'accepted') gift_devour_copy($g);
    q('UPDATE gifts SET status = "devoured", decided_at = NOW() WHERE id = ?', [$g['id']]);
    json_out(['ok' => true]);
}

/* ===== полки-папки: у каждого свои, для книг, PDF и файлов сюиты ===== */

case 'folders_list': {
    $u = require_login();
    $uid = (int)($_GET['uid'] ?? $u['id']);
    if ($uid !== (int)$u['id']) require_over($u, target_user($uid));   // чужие полки — подопечных
    json_out(['folders' => q(
        'SELECT f.id, f.name, f.kind, f.parent_id,
                (SELECT COUNT(*) FROM books b WHERE b.folder_id = f.id) books,
                (SELECT COUNT(*) FROM pdf_books p WHERE p.folder_id = f.id) pdfs,
                (SELECT COUNT(*) FROM suite_files s WHERE s.folder_id = f.id) files
         FROM folders f WHERE f.user_id = ? ORDER BY f.name', [$uid])->fetchAll()]);
}

case 'lib_index': {  // лёгкий слепок библиотеки: без текстов книг — для быстрых полок
    $u = require_login();
    $uid = (int)($_GET['uid'] ?? $u['id']);
    if ($uid !== (int)$u['id']) require_over($u, target_user($uid));
    json_out([
        'folders' => q('SELECT id, name, kind, parent_id FROM folders WHERE user_id = ? ORDER BY name',
            [$uid])->fetchAll(),
        'books' => q('SELECT id, num, folder_id FROM books WHERE user_id = ? ORDER BY num',
            [$uid])->fetchAll(),
        'pdfs' => q('SELECT id, ext_id, folder_id FROM pdf_books WHERE user_id = ? ORDER BY id',
            [$uid])->fetchAll(),
        'files' => q('SELECT id, title, file, size, icon, descr, folder_id
                      FROM suite_files WHERE user_id = ? ORDER BY id', [$uid])->fetchAll(),
    ]);
}

case 'folder_create': {   // папка на полке или внутри другой папки (вложенность любая)
    $u = require_login();
    $name = trim($in['name'] ?? '');
    if ($name === '') fail('У папки должно быть имя');
    if (mb_strlen($name) > 120) $name = mb_substr($name, 0, 120);
    $kind = in_array($in['kind'] ?? '', ['book', 'pdf', 'file'], true) ? $in['kind'] : 'book';
    $parent = folder_parent_arg($u, $in['parent'] ?? null, $kind);
    if (folder_name_taken($u, $kind, $parent, $name, 0))
        fail('Папка с таким именем здесь уже есть');
    q('INSERT INTO folders (user_id, name, kind, parent_id) VALUES (?,?,?,?)', [$u['id'], $name, $kind, $parent]);
    json_out(['id' => (int)db()->lastInsertId(), 'name' => $name, 'kind' => $kind, 'parent_id' => $parent]);
}

case 'folder_rename': {
    $u = require_login();
    $f = q('SELECT * FROM folders WHERE id = ? AND user_id = ?',
        [(int)($in['id'] ?? 0), $u['id']])->fetch();
    if (!$f) fail('Папка не найдена', 404);
    $name = trim($in['name'] ?? '');
    if ($name === '') fail('У папки должно быть имя');
    $name = mb_substr($name, 0, 120);
    if (folder_name_taken($u, $f['kind'], $f['parent_id'] === null ? null : (int)$f['parent_id'], $name, (int)$f['id']))
        fail('Папка с таким именем здесь уже есть');
    q('UPDATE folders SET name = ? WHERE id = ?', [$name, $f['id']]);
    json_out(['ok' => true]);
}

case 'folder_move': {   // перенести папку (со всем содержимым) в другую папку или на полку
    $u = require_login();
    $f = q('SELECT * FROM folders WHERE id = ? AND user_id = ?',
        [(int)($in['id'] ?? 0), $u['id']])->fetch();
    if (!$f) fail('Папка не найдена', 404);
    $parent = folder_parent_arg($u, $in['parent'] ?? null, $f['kind']);
    // нельзя в саму себя и в свою же подпапку — круг
    for ($p = $parent; $p !== null; ) {
        if ($p === (int)$f['id']) fail('Папку нельзя положить в саму себя или в её подпапку');
        $row = q('SELECT parent_id FROM folders WHERE id = ?', [$p])->fetch();
        $p = $row && $row['parent_id'] !== null ? (int)$row['parent_id'] : null;
    }
    if (folder_name_taken($u, $f['kind'], $parent, $f['name'], (int)$f['id']))
        fail('Там уже есть папка с таким именем');
    q('UPDATE folders SET parent_id = ? WHERE id = ?', [$parent, $f['id']]);
    json_out(['ok' => true]);
}

case 'folder_del': {   // папку убираем: её вещи и подпапки поднимаются на уровень выше
    $u = require_login();
    $f = q('SELECT * FROM folders WHERE id = ? AND user_id = ?',
        [(int)($in['id'] ?? 0), $u['id']])->fetch();
    if (!$f) fail('Папка не найдена', 404);
    $up = $f['parent_id'] === null ? null : (int)$f['parent_id'];
    $moved = 0;
    foreach (['books', 'pdf_books', 'suite_files'] as $t)
        $moved += q("UPDATE $t SET folder_id = ? WHERE folder_id = ? AND user_id = ?",
            [$up, $f['id'], $u['id']])->rowCount();
    // подпапки — тоже выше; совпало имя — к имени добавится номер
    foreach (q('SELECT id, name FROM folders WHERE parent_id = ? AND user_id = ?', [$f['id'], $u['id']])->fetchAll() as $c) {
        $name = $c['name'];
        for ($i = 2; folder_name_taken($u, $f['kind'], $up, $name, (int)$c['id']); $i++) $name = $c['name'] . ' ' . $i;
        q('UPDATE folders SET parent_id = ?, name = ? WHERE id = ?', [$up, $name, $c['id']]);
        $moved++;
    }
    q('DELETE FROM folders WHERE id = ?', [$f['id']]);
    json_out(['ok' => true, 'freed' => $moved]);
}

case 'items_move': {   // переложить сразу несколько вещей: в папку или обратно на полку
    $u = require_login();
    $type = in_array($in['type'] ?? '', ['book', 'pdf', 'file'], true) ? $in['type'] : 'book';
    $tbl = $type === 'book' ? 'books' : ($type === 'pdf' ? 'pdf_books' : 'suite_files');
    $ids = array_values(array_filter(array_map('intval', (array)($in['ids'] ?? []))));
    if (!$ids) fail('Не выбрано ни одной вещи');
    $folder = isset($in['folder']) && $in['folder'] !== null && $in['folder'] !== ''
        ? (int)$in['folder'] : null;
    if ($folder !== null &&
        !q('SELECT id FROM folders WHERE id = ? AND user_id = ? AND kind = ?',
            [$folder, $u['id'], $type])->fetch())
        fail('Папка не ваша или другого рода', 403);
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $n = q("UPDATE $tbl SET folder_id = ? WHERE id IN ($ph) AND user_id = ?",
        array_merge([$folder], $ids, [$u['id']]))->rowCount();
    json_out(['ok' => true, 'moved' => $n]);
}

case 'items_copy': {   // копии своих вещей в папку (или на полку); файлы общие — копируются записи
    $u = require_login();
    $type = in_array($in['type'] ?? '', ['book', 'pdf', 'file'], true) ? $in['type'] : 'book';
    $ids = array_values(array_filter(array_map('intval', (array)($in['ids'] ?? []))));
    if (!$ids) fail('Не выбрано ни одной вещи');
    $folder = folder_parent_arg($u, $in['folder'] ?? null, $type);
    $made = [];
    foreach ($ids as $id) if ($c = lib_copy_item($u, $type, $id, $folder)) $made[] = $c;
    json_out(['ok' => true, 'copied' => count($made), 'ids' => $made]);
}

case 'folder_copy': {   // копия папки со всем содержимым и подпапками
    $u = require_login();
    $f = q('SELECT * FROM folders WHERE id = ? AND user_id = ?', [(int)($in['id'] ?? 0), $u['id']])->fetch();
    if (!$f) fail('Папка не найдена', 404);
    $parent = folder_parent_arg($u, $in['parent'] ?? null, $f['kind']);
    json_out(['ok' => true, 'id' => lib_copy_folder($u, (int)$f['id'], $parent)]);
}

case 'pdf_rename': case 'file_rename': {   // новое название своей вещи в своей библиотеке
    $u = require_login();
    $tbl = $action === 'pdf_rename' ? 'pdf_books' : 'suite_files';
    $title = mb_substr(trim($in['title'] ?? ''), 0, 255);
    if ($title === '') fail('Название не может быть пустым');
    $n = q("UPDATE $tbl SET title = ? WHERE id = ? AND user_id = ?", [$title, (int)($in['id'] ?? 0), $u['id']])->rowCount();
    if (!$n && !q("SELECT id FROM $tbl WHERE id = ? AND user_id = ?", [(int)($in['id'] ?? 0), $u['id']])->fetch())
        fail('Не найдено в вашей библиотеке', 404);
    json_out(['ok' => true]);
}

case 'lib_purge': {   // стереть с сервера совсем — только владелец сайта
    $u = require_login();
    if ($u['role'] !== 'owner') fail('Стереть файл с сервера может только владелец сайта', 403);
    $type = in_array($in['type'] ?? '', ['book', 'pdf', 'file'], true) ? $in['type'] : fail('Неизвестный род');
    json_out(['ok' => true, 'removed' => lib_purge($type, (int)($in['id'] ?? 0))]);
}

case 'users_below': { // мои подопечные: те, кто вырос из моей ветки и ниже рангом
    $u = require_login();
    $rows = q('SELECT id, login, role FROM users ORDER BY login')->fetchAll();
    $res = [];
    foreach ($rows as $r)
        if (can_manage($u, $r)) $res[] = $r;
    json_out(['users' => $res]);
}

case 'save_view': { // личный вид карты (зум + сдвиг X/Y) со штампом времени: новее — главнее
    $u = require_login();
    $view = [
        'zoom' => max(0.25, min(3.5, (float)($in['zoom'] ?? 1))),
        'panx' => (float)($in['panx'] ?? 0),
        'pany' => (float)($in['pany'] ?? 0),
    ];
    q('UPDATE users SET map_view = ?, view_time = UTC_TIMESTAMP() WHERE id = ?',
        [json_encode($view), $u['id']]);
    json_out(['ok' => true, 'time' => gmdate('Y-m-d H:i:s')]);
}

case 'save_planet_positions': { // авторские позиции планет-локаций (тоже со штампом)
    $u = require_login();
    $uid = (int)($in['uid'] ?? $u['id']);
    if ($uid !== (int)$u['id']) require_over($u, target_user($uid)); // правка чужой карты — вышестоящим
    foreach (($in['items'] ?? []) as $it) {
        if (!isset($it['loc'])) continue;
        $key = mb_strtolower(trim($it['loc']));
        if ($key === '') continue;
        q('INSERT INTO planet_positions (user_id, loc_key, x, y, z, pos_time)
           VALUES (?,?,?,?,?, UTC_TIMESTAMP())
           ON DUPLICATE KEY UPDATE x=VALUES(x), y=VALUES(y), z=VALUES(z), pos_time=UTC_TIMESTAMP()', [
            $uid, $key,
            isset($it['x']) ? (float)$it['x'] : null,
            isset($it['y']) ? (float)$it['y'] : null,
            isset($it['z']) ? (float)$it['z'] : null,
        ]);
    }
    json_out(['ok' => true, 'time' => gmdate('Y-m-d H:i:s')]);
}

case 'save_positions': { // авторские координаты со штампом времени
    $u = require_login();
    $uid = (int)($in['uid'] ?? $u['id']);
    if ($uid !== (int)$u['id']) require_over($u, target_user($uid)); // правка чужой карты — вышестоящим
    foreach (($in['items'] ?? []) as $it) {
        if (!isset($it['id'])) continue;
        q('UPDATE dreams SET pos_x = ?, pos_y = ?, pos_z = ?, pos_time = UTC_TIMESTAMP()
           WHERE id = ? AND user_id = ?', [
            isset($it['x']) ? (float)$it['x'] : null,
            isset($it['y']) ? (float)$it['y'] : null,
            isset($it['z']) ? (float)$it['z'] : null,
            (int)$it['id'], $uid,
        ]);
    }
    json_out(['ok' => true, 'time' => gmdate('Y-m-d H:i:s')]);
}

/* ===== анкета ===== */

case 'change_pass': {
    $u = require_login();
    $row = q('SELECT pass_hash FROM users WHERE id = ?', [$u['id']])->fetch();
    if (!password_verify($in['old_pass'] ?? '', $row['pass_hash']))
        fail('Текущий пароль неверен');
    if (mb_strlen($in['new_pass'] ?? '') < 6) fail('Новый пароль от 6 символов');
    q('UPDATE users SET pass_hash = ? WHERE id = ?',
        [password_hash($in['new_pass'], PASSWORD_DEFAULT), $u['id']]);
    json_out(['ok' => true]);
}

/* ===== админка ===== */

/* ===== инвайты (создают админ и владелец) ===== */

case 'invites_list': {   // инвайты свои и своей ветки; звать может модер и выше
    $u = require_moder();
    // свои инвайты и инвайты своей ветки; used_login помнится и после удаления сновидца
    $all = q(
        'SELECT i.id, i.code, i.created_at, i.used_at, i.created_by, c.login creator,
                COALESCE(NULLIF(us.login, ""), i.used_login, "") used_login,
                (i.used_at IS NOT NULL AND us.id IS NULL) gone
         FROM invites i
         JOIN users c ON c.id = i.created_by
         LEFT JOIN users us ON us.id = i.used_by
         ORDER BY i.id DESC')->fetchAll();
    $res = [];
    foreach ($all as $i)
        if ((int)$i['created_by'] === (int)$u['id'] || $u['role'] === 'owner'
            || is_descendant((int)$u['id'], (int)$i['created_by'])) $res[] = $i;
    json_out(['invites' => $res]);
}

case 'invite_create': {  // приглашённый вырастет из ветки зовущего
    $u = require_moder();
    $code = strtoupper(bin2hex(random_bytes(5)));   // 10 знаков
    q('INSERT INTO invites (code, created_by) VALUES (?,?)', [$code, $u['id']]);
    json_out(['code' => $code]);
}

case 'invites_purge': { // подчистить летопись входов — право одного владельца
    $u = require_admin();
    if ($u['role'] !== 'owner') fail('Чистить летопись инвайтов может только владелец', 403);
    $n = db()->exec('DELETE FROM invites WHERE used_at IS NOT NULL');
    json_out(['ok' => true, 'removed' => $n]);
}

case 'invite_del': {
    $u = require_moder();
    $i = q('SELECT * FROM invites WHERE id = ?', [(int)($in['id'] ?? 0)])->fetch();
    if (!$i) fail('Инвайт не найден', 404);
    if ((int)$i['created_by'] !== (int)$u['id'] && $u['role'] !== 'owner'
        && !is_descendant((int)$u['id'], (int)$i['created_by'])) fail('Это чужой инвайт', 403);
    if ($i['used_by']) fail('Использованный инвайт — часть истории, его не удалить');
    q('DELETE FROM invites WHERE id = ?', [$i['id']]);
    json_out(['ok' => true]);
}

case 'users_list': {  // в списке — сам и его ветка: чужих подопечных не видно
    $u = require_moder();
    $all = q(
        'SELECT u.id, u.login, u.role, u.banned, u.created_at, u.parent_id,
                (u.openrouter_key <> "") has_key, u.key_issued,
                (SELECT COUNT(*) FROM dreams d WHERE d.user_id = u.id) dreams,
                (SELECT p.login FROM users p WHERE p.id = u.parent_id) parent_login
         FROM users u ORDER BY u.id')->fetchAll();
    $res = [];
    foreach ($all as $r)
        if ((int)$r['id'] === (int)$u['id'] || can_manage($u, $r)) $res[] = $r;
    json_out(['users' => $res]);
}

case 'user_set_key': {
    $u = require_admin();
    $id = (int)($in['id'] ?? 0);
    if ($id !== (int)$u['id']) require_over($u, target_user($id));
    if (!empty($in['use_mine'])) { // выдать свой ключ одним кликом — без ввода
        $me = q('SELECT openrouter_key FROM users WHERE id = ?', [$u['id']])->fetch();
        if (!$me || $me['openrouter_key'] === '') fail('У вас самого не задан ключ ИИ — впишите его в настройках');
        q('UPDATE users SET openrouter_key = ?, key_issued = 1 WHERE id = ?', [$me['openrouter_key'], $id]);
        json_out(['ok' => true]);
    }
    $key = trim($in['key'] ?? '');
    if ($key === '')
        q('UPDATE users SET openrouter_key = "", key_issued = 0 WHERE id = ?', [$id]);
    else
        q('UPDATE users SET openrouter_key = ?, key_issued = 1 WHERE id = ?', [$key, $id]);
    json_out(['ok' => true]);
}

case 'user_set_role': {
    $u = require_admin();
    $id = (int)($in['id'] ?? 0);
    if ($id === (int)$u['id']) fail('Свою роль менять нельзя');
    $t = target_user($id);
    require_over($u, $t);
    $role = in_array($in['role'] ?? '', ['user', 'moder', 'admin'], true) ? $in['role'] : 'user';
    // выдать можно только роль ниже своей: владелец — до админа, админ — до модера
    if (role_rank($role) >= role_rank($u['role']))
        fail('Эту роль выдать нельзя');
    q('UPDATE users SET role = ? WHERE id = ?', [$role, $id]);
    json_out(['ok' => true]);
}

case 'user_ban': {
    $u = require_admin();
    $id = (int)($in['id'] ?? 0);
    if ($id === (int)$u['id']) fail('Себя банить нельзя');
    $t = target_user($id);
    require_over($u, $t);
    if (role_rank($t['role']) >= 3 && !empty($in['banned']))
        fail('Админа забанить нельзя — сначала снимите с него роль');
    q('UPDATE users SET banned = ? WHERE id = ?', [empty($in['banned']) ? 0 : 1, $id]);
    json_out(['ok' => true]);
}

case 'user_rename': {
    $u = require_admin();
    $id = (int)($in['id'] ?? 0);
    if ($id !== (int)$u['id']) require_over($u, target_user($id)); // свой ник менять можно
    $login = trim($in['login'] ?? '');
    if (mb_strlen($login) < 3) fail('Логин от 3 символов');
    if (q('SELECT id FROM users WHERE login = ? AND id <> ?', [$login, $id])->fetch())
        fail('Логин занят');
    q('UPDATE users SET login = ? WHERE id = ?', [$login, $id]);
    json_out(['ok' => true]);
}

case 'user_set_pass': {
    $u = require_admin();
    $id = (int)($in['id'] ?? 0);
    if ($id !== (int)$u['id']) require_over($u, target_user($id));
    if (mb_strlen($in['pass'] ?? '') < 6) fail('Пароль от 6 символов');
    q('UPDATE users SET pass_hash = ? WHERE id = ?',
        [password_hash($in['pass'], PASSWORD_DEFAULT), $id]);
    json_out(['ok' => true]);
}

case 'user_delete': {
    $u = require_admin();
    $id = (int)($in['id'] ?? 0);
    if ($id === (int)$u['id']) fail('Себя удалить нельзя');
    require_over($u, target_user($id));
    $files = q('SELECT DISTINCT image_file FROM dreams WHERE user_id = ? AND image_file <> ""', [$id])->fetchAll();
    q('DELETE FROM users WHERE id = ?', [$id]); // сны и связи удалятся каскадом
    foreach ($files as $f)
        if (!q('SELECT id FROM dreams WHERE image_file = ? LIMIT 1', [$f['image_file']])->fetch())
            @unlink(cfg()['uploads'] . '/' . $f['image_file']); @unlink(cfg()['uploads'] . '/thumbs/' . $f['image_file']); @unlink(cfg()['uploads'] . '/thumbs/' . $f['image_file'] . '.webp');
    json_out(['ok' => true]);
}

default:
    fail('Неизвестное действие: ' . $action, 404);
}
