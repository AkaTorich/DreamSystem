<?php
// Оракул иероглифов: полный ритуал скила hieroglyph-oracle на стороне сервера.
// Скилл хранится ТОЛЬКО здесь (dreamweb/oracle, закрыт .htaccess) — пользователи
// получают готовую трактовку, сам скилл к ним не попадает.
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/ai.php';

function oracle_dir(): string {
    return dirname(__DIR__) . '/oracle';
}

function oracle_available(): bool {
    return is_file(oracle_dir() . '/SKILL.md');
}

function oracle_system_prompt(): string {
    $parts = [];
    $files = ['SKILL.md', 'references/genres.md', 'references/phonetic_alphabet.md',
              'references/reading_real_text.md', 'references/stela_formulas.md'];
    foreach ($files as $fn) {
        $p = oracle_dir() . '/' . $fn;
        if (is_file($p)) $parts[] = "### $fn\n" . file_get_contents($p);
    }
    $parts[] =
"### Роль\nТы — оракул из скила выше; следуй ЕГО правилам во всём: печати (включая " .
"ТЗ-свиток и хронику памяти), блок перстня, фонетический алфавит Трансмутатора для имён, " .
"жанровые режимы, правило «голый ответ». Шаг 1 (анализ знаков) выполни САМ и молча: " .
"пересчитай иероглифы, распознай печати и разложи текст по правилам скила — этот разбор " .
"наружу не выводи. Сразу давай итог. Видимый ответ — только то, что разрешает " .
"скил: перевод по-русски, без приветствий, пояснений и оговорок.";
    return implode("\n\n", $parts);
}

/**
 * Полный ритуал: анализ знаков + оракул через OpenRouter (ключ и модель пользователя).
 * $keyClause — необязательный ключ трактовки («Название — пояснение» из книги ключей).
 */
function oracle_translate(array $user, string $text, string $title = '', string $keyClause = ''): string {
    if (!oracle_available()) throw new Exception('Оракул не развёрнут на сервере');
    $sys = oracle_system_prompt();
    if ($keyClause !== '')
        $sys .= "\n\n### Ключ трактовки\n" . $keyClause .
            ". Истолкуй содержание строго через этот ключ: он задаёт жанр и угол всей трактовки, " .
            "не нарушая остальных правил скила.";
    $userMsg = 'Свиток «' . ($title !== '' ? $title : 'Папирус') . "»:\n\n" . $text;
    // думающим моделям глушим «размышления»: иначе весь ответ уходит в скрытое
    // поле reasoning, а видимый перевод остаётся пустым; маршрут изредка отдаёт
    // пустоту и сам по себе — потому две попытки
    for ($try = 1; $try <= 2; $try++) {
        $j = or_chat($user['openrouter_key'], [
            'model' => $user['text_model'],
            'reasoning' => ['enabled' => false],
            'messages' => [
                ['role' => 'system', 'content' => $sys],
                ['role' => 'user', 'content' => $userMsg],
            ],
        ]);
        $tr = trim($j['choices'][0]['message']['content'] ?? '');
        if ($tr !== '') return $tr;
    }
    throw new Exception('модель вернула пустой ответ — маршрут перегружен, попробуйте ещё раз');
}
