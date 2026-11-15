<?php
/* Действия с личной библиотекой: копировать вещи и папки, переименовать, стереть с сервера.
   Правило: из библиотеки убирается только запись — файлы на сервере копятся и не стираются.
   Стереть файл совсем (у всех, с обложкой и значком) может только владелец сайта: lib_purge. */

function lib_table(string $type): string {
    return $type === 'book' ? 'books' : ($type === 'pdf' ? 'pdf_books' : 'suite_files');
}

/* копия одной своей вещи в папку $folder (null — полка); возвращает id копии */
function lib_copy_item(array $u, string $type, int $id, ?int $folder): int {
    $tbl = lib_table($type);
    $b = q("SELECT * FROM $tbl WHERE id = ? AND user_id = ?", [$id, $u['id']])->fetch();
    if (!$b) return 0;
    if ($type === 'book') {
        $num = (int)q('SELECT COALESCE(MAX(num), 0) + 1 FROM books WHERE user_id = ?', [$u['id']])->fetchColumn();
        q('INSERT INTO books (user_id, num, title, text, translation, seal, location, folder_id) VALUES (?,?,?,?,?,?,?,?)',
            [$u['id'], $num, $b['title'], $b['text'], $b['translation'], $b['seal'], $b['location'], $folder]);
    } elseif ($type === 'pdf') {
        q('INSERT INTO pdf_books (user_id, ext_id, title, file, folder_id) VALUES (?,"",?,?,?)',
            [$u['id'], $b['title'], $b['file'], $folder]);   // файл общий — копируется только запись
    } else {
        q('INSERT INTO suite_files (user_id, title, file, size, icon, descr, folder_id) VALUES (?,?,?,?,?,?,?)',
            [$u['id'], $b['title'], $b['file'], $b['size'], $b['icon'], $b['descr'], $folder]);
    }
    return (int)db()->lastInsertId();
}

/* свободное имя папки на уровне $parent: «Имя», «Имя 2», «Имя 3»… */
function lib_free_folder_name(array $u, string $kind, ?int $parent, string $name): string {
    $n = $name;
    for ($i = 2; folder_name_taken($u, $kind, $parent, $n, 0); $i++) $n = $name . ' ' . $i;
    return $n;
}

/* копия папки со всем содержимым и подпапками внутрь $parent; возвращает id копии */
function lib_copy_folder(array $u, int $id, ?int $parent, int $depth = 0): int {
    if ($depth > 64) return 0;   // защита от круга в испорченной раскладке
    $f = q('SELECT * FROM folders WHERE id = ? AND user_id = ?', [$id, $u['id']])->fetch();
    if (!$f) return 0;
    $name = lib_free_folder_name($u, $f['kind'], $parent, $f['name']);
    q('INSERT INTO folders (user_id, name, kind, parent_id) VALUES (?,?,?,?)', [$u['id'], $name, $f['kind'], $parent]);
    $copy = (int)db()->lastInsertId();
    $tbl = lib_table($f['kind']);
    foreach (q("SELECT id FROM $tbl WHERE folder_id = ? AND user_id = ?", [$id, $u['id']])->fetchAll() as $r)
        lib_copy_item($u, $f['kind'], (int)$r['id'], $copy);
    foreach (q('SELECT id FROM folders WHERE parent_id = ? AND user_id = ? AND id <> ?', [$id, $u['id'], $copy])->fetchAll() as $c)
        lib_copy_folder($u, (int)$c['id'], $copy, $depth + 1);
    return $copy;
}

/* стереть файл с сервера совсем: все записи у всех, связи, сам файл, обложку, значок */
function lib_purge(string $type, int $id): int {
    $tbl = lib_table($type);
    $b = q("SELECT * FROM $tbl WHERE id = ?", [$id])->fetch();
    if (!$b) fail('Не найдено', 404);
    if ($type === 'book') {
        $ids = [(int)$b['id']];
        q('DELETE FROM books WHERE id = ?', [$b['id']]);
    } else {
        $ids = array_map('intval', array_column(q("SELECT id FROM $tbl WHERE file = ?", [$b['file']])->fetchAll(), 'id'));
        q("DELETE FROM $tbl WHERE file = ?", [$b['file']]);
        if ($type === 'pdf') {
            @unlink(cfg()['uploads'] . '/pdf/' . basename($b['file']));
            @unlink(pdf_cover_path($b['file']));
        } else {
            @unlink(cfg()['uploads'] . '/files/' . basename($b['file']));
            if ($b['icon'] !== '' && !q('SELECT id FROM suite_files WHERE icon = ? LIMIT 1', [$b['icon']])->fetch())
                @unlink(cfg()['uploads'] . '/files/icons/' . basename($b['icon']));
        }
    }
    if ($type !== 'file')
        foreach ($ids as $i)
            q('DELETE FROM book_links WHERE (a_type=? AND a_id=?) OR (b_type=? AND b_id=?)', [$type, $i, $type, $i]);
    return count($ids);
}
