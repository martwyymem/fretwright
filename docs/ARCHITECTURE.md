# Fretwright architecture

Fretwright is a browser app that turns one parameter set (`GuitarSpec`) into accurate **1:1 paper templates**
(PDF tiled to A4/Letter, SVG, DXF) for building electric guitars and basses. It needs no install and no CAD
kernel: v1 is 2D only. 3D preview and STEP export come later.

Inspired by [MarzWorkbench](https://github.com/mnesarco/MarzWorkbench) (GPL-3.0). Fretwright is GPL-3.0-or-later,
so Marz's math may be used as a reference.

## Data flow

```
GuitarSpec ──validateSpec──▶ issues[]            (plain-language messages for the UI)
     │
     ├─buildFretboardLayout──▶ FretboardLayout   (strings, frets, outline, nut, saddle line, inlays)
     │
     └─TemplateDef.build──────▶ Drawing           (layers of polylines / circles / text, mm)
                                   │
                                   ├─drawingToSvg  → .svg (1:1, also used for the on-screen preview)
                                   ├─drawingToPdf  → .pdf (tiled pages, calibration ruler)
                                   └─drawingToDxf  → .dxf (mm)
```

## Folders

| Path | Contents | Rule |
|---|---|---|
| `src/core/` | spec, presets, geometry, layout, validation, templates | Pure TypeScript. No DOM, no React, no exporters. |
| `src/core/templates/` | one file per template + `index.ts` registry | Each file exports one `TemplateDef`. |
| `src/export/` | SVG, PDF, DXF | Depends only on `core/geom`. |
| `src/ui/` | React app | Imports only from `src/core/index.ts` and `src/export/index.ts`. |

## Conventions (the contract)

- **Units:** millimetres for every length, degrees for every angle. Inches exist only at the UI boundary (`units.ts`).
- **Axes:** +x right, **+y up** (math convention). SVG/PDF exporters flip y.
- **Top-view frame:** instrument face up, headstock LEFT, bridge RIGHT. **Origin = fret 0 on the centerline**
  (on multiscale, the midpoint of the fret-0 line). +x along the centerline toward the bridge, **+y = bass side**.
- **String order:** arrays are TREBLE → BASS. Index 0 = string 1 (thinnest).
- **Curves:** templates flatten Béziers and arcs to polylines (`flattenCubic`, `arcPoints`) at ≤ 0.05 mm chord error.
  Drawings contain only `polyline`, `circle`, `text`.
- **Layer kinds:** `cut` (heavy solid), `slot` (thin solid), `mark` (thin solid), `reference` (dashed, light), `annotation` (text).
  Layer `name` is `[a-z0-9_-]+` and becomes the DXF layer / SVG group id.
- **Every template** includes: a title + key dimensions as text (annotation layer), the centerline (reference), and a
  100 mm scale-check bar is added by the PDF exporter (not by templates).
- **Validation messages** say what is wrong and what to change.
- **Schema changes** bump `SPEC_VERSION` and add a migration. Additive optional fields do not need a bump.

## Fret maths

`fretDistance(n, L) = L · (1 − 2^(−n/12))`, measured from fret 0 along the string.
Multiscale: each string has its own scale, interpolated linearly from treble to bass across string positions.
Fret n is the line through the treble-string and bass-string points at `fretDistance(n, scale)`, extended to the
fretboard edges. The perpendicular fret is placed square to the centerline by shifting the treble scale frame along x.

## Testing

`npm test` (vitest). Geometry is verified with numeric assertions (golden values, symmetry, bounds), never by eye:
AI agents cannot see drawings, so every template has tests on its geometry.
