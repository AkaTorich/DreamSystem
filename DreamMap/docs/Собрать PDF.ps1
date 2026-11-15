# Печать HTML-исходника в PDF через Chrome (headless).
#   .\Собрать PDF.ps1                       — собрать руководство рядом со скриптом
#   .\Собрать PDF.ps1 -Html путь -Pdf путь  — собрать что угодно
param(
    [string]$Html = "$PSScriptRoot\Руководство.html",
    [string]$Pdf  = "$env:USERPROFILE\Desktop\Карта снов — руководство.pdf"
)

$chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) { Write-Error "Chrome не найден — печать в PDF идёт только через него (Edge не умеет)"; exit 1 }
if (-not (Test-Path $Html)) { Write-Error "Нет исходника: $Html"; exit 1 }

$tmpDir = Join-Path $env:TEMP ("chrome_pdf_" + [guid]::NewGuid().ToString("N").Substring(0, 8))
$url = "file:///" + $Html.Replace([char]92, [char]47)

& $chrome --headless=new --disable-gpu --no-first-run --user-data-dir="$tmpDir" `
          --no-pdf-header-footer --print-to-pdf="$Pdf" $url 2>$null
Start-Sleep -Seconds 2
try { Remove-Item $tmpDir -Recurse -Force -ErrorAction Stop } catch { }   # временный профиль Chrome

if (Test-Path $Pdf) {
    $i = Get-Item $Pdf
    "готово: {0}  ({1:N0} байт)" -f $i.FullName, $i.Length
} else {
    Write-Error "PDF не создан"
}
