// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Scale & bridge layout (top view, layout frame): string paths from fret 0 to the compensated
 * saddles, fret lines, the uncompensated saddle line and per-string compensated saddle points.
 * Used to place the bridge on the body.
 */
import type { Drawing, Shape } from '../geom';
import { add, circle, norm, polyline, scale, segment, sub, text, v } from '../geom';
import { buildFretboardLayout } from '../layout';
import type { GuitarSpec } from '../spec';
import type { TemplateDef } from '../template';
import { cross, mm, mmIn, textBlock } from './_util';

export function buildScaleLayoutDrawing(spec: GuitarSpec): Drawing {
  const lay = buildFretboardLayout(spec);
  const [st, sb] = lay.saddleLine;
  const u = norm(sub(sb, st));

  const strings: Shape[] = [];
  const saddles: Shape[] = [];
  const labels: Shape[] = [];
  for (const s of lay.strings) {
    strings.push(segment(s.nut, s.compensatedSaddle));
    saddles.push(circle(s.compensatedSaddle, 0.75), ...cross(s.compensatedSaddle, 2));
    labels.push(text(add(s.compensatedSaddle, v(3, 0.6)), `${s.index + 1}: +${(s.compensation ?? 0).toFixed(1)}`, 2));
  }
  const frets = lay.frets.map((f) => segment(f.treble, f.bass));
  for (const f of lay.frets) {
    if (f.n % 12 === 0 || f.n === spec.frets.perpendicularFret) {
      labels.push(text(add(f.treble, v(0, -4.5)), String(f.n), 2.5, { anchor: 'middle' }));
    }
  }

  const ext = 10;
  const saddleLine = segment(sub(st, scale(u, ext)), add(sb, scale(u, ext)));
  const maxX = Math.max(...lay.strings.map((s) => s.compensatedSaddle.x)) + 25;
  const minX = Math.min(...lay.outline.map((p) => p.x), ...lay.nut.map((p) => p.x)) - 10;
  const minY = Math.min(st.y, ...lay.outline.map((p) => p.y));

  const notes = [
    spec.scale.bass === spec.scale.treble
      ? `Scale ${mmIn(spec.scale.bass)}`
      : `Scale treble ${mmIn(spec.scale.treble)} / bass ${mmIn(spec.scale.bass)}, perpendicular fret ${spec.frets.perpendicularFret}`,
    `String spread nut ${mm(spec.nut.stringSpread)}, bridge ${mm(spec.bridge.stringSpread)} (centre to centre)`,
    `Compensation treble +${mm(spec.bridge.compensationTreble, 1)} → bass +${mm(spec.bridge.compensationBass, 1)}`,
    'Crosses = compensated saddle points (string number: compensation in mm).',
  ];

  return {
    id: 'scale-layout',
    title: 'Scale & bridge layout',
    notes,
    layers: [
      { name: 'strings', kind: 'reference', shapes: strings },
      { name: 'frets', kind: 'slot', shapes: frets },
      { name: 'fretboard', kind: 'reference', shapes: [polyline([...lay.outline], true)] },
      { name: 'nut', kind: 'reference', shapes: [polyline(lay.nut, true)] },
      { name: 'saddle-line', kind: 'reference', shapes: [saddleLine] },
      { name: 'saddles', kind: 'mark', shapes: saddles },
      { name: 'centerline', kind: 'reference', shapes: [segment(v(minX, 0), v(maxX, 0))] },
      {
        name: 'labels',
        kind: 'annotation',
        shapes: [
          ...labels,
          text(add(st, scale(u, -ext - 5)), 'Saddle line (uncompensated)', 2.5, { anchor: 'middle' }),
          ...textBlock(v(minX, minY - 14), [`${spec.meta.name} - scale & bridge layout`, ...notes]),
        ],
      },
    ],
  };
}

export const scaleLayoutTemplate: TemplateDef = {
  id: 'scale-layout',
  title: 'Scale & bridge layout',
  description: 'Nut-to-saddle string paths, fret lines and the compensated saddle line for placing the bridge.',
  category: 'layout',
  build: buildScaleLayoutDrawing,
};
