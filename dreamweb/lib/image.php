<?php
/* Картина сна: рисуется сразу маленькой, чтобы не ждать лишнего.
   Ровно 640×480 модели рисовать не умеют, поэтому у каждой просим самое быстрое из того, что она
   понимает (низкое качество, наименьшее разрешение, пропорция 4:3 или ближайшая), а затем сервер
   обрезает и ужимает картину ровно до 640×480. */

const DREAM_IMG_W = 640;
const DREAM_IMG_H = 480;

// что умеет модель (список OpenRouter, хранится у нас сутки: он почти не меняется)
function image_model_params(string $model): array {
    $cache = cfg()['uploads'] . '/image_models.json';
    $list = null;
    if (is_file($cache) && filemtime($cache) > time() - 86400)
        $list = json_decode((string)file_get_contents($cache), true);
    if (!$list) {
        $raw = @file_get_contents('https://openrouter.ai/api/v1/images/models', false,
            stream_context_create(['http' => ['timeout' => 15]]));
        $j = $raw ? json_decode($raw, true) : null;
        $list = $j['data'] ?? $j;
        if (is_array($list) && $list) @file_put_contents($cache, json_encode($list));
    }
    foreach ((array)$list as $m)
        if (($m['id'] ?? '') === $model) return $m['supported_parameters'] ?? [];
    return [];
}

// самые быстрые настройки из тех, что модель понимает
function image_fast_options(array $p): array {
    $pick = function (string $name, array $wanted) use ($p) {
        $vals = $p[$name]['values'] ?? [];
        foreach ($wanted as $w) if (in_array($w, $vals, true)) return $w;
        return null;
    };
    $o = [];
    if ($v = $pick('aspect_ratio', ['4:3', '3:2', '5:4'])) $o['aspect_ratio'] = $v;
    if ($v = $pick('resolution', ['512', '768', '1K'])) $o['resolution'] = $v;
    if ($v = $pick('quality', ['low'])) $o['quality'] = $v;
    if ($v = $pick('output_format', ['jpeg'])) $o['output_format'] = $v;
    return $o;
}

// картина через OpenRouter Images API; null — модель там недоступна, тогда рисуем по-старому
function image_generate_fast(string $key, string $model, string $prompt): ?string {
    $p = image_model_params($model);
    if (!$p) return null;
    $body = ['model' => $model, 'prompt' => $prompt] + image_fast_options($p);
    $ch = curl_init('https://openrouter.ai/api/v1/images');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_TIMEOUT => 180,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $key, 'Content-Type: application/json',
                               'HTTP-Referer: https://dream.globthe.top', 'X-Title: Dream Map Web'],
        CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE),
    ]);
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($res === false || $code >= 400) return null;
    $b64 = json_decode($res, true)['data'][0]['b64_json'] ?? '';
    return $b64 !== '' ? base64_decode($b64) : null;
}

// ровно 640×480: срезаем лишнее по краям (без растягивания), затем ужимаем
function save_image_640x480(string $raw, string $destPath): void {
    $im = function_exists('imagecreatefromstring') ? @imagecreatefromstring($raw) : false;
    if (!$im) { file_put_contents($destPath, $raw); return; }
    $w = imagesx($im); $h = imagesy($im);
    $k = DREAM_IMG_W / DREAM_IMG_H;
    if ($w / $h > $k) { $cw = (int)round($h * $k); $ch = $h; } else { $cw = $w; $ch = (int)round($w / $k); }
    $out = imagecreatetruecolor(DREAM_IMG_W, DREAM_IMG_H);
    imagecopyresampled($out, $im, 0, 0, (int)(($w - $cw) / 2), (int)(($h - $ch) / 2),
        DREAM_IMG_W, DREAM_IMG_H, $cw, $ch);
    imagejpeg($out, $destPath, 85);
    imagedestroy($im); imagedestroy($out);
    make_thumb($destPath);
}
