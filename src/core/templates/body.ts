// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Body template (top view, instrument frame): body outline, neck pocket, pickup routes, the
 * control cavity (routed from the back), saddle line with compensated saddle points, strings.
 */
import type { Drawing, Shape } from '../geom';
import { add, circle, norm, polyline, scale, segment, sub, text, v } from '../geom';
import { BODY_ARCHETYPES } from '../body-shapes';
import { buildBodyGeometry, PICKUP_ROUTES, POCKET_CLEARANCE, POCKET_CORNER_R, saddleCenter } from '../body';
import { buildFretboardLayout } from '../layout';
import { crossingsAtY, polyBounds } from '../polygon';
import type { GuitarSpec, PickupType } from '../spec';
import type { TemplateDef } from '../template';
import { cross, mm, textBlock } from './_util';

export const PICKUP_LABEL: Record<PickupType, string> = {
  single: 'single coil',
  humbucker: 'humbucker',
  p90: 'P-90',
  'bass-single': 'bass single',
  'bass-split': 'bass split',
};

const SHORT: Record<PickupType, string> = { single: 'SC', humbucker: 'HB', p90: 'P90', 'bass-single': 'J', 'bass-split': 'P' };

const f1 = (x: number) => x.toFixed(1);

export function bodyShapeLabel(spec: GuitarSpec): string {
  return spec.body.shape === 'custom' ? 'custom outline' : BODY_ARCHETYPES[spec.body.shape].label.toLowerCase();
}

export function buildBodyDrawing(spec: GuitarSpec): Drawing {
  const lay = buildFretboardLayout(spec);
  const g = buildBodyGeometry(spec, lay);
  const anchor = g.anchor ?? v(0, 0);
  const hasOutline = g.outline.length >= 3;
  const bb = hasOutline ? polyBounds(g.outline) : { minX: anchor.x, maxX: anchor.x + spec.body.length, minY: -spec.body.width / 2, maxY: spec.body.width / 2 };
  const sc = saddleCenter(lay);
  const tailX = hasOutline ? Math.max(...crossingsAtY(g.outline, 0)) : bb.maxX;

  // Strings over the body: from the neck-end edge to the compensated saddles.
  const strings: Shape[] = [];
  for (const s of lay.strings) {
    const d = sub(s.compensatedSaddle, s.nut);
    const t = (anchor.x - 15 - s.nut.x) / d.x;
    strings.push(segment(add(s.nut, scale(d, Math.max(0, t))), s.compensatedSaddle));
  }

  const [st, sb] = g.saddleLine;
  const u = norm(sub(sb, st));
  const saddles: Shape[] = [segment(sub(st, scale(u, 10)), add(sb, scale(u, 10)))];
  for (const s of lay.strings) saddles.push(circle(s.compensatedSaddle, 0.75), ...cross(s.compensatedSaddle, 2));

  const labels: Shape[] = [];
  const pocketDepth = spec.body.neckPocketDepth;
  const through = spec.neck.joint === 'neck-through';
  if (g.neckPocket) {
    const pb = polyBounds(g.neckPocket);
    const cx = (anchor.x + (g.pocketEndX ?? pb.maxX)) / 2;
    labels.push(
      text(v(cx, 2), through ? 'NECK-THROUGH CENTRE SECTION' : spec.neck.joint === 'set-in' ? 'NECK TENON POCKET' : 'NECK POCKET', 3, { anchor: 'middle' }),
      text(v(cx, -4), through ? 'glue lines' : `${f1(pocketDepth)} mm deep`, 2.5, { anchor: 'middle' }),
    );
  }
  g.pickups.forEach((p, i) => {
    const b = polyBounds(p.outline);
    labels.push(text(v(p.center.x, b.maxY + 2), `${SHORT[p.type]}${i + 1}`, 3, { anchor: 'middle' }));
  });
  for (const c of g.cavities) {
    const b = polyBounds(c);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    labels.push(text(v(cx, cy + 1), 'CONTROL CAVITY', 2.5, { anchor: 'middle' }), text(v(cx, cy - 3.5), '(back side)', 2.5, { anchor: 'middle' }));
  }
  labels.push(text(v(anchor.x - 3, -2), `fret ${spec.neck.jointFret}`, 2.5, { anchor: 'end' }), text(v(bb.maxX + 6, -1.5), 'TAIL', 3));

  const notes: string[] = [
    `Shape: ${bodyShapeLabel(spec)}, ${mm(spec.body.length, 1)} long × ${mm(spec.body.width, 1)} wide, ${mm(spec.body.thickness, 1)} thick`,
    `Neck (${spec.neck.joint}) meets the body at fret ${spec.neck.jointFret}: body edge on the centerline ${mm(anchor.x, 1)} from fret 0`,
  ];
  if (g.neckPocket && !through) {
    const len = (g.pocketEndX ?? anchor.x) - anchor.x;
    const pb = polyBounds(g.neckPocket);
    notes.push(
      `Neck pocket ${mm(len, 1)} long, ${mm(pb.maxY - pb.minY, 1)} wide max, ${mm(pocketDepth, 1)} deep; ${mm(POCKET_CLEARANCE, 1)} clearance per side, R${POCKET_CORNER_R} heel corners`,
    );
    if ((g.pocketShortenedBy ?? 0) > 0.05) notes.push(`Pocket shortened by ${mm(g.pocketShortenedBy!, 1)} to leave wood before the neck pickup route.`);
  } else if (g.neckPocket) {
    const pb = polyBounds(g.neckPocket);
    notes.push(`Centre section ${mm(pb.maxY - pb.minY, 1)} wide; glue the body wings to it.`);
  }
  notes.push(`Saddle line (centre) ${mm(sc.x - anchor.x, 1)} from the body's neck edge, ${mm(tailX - sc.x, 1)} from the tail`);
  g.pickups.forEach((p, i) => {
    const r = PICKUP_ROUTES[p.type];
    const size = p.type === 'bass-split' ? `2 × ${r.across} × ${r.along}` : `${r.across} × ${r.along}`;
    const slant = p.angle !== 0 ? `, slant ${f1(p.angle)}°` : '';
    notes.push(`${SHORT[p.type]}${i + 1}: ${PICKUP_LABEL[p.type]} route ${size} mm, centre ${mm(spec.body.pickups[i]!.fromBridge, 1)} from the saddle line${slant}`);
  });
  if (g.cavities.length) notes.push('Dashed control cavity is routed from the BACK of the body.');
  if (!hasOutline) notes.push('No body outline: import an SVG outline in the Body step.');

  const title = `${spec.meta.name} - body`;
  const minX = Math.min(bb.minX, anchor.x - 20);
  const maxX = bb.maxX;

  return {
    id: 'body',
    title: 'Body',
    notes,
    layers: [
      { name: 'outline', kind: 'cut', shapes: hasOutline ? [polyline(g.outline, true)] : [] },
      { name: 'neck-pocket', kind: through ? 'mark' : 'cut', shapes: g.neckPocket ? [polyline(g.neckPocket, true)] : [] },
      { name: 'pickups', kind: 'cut', shapes: g.pickups.map((p) => polyline(p.outline, true)) },
      { name: 'control-cavity', kind: 'reference', shapes: g.cavities.map((c) => polyline(c, true)) },
      { name: 'saddles', kind: 'mark', shapes: saddles },
      { name: 'strings', kind: 'reference', shapes: strings },
      { name: 'centerline', kind: 'reference', shapes: [segment(v(minX - 10, 0), v(maxX + 4, 0))] },
      { name: 'labels', kind: 'annotation', shapes: [...labels, ...textBlock(v(minX, bb.minY - 12), [title, ...notes])] },
    ].filter((l) => l.shapes.length > 0) as Drawing['layers'],
  };
}

export const bodyTemplate: TemplateDef = {
  id: 'body',
  title: 'Body',
  description: 'Body outline with neck pocket, pickup routes and the bridge line.',
  category: 'body',
  build: buildBodyDrawing,
};
