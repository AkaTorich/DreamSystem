<?php
// OpenRouter: анализ сна, поиск связей, генерация картинки локации.
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/image.php';

function or_chat(string $key, array $body): array {
    // перегрузка у поставщика модели (429) и сбои шлюза (502/503) — временные: повторяем
    foreach ([0, 3, 7] as $wait) {
        if ($wait) sleep($wait);
        $ch = curl_init('https://openrouter.ai/api/v1/chat/completions');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_TIMEOUT => 180,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $key,
                'Content-Type: application/json',
                'HTTP-Referer: https://dreammap.local',
                'X-Title: Dream Map Web',
            ],
            CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE),
        ]);
        $res = curl_exec($ch);
        if ($res === false) { $err = 'OpenRouter: ' . curl_error($ch); curl_close($ch); continue; }
        $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if (in_array($code, [429, 502, 503], true)) {
            $err = 'Модель ИИ сейчас перегружена у поставщика — повторите через минуту';
            continue;
        }
        if ($code >= 400) throw new Exception('OpenRouter ' . $code . ': ' . mb_substr($res, 0, 300));
        $j = json_decode($res, true);
        if (!$j) throw new Exception('OpenRouter: пустой ответ');
        return $j;
    }
    throw new Exception($err);
}

/* Имя локации — не более трёх слов: это подпись под планетой, а не описание. */
function short_loc(string $s): string {
    $s = trim(preg_replace('/\s+/u', ' ', $s));
    if ($s === '') return '';
    $cut = mb_strpos($s, ',');                       // до первой запятой: «Двор, где…» → «Двор»
    if ($cut !== false && $cut > 0) $s = mb_substr($s, 0, $cut);
    $w = array_slice(preg_split('/\s+/u', trim($s)), 0, 3);
    // хвостовые знаки снимаем регуляркой: trim рубил бы многобайтовые символы по байтам
    return preg_replace('/^[\s\-—:;.]+|[\s\-—:;.]+$/u', '', implode(' ', $w));
}

function loose_json(string $s): array {
    $j = json_decode($s, true);
    if (is_array($j)) return $j;
    if (preg_match('/\{[\s\S]*\}/u', $s, $m)) {
        $j = json_decode($m[0], true);
        if (is_array($j)) return $j;
    }
    throw new Exception('Модель вернула не-JSON: ' . mb_substr($s, 0, 200));
}

function ai_analyze(array $user, string $text): array {
    $sys = "Ты — вдумчивый толкователь снов. Тебе дают запись сна. Верни ТОЛЬКО валидный JSON без пояснений:\n"
        . '{"summary":"1-2 предложения, суть сна, по-русски",' . "\n"
        . '"location":"главная локация сна: НЕ БОЛЕЕ ТРЁХ СЛОВ, по-русски, назывное имя места без пояснений и запятых — «Тёмный лес», «Двор дома», «Мост»",' . "\n"
        . '"characters":["персонажи/существа, по-русски"],' . "\n"
        . '"emotions":["эмоции сна, по-русски"],' . "\n"
        . '"symbols":["яркие символы/предметы, по-русски"],' . "\n"
        . '"motifs":["повторяемые мотивы/темы, по-русски"],' . "\n"
        . '"image_prompt":"подробный английский промпт для генерации картины ГЛАВНОЙ ЛОКАЦИИ этого сна"}';
    $j = or_chat($user['openrouter_key'], [
        'model' => $user['text_model'], 'temperature' => 0.4,
        'messages' => [
            ['role' => 'system', 'content' => $sys],
            ['role' => 'user', 'content' => $text],
        ],
    ]);
    $o = loose_json($j['choices'][0]['message']['content']);
    if (isset($o['location'])) $o['location'] = short_loc((string)$o['location']);
    return $o;
}

function ai_links(array $user, array $dream, array $others): array {
    if (!$others) return [];
    $sys = "Ты сопоставляешь новый сон с прежними снами человека. Найди ОСМЫСЛЕННЫЕ связи "
        . "(общая или похожая локация, тот же персонаж, та же эмоция, тот же символ, продолжение/похожий сюжет). "
        . "Не выдумывай связи ради количества — если их нет, верни пустой список. Верни ТОЛЬКО JSON:\n"
        . '{"links":[{"id":"id прежнего сна","type":"локация|персонаж|эмоция|символ|сюжет","reason":"кратко почему, по-русски"}]}';
    $j = or_chat($user['openrouter_key'], [
        'model' => $user['text_model'], 'temperature' => 0.2,
        'messages' => [
            ['role' => 'system', 'content' => $sys],
            ['role' => 'user', 'content' => json_encode(
                ['new_dream' => $dream, 'previous_dreams' => $others], JSON_UNESCAPED_UNICODE)],
        ],
    ]);
    $o = loose_json($j['choices'][0]['message']['content']);
    $valid = ['локация', 'персонаж', 'эмоция', 'символ', 'сюжет'];
    $ids = array_column($others, 'id');
    $res = [];
    foreach (($o['links'] ?? []) as $l) {
        if (isset($l['id'], $l['type']) && in_array($l['type'], $valid, true)
            && in_array($l['id'], $ids) && count($res) < 12)
            $res[] = ['id' => (int)$l['id'], 'type' => $l['type'], 'reason' => $l['reason'] ?? ''];
    }
    return $res;
}

function ai_image(array $user, string $prompt, string $destPath): void {
    $prompt .= ' — dreamlike surreal atmospheric painting, soft glow, drifting mist, deep night palette,'
             . ' cinematic, 4:3 landscape composition, no text';
    // быстрый путь: маленькая картина с низким качеством (lib/image.php)
    $raw = image_generate_fast($user['openrouter_key'], $user['image_model'], $prompt);
    if ($raw === null) {   // модели нет в Images API — по-старому, через чат
        $j = or_chat($user['openrouter_key'], [
            'model' => $user['image_model'],
            'modalities' => ['image', 'text'],
            'messages' => [['role' => 'user', 'content' => $prompt]],
        ]);
        $url = $j['choices'][0]['message']['images'][0]['image_url']['url'] ?? null;
        if (!$url || strpos($url, 'data:') !== 0) throw new Exception('Модель не вернула изображение');
        $raw = base64_decode(substr($url, strpos($url, ',') + 1));
    }
    save_image_640x480($raw, $destPath);
}

// PUA-шрифт мода (U+E000..U+E42E) -> настоящие иероглифы юникода (U+13000..)
function pua_to_uni(string $s): string {
    return preg_replace_callback('/[\x{E000}-\x{E42E}]/u', function ($m) {
        return mb_chr(mb_ord($m[0], 'UTF-8') - 0xE000 + 0x13000, 'UTF-8');
    }, $s);
}

// Трактовка книги: как ритуал перевода в Скайриме, но напрямую через ИИ
function ai_interpret(array $user, string $text): string {
    $j = or_chat($user['openrouter_key'], [
        'model' => $user['text_model'], 'temperature' => 0.5,
        'messages' => [
            ['role' => 'system', 'content' =>
"Ты — жрец-чтец, толкующий египетские иероглифы. Тебе дают текст книги: египетские иероглифы " .
"(юникод U+13000–U+1342E) вперемешку с русским текстом. Переведи и растолкуй иероглифические " .
"пассажи на русский построчно, сохраняя порядок и структуру книги; русские пояснения не пересказывай. " .
"Отвечай ГОЛОЙ трактовкой, без вступлений, извинений и пометок."],
            ['role' => 'user', 'content' => $text],
        ],
    ]);
    return trim($j['choices'][0]['message']['content']);
}

// Маленькая копия картинки сна для карты (там это кружок с ноготь): uploads/thumbs/<имя>.webp —
// квадрат 160×160 из середины картинки, WebP (~3–5 КБ). Большая остаётся для карточки сна.
// Возвращает путь к копии или '' без GD.
function make_thumb(string $fullPath, int $side = 160): string {
    $dir = dirname($fullPath) . '/thumbs';
    $dst = $dir . '/' . basename($fullPath) . '.webp';
    if (is_file($dst)) return $dst;
    if (!function_exists('imagecreatefromstring') || !function_exists('imagewebp') || !is_file($fullPath)) return '';
    $im = @imagecreatefromstring((string)file_get_contents($fullPath));
    if (!$im) return '';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $w = imagesx($im); $h = imagesy($im);
    $s = min($w, $h);
    $t = min($side, $s);
    $sq = imagecreatetruecolor($t, $t);
    imagecopyresampled($sq, $im, 0, 0, (int)(($w - $s) / 2), (int)(($h - $s) / 2), $t, $t, $s, $s);
    imagedestroy($im);
    $ok = imagewebp($sq, $dst, 70);
    imagedestroy($sq);
    return $ok ? $dst : '';
}

function save_image_resized(string $raw, string $destPath, int $maxSide = 900): void {
    if (function_exists('imagecreatefromstring')) {
        $im = @imagecreatefromstring($raw);
        if ($im) {
            $w = imagesx($im); $h = imagesy($im);
            $k = min(1, $maxSide / max($w, $h));
            if ($k < 1) {
                $im2 = imagescale($im, (int)($w * $k), (int)($h * $k));
                if ($im2) { imagedestroy($im); $im = $im2; }
            }
            imagejpeg($im, $destPath, 85);
            imagedestroy($im);
            make_thumb($destPath);
            return;
        }
    }
    file_put_contents($destPath, $raw); // без GD сохраняем как есть
}
