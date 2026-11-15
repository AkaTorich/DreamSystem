# Запускает собранную CrossDream с отладочным портом WebView2 (9222) — для проверки окна через tools\cdp.ps1.
# Запуск: powershell -ExecutionPolicy Bypass -File tools\run-debug.ps1
$exe = Join-Path (Split-Path $PSScriptRoot -Parent) 'target\release\CrossDream.exe'
if (-not (Test-Path $exe)) { throw 'Нет target\release\CrossDream.exe — сначала tools\build-windows.ps1' }
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'
Start-Process $exe
