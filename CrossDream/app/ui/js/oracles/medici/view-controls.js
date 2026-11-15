// Панель «РАСЧЁТ ЦЕПОЧКИ»: предназначение, алгоритм, правила свёрток, тасования,
// кнопки, счётчик попыток и лог трактовки.
import { h } from '../common/frame.js';
import { L } from './data/labels.js';
import { PURPOSES, PURPOSE_DEFAULT } from './data/purposes.js';

function radio(name, value, text, tip, checked) {
  const input = h('input', { type: 'radio', name, value, checked });
  const label = h('label', { class: 'md-radio', title: tip }, input, h('span', {}, text));
  return { input, label };
}

function button(text, tip, cls) {
  return h('button', { type: 'button', class: cls || '', title: tip }, text);
}

export function buildControls() {
  // предназначение
  const purposeInputs = {};
  const purposeList = h('div', { class: 'md-purposes' });
  for (const p of PURPOSES) {
    const r = radio('md-purpose', p.id, p.label, p.tip, p.id === PURPOSE_DEFAULT);
    purposeInputs[p.id] = r.input;
    purposeList.append(r.label);
  }

  // алгоритм
  const backtrack = radio('md-algo', 'backtrack', L.algoBacktrack.text, L.algoBacktrack.tip, true);
  const greedy = radio('md-algo', 'greedy', L.algoGreedy.text, L.algoGreedy.tip, false);

  // правила свёрток
  const rulesHeader = h('div', { class: 'md-sub' }, L.rulesHead);
  const checks = {};
  const rulesPanel = h('div', { class: 'md-rules' });
  for (const r of L.rules) {
    const input = h('input', { type: 'checkbox', checked: true });
    checks[r.key] = input;
    rulesPanel.append(h('label', { class: 'md-check', title: r.tip }, input, h('span', {}, r.text)));
  }

  // тасования, кнопки, счётчик
  const shuffle = h('input', { type: 'text', class: 'md-shuffle', value: L.shuffleDefault, inputmode: 'numeric' });
  const buttons = {
    find: button(L.btnFind, null, 'md-gap'),
    reset: button(L.btnReset, null, 'md-gap'),
    stop: button(L.btnStop, null, ''),
    save: button(L.btnSave.text, L.btnSave.tip, 'md-gap md-gap-left md-emoji'),
    copy: button(L.btnCopy.text, L.btnCopy.tip, 'md-emoji'),
  };
  const counter = h('span', { class: 'md-counter' }, L.counter(0));
  const log = h('textarea', { class: 'md-log', spellcheck: 'false' });

  const el = h('div', { class: 'md-panel md-calc' },
    h('div', { class: 'md-head md-head-calc' }, L.calcHead),
    h('div', { class: 'md-block' },
      h('div', { class: 'md-sub' }, L.purposeHead),
      purposeList,
      h('div', { class: 'md-legend' }, L.purposeLegend),
      h('div', { class: 'md-sub' }, L.algoHead),
      h('div', { class: 'md-row' }, backtrack.label, greedy.label),
      rulesHeader,
      rulesPanel),
    h('div', { class: 'md-actions' },
      h('span', { class: 'md-shuffle-label' }, L.shuffleLabel),
      shuffle,
      buttons.find, buttons.reset, buttons.stop, buttons.save, buttons.copy,
      counter),
    log);

  // галочки правил доступны только при переборе и в свободном предназначении
  function setRulesEnabled(on) {
    rulesPanel.classList.toggle('off', !on);
    for (const c of Object.values(checks)) c.disabled = !on;
  }

  function checkedPurpose() {
    const p = PURPOSES.find(x => purposeInputs[x.id].checked);
    return p || PURPOSES.find(x => x.id === PURPOSE_DEFAULT);
  }

  return {
    el, purposeInputs, checkedPurpose,
    backtrack: backtrack.input, greedy: greedy.input,
    rulesHeader, checks, setRulesEnabled,
    shuffle, buttons, counter, log,
  };
}
