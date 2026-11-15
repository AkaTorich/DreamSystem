<?php
// Восстановление доступа: без ?t — запросить письмо; с ?t=… (ссылка из письма) — задать новый пароль.
require_once __DIR__ . '/lib/auth.php';
$token = preg_match('/^[a-f0-9]{64}$/', $_GET['t'] ?? '') ? $_GET['t'] : '';
?><!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Карта снов · восстановление доступа</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<link rel="stylesheet" href="assets/style.css?v=<?= @filemtime(__DIR__ . '/assets/style.css') ?>">
</head>
<body>
<canvas id="sky"></canvas>
<div class="center-page">
  <div class="card">
    <h1>☾ Карта снов</h1>
    <div class="sub">восстановление доступа</div>
<?php if ($token === ''): ?>
    <form onsubmit="return ask(event)">
      <label>ЛОГИН ИЛИ ПОЧТА</label>
      <input type="text" id="who" autocomplete="username" required>
      <div class="mrow"><button class="primary" type="submit" style="width:100%">Прислать ссылку</button></div>
    </form>
    <p class="note" style="margin-top:12px; color:var(--faint); font-size:12px">
      Письмо придёт на почту, указанную в настройках аккаунта. Почты в аккаунте нет — новый пароль задаст админ.</p>
<?php else: ?>
    <form onsubmit="return setPass(event)" autocomplete="on">
      <input type="text" name="username" autocomplete="username" hidden>
      <label>НОВЫЙ ПАРОЛЬ</label>
      <input type="password" id="p1" autocomplete="new-password" minlength="6" required>
      <label>ЕЩЁ РАЗ</label>
      <input type="password" id="p2" autocomplete="new-password" minlength="6" required>
      <div class="mrow"><button class="primary" type="submit" style="width:100%">Сохранить пароль</button></div>
    </form>
<?php endif; ?>
    <p style="margin-top:14px"><a class="btn ghost" href="/app/">← ко входу</a></p>
  </div>
</div>
<script src="assets/common.js?v=<?= @filemtime(__DIR__ . '/assets/common.js') ?>"></script>
<script>
startSky('sky');
async function ask(ev) {
  ev.preventDefault();
  try {
    const r = await api('reset_request', { who: document.getElementById('who').value });
    toast(r.message);
  } catch (e) { toast(e.message); }
  return false;
}
async function setPass(ev) {
  ev.preventDefault();
  const p1 = document.getElementById('p1').value, p2 = document.getElementById('p2').value;
  if (p1 !== p2) { toast('Пароли не совпадают'); return false; }
  try {
    const r = await api('reset_confirm', { token: <?= json_encode($token) ?>, pass: p1 });
    toast('Пароль сохранён — войдите с ним, логин «' + r.login + '»');
    setTimeout(() => { location.href = '/app/'; }, 2500);
  } catch (e) { toast(e.message); }
  return false;
}
</script>
</body>
</html>
