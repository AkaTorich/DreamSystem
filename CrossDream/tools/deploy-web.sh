#!/usr/bin/env bash
# Сервер: выложить сайтовую версию CrossDream в корень dream.globthe.top (зовёт tools\build-web.ps1 -Deploy).
# $1 — имена верхнего уровня сборки (index.html css fonts js shim vendor): заменяются только они.
set -e
W=/var/www/clients/client0/web3/web
TAR=/root/cd-web.tgz
NAMES="$1"
[ -s "$TAR" ] || { echo "нет архива $TAR"; exit 1; }
cd "$W"

# 1. свои имена — заново; чужое (api.php, lib, uploads, reset.php, assets…) не трогается
for n in $NAMES; do
  case "$n" in
    index.html|css|fonts|js|shim|vendor) rm -rf -- "$W/$n" ;;
    .htaccess) ;;                                  # правила корня — ниже, дописываются
    *) echo "незнакомое имя в сборке: $n — не трогаю"; ;;
  esac
done
tar -xzf "$TAR" -C "$W" --exclude='./.htaccess'
rm -f "$TAR"
for n in index.html css fonts js shim vendor; do
  [ -e "$W/$n" ] || continue
  chown -R web3:client0 "$W/$n"
  find "$W/$n" -type d -exec chmod 755 {} + ; find "$W/$n" -type f -exec chmod 644 {} +
done

# 2. программа — главная: прежняя заглушка index.php и папка /app/ больше не нужны
rm -f "$W/index.php"
rm -rf "$W/app"

# 3. правила корня: старые адреса и /app/ → главная; скрипты сверяются при каждой загрузке
H="$W/.htaccess"
grep -q 'RewriteEngine On' "$H" 2>/dev/null || echo 'RewriteEngine On' >> "$H"
sed -i '/^# прежние страницы убраны/d; /^RewriteRule \^(login|logout|biblio|admin|import)/d' "$H"
grep -q 'CrossDream: главная' "$H" || cat >> "$H" <<'R'

# CrossDream: главная — сайтовая версия программы. Старые ссылки и закладки ведут на неё
RewriteRule ^(login|logout|biblio|admin|import|index)\.php$ / [R=301,L]
RewriteRule ^app(/.*)?$ / [R=301,L]
DirectoryIndex index.html
<IfModule mod_headers.c>
  <FilesMatch "\.(js|css|html)$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>
R
chown web3:client0 "$H"; chmod 644 "$H"

echo "залито в корень: $(find $NAMES -type f 2>/dev/null | wc -l) файлов"
for u in / /app/ /login.php /api.php?action=me /reset.php /js/main.js; do
  curl -s -o /dev/null -w "$u: %{http_code} %{redirect_url}\n" "https://dream.globthe.top$u"
done
