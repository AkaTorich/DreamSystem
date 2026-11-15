# Один раз (и после каждого «cargo tauri android init»): проект Android в app\gen\android и свои правки в нём.
#   1) cargo tauri android init --ci — только создаёт проект Gradle, ничего не собирает;
#   2) имя на телефоне — «Карта снов», разрешение на интернет (сайт);
#   3) подпись своим ключом: android-keystore\crossdream.jks + keystore.properties (ключ создаётся, если его нет;
#      пароль случайный и лежит только в keystore.properties — папка в .gitignore).
# Запуск: powershell -ExecutionPolicy Bypass -File tools\android-init.ps1 [-Force]   (-Force — заново init)

param([switch]$Force)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'android-env.ps1')
$root = Split-Path $PSScriptRoot -Parent
$app = Join-Path $root 'app'
$android = Join-Path $app 'gen\android'
$utf8 = New-Object System.Text.UTF8Encoding($false)

if ($Force -or -not (Test-Path (Join-Path $android 'app\build.gradle.kts'))) {
    Set-Location $app
    $ErrorActionPreference = 'Continue'
    cargo tauri android init --ci 2>&1 | ForEach-Object { "  $_" }
    $ErrorActionPreference = 'Stop'
    Set-Location $root
    if (-not (Test-Path (Join-Path $android 'app\build.gradle.kts'))) { throw 'cargo tauri android init не создал проект' }
}

# --- подпись: свой ключ ---
$ksDir = Join-Path $root 'android-keystore'
$props = Join-Path $ksDir 'keystore.properties'
if (-not (Test-Path $props)) {
    New-Item -ItemType Directory -Force $ksDir | Out-Null
    $chars = [char[]]'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
    $b = New-Object byte[] 24; $rng.GetBytes($b)
    $pw = -join ($b | ForEach-Object { $chars[$_ % $chars.Length] })
    $jks = Join-Path $ksDir 'crossdream.jks'
    if (Test-Path $jks) { throw "Есть $jks, но нет keystore.properties с его паролем — верните файл паролей или уберите ключ сами." }
    # keytool пишет ход работы в поток ошибок — это не ошибка
    $ErrorActionPreference = 'Continue'
    & (Join-Path $env:JAVA_HOME 'bin\keytool.exe') -genkeypair -keystore $jks -alias crossdream -keyalg RSA -keysize 2048 `
        -validity 10000 -storepass $pw -keypass $pw -dname 'CN=CrossDream, O=O.V.K' 2>&1 | Out-Null
    $ErrorActionPreference = 'Stop'
    if (-not (Test-Path $jks)) { throw 'keytool не создал ключ' }
    $text = "storeFile=crossdream.jks`nstorePassword=$pw`nkeyAlias=crossdream`nkeyPassword=$pw`n"
    [IO.File]::WriteAllText($props, $text, $utf8)
    Write-Output "Ключ подписи: $jks"
}

# --- build.gradle.kts: подпись выпуска своим ключом ---
$gradle = Join-Path $android 'app\build.gradle.kts'
$g = [IO.File]::ReadAllText($gradle)
if ($g -notmatch 'CrossDream: подпись') {
    $sign = @'
    // CrossDream: подпись своим ключом (android-keystore в корне проекта)
    signingConfigs {
        create("release") {
            val propsFile = rootProject.file("../../../android-keystore/keystore.properties")
            val props = Properties()
            props.load(FileInputStream(propsFile))
            keyAlias = props["keyAlias"] as String
            keyPassword = props["keyPassword"] as String
            storeFile = File(propsFile.parentFile, props["storeFile"] as String)
            storePassword = props["storePassword"] as String
        }
    }
    buildTypes {
'@
    $g = ([regex]'(?m)^    buildTypes \{\r?\n').Replace($g, ($sign -replace "`r", '') + "`n", 1)
    $g = ([regex]'getByName\("release"\) \{\r?\n').Replace($g, "getByName(`"release`") {`n            signingConfig = signingConfigs.getByName(`"release`")`n", 1)
    if ($g -notmatch 'import java\.io\.FileInputStream') { $g = "import java.io.FileInputStream`n" + $g }
    if ($g -notmatch 'import java\.util\.Properties') { $g = "import java.util.Properties`n" + $g }
    [IO.File]::WriteAllText($gradle, $g, $utf8)
    Write-Output 'build.gradle.kts: подпись своим ключом'
}

# --- имя на телефоне ---
$strings = Join-Path $android 'app\src\main\res\values\strings.xml'
if (Test-Path $strings) {
    $s = [IO.File]::ReadAllText($strings)
    $s = $s -replace '<string name="app_name">[^<]*</string>', '<string name="app_name">Карта снов</string>'
    $s = $s -replace '<string name="main_activity_title">[^<]*</string>', '<string name="main_activity_title">Карта снов</string>'
    [IO.File]::WriteAllText($strings, $s, $utf8)
}

# --- манифест: интернет для сайта ---
$manifest = Join-Path $android 'app\src\main\AndroidManifest.xml'
$m = [IO.File]::ReadAllText($manifest)
if ($m -notmatch 'android\.permission\.INTERNET') {
    $m = $m -replace '(<manifest[^>]*>)', "`$1`n    <uses-permission android:name=`"android.permission.INTERNET`" />"
    [IO.File]::WriteAllText($manifest, $m, $utf8)
}
Write-Output "Проект Android готов: $android"
