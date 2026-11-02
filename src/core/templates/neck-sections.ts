// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Neck profile gauges: female templates (the negative of the neck back) at fret 1, fret 12 and the
 * body joint. Cut each card out along the heavy line, including the curved notch; hold the notch
 * across the neck back while carving until it seats with the card's top edge on the glue line.
 *
 * Gauge-local frame (all cards in one row): +y up, each card spans y ∈ [0, depth + GAUGE_MARGIN_Y]
 * and the notch opens at the top edge (y = card height), +x = BASS side within each card.
 */
import type { Drawing, Shape, Vec2 } from '../geom';
import { segment, polyline, text, v } from '../geom';
import { buildFretboardLayout } from '../layout';
import { boardWidthAt, fretCenterX, neckDepthAt, neckThicknessAt, profileSection } from '../neck';
import type { GuitarSpec } from '../spec';
import type { TemplateDef } from '../template';
import { mm, textBlock } from './_util';

/** Card size: profile width + GAUGE_MARGIN_X, profile depth + GAUGE_MARGIN_Y. */
export const GAUGE_MARGIN_X = 30;
export const GAUGE_MARGIN_Y = 25;
export const SECTION_SPACING = 10;

export interface NeckGauge {
  fret: number;
  label: string;
  /** Fretboard width at the fret (perpendicular to the centerline) = notch width. */
  width: number;
  /** Neck wood depth (total thickness minus fretboard) = notch depth. */
  depth: number;
  /** Total thickness incl. fretboard. */
  thickness: number;
  /** Card centre x and size. */
  cx: number;
  cardWidth: number;
  cardHeight: number;
  /** Closed card outline with the notch, CCW. */
  outline: Vec2[];
}

export function neckGauges(spec: GuitarSpec): NeckGauge[] {
  const lay = buildFretboardLayout(spec);
  const stations: { fret: number; label: string }[] = [
    { fret: 1, label: 'Fret 1' },
    { fret: 12, label: 'Fret 12' },
  ];
  const jf = spec.neck.jointFret;
  if (jf > 12 && jf <= spec.frets.count) stations.push({ fret: jf, label: `Fret ${jf} (body joint)` });
  const out: NeckGauge[] = [];
  let x = 0;
  for (const s of stations) {
    const fx = fretCenterX(lay, s.fret);
    const width = boardWidthAt(lay, fx);
    const depth = Math.max(neckDepthAt(spec, lay, fx), 1);
    const cardWidth = width + GAUGE_MARGIN_X;
    const cardHeight = depth + GAUGE_MARGIN_Y;
    const cx = x + cardWidth / 2;
    const back = profileSection(spec.neck.profile, width, depth).map((p) => v(cx + p.x, cardHeight + p.y));
    // CCW: bottom-left, bottom-right, top-right, then the notch from its right end to its left end, top-left.
    const outline = [v(x, 0), v(x + cardWidth, 0), v(x + cardWidth, cardHeight), ...[...back].reverse(), v(x, cardHeight)];
    out.push({ ...s, width, depth, thickness: neckThicknessAt(spec, lay, fx), cx, cardWidth, cardHeight, outline });
    x += cardWidth + SECTION_SPACING;
  }
  return out;
}

export function buildNeckSectionsDrawing(spec: GuitarSpec): Drawing {
  const gs = neckGauges(spec);
  const prof = spec.neck.profile;
  const cuts: Shape[] = [];
  const center: Shape[] = [];
  const labels: Shape[] = [];
  for (const g of gs) {
    cuts.push(polyline(g.outline, true));
    center.push(segment(v(g.cx, -3), v(g.cx, g.cardHeight + 3)));
    const y = g.cardHeight - g.depth - 6;
    labels.push(text(v(g.cx, y), `${g.label} — ${prof} profile — ${g.thickness.toFixed(1)} mm`, 2.3, { anchor: 'middle' }));
    labels.push(text(v(g.cx, y - 4), `neck ${g.depth.toFixed(1)} + board ${spec.fretboard.thickness.toFixed(1)}, width ${g.width.toFixed(1)}`, 2, { anchor: 'middle' }));
    labels.push(text(v(g.cx + g.width / 2 + 2, g.cardHeight - 4), 'BASS', 2));
    labels.push(text(v(g.cx - g.width / 2 - 2, g.cardHeight - 4), 'TREBLE', 2, { anchor: 'end' }));
  }
  const notes = [
    ...gs.map((g) => `${g.label}: ${prof} profile, ${mm(g.thickness, 1)} total (neck ${mm(g.depth, 1)} + board), notch ${mm(g.width, 1)} wide`),
    'Cut along the heavy line including the notch; the top edge sits on the glue line (fretboard off).',
  ];
  return {
    id: 'neck-sections',
    title: 'Neck profile gauges',
    notes,
    layers: [
      { name: 'gauges', kind: 'cut', shapes: cuts },
      { name: 'centerline', kind: 'reference', shapes: center },
      { name: 'labels', kind: 'annotation', shapes: [...labels, ...textBlock(v(0, -10), [`${spec.meta.name} - neck profile gauges`, ...notes])] },
    ],
  };
}

export const neckSectionsTemplate: TemplateDef = {
  id: 'neck-sections',
  title: 'Neck profile gauges',
  description: 'Cross-section gauges at fret 1, fret 12 and the body joint for carving the neck back.',
  category: 'gauge',
  build: buildNeckSectionsDrawing,
};
