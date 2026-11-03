#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Builds build/linux/Fretwright-<version>.flatpak on Linux (needs flatpak, flatpak-builder, Node).
#   npm run build:flatpak          (SKIP_WEB=1 to reuse dist/)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="$(node -p "require('./package.json').version")"
APP_ID=io.github.martwyymem.Fretwright
OUT="$ROOT/build/linux"
if [[ "${SKIP_WEB:-}" != "1" ]]; then
  npx tsc -b
  npx vite build --logLevel warn
fi
mkdir -p "$OUT"
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak-builder --user --install-deps-from=flathub --force-clean --repo="$OUT/repo" "$OUT/build-dir" "linux/$APP_ID.yml"
flatpak build-bundle --runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo "$OUT/repo" "$OUT/Fretwright-$VERSION.flatpak" "$APP_ID"
echo "Built $OUT/Fretwright-$VERSION.flatpak"
echo "Install: flatpak install --user $OUT/Fretwright-$VERSION.flatpak"
