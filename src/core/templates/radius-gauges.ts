// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Radius gauges (gauge-local frame, not a top view). Each gauge is a closed cut-out whose bottom edge
 * is the concave arc of the fretboard radius; hold it across the board while sanding.
 *
 * Local frame per gauge: x across the board, +y up, the arc's two ends at y = 0 and the arc apex at
 * y = sagitta. The gauge spans (board width at that point + 10 mm) and is GAUGE_HEIGHT tall above the
 * arc ends. Gauges are laid out left to right with GAUGE_SPACING between them.
 */
import type { Drawing, Shape, Vec2 } from '../geom';
import { arcPoints, polyline, segment, text, v } from '../geom';
import { buildFretboardLayout } from '../layout';
import type { GuitarSpec } from '../spec';
import type { TemplateDef } from '../template';
import { mm, mmIn, textBlock } from './_util';

export const GAUGE_HEIGHT = 15;
export const GAUGE_EXTRA_WIDTH = 10;
export const GAUGE_SPACING = 10;

export interface RadiusGauge {
  radius: number;
  width: number;
  /** Centre x of the gauge in the drawing. */
  cx: number;
  sagitta: number;
  outline: Vec2[];
  where: string;
}

/** One closed gauge outline: arc (right end → over the apex → left end), then up and across the top. */
function gaugeOutline(cx: number, radius: number, width: number): { outline: Vec2[]; sagitta: number } {
  // A radius smaller than half the span cannot form the arc; clamp so the drawing stays valid
  // (validation reports this case as an error).
  const half = Math.min(width / 2, radius * 0.999);
  const sagitta = radius - Math.sqrt(radius * radius - half * half);
  const c = v(cx, sagitta - radius);
  const a0 = Math.atan2(radius - sagitta, half);
  const arc = arcPoints(c, radius, a0, Math.PI - a0);
  // Pin the arc ends exactly on y = 0 to avoid float noise at the corners.
  arc[0] = v(cx + half, 0);
  arc[arc.length - 1] = v(cx - half, 0);
  return { outline: [...arc, v(cx - half, GAUGE_HEIGHT), v(cx + half, GAUGE_HEIGHT)], sagitta };
}

export function radiusGauges(spec: GuitarSpec): RadiusGauge[] {
  const lay = buildFretboardLayout(spec);
  const { radiusStart, radiusEnd } = spec.fretboard;
  const list =
    radiusStart === radiusEnd
      ? [{ radius: radiusStart, width: Math.max(lay.widthAtNut, lay.widthAtLastFret), where: 'whole board' }]
      : [
          { radius: radiusStart, width: lay.widthAtNut, where: 'at the nut' },
          { radius: radiusEnd, width: lay.widthAtLastFret, where: `at fret ${spec.frets.count}` },
        ];
  const out: RadiusGauge[] = [];
  let x = 0;
  for (const g of list) {
    const width = g.width + GAUGE_EXTRA_WIDTH;
    const cx = x + width / 2;
    const { outline, sagitta } = gaugeOutline(cx, g.radius, width);
    out.push({ radius: g.radius, width, cx, sagitta, outline, where: g.where });
    x += width + GAUGE_SPACING;
  }
  return out;
}

export function buildRadiusGaugesDrawing(spec: GuitarSpec): Drawing {
  const gauges = radiusGauges(spec);
  const cuts: Shape[] = [];
  const center: Shape[] = [];
  const labels: Shape[] = [];
  for (const g of gauges) {
    cuts.push(polyline(g.outline, true));
    center.push(segment(v(g.cx, -3), v(g.cx, GAUGE_HEIGHT + 3)));
    const mid = g.sagitta + (GAUGE_HEIGHT - g.sagitta) / 2;
    labels.push(text(v(g.cx, mid + 0.3), `R ${mmIn(g.radius)}`, 2.5, { anchor: 'middle' }));
    labels.push(text(v(g.cx, mid - 3.2), g.where, 2, { anchor: 'middle' }));
  }
  const notes = [
    ...gauges.map((g) => `R ${mmIn(g.radius)} ${g.where}, gauge width ${mm(g.width, 1)}`),
    'Cut along the heavy line; the curved edge sits on the fretboard.',
  ];
  return {
    id: 'radius-gauges',
    title: 'Radius gauges',
    notes,
    layers: [
      { name: 'gauges', kind: 'cut', shapes: cuts },
      { name: 'centerline', kind: 'reference', shapes: center },
      { name: 'labels', kind: 'annotation', shapes: [...labels, ...textBlock(v(0, -10), [`${spec.meta.name} - radius gauges`, ...notes])] },
    ],
  };
}

export const radiusGaugesTemplate: TemplateDef = {
  id: 'radius-gauges',
  title: 'Radius gauges',
  description: 'Cut out and use to check the fretboard radius while sanding.',
  category: 'gauge',
  build: buildRadiusGaugesDrawing,
};
