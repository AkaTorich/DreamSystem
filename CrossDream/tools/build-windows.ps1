# Сборка CrossDream для Windows: значок (fix-ico), программа и установщик NSIS, копии в корень проекта.
# Сборка в две нити (--jobs 2), чтобы не грузить машину. Запущенная CrossDream закрывается сама — иначе exe занят.
# Запуск: powershell -ExecutionPolicy Bypass -File tools\build-windows.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"

Get-Process CrossDream -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500

# значок: мелкие размеры несжатыми, иначе Проводник рисует на ярлыке пустую заглушку
& (Join-Path $PSScriptRoot 'fix-ico.ps1')

Set-Location (Join-Path $root 'app')
$started = Get-Date
$ErrorActionPreference = 'Continue'
cargo tauri build --bundles nsis -- --jobs 2 2>&1 | ForEach-Object { "$_" } |
    Select-String -Pattern '^error|error\[|Finished|Built application|Finished \d+ bundle' |
    ForEach-Object { "  $_" }
$ErrorActionPreference = 'Stop'
Set-Location $root

$exe = Join-Path $root 'target\release\CrossDream.exe'
if (-not (Test-Path $exe) -or (Get-Item $exe).LastWriteTime -lt $started.AddSeconds(-5)) {
    if (-not (Test-Path $exe)) { throw 'CrossDream.exe не собрался' }
    Write-Output '  (exe не менялся — исходники те же)'
}
Copy-Item $exe (Join-Path $root 'CrossDream.exe') -Force

$setup = Get-ChildItem (Join-Path $root 'target\release\bundle\nsis') -Filter '*-setup.exe' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) { throw 'установщик не собрался' }
Copy-Item $setup.FullName (Join-Path $root $setup.Name) -Force

Write-Output "Программа:  $(Join-Path $root 'CrossDream.exe')"
Write-Output "Установщик: $(Join-Path $root $setup.Name)"
