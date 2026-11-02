// SPDX-License-Identifier: GPL-3.0-or-later
/** Temporary drawing used by templates that are not implemented yet. Delete once all are real. */
import type { Drawing } from '../geom';
import { polyline, text, v } from '../geom';
import { buildFretboardLayout } from '../layout';
import type { GuitarSpec } from '../spec';

export function placeholderDrawing(id: string, title: string, spec: GuitarSpec): Drawing {
  const lay = buildFretboardLayout(spec);
  return {
    id,
    title,
    layers: [
      { name: 'outline', kind: 'cut', shapes: [polyline([...lay.outline], true)] },
      { name: 'labels', kind: 'annotation', shapes: [text(v(10, 0), `${title} (not implemented yet)`, 4)] },
    ],
  };
}
