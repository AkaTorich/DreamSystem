#!/usr/bin/env bash
# Испечь обложки всех PDF сайта: первая страница → WebP 160 точек в ширину (~2 КБ)
# в uploads/pdfcovers/<имя файла>.webp. Готовые не трогает. Запуск на сервере:
#   bash bake-covers.sh /var/www/clients/client0/web3/web
# Новым книгам обложку печёт сам api.php (pdf_cover_bake) при отправке.
set -u
WEB="${1:-/var/www/clients/client0/web3/web}"
SRC="$WEB/uploads/pdf"
DST="$WEB/uploads/pdfcovers"
mkdir -p "$DST"
TMP="$(mktemp -d)"
made=0; skip=0; bad=0
for f in "$SRC"/*.pdf; do
  [ -e "$f" ] || continue
  out="$DST/$(basename "$f").webp"
  if [ -s "$out" ]; then skip=$((skip+1)); continue; fi
  if nice -n 15 timeout 60 gs -q -dSAFER -dBATCH -dNOPAUSE -dFirstPage=1 -dLastPage=1 \
       -sDEVICE=png16m -r48 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -o "$TMP/p.png" "$f" 2>/dev/null \
     && nice -n 15 convert "$TMP/p.png" -resize "160x>" -strip -quality 70 "$out" 2>/dev/null; then
    made=$((made+1))
  else
    bad=$((bad+1)); rm -f "$out"
  fi
done
rm -rf "$TMP"
chown -R web3:client0 "$DST" 2>/dev/null
chmod 644 "$DST"/*.webp 2>/dev/null
echo "испечено: $made, уже были: $skip, не вышло: $bad"
echo "занимают: $(du -sh "$DST" | cut -f1)"
