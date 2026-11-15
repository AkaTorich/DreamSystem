// Окно «Пасьянс Медичи»: выбор карт в цель и зависшее, предназначение, алгоритм и правила
// свёрток, поиск цепочки (перебор с возвратами или жадный), лог трактовки, сохранение и копия.
// Сон гаданию не нужен — параметры open(ctx, opts) кроме ctx не используются.
import { makeWindow, loadCss, h } from '../common/frame.js';
import { saveText, copyText } from '../common/export.js';
import { DECK_SIZE, makeDeck, same, isPerson } from './cards.js';
import { describeCard } from './meaning.js';
import { preparePlan } from './plan.js';
import { newToken, runSearch, backtrackAttempt, greedyAttempt } from './search.js';
import { planNote, chainText, greedyNote, plainChainText, exportText } from './reading.js';
import { showMessage } from './msgbox.js';
import { buildCardsPanel } from './view-cards.js';
import { buildStackPanel } from './view-stacks.js';
import { buildControls } from './view-controls.js';
import { PURPOSES } from './data/purposes.js';
import { L } from './data/labels.js';
import { MSG } from './data/messages.js';

export function open(ctx /* , opts */) {
  loadCss(new URL('./medici.css', import.meta.url));
  const w = makeWindow({
    key: 'medici', title: L.winTitle, subtitle: L.winSub,
    theme: 'medici', width: 1060, height: 660,
  });
  if (!w) return;

  const deck = makeDeck();
  const finalStack = [];
  const hungStack = [];
  let mode = 'goal';            // режим предназначения — от него зависит смысл карт
  let requirePerson = false;    // «на встречу с человеком»: в цели нужна карта-персона
  let manualPurpose = false;    // «свободный» режим — галочки правит пользователь
  let token = null;
  let attempts = 0;

  const say = m => showMessage(w.root, m);
  const controls = buildControls();
  const describe = card => describeCard(card, { mode, greedy: controls.greedy.checked });

  const cards = buildCardsPanel({ deck, onPrimary: addToFinal, onSecondary: addToHung });
  const targetPanel = buildStackPanel({
    title: L.targetHead, hint: L.targetHint,
    onRemove: card => removeFrom(finalStack, card),
  });
  const hungPanel = buildStackPanel({
    title: L.hungHead, hint: L.hungHint,
    onRemove: card => removeFrom(hungStack, card),
  });

  w.body.append(h('div', { class: 'md-grid' },
    cards.el,
    h('div', { class: 'md-stacks' }, targetPanel.el, hungPanel.el),
    controls.el));

  function renderStacks() {
    targetPanel.render(finalStack);
    hungPanel.render(hungStack);
  }

  function addToFinal(card) {
    if (finalStack.some(c => same(c, card))) return say(MSG.alreadyInFinal);
    if (hungStack.some(c => same(c, card))) return say(MSG.hungBlocksFinal);
    if (finalStack.length >= DECK_SIZE) return say(MSG.finalFull);
    finalStack.push(card);
    renderStacks();
  }

  function addToHung(card) {
    if (hungStack.some(c => same(c, card))) return say(MSG.alreadyHung);
    if (finalStack.some(c => same(c, card))) return say(MSG.finalBlocksHung);
    hungStack.push(card);
    renderStacks();
  }

  function removeFrom(stack, card) {
    const i = stack.indexOf(card);
    if (i >= 0) stack.splice(i, 1);
    renderStacks();
  }

  // ── предназначение и алгоритм ──
  function refreshTooltips() {
    cards.refresh(describe);
  }

  // предназначение задаёт, какие блоки свёртки включены
  function purposeChanged() {
    const p = controls.checkedPurpose();
    requirePerson = false;
    if (p.rules) {
      controls.checks.greeting.checked = p.rules.greeting;
      controls.checks.hung.checked = p.rules.hung;
      controls.checks.result.checked = p.rules.result;
      requirePerson = !!p.requirePerson;
    }
    mode = p.mode;
    // в свободном режиме галочки не блокируем; в остальных — фиксируем под предназначение
    manualPurpose = !p.rules;
    controls.setRulesEnabled(manualPurpose && controls.backtrack.checked);
    refreshTooltips();
  }

  // правила свёрток относятся только к перебору: жадный расчёт — другой инструмент
  function algorithmChanged() {
    const rulesApply = controls.backtrack.checked;
    controls.setRulesEnabled(rulesApply && manualPurpose);
    controls.rulesHeader.classList.toggle('dim', !rulesApply);
    refreshTooltips();   // жадный расчёт — исходные смыслы карт
  }

  for (const input of Object.values(controls.purposeInputs))
    input.addEventListener('change', purposeChanged);
  controls.backtrack.addEventListener('change', algorithmChanged);
  controls.greedy.addEventListener('change', algorithmChanged);

  // ── лог и счётчик ──
  function appendLog(message) {
    const log = controls.log;
    log.value += message + '\n';
    log.scrollTop = log.scrollHeight;
  }

  function updateCounter() {
    controls.counter.textContent = L.counter(attempts);
  }

  function readShuffleTimes() {
    const s = controls.shuffle.value.trim();
    const n = /^[+-]?\d+$/.test(s) ? parseInt(s, 10) : NaN;
    if (!(n >= 1) || n > 2147483647) {
      controls.shuffle.value = '1';
      return 1;
    }
    return n;
  }

  function cancel() {
    if (token) token.cancelled = true;
  }

  function startToken() {
    cancel();
    token = newToken();
    attempts = 0;
    updateCounter();
    return token;
  }

  const onAttempt = () => { attempts++; updateCounter(); };

  // ── поиск цепочки ──
  async function findChain() {
    const target = finalStack.slice();
    if (target.length === 0) return say(MSG.noTarget);

    // предназначение «на встречу с человеком»: в цели обязана быть карта-персона
    if (requirePerson && !target.some(isPerson)) return say(MSG.noPerson);

    if (controls.greedy.checked) return findChainGreedy(target);

    const rules = {
      greeting: controls.checks.greeting.checked,
      hung: controls.checks.hung.checked,
      result: controls.checks.result.checked,
    };
    const plan = preparePlan(deck, target, hungStack, rules);
    if (plan.error) return say(plan.error);

    const shuffleTimes = readShuffleTimes();
    const tok = startToken();
    appendLog(planNote(rules, plan.target, plan.hung, plan.addedResult, describe));

    const chain = await runSearch(tok,
      backtrackAttempt(deck, plan, rules, shuffleTimes, tok), onAttempt);
    if (!chain || tok.cancelled) return;

    const text = chainText(chain, rules, plan.target.length, plan.hung.length, plan.addedResult, describe);
    appendLog(text);
    await say(MSG.chain(text));
    await say(MSG.found);
  }

  // прежний расчёт: правила свёрток здесь не действуют
  async function findChainGreedy(target) {
    const shuffleTimes = readShuffleTimes();
    const tok = startToken();
    appendLog(greedyNote(target));

    const chain = await runSearch(tok,
      greedyAttempt(deck, target, shuffleTimes, tok), onAttempt);
    if (!chain || tok.cancelled) return;

    const text = plainChainText(chain, describe);
    appendLog(text);
    await say(MSG.chain(text));
    await say(MSG.found);
  }

  function reset() {
    finalStack.length = 0;
    hungStack.length = 0;
    renderStacks();
    attempts = 0;
    updateCounter();
    cancel();
  }

  // ── экспорт трактовки-цепочки из лога: файлом или в буфер ──
  function purposeTitle() {
    const p = PURPOSES.find(x => controls.purposeInputs[x.id].checked);
    return p ? p.title : 'Королевский';
  }

  const fullText = () => exportText(purposeTitle(), controls.greedy.checked, controls.log.value);

  async function saveClick() {
    if (!controls.log.value.trim()) return say(MSG.emptyLogSave);
    try {
      const path = await saveText(ctx.api, L.exportName(purposeTitle()), fullText(),
        { title: 'Сохранить трактовку цепочки' });
      if (path) appendLog(MSG.logSaved(path));
    } catch (e) {
      say(MSG.saveFailed(e && e.message ? e.message : String(e)));
    }
  }

  async function copyClick() {
    if (!controls.log.value.trim()) return say(MSG.emptyLogCopy);
    try {
      if (await copyText(fullText())) appendLog(MSG.logCopied);
      else say(MSG.copyFailed(MSG.clipboardDenied));
    } catch (e) {
      say(MSG.copyFailed(e && e.message ? e.message : String(e)));
    }
  }

  const b = controls.buttons;
  b.find.addEventListener('click', findChain);
  b.reset.addEventListener('click', reset);
  b.stop.addEventListener('click', cancel);
  b.save.addEventListener('click', saveClick);
  b.copy.addEventListener('click', copyClick);

  w.onClose(cancel);

  renderStacks();
  purposeChanged();   // применить предназначение по умолчанию (программа к цели)
}
