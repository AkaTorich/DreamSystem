// Подсказки моделей OpenRouter для владельца: текстовые и рисующие, с ценой.
let cache = null;

async function load() {
  if (!cache) cache = fetch('https://openrouter.ai/api/v1/models').then(r => r.json()).then(r => r.data || [])
    .catch(e => { cache = null; throw e; });
  return cache;
}

export async function fillModels(statusEl) {
  await null;   // поля подсказок уже стоят в окне
  statusEl.textContent = 'Загружаю список моделей OpenRouter…';
  try {
    const list = await load();
    const dt = document.getElementById('cdTextModels'), di = document.getElementById('cdImgModels');
    if (!dt || !di) return;
    dt.replaceChildren(); di.replaceChildren();
    for (const m of list) {
      const om = (m.architecture && m.architecture.output_modalities) || ['text'];
      const pr = m.pricing || {};
      const imgOut = parseFloat(pr.image_output || 0);
      const free = !parseFloat(pr.prompt || 0) && !parseFloat(pr.completion || 0) && !imgOut;
      const o = document.createElement('option');
      o.value = m.id;
      o.label = m.id + (free ? ' · бесплатно'
        : (om.includes('image') && imgOut > 0 ? ' · ≈$' + (imgOut * 1290).toFixed(3) + '/картинка' : ' · платно'));
      (om.includes('image') ? di : dt).append(o);
    }
    statusEl.textContent = 'Моделей: ' + list.length + '. Начните вводить имя — появятся подсказки.';
  } catch (e) {
    statusEl.textContent = 'Список моделей не загрузился — имя можно вписать руками.';
  }
}
