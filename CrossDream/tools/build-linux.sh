#!/usr/bin/env bash
# Сборка CrossDream для Linux (AppImage + deb) в WSL (Ubuntu) на этом же компьютере.
# Запуск из Windows:  wsl -d Ubuntu -- bash "<путь к CrossDream в /mnt/c/...>/tools/build-linux.sh"
# Первый раз сам ставит пакеты (через sudo), Rust и tauri-cli. Исходники копируются в ~/crossdream-build
# (сборка прямо с диска Windows в WSL идёт в разы медленнее), готовое кладётся в CrossDream/builds/linux.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$HOME/crossdream-build"
OUT="$SRC/builds/linux"

if ! dpkg -s libwebkit2gtk-4.1-dev >/dev/null 2>&1; then
  echo "== пакеты для WebKitGTK"
  sudo DEBIAN_FRONTEND=noninteractive apt-get update
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev \
    libxdo-dev patchelf file build-essential curl wget rsync pkg-config ca-certificates
fi

if [ ! -x "$HOME/.cargo/bin/cargo" ]; then
  echo "== Rust"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
fi
export PATH="$HOME/.cargo/bin:$PATH"

if ! cargo tauri --version >/dev/null 2>&1; then
  echo "== tauri-cli"
  cargo install tauri-cli --version "^2" --locked --jobs 4
fi

echo "== исходники → $WORK"
mkdir -p "$WORK"
rsync -a --delete --exclude target --exclude builds --exclude web-dist --exclude 'app/gen' \
  --exclude '*.exe' --exclude '*.apk' --exclude 'docs/*.pdf' "$SRC/" "$WORK/"

echo "== сборка"
cd "$WORK/app"
# AppImage собирается без FUSE (в WSL его нет)
export APPIMAGE_EXTRACT_AND_RUN=1 NO_STRIP=1
CARGO_BUILD_JOBS=4 cargo tauri build --bundles appimage,deb

mkdir -p "$OUT"
cp -f "$WORK"/target/release/bundle/appimage/*.AppImage "$WORK"/target/release/bundle/deb/*.deb "$OUT/"
echo "== готово:"
ls -la "$OUT"
