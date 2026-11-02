// SPDX-License-Identifier: GPL-3.0-or-later
import type { Drawing, Shape, Vec2 } from '../geom';
import { dist, drawingBounds } from '../geom';
import { buildFretboardLayout } from '../layout';
import { DEFAULT_SPEC, PRESETS } from '../presets';
import type { GuitarSpec } from '../spec';
import { headstockTemplate } from './headstock';
import { GAUGE_MARGIN_X, GAUGE_MARGIN_Y, neckGauges, neckSectionsTemplate } from './neck-sections';
import { neckSideTemplate } from './neck-side';

const OURS = [headstockTemplate, neckSideTemplate, neckSectionsTemplate];
const points = (s: Shape): Vec2[] => (s.kind === 'polyline' ? s.points : s.kind === 'circle' ? [s.center] : [s.at]);
const layer = (d: Drawing, name: string) => d.layers.find((l) => l.name === name)!;
const texts = (d: Drawing) => d.layers.flatMap((l) => l.shapes).filter((s) => s.kind === 'text').map((s) => (s as { text: string }).text);

const variants: [string, GuitarSpec][] = PRESETS.map((p) => [p.id, p.spec]);
for (const [name, f] of [
  ['angled + volute', (s: GuitarSpec) => { s.headstock.style = 'angled'; s.headstock.angle = 13; s.headstock.volute = true; }],
  ['flat + volute', (s: GuitarSpec) => { s.headstock.volute = true; }],
  ['neck-through, heel access', (s: GuitarSpec) => { s.neck.joint = 'neck-through'; s.neck.trussRod.access = 'heel'; }],
  ['set-in, asym', (s: GuitarSpec) => { s.neck.joint = 'set-in'; s.neck.profile = 'asym'; }],
  ['split-offset', (s: GuitarSpec) => { s.headstock.shape = 'split-offset'; }],
  ['paddle', (s: GuitarSpec) => { s.headstock.shape = 'paddle'; }],
] as const) {
  const s = structuredClone(DEFAULT_SPEC);
  f(s);
  variants.push([name, s]);
}

describe.each(variants)('%s', (_id, spec) => {
  it.each(OURS.map((t) => [t.id, t] as const))('%s builds with finite coordinates and a valid layer contract', (id, t) => {
    const d = t.build(spec);
    expect(d.id).toBe(id);
    expect(drawingBounds(d)).not.toBeNull();
    expect(d.layers.some((l) => l.kind === 'annotation')).toBe(true);
    expect(d.layers.some((l) => l.name === 'centerline' && l.kind === 'reference')).toBe(true);
    expect(d.layers.some((l) => l.kind === 'cut' && l.shapes.length > 0)).toBe(true);
    expect(d.notes!.length).toBeGreaterThan(2);
    expect(texts(d).some((x) => x.includes(spec.meta.name))).toBe(true); // title printed on paper
    for (const l of d.layers) {
      expect(l.name).toMatch(/^[a-z0-9_-]+$/);
      for (const s of l.shapes) {
        for (const p of points(s)) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        if (s.kind === 'circle') expect(s.r).toBeGreaterThan(0);
        if (s.kind === 'text') expect(s.size).toBeGreaterThan(0);
        if (s.kind === 'polyline') expect(s.points.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('headstock: closed outline, one hole + crosshair per string, string paths, access pocket per spec', () => {
    const d = headstockTemplate.build(spec);
    const N = spec.strings.gauges.length;
    const o = layer(d, 'outline').shapes[0]!;
    expect(o.kind === 'polyline' && o.closed).toBe(true);
    const holes = layer(d, 'tuner-holes');
    expect(holes.kind).toBe('mark');
    expect(holes.shapes).toHaveLength(N);
    for (const h of holes.shapes) expect(h.kind === 'circle' && h.r === spec.headstock.tunerHoleDiameter / 2).toBe(true);
    expect(layer(d, 'tuner-centres').shapes).toHaveLength(2 * N);
    expect(layer(d, 'strings').shapes).toHaveLength(N);
    expect(layer(d, 'nut').kind).toBe('mark');
    expect(layer(d, 'nut-line').kind).toBe('reference');
    expect(layer(d, 'truss-access').shapes).toHaveLength(spec.neck.trussRod.access === 'headstock' ? 1 : 0);
    // Side view sits entirely below the top view.
    const topMin = Math.min(...points(o).map((p) => p.y));
    const side = layer(d, 'side-profile').shapes;
    expect(side.length).toBeGreaterThan(0);
    for (const s of side) for (const p of points(s)) expect(p.y).toBeLessThan(topMin);
  });

  it('neck side: closed outline, one tick per fret, truss-rod channel at the spec depth and length', () => {
    const d = neckSideTemplate.build(spec);
    const o = layer(d, 'neck').shapes[0]!;
    expect(o.kind === 'polyline' && o.closed).toBe(true);
    expect(layer(d, 'frets').shapes).toHaveLength(spec.frets.count);
    const ch = points(layer(d, 'truss-rod').shapes[0]!);
    expect(Math.min(...ch.map((p) => p.y))).toBeCloseTo(-spec.neck.trussRod.depth, 9);
    expect(Math.max(...ch.map((p) => p.x)) - Math.min(...ch.map((p) => p.x))).toBeCloseTo(spec.neck.trussRod.length, 9);
    expect(layer(d, 'truss-rod').kind).toBe('reference');
  });

  it('neck sections: gauges sized from the layout, laid out side by side, notch = profile', () => {
    const lay = buildFretboardLayout(spec);
    const gs = neckGauges(spec);
    expect(gs.map((g) => g.fret).slice(0, 2)).toEqual([1, 12]);
    for (const g of gs) {
      const f = lay.frets[g.fret]!;
      if (spec.scale.bass === spec.scale.treble) expect(g.width).toBeCloseTo(dist(f.treble, f.bass), 9);
      expect(g.cardWidth).toBeCloseTo(g.width + GAUGE_MARGIN_X, 12);
      expect(g.cardHeight).toBeCloseTo(g.depth + GAUGE_MARGIN_Y, 12);
      expect(g.depth + spec.fretboard.thickness).toBeCloseTo(g.thickness, 12);
      const ys = g.outline.map((p) => p.y);
      const xs = g.outline.map((p) => p.x);
      expect(Math.min(...ys)).toBe(0);
      expect(Math.max(...ys)).toBeCloseTo(g.cardHeight, 12);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(g.cardWidth, 12);
      // Deepest point of the notch on the card centre.
      const notch = g.outline.filter((p) => p.y < g.cardHeight - 1e-9);
      const bottom = notch.filter((p) => p.y > 1e-9).reduce((a, b) => (b.y < a.y ? b : a));
      expect(bottom.x).toBeCloseTo(g.cx, 9);
      expect(bottom.y).toBeCloseTo(g.cardHeight - g.depth, 9);
    }
    expect(gs[0]!.thickness).toBeCloseTo(spec.neck.thicknessAt1, 9);
    expect(gs[1]!.thickness).toBeCloseTo(spec.neck.thicknessAt12, 9);
    for (let i = 1; i < gs.length; i++) expect(gs[i - 1]!.cx + gs[i - 1]!.cardWidth / 2).toBeLessThan(gs[i]!.cx - gs[i]!.cardWidth / 2);
    const d = neckSectionsTemplate.build(spec);
    expect(layer(d, 'gauges').shapes).toHaveLength(gs.length);
    expect(texts(d).some((t) => t.startsWith(`Fret 1 — ${spec.neck.profile} profile — ${spec.neck.thicknessAt1.toFixed(1)} mm`))).toBe(true);
  });
});
