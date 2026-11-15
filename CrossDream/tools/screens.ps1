# Снимки всех вкладок CrossDream (для руководства и показа): программа должна быть запущена
# с отладочным портом — tools\run-debug.ps1 или установленная с WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS.
# Снимки — в docs\screens\NN-имя.png. Ничего не удаляет и не меняет: только открывает окна.
param([string]$Out = (Join-Path (Split-Path $PSScriptRoot -Parent) 'docs\screens'))
$cdp = Join-Path $PSScriptRoot 'cdp.ps1'
New-Item -ItemType Directory -Force $Out | Out-Null

# общие помощники в окне
$prep = @'
(()=>{window.SS={
 w:ms=>new Promise(r=>setTimeout(r,ms)),
 click:id=>document.getElementById(id).click(),
 home:async()=>{document.querySelector('#tabPdf .x')?.click();document.getElementById('tabMap').click();await SS.w(300);
   for(let i=0;i<4;i++){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await SS.w(120);}},
 lib:async mode=>{document.getElementById('btnLibrary').click();await SS.w(900);document.querySelector('.lib-tab[data-mode='+mode+']').click();await SS.w(700);},
 folder:async name=>{[...document.querySelectorAll('.lib-folder')].find(b=>b.textContent.includes(name))?.click();await SS.w(900);},
 dream:async()=>{const api=await import('./js/shell/api.js');const r=await api.invoke('dreams_list');const ds=r.dreams||r;return ds.find(d=>d.ImageFile)||ds[0];},
 oracle:async name=>{const ui=await import('./js/shell/ui.js');ui.bus.emit('oracle:open',{name,dream:await SS.dream()});await SS.w(1600);},
 btn:(root,t)=>[...(root||document).querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(t)),
};return 'ok'})()
'@
& $cdp -Eval $prep | Out-Null

$steps = [ordered]@{
 '01-karta'              = "(async()=>{await SS.home();await SS.w(800)})()"
 '02-kartochka-sna'      = "(async()=>{const ui=await import('./js/shell/ui.js');ui.bus.emit('dream:open',(await SS.dream()).Id);await SS.w(1500)})()"
 '03-zapisat-son'        = "(async()=>{await SS.home();SS.click('btnNew');await SS.w(900)})()"
 '04-sny'                = "(async()=>{await SS.home();SS.click('btnList');await SS.w(1200)})()"
 '05-biblioteka-ieroglify' = "(async()=>{await SS.home();await SS.lib('book')})()"
 '06-chitalnya-knigi'    = "(async()=>{document.querySelector('.lib-grid .bookcard.lib-book')?.click();await SS.w(1500)})()"
 '07-biblioteka-pdf'     = "(async()=>{await SS.home();await SS.lib('pdf')})()"
 '08-papka-pdf'          = "(async()=>{await SS.folder('АСТРОЛОГИЯ');await SS.w(600)})()"
 '09-menu-deystviy'      = "(async()=>{const c=document.querySelectorAll('.lib-grid .bookcard')[2];const r=c.getBoundingClientRect();c.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));await SS.w(500)})()"
 '10-vybor-neskolkih'    = "(async()=>{document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));document.querySelector('.lib-menu')?.remove();SS.btn(document.querySelector('.lib-actions'),'Выбрать').click();await SS.w(400);const cs=document.querySelectorAll('.lib-grid .bookcard');[0,1,4].forEach(i=>cs[i]?.click());await SS.w(500)})()"
 '11-pdf-vkladka'        = "(async()=>{SS.btn(document.querySelector('.lib-pickbar'),'Отмена')?.click();await SS.w(300);document.querySelector('.lib-grid .bookcard.lib-pdf')?.click();for(let i=0;i<80;i++){await SS.w(150);if(/страниц/.test(document.querySelector('.pdf-status')?.textContent||''))break;}await SS.w(1200)})()"
 '12-syuita'             = "(async()=>{await SS.home();await SS.lib('file');await SS.w(800)})()"
 '13-kosmos'             = "(async()=>{await SS.home();SS.click('menuCosmos');await SS.w(2500)})()"
 '14-polzovateli'        = "(async()=>{await SS.home();SS.click('menuUsers');await SS.w(1500)})()"
 '15-nastroyki'          = "(async()=>{await SS.home();SS.click('menuSettings');await SS.w(900)})()"
 '16-sayt'               = "(async()=>{await SS.home();SS.click('btnSite');await SS.w(900)})()"
 '17-larets-darov'       = "(async()=>{await SS.home();SS.click('btnGifts');await SS.w(1200)})()"
 '18-doverie'            = "(async()=>{await SS.home();SS.click('btnTrust');await SS.w(1200)})()"
 '19-menu-eshche'        = "(async()=>{await SS.home();SS.click('btnMore');await SS.w(300)})()"
 '20-gadanie-i-czin'     = "(async()=>{await SS.home();await SS.oracle('iching');SS.btn(null,'ГЕНЕРАЦИЯ')?.click();await SS.w(2500)})()"
 '21-gadanie-medichi'    = "(async()=>{await SS.home();await SS.oracle('medici');const t=[...document.querySelectorAll('.md-card')].find(c=>/^Т/.test(c.textContent.trim()));t?.click();await SS.w(300);SS.btn(null,'Найти цепочку')?.click();await SS.w(4000)})()"
 '22-gadanie-tonalpoualli' = "(async()=>{await SS.home();await SS.oracle('tonalpohualli');SS.btn(null,'СПРОСИТЬ ДЕНЬ')?.click();await SS.w(2000)})()"
 '23-gadanie-tsite'      = "(async()=>{await SS.home();await SS.oracle('tzite');SS.btn(null,'БРОСИТЬ СЕМЕНА')?.click();await SS.w(3000)})()"
 '24-gadanie-obi'        = "(async()=>{await SS.home();await SS.oracle('obi');document.querySelector('.obi-guess').value='Стоит ли начинать?';SS.btn(null,'БРОСИТЬ ОРЕХ')?.click();await SS.w(2500)})()"
}
foreach ($k in $steps.Keys) {
  & $cdp -Eval $steps[$k] | Out-Null
  & $cdp -Shot (Join-Path $Out "$k.png") | Out-Null
  "снят: $k"
}
& $cdp -Eval "(async()=>{await SS.home();return 'готово'})()"
