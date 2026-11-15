# Мост к серверу 199.80.55.10 (dream.globthe.top и др.) через модуль Posh-SSH.
# Пароль берётся из файла хозяина L:\ProjectOfLightLife\пароли.txt (строка «пароль» после «SSH (root)»),
# в скрипте и в истории команд он не хранится.
#   .\srv.ps1 sh   "команда на сервере"
#   .\srv.ps1 pull /путь/на/сервере  C:\локальный\файл
#   .\srv.ps1 push C:\локальный\файл /путь/на/сервере
param(
    [Parameter(Mandatory)][ValidateSet('sh', 'pull', 'push')][string]$Op,
    [Parameter(Mandatory)][string]$A,
    [string]$B
)
$ErrorActionPreference = 'Stop'
Import-Module Posh-SSH

$file = Get-ChildItem 'L:\ProjectOfLightLife' -Filter '*.txt' | Where-Object { $_.BaseName -match '^\p{IsCyrillic}+$' } |
    Select-String -Pattern 'SSH \(root\)' -List | Select-Object -First 1
if (-not $file) { throw 'Не найден файл паролей в L:\ProjectOfLightLife' }
$lines = Get-Content $file.Path -Encoding UTF8
$pass = $null
for ($i = 0; $i -lt $lines.Count -and -not $pass; $i++) {
    if ($lines[$i] -notmatch 'SSH \(root\)') { continue }
    for ($j = $i + 1; $j -le [Math]::Min($i + 4, $lines.Count - 1); $j++) {
        if ($lines[$j] -match '^\s*пароль\s+(\S+)') { $pass = $Matches[1]; break }
    }
}
if (-not $pass) { throw 'В файле паролей не нашлась строка пароля SSH' }
$cred = New-Object PSCredential('root', (ConvertTo-SecureString $pass -AsPlainText -Force))
$hostIp = '199.80.55.10'

switch ($Op) {
    'sh' {
        $s = New-SSHSession -ComputerName $hostIp -Credential $cred -AcceptKey -Force -WarningAction SilentlyContinue
        try {
            $r = Invoke-SSHCommand -SessionId $s.SessionId -Command $A -TimeOut 600
            $r.Output; if ($r.Error) { $r.Error }
            exit $r.ExitStatus
        } finally { Remove-SSHSession -SessionId $s.SessionId | Out-Null }
    }
    'pull' {
        Get-SCPItem -ComputerName $hostIp -Credential $cred -AcceptKey -Force -Path $A -PathType File `
            -Destination (Split-Path $B -Parent) -NewName (Split-Path $B -Leaf) -WarningAction SilentlyContinue
        "скачан: $B"
    }
    'push' {
        # путь на сервере делим вручную: Split-Path перевернул бы косые черты на виндовые
        $cut = $B.LastIndexOf('/')
        Set-SCPItem -ComputerName $hostIp -Credential $cred -AcceptKey -Force -Path $A `
            -Destination $B.Substring(0, $cut) -NewName $B.Substring($cut + 1) -WarningAction SilentlyContinue
        "отправлен: $B"
    }
}
