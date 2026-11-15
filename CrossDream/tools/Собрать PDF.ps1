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
# русские буквы в пути: адрес — в процентной записи, PDF — сперва во временный файл с латинским именем
$url = ([Uri](Resolve-Path $Html).Path).AbsoluteUri
$tmpPdf = "$tmpDir.pdf"

$p = Start-Process $chrome -PassThru -Wait -WindowStyle Hidden -ArgumentList @(
    '--headless=new', '--disable-gpu', '--no-first-run', "--user-data-dir=`"$tmpDir`"",
    '--no-pdf-header-footer', "--print-to-pdf=`"$tmpPdf`"", "`"$url`"")
if ([IO.File]::Exists($tmpPdf)) { if ([IO.File]::Exists($Pdf)) { [IO.File]::Delete($Pdf) }; [IO.File]::Move($tmpPdf, $Pdf) }
try { [IO.Directory]::Delete($tmpDir, $true) } catch { }   # временный профиль Chrome

if (Test-Path $Pdf) {
    $i = Get-Item $Pdf
    "готово: {0}  ({1:N0} байт)" -f $i.FullName, $i.Length
} else {
    Write-Error "PDF не создан"
}
