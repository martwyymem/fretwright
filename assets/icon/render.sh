#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Regenerates every icon format from the two SVG sources (needs macOS: qlmanage, sips, iconutil;
# plus ImageMagick `convert` for the .ico). Outputs are committed so other platforms needn't run this.
#   fretwright-macos.svg  macOS icon grid (824 pt shape inside 1024, transparent margin)
#   fretwright.svg        same art cropped tight, for Windows, Linux and the web favicon
set -euo pipefail
cd "$(dirname "$0")"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

render() { # svg size out.png
  qlmanage -t -s 1024 -o "$TMP" "$1" >/dev/null 2>&1
  sips -z "$2" "$2" "$TMP/$(basename "$1").png" --out "$3" >/dev/null
}

# macOS .icns
mkdir -p "$TMP/Fretwright.iconset"
for s in 16 32 128 256 512; do
  render fretwright-macos.svg $s "$TMP/Fretwright.iconset/icon_${s}x${s}.png"
  render fretwright-macos.svg $((s * 2)) "$TMP/Fretwright.iconset/icon_${s}x${s}@2x.png"
done
iconutil -c icns -o Fretwright.icns "$TMP/Fretwright.iconset"
render fretwright-macos.svg 1024 fretwright-macos-1024.png

# Square PNGs (Linux hicolor sizes, README, Windows sources)
mkdir -p png
for s in 16 24 32 48 64 128 256 512 1024; do render fretwright.svg $s "png/fretwright-$s.png"; done

# Windows .ico (16–256)
convert png/fretwright-16.png png/fretwright-24.png png/fretwright-32.png png/fretwright-48.png \
  png/fretwright-64.png png/fretwright-128.png png/fretwright-256.png Fretwright.ico
echo "icons rendered"
