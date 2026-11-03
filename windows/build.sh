#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Builds build/windows/Fretwright-<version>-windows-{x64,arm64}.zip (portable Fretwright.exe).
# Cross-compiles from macOS, Linux or Windows (Git Bash): needs Go and Node only.
#   npm run build:windows          (SKIP_WEB=1 to reuse dist/)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="$(node -p "require('./package.json').version")"
VERSION4="$(node -p "(require('./package.json').version.split('-')[0].split('.').concat(['0','0','0','0'])).slice(0,4).join('.')")"
OUT="$ROOT/build/windows"
WORK="$OUT/.work"

echo "==> Web app"
if [[ "${SKIP_WEB:-}" != "1" ]]; then
  npx tsc -b
  npx vite build --logLevel warn
fi
[[ -f dist/index.html ]] || { echo "dist/index.html missing" >&2; exit 1; }

rm -rf windows/web "$WORK"
mkdir -p "$OUT" "$WORK"
cp -R dist windows/web

echo "==> Resources (icon, manifest, version)"
sed -e "s/__VERSION4__/$VERSION4/g" -e "s/__VERSION__/$VERSION/g" windows/winres/winres.json > windows/winres/winres.gen.json
(cd windows && go run github.com/tc-hib/go-winres@v0.3.3 make --in winres/winres.gen.json --arch amd64,arm64 --out rsrc)
rm windows/winres/winres.gen.json

for arch in amd64 arm64; do
  label=$([[ $arch == amd64 ]] && echo x64 || echo arm64)
  echo "==> Fretwright.exe ($label)"
  mkdir -p "$WORK/$label/Fretwright"
  (cd windows && CGO_ENABLED=0 GOOS=windows GOARCH=$arch go build -trimpath -ldflags "-H windowsgui -s -w" -o "$WORK/$label/Fretwright/Fretwright.exe" .)
  cp LICENSE "$WORK/$label/Fretwright/LICENSE.txt"
  zip="$OUT/Fretwright-$VERSION-windows-$label.zip"
  rm -f "$zip"
  (cd "$WORK/$label" && if command -v zip >/dev/null; then zip -qr "$zip" Fretwright; else powershell -NoProfile -Command "Compress-Archive -Path Fretwright -DestinationPath '$(cygpath -w "$zip" 2>/dev/null || echo "$zip")'"; fi)
  cp "$WORK/$label/Fretwright/Fretwright.exe" "$OUT/Fretwright-$label.exe"
done
rm -rf "$WORK" windows/web windows/rsrc_windows_*.syso
ls -la "$OUT"
