# Сборка CrossDream.apk: arm64 для телефонов + x86_64 для эмулятора, подпись своим ключом, копия в корень проекта.
#
# Почему не одной командой «cargo tauri android build»: в конце она делает символьные ссылки на библиотеки,
# а Windows без режима разработчика даёт их только администратору. Поэтому так:
#   1) библиотека Rust под каждую цель собирается самим Tauri (со всеми нужными переменными); его последний шаг —
#      ссылка — падает, это ожидаемо, проверяется только свежесть готовой .so;
#   2) .so копируются в jniLibs обычным копированием;
#   3) Gradle собирает apk без своих задач сборки Rust (-x rustBuild…).
# Ни компоновщик NDK (clang через .cmd), ни Gradle не терпят русских букв в пути («Программы»): Rust для Android
# собирается в отдельную папку с латинским путём (CARGO_TARGET_DIR), а Gradle — через букву диска (subst).
# Tauri же запускается из настоящей папки: под подменённой буквой он не находит свои assets.
# Запуск: powershell -ExecutionPolicy Bypass -File tools\build-android.ps1 [-SkipRust]

param([switch]$SkipRust)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'android-env.ps1')
$realRoot = Split-Path $PSScriptRoot -Parent
$lib = 'libcrossdream_lib.so'
$targets = @(
    @{ tauri = 'aarch64'; triple = 'aarch64-linux-android'; abi = 'arm64-v8a'; arch = 'arm64' },
    @{ tauri = 'x86_64'; triple = 'x86_64-linux-android'; abi = 'x86_64'; arch = 'x86_64' }
)
if (-not (Test-Path (Join-Path $realRoot 'app\gen\android'))) { throw 'Нет app\gen\android — сначала tools\android-init.ps1 (см. README).' }
if (-not (Test-Path (Join-Path $realRoot 'android-keystore\keystore.properties'))) {
    throw 'Нет android-keystore\keystore.properties — сначала tools\android-init.ps1.'
}

$letter = $null
foreach ($l in 'X', 'Z', 'O', 'N', 'M', 'K', 'J') {
    if (-not (Test-Path "${l}:\")) { $letter = "${l}:"; break }
}
if (-not $letter) { throw 'Нет свободной буквы диска для subst' }
$env:CARGO_TARGET_DIR = Join-Path $env:LOCALAPPDATA 'crossdream-android-target'   # латинский путь для NDK
subst $letter $realRoot
try {
    $root = "$letter\"
    $android = Join-Path $root 'app\gen\android'
    Set-Location (Join-Path $realRoot 'app')

    if (-not $SkipRust) {
        foreach ($t in $targets) {
            $so = Join-Path $env:CARGO_TARGET_DIR "$($t.triple)\release\$lib"
            $started = Get-Date
            Write-Output "Rust: $($t.triple)"
            $ErrorActionPreference = 'Continue'
            $log = cargo tauri android build --apk --target $t.tauri -- --jobs 2 2>&1 | ForEach-Object { "$_" }
            $ErrorActionPreference = 'Stop'
            $log | Select-String -Pattern '^error|error\[|Finished' | ForEach-Object { "  $_" }
            if (-not (Test-Path $so) -or (Get-Item $so).LastWriteTime -lt $started.AddSeconds(-5)) {
                # не пересобралась: либо исходники те же («Finished» без ошибок), либо настоящая ошибка
                if (($log -join "`n") -match '(?m)^\S*error' -or -not (Test-Path $so)) {
                    throw "Rust для $($t.triple) не собрался:`n$(($log | Select-Object -Last 30) -join "`n")"
                }
            }
        }
    }

    foreach ($t in $targets) {
        $dir = Join-Path $android "app\src\main\jniLibs\$($t.abi)"
        New-Item -ItemType Directory -Force $dir | Out-Null
        Copy-Item (Join-Path $env:CARGO_TARGET_DIR "$($t.triple)\release\$lib") (Join-Path $dir $lib) -Force
    }

    Set-Location $android
    $abis = ($targets | ForEach-Object { $_.abi }) -join ','
    $archs = ($targets | ForEach-Object { $_.arch }) -join ','
    $tlist = ($targets | ForEach-Object { $_.tauri }) -join ','
    $skip = @('-x', 'rustBuildUniversalRelease')
    foreach ($t in $targets) { $skip += @('-x', "rustBuild$((Get-Culture).TextInfo.ToTitleCase($t.arch))Release") }
    $ErrorActionPreference = 'Continue'
    & .\gradlew.bat assembleUniversalRelease "-PabiList=$abis" "-ParchList=$archs" "-PtargetList=$tlist" @skip --no-daemon 2>&1 |
        ForEach-Object { "$_" } | Select-String -Pattern 'BUILD|What went wrong|error:|e: ' | ForEach-Object { "  $_" }
    $ErrorActionPreference = 'Stop'
}
finally {
    Set-Location $realRoot
    subst $letter /D | Out-Null
}
$apk = Get-ChildItem (Join-Path $realRoot 'app\gen\android\app\build\outputs\apk\universal\release') -Filter '*.apk' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $apk) { throw 'apk не собрался' }
Copy-Item $apk.FullName (Join-Path $realRoot 'CrossDream.apk') -Force
Write-Output "APK: $(Join-Path $realRoot 'CrossDream.apk')"
