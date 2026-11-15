# Сайтовая версия CrossDream: тот же интерфейс app\ui, что в программе, плюс прослойка web\shim,
# которая вместо ядра на Rust ходит в api.php сайта. Это и есть сайт dream.globthe.top — лежит в корне.
# Собирается в web-dist\ (не в git); по ключу -Deploy заливается в корень сайта (tools\deploy-web.sh):
# заменяются только свои имена (index.html, css, fonts, js, shim, vendor) — api.php, lib, uploads,
# reset.php и прочее серверное не трогается.
# Запуск: powershell -ExecutionPolicy Bypass -File tools\build-web.ps1 [-Deploy]
param([switch]$Deploy)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$ui = Join-Path $root 'app\ui'
$shim = Join-Path $root 'web\shim'
$out = Join-Path $root 'web-dist'

# 1. чистая копия интерфейса + прослойка
if (Test-Path $out) { Get-ChildItem $out -Force | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force } }
New-Item -ItemType Directory -Force $out | Out-Null
Copy-Item "$ui\*" $out -Recurse -Force
Copy-Item $shim (Join-Path $out 'shim') -Recurse -Force

# 2. прослойка подключается раньше main.js (модули выполняются по порядку)
$ix = Join-Path $out 'index.html'
$t = [IO.File]::ReadAllText($ix, [Text.Encoding]::UTF8)
$tag = '<script type="module" src="js/main.js"></script>'
if (-not $t.Contains($tag)) { throw 'в index.html нет подключения main.js' }
$t = $t.Replace($tag, '<script type="module" src="shim/tauri.js"></script>' + "`n" + $tag)
[IO.File]::WriteAllText($ix, $t, (New-Object Text.UTF8Encoding($false)))
$names = (Get-ChildItem $out -Force | ForEach-Object Name) -join ' '
"собрано: $out ($((Get-ChildItem $out -Recurse -File).Count) файлов): $names"

if (-not $Deploy) { return }

# 3. заливка: архив + серверный сценарий; правила .htaccess корня сайта сценарий дописывает сам
$tar = Join-Path $env:LOCALAPPDATA 'Temp\cd-web.tgz'
& tar.exe -czf $tar -C $out .
$srv = Join-Path (Split-Path $root -Parent) 'tools\srv.ps1'
& powershell.exe -ExecutionPolicy Bypass -File $srv push $tar '/root/cd-web.tgz' | Out-Null
& powershell.exe -ExecutionPolicy Bypass -File $srv push (Join-Path $PSScriptRoot 'deploy-web.sh') '/root/deploy-web.sh' | Out-Null
& powershell.exe -ExecutionPolicy Bypass -File $srv sh "bash /root/deploy-web.sh '$names'; rm -f /root/deploy-web.sh"
Remove-Item -LiteralPath $tar -Force
