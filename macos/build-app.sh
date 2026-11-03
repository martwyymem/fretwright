#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Builds build/Fretwright.app (universal: Apple silicon + Intel, macOS 26 or later) and a zip of it.
#   npm run build:mac
# Env: CODESIGN_IDENTITY (default "-" = ad-hoc), SKIP_WEB=1 to reuse dist/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/build"
APP="$OUT/Fretwright.app"
WORK="$OUT/.mac-work"
MIN_OS="26.0"
VERSION="$(node -p "require('$ROOT/package.json').version")"
BUILD_NUMBER="$(git -C "$ROOT" rev-list --count HEAD 2>/dev/null || echo 1)"
IDENTITY="${CODESIGN_IDENTITY:--}"

cd "$ROOT"
echo "==> Web app"
if [[ "${SKIP_WEB:-}" != "1" ]]; then
  npx tsc -b
  npx vite build --logLevel warn
fi
[[ -f dist/index.html ]] || { echo "dist/index.html missing" >&2; exit 1; }

rm -rf "$APP" "$WORK"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$WORK"

echo "==> Native shell (arm64 + x86_64, macOS $MIN_OS+)"
for arch in arm64 x86_64; do
  xcrun --sdk macosx swiftc -O -swift-version 5 \
    -target "$arch-apple-macos$MIN_OS" \
    -o "$WORK/Fretwright-$arch" macos/Sources/main.swift
done
lipo -create -output "$APP/Contents/MacOS/Fretwright" "$WORK/Fretwright-arm64" "$WORK/Fretwright-x86_64"

echo "==> Resources"
cp -R dist "$APP/Contents/Resources/web"
cp LICENSE "$APP/Contents/Resources/LICENSE.txt"
sed -e "s/__VERSION__/$VERSION/" -e "s/__BUILD__/$BUILD_NUMBER/" macos/Info.plist > "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"

cp assets/icon/Fretwright.icns "$APP/Contents/Resources/AppIcon.icns"

echo "==> Sign ($([[ "$IDENTITY" == "-" ]] && echo ad-hoc || echo "$IDENTITY"))"
codesign --force --options runtime --timestamp=none --sign "$IDENTITY" "$APP"
codesign --verify --strict "$APP"

echo "==> Zip"
ZIP="$OUT/Fretwright-$VERSION-macOS.zip"
rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"
rm -rf "$WORK"

echo "Built $APP"
echo "      $ZIP"
lipo -archs "$APP/Contents/MacOS/Fretwright"
