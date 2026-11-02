// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Full instrument layout at 1:1 (top view, instrument frame): headstock, fretboard with frets and
 * nut, strings from the nut to the compensated saddles, body with pocket and pickups. For checking
 * proportions and for laying out the blanks; the part templates are the ones to cut from.
 */
import type { Drawing, Shape } from '../geom';
import { add, circle, polyline, scale, segment, sub, text, v } from '../geom';
import { buildBodyGeometry, saddleCenter } from '../body';
import { buildHeadstockGeometry } from '../headstock';
import { buildFretboardLayout } from '../layout';
import { polyBounds } from '../polygon';
import type { GuitarSpec } from '../spec';
import type { TemplateDef } from '../template';
import { mm, mmIn, textBlock } from './_util';
import { bodyShapeLabel } from './body';

export function buildFullLayoutDrawing(spec: GuitarSpec): Drawing {
  const lay = buildFretboardLayout(spec);
  const hs = buildHeadstockGeometry(spec, lay);
  const body = buildBodyGeometry(spec, lay);
  // Overall length: headstock tip to body tail, along the centerline.
  const bb = polyBounds([...hs.outline, ...body.outline, ...lay.outline, ...lay.strings.map((s) => s.compensatedSaddle)]);
  const { minX, maxX } = bb;

  const strings: Shape[] = lay.strings.map((s) => segment(s.nut, s.compensatedSaddle));
  for (const p of hs.stringPaths ?? []) strings.push(segment(p[0], p[1]));

  const frets: Shape[] = lay.frets.filter((f) => f.n > 0 || spec.frets.zeroFret).map((f) => segment(f.treble, f.bass));
  const [st, sb] = lay.saddleLine;

  // Overall length dimension below everything.
  const dimY = bb.minY - 15;
  const tick = (x: number) => segment(v(x, dimY - 4), v(x, dimY + 4));
  const dims: Shape[] = [segment(v(minX, dimY), v(maxX, dimY)), tick(minX), tick(maxX)];
  const overall = maxX - minX;

  const sc = saddleCenter(lay);
  const notes = [
    spec.scale.bass === spec.scale.treble
      ? `Scale ${mmIn(spec.scale.bass)}, ${spec.strings.gauges.length} strings, ${spec.frets.count} frets`
      : `Scale ${mmIn(spec.scale.treble)} to ${mmIn(spec.scale.bass)} (fanned), ${spec.strings.gauges.length} strings, ${spec.frets.count} frets`,
    `Overall length ${mmIn(overall)} (headstock tip to body tail)`,
    `Body: ${bodyShapeLabel(spec)} ${mm(spec.body.length, 0)} × ${mm(spec.body.width, 0)}; neck (${spec.neck.joint}) joins at fret ${spec.neck.jointFret}`,
    `Headstock ${mm(spec.headstock.length, 0)} long; saddle line centre ${mm(sc.x, 1)} from fret 0`,
    'For checking proportions; cut parts from their own templates.',
  ];

  const tuners = hs.tuners.map((t) => circle(t.center, t.diameter / 2));
  const title = `${spec.meta.name} - full layout`;

  return {
    id: 'full-layout',
    title: 'Full instrument layout',
    notes,
    layers: [
      { name: 'body', kind: 'cut', shapes: body.outline.length >= 3 ? [polyline(body.outline, true)] : [] },
      { name: 'neck-pocket', kind: 'reference', shapes: body.neckPocket ? [polyline(body.neckPocket, true)] : [] },
      { name: 'pickups', kind: 'cut', shapes: body.pickups.map((p) => polyline(p.outline, true)) },
      { name: 'headstock', kind: 'cut', shapes: hs.outline.length >= 3 ? [polyline(hs.outline, true)] : [] },
      { name: 'tuners', kind: 'mark', shapes: tuners },
      { name: 'fretboard', kind: 'cut', shapes: [polyline([...lay.outline], true)] },
      { name: 'frets', kind: 'slot', shapes: frets },
      { name: 'nut', kind: 'mark', shapes: [polyline(lay.nut, true)] },
      { name: 'strings', kind: 'reference', shapes: strings },
      { name: 'saddle-line', kind: 'mark', shapes: [segment(sub(st, scale(sub(sb, st), 0.2)), add(sb, scale(sub(sb, st), 0.2)))] },
      { name: 'centerline', kind: 'reference', shapes: [segment(v(minX - 10, 0), v(maxX + 10, 0))] },
      { name: 'dimensions', kind: 'reference', shapes: dims },
      {
        name: 'labels',
        kind: 'annotation',
        shapes: [
          text(v((minX + maxX) / 2, dimY + 2), `${mm(overall, 1)} overall`, 4, { anchor: 'middle' }),
          ...textBlock(v(minX, dimY - 14), [title, ...notes], 4),
        ],
      },
    ].filter((l) => l.shapes.length > 0) as Drawing['layers'],
  };
}

export const fullLayoutTemplate: TemplateDef = {
  id: 'full-layout',
  title: 'Full instrument layout',
  description: 'The whole instrument at 1:1: body, neck, headstock and strings, for checking proportions.',
  category: 'layout',
  build: buildFullLayoutDrawing,
};
