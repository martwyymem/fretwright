// SPDX-License-Identifier: GPL-3.0-or-later
import type { Vec2 } from './geom';
import { dist, lineIntersection } from './geom';
import type { FretboardLayout } from './layout';
import { buildFretboardLayout, fretDistance } from './layout';
import { DEFAULT_SPEC, PRESETS } from './presets';
import type { GuitarSpec } from './spec';
import { insideConvex } from './templates/_util';
import { inToMm } from './units';

const EPS = 1e-9;
const mod = (f: (s: GuitarSpec) => void, base: GuitarSpec = DEFAULT_SPEC): GuitarSpec => {
  const s = structuredClone(base);
  f(s);
  return s;
};
const multiscale = PRESETS.find((p) => p.id === 'multiscale-7')!.spec;

/** Distance along string i from its nut point to where fret n crosses it. */
function alongString(lay: FretboardLayout, i: number, n: number): number {
  const s = lay.strings[i]!;
  const f = lay.frets[n]!;
  const p = lineIntersection(s.nut, s.saddle, f.treble, f.bass)!;
  return dist(s.nut, p);
}

/** A battery of specs covering every layout option. */
const VARIANTS: [string, GuitarSpec][] = [
  ...PRESETS.map((p) => [p.id, p.spec] as [string, GuitarSpec]),
  ['ms-perp-nut-zero', mod((s) => { s.nut.position = 'perpendicular'; s.frets.zeroFret = true; }, multiscale)],
  ['ms-perp-end', mod((s) => { s.fretboard.endCut = 'perpendicular'; s.fretboard.startMargin = 10; }, multiscale)],
  ['ms-frac-perp', mod((s) => { s.frets.perpendicularFret = 7.5; }, multiscale)],
  ['ms-perp-fret-0', mod((s) => { s.frets.perpendicularFret = 0; }, multiscale)],
  ['ms-perp-fret-last', mod((s) => { s.frets.perpendicularFret = 24; }, multiscale)],
  ['blocks', mod((s) => { s.fretboard.inlays.style = 'blocks'; s.frets.count = 24; })],
  ['ms-blocks', mod((s) => { s.fretboard.inlays.style = 'blocks'; }, multiscale)],
  ['zero-fret', mod((s) => { s.frets.zeroFret = true; s.fretboard.startMargin = 3; })],
];

describe('fretDistance golden values (25.5" = 647.7 mm)', () => {
  const L = inToMm(25.5);
  it('fret 1 ≈ 36.35 mm', () => expect(fretDistance(1, L)).toBeCloseTo(36.35, 2));
  it('fret 12 = 323.85 mm', () => expect(fretDistance(12, L)).toBeCloseTo(323.85, 9));
  it('fret 24 = 485.775 mm', () => expect(fretDistance(24, L)).toBeCloseTo(485.775, 9));
  it('fretTable matches on both sides', () => {
    const lay = buildFretboardLayout(DEFAULT_SPEC);
    expect(lay.fretTable).toHaveLength(DEFAULT_SPEC.frets.count + 1);
    expect(lay.fretTable[12]!.bass).toBeCloseTo(323.85, 9);
    expect(lay.fretTable[12]!.treble).toBeCloseTo(323.85, 9);
    expect(lay.fretTable[0]!.bass).toBe(0);
  });
  it('outer strings cross each fret at exactly fretDistance(n, L) from fret 0', () => {
    for (const spec of [DEFAULT_SPEC, multiscale]) {
      const lay = buildFretboardLayout(spec);
      const last = lay.strings.length - 1;
      for (const n of [1, 5, 12, spec.frets.count]) {
        expect(alongString(lay, 0, n)).toBeCloseTo(fretDistance(n, spec.scale.treble), 9);
        expect(alongString(lay, last, n)).toBeCloseTo(fretDistance(n, spec.scale.bass), 9);
      }
    }
  });
  // Straight frets are exact only for strings whose relative position is the same at the nut and the
  // bridge. On a multiscale board with equal-gap nut spacing (bridge is always equal-centre) inner
  // strings drift slightly; that is inherent to straight fanned frets, not a layout bug.
  it.each([
    ['single scale, equal-gap', DEFAULT_SPEC, 0.05],
    ['single scale, equal-centre', mod((s) => { s.nut.spacing = 'equal-center'; }), 0.05],
    ['multiscale, equal-centre', mod((s) => { s.nut.spacing = 'equal-center'; }, multiscale), 0.06],
    ['multiscale, equal-gap', multiscale, 0.5],
  ] as const)('%s: inner strings cross frets near their own fretDistance', (_n, spec, tol) => {
    const lay = buildFretboardLayout(spec);
    for (const s of lay.strings) {
      for (const n of [1, 12, spec.frets.count]) {
        expect(Math.abs(alongString(lay, s.index, n) - fretDistance(n, s.scale!))).toBeLessThan(tol);
      }
    }
  });
});

describe('origin and symmetry', () => {
  it.each(VARIANTS)('%s: fret-0 line crosses the centerline at (0,0)', (_id, spec) => {
    const c = buildFretboardLayout(spec).frets[0]!.center!;
    expect(Math.abs(c.x)).toBeLessThan(EPS);
    expect(Math.abs(c.y)).toBeLessThan(EPS);
  });

  it('single scale, equal-centre: strings and frets are mirror-symmetric about y = 0', () => {
    const spec = mod((s) => { s.nut.spacing = 'equal-center'; });
    const lay = buildFretboardLayout(spec);
    const N = lay.strings.length;
    for (let i = 0; i < N; i++) {
      const a = lay.strings[i]!;
      const b = lay.strings[N - 1 - i]!;
      expect(a.nut.y).toBeCloseTo(-b.nut.y, 9);
      expect(a.nut.x).toBeCloseTo(b.nut.x, 9);
      expect(a.saddle.y).toBeCloseTo(-b.saddle.y, 9);
      expect(a.saddle.x).toBeCloseTo(b.saddle.x, 9);
    }
    for (const f of lay.frets) expect(Math.abs(f.treble.x - f.bass.x)).toBeLessThan(EPS);
  });

  it('single scale with equal gauges: outline is mirror-symmetric', () => {
    const spec = mod((s) => { s.strings.gauges = s.strings.gauges.map(() => 0.5); });
    const [nt, et, eb, nb] = buildFretboardLayout(spec).outline;
    expect(nt.y).toBeCloseTo(-nb.y, 9);
    expect(et.y).toBeCloseTo(-eb.y, 9);
    expect(nt.x).toBeCloseTo(nb.x, 9);
    expect(et.x).toBeCloseTo(eb.x, 9);
  });
});

describe('multiscale', () => {
  it('perpendicular fret is square to the centerline', () => {
    for (const p of [8, 0, 3, 24]) {
      const lay = buildFretboardLayout(mod((s) => { s.frets.perpendicularFret = p; }, multiscale));
      const f = lay.frets[p]!;
      expect(Math.abs(f.bass.x - f.treble.x)).toBeLessThan(EPS);
      expect(Math.abs(f.slotBass.x - f.slotTreble.x)).toBeLessThan(EPS);
    }
  });
  it('fractional perpendicular fret: outer-string points at fretDistance(p) share x', () => {
    const p = 7.5;
    const spec = mod((s) => { s.frets.perpendicularFret = p; }, multiscale);
    const lay = buildFretboardLayout(spec);
    const at = (i: number, L: number): Vec2 => {
      const s = lay.strings[i]!;
      const k = fretDistance(p, L) / L;
      return { x: s.nut.x + (s.saddle.x - s.nut.x) * k, y: s.nut.y + (s.saddle.y - s.nut.y) * k };
    };
    expect(Math.abs(at(0, spec.scale.treble).x - at(lay.strings.length - 1, spec.scale.bass).x)).toBeLessThan(EPS);
  });
  it('frets fan: bass end is behind the treble end below the perpendicular fret, ahead above it', () => {
    const lay = buildFretboardLayout(multiscale);
    expect(lay.frets[0]!.bass.x).toBeLessThan(lay.frets[0]!.treble.x);
    expect(lay.frets[24]!.bass.x).toBeGreaterThan(lay.frets[24]!.treble.x);
  });
  it('nut string spread is measured across the centerline', () => {
    const lay = buildFretboardLayout(multiscale);
    const s = lay.strings;
    expect(s[s.length - 1]!.nut.y - s[0]!.nut.y).toBeCloseTo(multiscale.nut.stringSpread, 9);
  });
});

describe('strings', () => {
  it.each(VARIANTS)('%s: nut → saddle equals the interpolated scale; compensation lerped', (_id, spec) => {
    const lay = buildFretboardLayout(spec);
    const N = lay.strings.length;
    for (const s of lay.strings) {
      const t = s.index / (N - 1);
      const L = spec.scale.treble + (spec.scale.bass - spec.scale.treble) * t;
      const c = spec.bridge.compensationTreble + (spec.bridge.compensationBass - spec.bridge.compensationTreble) * t;
      expect(dist(s.nut, s.saddle)).toBeCloseTo(L, 9);
      expect(dist(s.nut, s.compensatedSaddle)).toBeCloseTo(L + c, 9);
      expect(s.scale).toBeCloseTo(L, 9);
    }
  });
  it.each(VARIANTS)('%s: strings start on the fret-0 line and outer saddles sit at the bridge spread', (_id, spec) => {
    const lay = buildFretboardLayout(spec);
    const f0 = lay.frets[0]!;
    for (const s of lay.strings) {
      const c = (f0.bass.x - f0.treble.x) * (s.nut.y - f0.treble.y) - (f0.bass.y - f0.treble.y) * (s.nut.x - f0.treble.x);
      expect(Math.abs(c)).toBeLessThan(1e-6);
    }
    const [st, sb] = lay.saddleLine;
    expect(st.y).toBeCloseTo(-spec.bridge.stringSpread / 2, 9);
    expect(sb.y).toBeCloseTo(spec.bridge.stringSpread / 2, 9);
    expect(dist(lay.strings[0]!.saddle, st)).toBeLessThan(1e-9);
  });
  it('equal-gap spacing: clear gaps between strings at the nut are all equal', () => {
    const lay = buildFretboardLayout(mod((s) => { s.nut.spacing = 'equal-gap'; }));
    const gaps = lay.nutGaps!;
    expect(gaps).toHaveLength(5);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0]!, 9);
    // Equal-gap ≠ equal-centre when gauges differ.
    const ys = lay.strings.map((s) => s.nut.y);
    expect(Math.abs(ys[1]! - ys[0]! - (ys[5]! - ys[4]!))).toBeGreaterThan(0.1);
  });
  it('equal-centre spacing: centre distances at the nut are all equal', () => {
    const lay = buildFretboardLayout(mod((s) => { s.nut.spacing = 'equal-center'; }));
    const ys = lay.strings.map((s) => s.nut.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeCloseTo(35 / 5, 9);
  });
});

describe('fretboard outline, nut and widths', () => {
  it.each(VARIANTS)('%s: every slot, fret end and inlay lies inside the outline', (_id, spec) => {
    const lay = buildFretboardLayout(spec);
    for (const f of lay.frets) {
      for (const p of [f.slotTreble, f.slotBass, f.treble, f.bass]) expect(insideConvex(p, lay.outline, 1e-6)).toBe(true);
    }
    for (const m of lay.inlays) for (const p of m.points) expect(insideConvex(p, lay.outline)).toBe(true);
    for (const p of lay.nut) expect(insideConvex(p, lay.outline, 1e-6)).toBe(true);
  });
  it.each(VARIANTS)('%s: slots are shortened by the nipping at each end', (_id, spec) => {
    for (const f of buildFretboardLayout(spec).frets) {
      expect(dist(f.treble, f.slotTreble)).toBeCloseTo(spec.frets.nipping, 9);
      expect(dist(f.bass, f.slotBass)).toBeCloseTo(spec.frets.nipping, 9);
    }
  });
  it('width at nut = spread + 2 × sideMargin + outer half-gauges (single scale)', () => {
    const s = DEFAULT_SPEC;
    const g = s.strings.gauges;
    const lay = buildFretboardLayout(s);
    // Edges are offset perpendicular to the (slightly fanned) outer strings, hence the small tolerance.
    expect(lay.widthAtNut).toBeCloseTo(s.nut.stringSpread + 2 * s.fretboard.sideMargin + (g[0]! + g[5]!) / 2, 2);
    expect(lay.widthAtLastFret).toBeGreaterThan(lay.widthAtNut);
  });
  it('parallel nut: front face is the fret-0 line, thickness along x, board starts at its back face + startMargin', () => {
    const spec = mod((s) => { s.fretboard.startMargin = 7; });
    const lay = buildFretboardLayout(spec);
    const f0 = lay.frets[0]!;
    expect(lay.nut[0]!.x).toBeCloseTo(f0.treble.x, 9);
    expect(lay.nut[1]!.x).toBeCloseTo(f0.bass.x, 9);
    expect(lay.nut[1]!.x - lay.nut[2]!.x).toBeCloseTo(spec.nut.thickness, 9);
    expect(lay.outline[0].x).toBeCloseTo(-spec.nut.thickness - 7, 9);
  });
  it('zero fret: nut sits zeroFretGap behind fret 0', () => {
    const spec = mod((s) => { s.frets.zeroFret = true; s.nut.zeroFretGap = 3; });
    const lay = buildFretboardLayout(spec);
    expect(lay.nut[0]!.x).toBeCloseTo(-3, 9);
    expect(lay.nut[3]!.x).toBeCloseTo(-3 - spec.nut.thickness, 9);
  });
  it('perpendicular nut on multiscale: square to the centerline, entirely behind fret 0', () => {
    const spec = mod((s) => { s.nut.position = 'perpendicular'; s.frets.zeroFret = true; s.nut.zeroFretGap = 2; }, multiscale);
    const lay = buildFretboardLayout(spec);
    const f0 = lay.frets[0]!;
    const xs = lay.nut.map((p) => p.x);
    expect(xs[0]).toBeCloseTo(xs[1]!, 9);
    expect(xs[2]).toBeCloseTo(xs[3]!, 9);
    expect(xs[0]).toBeCloseTo(Math.min(f0.treble.x, f0.bass.x) - 2, 9);
    expect(lay.outline[0].x).toBeCloseTo(lay.outline[3].x, 9);
  });
  it('end cut: parallel follows the last fret, perpendicular is square at the furthest point', () => {
    const par = buildFretboardLayout(multiscale);
    const last = par.frets[24]!;
    const [, et, eb] = par.outline;
    // End line parallel to the last fret, 4 mm (endMargin) further along x.
    expect(Math.abs((eb.x - et.x) * (last.bass.y - last.treble.y) - (eb.y - et.y) * (last.bass.x - last.treble.x))).toBeLessThan(1e-6);
    const endAtCenter = et.x + ((eb.x - et.x) * (0 - et.y)) / (eb.y - et.y);
    expect(endAtCenter).toBeCloseTo(last.center!.x + 4, 9);
    const perp = buildFretboardLayout(mod((s) => { s.fretboard.endCut = 'perpendicular'; }, multiscale));
    expect(perp.outline[1].x).toBeCloseTo(perp.outline[2].x, 9);
    expect(perp.outline[1].x).toBeCloseTo(Math.max(last.treble.x, last.bass.x) + 4, 9);
  });
  it('outline is CCW (positive signed area)', () => {
    for (const [, spec] of VARIANTS) {
      const o = buildFretboardLayout(spec).outline;
      let a = 0;
      for (let i = 0; i < 4; i++) a += o[i]!.x * o[(i + 1) % 4]!.y - o[(i + 1) % 4]!.x * o[i]!.y;
      expect(a).toBeGreaterThan(0);
    }
  });
});

describe('inlays', () => {
  it('dots sit on the centerline midway between fret n−1 and n; doubles at ±¼ of the local width', () => {
    const lay = buildFretboardLayout(DEFAULT_SPEC);
    const d3 = lay.inlays.find((m) => m.fret === 3)!;
    expect(d3.kind).toBe('dot');
    expect(d3.points[0]!.y).toBeCloseTo(0, 9);
    expect(d3.points[0]!.x).toBeCloseTo((lay.frets[2]!.center!.x + lay.frets[3]!.center!.x) / 2, 9);
    expect(d3.diameter).toBe(6);
    const d12 = lay.inlays.find((m) => m.fret === 12)!;
    expect(d12.kind).toBe('double-dot');
    const w = (dist(lay.frets[11]!.treble, lay.frets[11]!.bass) + dist(lay.frets[12]!.treble, lay.frets[12]!.bass)) / 2;
    expect(dist(d12.points[0]!, d12.points[1]!)).toBeCloseTo(w / 2, 6);
    expect(d12.sides).toHaveLength(2);
    expect(lay.inlays.map((m) => m.fret)).toEqual([3, 5, 7, 9, 12, 15, 17, 19, 21]); // 24 > 22 frets
  });
  it('side dots lie on the bass edge', () => {
    const lay = buildFretboardLayout(multiscale);
    const [, , eb, nb] = lay.outline;
    for (const m of lay.inlays) {
      for (const p of m.sides!) {
        const c = (eb.x - nb.x) * (p.y - nb.y) - (eb.y - nb.y) * (p.x - nb.x);
        expect(Math.abs(c)).toBeLessThan(1e-6);
      }
    }
  });
  it('blocks lie between their two frets and inside the edges', () => {
    const spec = mod((s) => { s.fretboard.inlays.style = 'blocks'; s.frets.count = 24; });
    const lay = buildFretboardLayout(spec);
    for (const m of lay.inlays) {
      expect(m.kind).toBe('block');
      expect(m.points).toHaveLength(4);
      const lo = lay.frets[m.fret - 1]!.treble.x;
      const hi = lay.frets[m.fret]!.treble.x;
      for (const p of m.points) {
        expect(p.x).toBeGreaterThan(lo);
        expect(p.x).toBeLessThan(hi);
        expect(insideConvex(p, lay.outline)).toBe(true);
      }
    }
  });
  it('style none: no face markers, side dots only', () => {
    const lay = buildFretboardLayout(mod((s) => { s.fretboard.inlays.style = 'none'; }));
    expect(lay.inlays.length).toBeGreaterThan(0);
    for (const m of lay.inlays) {
      expect(m.points).toEqual([]);
      expect(m.side).toBeDefined();
    }
    const none = buildFretboardLayout(mod((s) => { s.fretboard.inlays.style = 'none'; s.fretboard.inlays.sideDots = false; }));
    expect(none.inlays).toEqual([]);
  });
});
