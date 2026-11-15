// Вывод трактовки: сохранить в файл (диалог Tauri + команда ядра save_text_file) и копировать в буфер.

// saveText(api, 'Медичи.txt', текст, {title}) → путь сохранённого файла или null (отменили)
export async function saveText(api, defaultName, text, opts = {}) {
  const res = await api.dialog().save({
    title: opts.title,
    defaultPath: defaultName,
    filters: [{ name: 'Текст (*.txt)', extensions: ['txt'] }, { name: 'Все файлы (*.*)', extensions: ['*'] }],
  });
  if (!res) return null;
  const path = typeof res === 'string' ? res : res.path;
  await api.invoke('save_text_file', { path, text });
  return path;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // запасной путь для окон, где буфер обмена не дан
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
