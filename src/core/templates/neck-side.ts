// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Neck side profile (side frame, see neck.ts: +x toward the bridge, x = 0 at fret 0, y = 0 on the
 * fretboard glue face, +y up). Glue on the side of the neck blank: cut the back taper, heel and
 * headstock transition; rout the truss-rod channel to the dashed line.
 */
import type { Drawing, Shape } from '../geom';
import { polyline, segment, text, v } from '../geom';
import { buildFretboardLayout } from '../layout';
import { buildNeckSide, neckThicknessAt } from '../neck';
import type { GuitarSpec } from '../spec';
import type { TemplateDef } from '../template';
import { mm, textBlock } from './_util';

const JOINT_NAMES: Record<GuitarSpec['neck']['joint'], string> = {
  'bolt-on': 'Bolt-on',
  'set-in': 'Set-in (glued tenon)',
  'neck-through': 'Neck-through',
};

/** Vertical dimension line with end ticks, plus a label to its right. */
function vDim(x: number, y0: number, y1: number, label: string): Shape[] {
  return [
    segment(v(x, y0), v(x, y1)),
    segment(v(x - 1.5, y0), v(x + 1.5, y0)),
    segment(v(x - 1.5, y1), v(x + 1.5, y1)),
    text(v(x + 2, (y0 + y1) / 2 - 1), label, 2.5),
  ];
}

export function buildNeckSideDrawing(spec: GuitarSpec): Drawing {
  const lay = buildFretboardLayout(spec);
  const ns = buildNeckSide(spec, lay);
  const tFb = spec.fretboard.thickness;
  const hs = spec.headstock;
  const nk = spec.neck;
  const xMin = Math.min(...ns.outline.map((p) => p.x));
  const xMax = Math.max(...ns.outline.map((p) => p.x));
  const yMin = Math.min(...ns.outline.map((p) => p.y));

  const ticks: Shape[] = [];
  const fretNums: Shape[] = [];
  for (const f of lay.frets) {
    if (f.n === 0) continue;
    const x = f.center!.x;
    ticks.push(segment(v(x, tFb), v(x, tFb + 2.5)));
    if (f.n % 2 === 1 || f.n === 12 || f.n === spec.frets.count) fretNums.push(text(v(x, tFb + 3.5), String(f.n), 2, { anchor: 'middle' }));
  }

  const tr = ns.trussRod;
  const channel = polyline([v(tr.x0, 0), v(tr.x0, -tr.depth), v(tr.x1, -tr.depth), v(tr.x1, 0)]);
  const accessMark = [segment(v(tr.accessX, 2), v(tr.accessX, -tr.depth - 3))];

  const t1 = neckThicknessAt(spec, lay, ns.x.fret1);
  const t12 = neckThicknessAt(spec, lay, ns.x.fret12);
  const dims: Shape[] = [
    ...vDim(ns.x.fret1, tFb - t1, tFb, `${t1.toFixed(1)} mm @ fret 1`),
    ...vDim(ns.x.fret12, tFb - t12, tFb, `${t12.toFixed(1)} mm @ fret 12`),
    segment(v(ns.x.joint, ns.back[0]!.y - 5), v(ns.x.joint, tFb + 2)),
  ];

  const heelTxt =
    nk.joint === 'neck-through'
      ? `Neck-through: the blank runs on through the body (drawn to ${mm(ns.x.neckEnd - ns.x.boardEnd, 0)} past the board end); trim it to the body outline. Body wings: ${mm(spec.body.thickness, 1)} thick.`
      : nk.joint === 'set-in'
        ? `Tenon ${mm(nk.heelLength, 1)} past the board end, ${mm(Math.min(spec.body.neckPocketDepth || Infinity, -ns.back[0]!.y), 1)} deep at fret ${nk.jointFret}`
        : `Heel ${mm(nk.heelLength, 1)} past the board end (square end), body joint at fret ${nk.jointFret}`;
  const notes = [
    `${JOINT_NAMES[nk.joint]} neck, ${nk.profile} profile; joins the body at fret ${nk.jointFret}${nk.angle ? `, neck angle ${nk.angle.toFixed(1)}°` : ''}`,
    `Thickness incl. ${mm(tFb, 1)} board: ${mm(nk.thicknessAt1, 1)} at fret 1, ${mm(nk.thicknessAt12, 1)} at fret 12`,
    heelTxt,
    ns.headstockAngle > 0
      ? `Headstock angled ${ns.headstockAngle.toFixed(1)}° from the board start, ${mm(hs.thickness, 1)} thick${hs.volute ? ', with volute' : ''}`
      : `Flat headstock, face flush with the glue face, ${mm(hs.thickness, 1)} thick${hs.volute ? ', with volute' : ''}`,
    `Truss rod channel ${mm(tr.width, 2)} wide × ${mm(tr.depth, 1)} deep, ${mm(nk.trussRod.length, 0)} long; adjusts at the ${nk.trussRod.access}`,
    `Overall blank length ${mm(xMax - xMin, 1)}; x = 0 is fret 0 (nut face)`,
  ];

  return {
    id: 'neck-side',
    title: 'Neck side profile',
    notes,
    layers: [
      { name: 'neck', kind: 'cut', shapes: [polyline(ns.outline, true)] },
      { name: 'fretboard', kind: 'mark', shapes: [polyline(ns.fretboard, true)] },
      { name: 'nut', kind: 'mark', shapes: [polyline(ns.nut, true)] },
      { name: 'frets', kind: 'mark', shapes: ticks },
      { name: 'truss-access', kind: 'mark', shapes: accessMark },
      { name: 'truss-rod', kind: 'reference', shapes: [channel] },
      {
        name: 'centerline',
        kind: 'reference',
        shapes: [segment(v(xMin - 10, 0), v(xMax + 10, 0)), segment(v(0, -5), v(0, tFb + 8))],
      },
      { name: 'dimensions', kind: 'reference', shapes: dims },
      {
        name: 'labels',
        kind: 'annotation',
        shapes: [
          ...fretNums,
          text(v((ns.x.nutFront + ns.x.nutBack) / 2, tFb + 5), 'NUT', 2, { anchor: 'middle' }),
          text(v(tr.accessX, -tr.depth - 6.5), 'ROD ADJUST', 2, { anchor: 'middle' }),
          text(v(ns.x.joint, ns.back[0]!.y - 9), `BODY EDGE (fret ${nk.jointFret})`, 2, { anchor: 'middle' }),
          text(v(xMax + 12, -1.5), 'BRIDGE →', 3),
          text(v(xMin, 10), 'HEADSTOCK', 2.5),
          ...textBlock(v(xMin, yMin - 12), [`${spec.meta.name} - neck side profile`, ...notes]),
        ],
      },
    ],
  };
}

export const neckSideTemplate: TemplateDef = {
  id: 'neck-side',
  title: 'Neck side profile',
  description: 'Side view of the neck: taper, heel and headstock transition, truss-rod channel.',
  category: 'neck',
  build: buildNeckSideDrawing,
};
