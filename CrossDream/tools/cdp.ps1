# Проверка окна CrossDream без клавиатуры и мыши: подключение к WebView2 по отладочному порту.
# Программу нужно запустить через tools\run-debug.ps1 (порт 9222).
#   -Eval 'код JS'                  выполнить в окне и вывести результат (обещания дожидаются)
#   -Shot файл.png                  снимок окна
#   -Width 390 -Height 800          размер страницы для снимка (без него — как есть)
#   -Scale 4                        плотность точек: -Width 1920 -Height 1080 -Scale 4 — снимок 7680×4320 (8K)
#   -Shots папка                    снимки при трёх ширинах: 360 (телефон), 768 (узкое окно), 1280 (широкое)
# Пример: powershell -ExecutionPolicy Bypass -File tools\cdp.ps1 -Eval "document.title"

param([string]$Eval, [string]$Shot, [string]$Shots, [int]$Width = 0, [int]$Height = 0, [int]$Port = 9222, [double]$Scale = 1)
$ErrorActionPreference = 'Stop'

$pages = Invoke-RestMethod "http://127.0.0.1:$Port/json"
$page = $pages | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
if (-not $page) { throw 'окно не найдено' }

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ws.Options.KeepAliveInterval = [TimeSpan]::FromSeconds(30)
$ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
$script:id = 0

function Send-Cdp([string]$method, $params) {
    $script:id++
    $msg = @{ id = $script:id; method = $method; params = $params } | ConvertTo-Json -Depth 10 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
    $ws.SendAsync([ArraySegment[byte]]$bytes, 'Text', $true, [Threading.CancellationToken]::None).Wait()
    $buf = New-Object byte[] 1048576
    while ($true) {
        $ms = New-Object IO.MemoryStream
        do {
            $r = $ws.ReceiveAsync([ArraySegment[byte]]$buf, [Threading.CancellationToken]::None).Result
            $ms.Write($buf, 0, $r.Count)
        } while (-not $r.EndOfMessage)
        $text = [Text.Encoding]::UTF8.GetString($ms.ToArray())
        $obj = $text | ConvertFrom-Json
        if ($obj.id -eq $script:id) { return $obj }
    }
}

function Set-Size([int]$w, [int]$h) {
    Send-Cdp 'Emulation.setDeviceMetricsOverride' @{ width = $w; height = $h; deviceScaleFactor = $Scale; mobile = ($w -lt 720) } | Out-Null
    Start-Sleep -Milliseconds 600
}

function Save-Shot([string]$file) {
    $res = Send-Cdp 'Page.captureScreenshot' @{ format = 'png' }
    [IO.File]::WriteAllBytes($file, [Convert]::FromBase64String($res.result.data))
    Write-Output "снимок: $file"
}

if ($Width -gt 0) { Set-Size $Width $Height }
if ($Eval) {
    $res = Send-Cdp 'Runtime.evaluate' @{ expression = $Eval; awaitPromise = $true; returnByValue = $true }
    if ($res.result.exceptionDetails) { Write-Output ('ОШИБКА: ' + ($res.result.exceptionDetails | ConvertTo-Json -Depth 6 -Compress)) }
    else { Write-Output ($res.result.result.value | ConvertTo-Json -Depth 6 -Compress) }
}
if ($Shot) { Save-Shot $Shot }
if ($Shots) {
    New-Item -ItemType Directory -Force $Shots | Out-Null
    foreach ($s in @(@(360, 760), @(768, 900), @(1280, 800))) {
        Set-Size $s[0] $s[1]
        Save-Shot (Join-Path $Shots ("w{0}.png" -f $s[0]))
    }
}
if ($Width -gt 0 -or $Shots) { Send-Cdp 'Emulation.clearDeviceMetricsOverride' @{} | Out-Null }
$ws.Dispose()
