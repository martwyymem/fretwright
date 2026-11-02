// SPDX-License-Identifier: GPL-3.0-or-later
/** Hand-built Drawings for exporter tests (independent of core templates). */
import { circle, polyline, segment, text, v, type Drawing } from '../core/geom';

/** A rectangle w × h with its lower-left corner at (x0, y0), plus a circle, a centerline and two labels. */
export function sampleDrawing(w = 100, h = 50, x0 = 0, y0 = 0): Drawing {
  return {
    id: 'sample',
    title: 'Sample <&> "template"',
    notes: ['Scale 1:1', 'Fret 12 at 324 mm'],
    layers: [
      {
        name: 'outline',
        kind: 'cut',
        shapes: [polyline([v(x0, y0), v(x0 + w, y0), v(x0 + w, y0 + h), v(x0, y0 + h)], true)],
      },
      { name: 'holes', kind: 'mark', shapes: [circle(v(x0 + w / 2, y0 + h / 2), 4)] },
      { name: 'centerline', kind: 'reference', shapes: [segment(v(x0, y0 + h / 2), v(x0 + w, y0 + h / 2))] },
      {
        name: 'labels',
        kind: 'annotation',
        shapes: [
          text(v(x0 + 5, y0 + 5), 'Low', 3),
          text(v(x0 + w / 2, y0 + h - 10), 'Up 45°', 3, { anchor: 'middle', rotate: 45 }),
        ],
      },
    ],
  };
}
