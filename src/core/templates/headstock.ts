// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Headstock template (top view, layout frame) with a side view drawn below it on the same x axis.
 * Glue the top view on the headstock face with the nut line on the nut, drill the tuner centres,
 * cut the outline. The side view shows the face, back, thickness, angle and volute.
 */
import type { Drawing, Shape, Vec2 } from '../geom';
import { add, arcPoints, circle, polyline, segment, text, v } from '../geom';
import { buildHeadstockGeometry } from '../headstock';
import { buildFretboardLayout } from '../layout';
import { buildNeckSide } from '../neck';
import type { GuitarSpec } from '../spec';
import type { TemplateDef } from '../template';
import { clipPolylineX } from './_clip';
import { cross, mm, textBlock } from './_util';

/** Gap between the top view and the side view (mm). */
const SIDE_GAP = 30;
/** How far past the board start the side view and the edge stubs extend (mm). */
const STUB = 40;
/** Truss-rod access pocket drawn on the headstock face (length along x, width). */
const ACCESS_LEN = 22;
const ACCESS_W = 10;

const SHAPE_NAMES: Record<GuitarSpec['headstock']['shape'], string> = {
  inline: 'Inline (all tuners on the bass side)',
  split: 'Split (half per side)',
  'split-offset': 'Split, more on the bass side',
  paddle: 'Paddle blank',
  custom: 'Custom outline',
};

function stadium(x0: number, x1: number, w: number): Vec2[] {
  const r = w / 2;
  return [
    ...arcPoints(v(x1 - r, 0), r, -Math.PI / 2, Math.PI / 2),
    ...arcPoints(v(x0 + r, 0), r, Math.PI / 2, (3 * Math.PI) / 2),
  ];
}

export function buildHeadstockDrawing(spec: GuitarSpec): Drawing {
  const lay = buildFretboardLayout(spec);
  const hg = buildHeadstockGeometry(spec, lay);
  const side = buildNeckSide(spec, lay);
  const hs = spec.headstock;
  const N = spec.strings.gauges.length;
  const [nt, et, eb, nb] = lay.outline;
  const xs = side.x.boardStart;
  const xTip = Math.min(...hg.outline.map((p) => p.x));
  const minY = Math.min(...hg.outline.map((p) => p.y));
  const maxY = Math.max(...hg.outline.map((p) => p.y));
  const xRight = xs + STUB;

  // --- Top view -----------------------------------------------------------
  const holes: Shape[] = [];
  const centres: Shape[] = [];
  const numbers: Shape[] = [];
  for (const t of hg.tuners) {
    holes.push(circle(t.center, t.diameter / 2));
    centres.push(...cross(t.center, t.diameter / 2 + 2));
    numbers.push(text(add(t.center, v(t.diameter / 2 + 1.5, 1)), String(t.stringIndex + 1), 2.5));
  }
  const stub = (a: Vec2, b: Vec2): Shape => {
    const t = (xRight - a.x) / (b.x - a.x);
    return segment(a, v(xRight, a.y + (b.y - a.y) * t));
  };
  const access: Shape[] =
    spec.neck.trussRod.access === 'headstock'
      ? [polyline(stadium(xs - ACCESS_LEN, xs + 2, ACCESS_W), true)]
      : [];

  // --- Side view (same x axis, shifted down) --------------------------------
  const sideTop = Math.max(...side.nut.map((p) => p.y));
  const dy = minY - SIDE_GAP - sideTop;
  const sh = (p: Vec2) => v(p.x, p.y + dy);
  const sideShapes: Shape[] = clipPolylineX(side.outline, true, xRight).map((pts) => polyline(pts.map(sh)));
  const sideRef: Shape[] = [
    ...clipPolylineX(side.fretboard, true, xRight).map((pts) => polyline(pts.map(sh))),
    ...clipPolylineX(side.nut, true, xRight).map((pts) => polyline(pts.map(sh))),
    segment(sh(v(xTip - 10, 0)), sh(v(xRight + 5, 0))), // glue-face datum
  ];
  const sideMin = Math.min(...side.outline.filter((p) => p.x <= xRight).map((p) => p.y)) + dy;
  if (spec.neck.trussRod.access === 'headstock') {
    const tr = side.trussRod;
    sideRef.push(polyline([v(tr.x0, 0), v(tr.x0, -tr.depth), v(xRight, -tr.depth)].map(sh)));
  }

  const styleTxt =
    side.headstockAngle > 0
      ? `Angled ${side.headstockAngle.toFixed(1)}° at the board start${hs.volute ? ', with volute' : ''}`
      : `Flat (face flush with the fretboard glue face)${hs.volute ? ', with volute' : ''}`;
  const pitch = (() => {
    const b = hg.tuners.filter((t) => t.side === 'bass').sort((a, c) => a.center.x - c.center.x);
    return b.length > 1 ? Math.abs(b[1]!.center.x - b[0]!.center.x) : 0;
  })();
  const notes = [
    `${SHAPE_NAMES[hs.shape]}, ${N} tuners`,
    `Length ${mm(hs.length, 1)} from the nut face to the tip, max width ${mm(maxY - minY, 1)}`,
    `Tuner holes ⌀${mm(hs.tunerHoleDiameter, 1)}${pitch > 0 ? `, spacing ${mm(pitch, 1)}` : ''}; drill square to the face`,
    `${styleTxt}; thickness ${mm(hs.thickness, 1)}`,
    spec.neck.trussRod.access === 'headstock' ? 'Truss rod adjusts at the headstock: rout the access pocket (marked).' : 'Truss rod adjusts at the heel.',
    'Line up the nut line with the nut position on the neck blank.',
  ];

  const midX = (xTip + xs) / 2;
  const sideLabelY = sideMin - 6;
  return {
    id: 'headstock',
    title: 'Headstock',
    notes,
    layers: [
      { name: 'outline', kind: 'cut', shapes: [polyline(hg.outline, true)] },
      { name: 'tuner-holes', kind: 'mark', shapes: holes },
      { name: 'tuner-centres', kind: 'mark', shapes: centres },
      { name: 'nut', kind: 'mark', shapes: [polyline(lay.nut, true)] },
      { name: 'truss-access', kind: 'mark', shapes: access },
      { name: 'side-profile', kind: 'cut', shapes: sideShapes },
      {
        name: 'centerline',
        kind: 'reference',
        shapes: [segment(v(xTip - 10, 0), v(xRight + 5, 0))],
      },
      { name: 'nut-line', kind: 'reference', shapes: [segment(hg.nutLine[0], hg.nutLine[1])] },
      { name: 'board-edges', kind: 'reference', shapes: [stub(nt, et), stub(nb, eb), segment(nt, nb)] },
      { name: 'strings', kind: 'reference', shapes: (hg.stringPaths ?? []).map(([a, b]) => segment(a, b)) },
      { name: 'side-reference', kind: 'reference', shapes: sideRef },
      {
        name: 'labels',
        kind: 'annotation',
        shapes: [
          ...numbers,
          text(v((lay.nut[0]!.x + lay.nut[2]!.x) / 2, 0), 'NUT', 2, { anchor: 'middle', rotate: 90 }),
          text(v(xRight + 2, -1.5), 'BRIDGE →', 3),
          text(v(midX, maxY + 3), 'BASS SIDE', 2.5, { anchor: 'middle' }),
          text(v(midX, minY - 6), 'TREBLE SIDE', 2.5, { anchor: 'middle' }),
          text(v(xTip, dy + sideTop + 3), 'SIDE VIEW (fretboard up)', 2.5),
          ...textBlock(v(xTip, sideLabelY), [`${spec.meta.name} - headstock`, ...notes]),
        ],
      },
    ],
  };
}

export const headstockTemplate: TemplateDef = {
  id: 'headstock',
  title: 'Headstock',
  description: 'Headstock outline with tuner hole centres and the nut line, plus a side view.',
  category: 'headstock',
  build: buildHeadstockDrawing,
};
