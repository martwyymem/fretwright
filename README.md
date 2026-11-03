<img src="assets/icon.svg" width="64" height="64" alt="">

# Fretwright

Design an electric guitar or bass from a few parameters and print accurate **1:1 paper templates**:
fretboard with fret slots, scale and bridge layout, radius gauges, neck profiles, headstock and body.
Runs in the browser, nothing to install.

Inspired by [MarzWorkbench](https://github.com/mnesarco/MarzWorkbench), a FreeCAD workbench, rebuilt as a
standalone app that is easier to use: presets, plain-language validation, live preview and tiled PDF output.

## Develop

```sh
npm install
npm run dev     # http://localhost:5173
npm test
npm run build   # static site in dist/
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the conventions.

## macOS app

```sh
npm run build:mac
```

Builds `build/Fretwright.app` and `build/Fretwright-<version>-macOS.zip`: a universal (Apple silicon and Intel)
native app for **macOS 26 or later**. It is a small Swift/WebKit shell (`macos/`) around the same web app, served from
inside the bundle. It works offline, keeps the autosave between launches, and saves exports through the normal save panel.

The build is ad-hoc signed, so on another Mac the first launch needs right-click → Open (or System Settings →
Privacy & Security → Open Anyway). Set `CODESIGN_IDENTITY="Developer ID Application: …"` and notarize to ship it
without that step.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
