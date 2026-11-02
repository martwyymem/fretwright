// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Fretboard template (top view, layout frame): taped/glued on the blank. Saw the slots, drill the
 * inlay centres, cut the outline.
 */
import type { Drawing, Shape } from '../geom';
import { add, circle, norm, polyline, scale, segment, sub, text, v } from '../geom';
import { buildFretboardLayout } from '../layout';
import type { GuitarSpec } from '../spec';
import type { TemplateDef } from '../template';
import { mm, mmIn, textBlock } from './_util';

/** Side dots are drawn as 2 mm circles centred on the bass edge. */
const SIDE_DOT_R = 1;

export function buildFretboardDrawing(spec: GuitarSpec): Drawing {
  const lay = buildFretboardLayout(spec);
  const [nt, et, eb, nb] = lay.outline;
  const minX = Math.min(nt.x, nb.x);
  const maxX = Math.max(et.x, eb.x);
  const minY = Math.min(nt.y, et.y);

  const slots: Shape[] = [];
  const numbers: Shape[] = [];
  for (const f of lay.frets) {
    if (f.n === 0 && !spec.frets.zeroFret) continue; // fret 0 is the nut face, not a slot
    slots.push(segment(f.slotTreble, f.slotBass));
    // Fret number just outside the treble edge, along the fret line.
    const u = norm(sub(f.bass, f.treble));
    numbers.push(text(add(f.treble, scale(u, -4.5)), String(f.n), 2.5, { anchor: 'middle' }));
  }

  const inlays: Shape[] = [];
  const sideDots: Shape[] = [];
  for (const m of lay.inlays) {
    if (m.kind === 'block') inlays.push(polyline(m.points, true));
    else for (const p of m.points) inlays.push(circle(p, (m.diameter ?? spec.fretboard.inlays.dotDiameter) / 2));
    for (const s of m.sides ?? (m.side ? [m.side] : [])) sideDots.push(circle(s, SIDE_DOT_R));
  }

  // Nut label centred in the nut footprint.
  const nutMid = v((lay.nut[0]!.x + lay.nut[2]!.x) / 2, 0);
  const radius =
    spec.fretboard.radiusStart === spec.fretboard.radiusEnd
      ? `Radius ${mmIn(spec.fretboard.radiusStart)}`
      : `Radius ${mmIn(spec.fretboard.radiusStart)} at nut → ${mmIn(spec.fretboard.radiusEnd)} at fret ${spec.frets.count}`;
  const scaleTxt =
    spec.scale.bass === spec.scale.treble
      ? `Scale ${mmIn(spec.scale.bass)}`
      : `Scale treble ${mmIn(spec.scale.treble)} / bass ${mmIn(spec.scale.bass)}, perpendicular fret ${spec.frets.perpendicularFret}`;
  const notes = [
    scaleTxt,
    `${spec.frets.count} frets${spec.frets.zeroFret ? ' + zero fret' : ''}, slot width ${mm(spec.frets.slotWidth)}, nipping ${mm(spec.frets.nipping)}`,
    radius,
    `Width at nut ${mm(lay.widthAtNut)}, at fret ${spec.frets.count} ${mm(lay.widthAtLastFret)}`,
    `Board length ${mm(maxX - minX)}, thickness ${mm(spec.fretboard.thickness)}`,
    'Fret 0 is the nut face (bridge side of the nut).',
  ];
  if (spec.frets.zeroFret) notes[notes.length - 1] = `Zero fret at x = 0; nut sits ${mm(spec.nut.zeroFretGap)} behind it.`;
  const title = `${spec.meta.name} - fretboard`;

  const f0 = lay.frets[0]!;

  return {
    id: 'fretboard',
    title: 'Fretboard',
    notes,
    layers: [
      { name: 'outline', kind: 'cut', shapes: [polyline([...lay.outline], true)] },
      { name: 'fret-slots', kind: 'slot', shapes: slots },
      { name: 'nut', kind: 'mark', shapes: [polyline(lay.nut, true)] },
      { name: 'inlays', kind: 'mark', shapes: inlays },
      { name: 'side-dots', kind: 'mark', shapes: sideDots },
      {
        name: 'centerline',
        kind: 'reference',
        shapes: [segment(v(minX - 10, 0), v(maxX + 10, 0)), segment(f0.treble, f0.bass)],
      },
      {
        name: 'labels',
        kind: 'annotation',
        shapes: [
          ...numbers,
          text(nutMid, 'NUT', 2, { anchor: 'middle', rotate: 90 }),
          text(v(maxX + 12, -1.5), 'BRIDGE →', 3),
          ...textBlock(v(minX, minY - 12), [title, ...notes]),
        ],
      },
    ],
  };
}

export const fretboardTemplate: TemplateDef = {
  id: 'fretboard',
  title: 'Fretboard',
  description: 'Glue to the blank, saw the fret slots, drill inlay centres, cut the outline.',
  category: 'fretboard',
  build: buildFretboardDrawing,
};
