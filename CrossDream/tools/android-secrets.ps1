# Кладёт ключ подписи Android (android-keystore\crossdream.jks и keystore.properties) в зашифрованные секреты
# репозитория AkaTorich/DreamSystem — чтобы GitHub подписывал apk тем же ключом и он ставился поверх прежнего.
# Секреты не видны никому, даже в открытом репозитории. Запускать один раз (и снова — если ключ сменится).
# Запуск: powershell -ExecutionPolicy Bypass -File tools\android-secrets.ps1

$ErrorActionPreference = 'Stop'
$dir = Join-Path (Split-Path $PSScriptRoot -Parent) 'android-keystore'
$repo = 'AkaTorich/DreamSystem'
foreach ($p in @(@('crossdream.jks', 'ANDROID_KEYSTORE_B64'), @('keystore.properties', 'ANDROID_KEYSTORE_PROPS_B64'))) {
    $file = Join-Path $dir $p[0]
    if (-not (Test-Path $file)) { throw "Нет файла $file" }
    [Convert]::ToBase64String([IO.File]::ReadAllBytes($file)) | gh secret set $p[1] --repo $repo
    if ($LASTEXITCODE -ne 0) { throw "Секрет $($p[1]) не записался" }
}
gh secret list --repo $repo
Write-Output 'Готово: ключ подписи Android лежит в секретах репозитория.'
