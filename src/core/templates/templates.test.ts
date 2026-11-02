// SPDX-License-Identifier: GPL-3.0-or-later
import type { Drawing, Shape, Vec2 } from '../geom';
import { dist, drawingBounds } from '../geom';
import { buildFretboardLayout } from '../layout';
import { DEFAULT_SPEC, PRESETS } from '../presets';
import type { GuitarSpec } from '../spec';
import { insideConvex } from './_util';
import { fretboardTemplate } from './fretboard';
import { GAUGE_EXTRA_WIDTH, GAUGE_HEIGHT, radiusGauges, radiusGaugesTemplate } from './radius-gauges';
import { scaleLayoutTemplate } from './scale-layout';

const OURS = [fretboardTemplate, scaleLayoutTemplate, radiusGaugesTemplate];

const points = (s: Shape): Vec2[] => (s.kind === 'polyline' ? s.points : s.kind === 'circle' ? [s.center] : [s.at]);
const layer = (d: Drawing, name: string) => d.layers.find((l) => l.name === name)!;

describe.each(PRESETS.map((p) => [p.id, p.spec] as [string, GuitarSpec]))('preset %s', (_id, spec) => {
  it.each(OURS.map((t) => [t.id, t] as const))('%s builds with finite coordinates and a valid layer contract', (id, t) => {
    const d = t.build(spec);
    expect(d.id).toBe(id);
    expect(drawingBounds(d)).not.toBeNull();
    const kinds = new Set(d.layers.map((l) => l.kind));
    expect(kinds.has('annotation')).toBe(true);
    expect(d.layers.some((l) => l.name === 'centerline' && l.kind === 'reference')).toBe(true);
    for (const l of d.layers) {
      expect(l.name).toMatch(/^[a-z0-9_-]+$/);
      for (const s of l.shapes) {
        for (const p of points(s)) {
          expect(Number.isFinite(p.x)).toBe(true);
          expect(Number.isFinite(p.y)).toBe(true);
        }
        if (s.kind === 'circle') expect(s.r).toBeGreaterThan(0);
        if (s.kind === 'text') expect(s.size).toBeGreaterThan(0);
        if (s.kind === 'polyline') expect(s.points.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('fretboard: one slot per fret, all inside the cut outline', () => {
    const d = fretboardTemplate.build(spec);
    const outline = layer(d, 'outline').shapes[0]!;
    expect(outline.kind === 'polyline' && outline.closed).toBe(true);
    const poly = points(outline);
    const slots = layer(d, 'fret-slots').shapes;
    expect(slots).toHaveLength(spec.frets.count + (spec.frets.zeroFret ? 1 : 0));
    for (const s of slots) for (const p of points(s)) expect(insideConvex(p, poly, 1e-6)).toBe(true);
    expect(layer(d, 'nut').kind).toBe('mark');
    expect(d.notes!.join(' ')).toContain('Width at nut');
  });

  it('scale-layout: one string line and one saddle mark per string', () => {
    const d = scaleLayoutTemplate.build(spec);
    const n = spec.strings.gauges.length;
    expect(layer(d, 'strings').shapes).toHaveLength(n);
    expect(layer(d, 'saddles').shapes).toHaveLength(n * 3); // circle + 2-segment cross
    expect(layer(d, 'frets').shapes).toHaveLength(spec.frets.count + 1);
  });

  it('radius gauges: arc of the right radius, spans width + 10 mm, side by side', () => {
    const gs = radiusGauges(spec);
    const lay = buildFretboardLayout(spec);
    const equal = spec.fretboard.radiusStart === spec.fretboard.radiusEnd;
    expect(gs).toHaveLength(equal ? 1 : 2);
    if (!equal) {
      expect(gs[0]!.width).toBeCloseTo(lay.widthAtNut + GAUGE_EXTRA_WIDTH, 9);
      expect(gs[1]!.width).toBeCloseTo(lay.widthAtLastFret + GAUGE_EXTRA_WIDTH, 9);
      expect(gs[0]!.cx + gs[0]!.width / 2).toBeLessThan(gs[1]!.cx - gs[1]!.width / 2);
    }
    for (const g of gs) {
      const c = { x: g.cx, y: g.sagitta - g.radius };
      const arc = g.outline.slice(0, -2);
      for (const p of arc) expect(dist(p, c)).toBeCloseTo(g.radius, 6);
      const xs = g.outline.map((p) => p.x);
      const ys = g.outline.map((p) => p.y);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(g.width, 6);
      expect(Math.max(...ys)).toBe(GAUGE_HEIGHT);
      expect(Math.min(...ys)).toBeCloseTo(0, 9);
      // Concave: apex (middle) is higher than the ends by the sagitta.
      const top = Math.max(...arc.map((p) => p.y));
      expect(top).toBeLessThanOrEqual(g.sagitta + 1e-9);
      expect(top).toBeGreaterThan(g.sagitta - 0.05); // arcPoints chord tolerance
    }
    const d = radiusGaugesTemplate.build(spec);
    expect(layer(d, 'gauges').shapes).toHaveLength(gs.length);
    expect(layer(d, 'gauges').kind).toBe('cut');
  });
});

it('fretboard template draws the zero fret as a slot when enabled', () => {
  const spec = structuredClone(DEFAULT_SPEC);
  spec.frets.zeroFret = true;
  expect(layer(fretboardTemplate.build(spec), 'fret-slots').shapes).toHaveLength(spec.frets.count + 1);
});

it('fretboard template draws blocks as closed polylines', () => {
  const spec = structuredClone(DEFAULT_SPEC);
  spec.fretboard.inlays.style = 'blocks';
  const shapes = layer(fretboardTemplate.build(spec), 'inlays').shapes;
  expect(shapes.length).toBeGreaterThan(0);
  for (const s of shapes) expect(s.kind === 'polyline' && s.closed && s.points.length === 4).toBe(true);
});
