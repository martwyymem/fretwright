// SPDX-License-Identifier: GPL-3.0-or-later
import { dist } from './geom';
import { signedArea } from './headstock';
import { buildFretboardLayout } from './layout';
import {
  boardEndX,
  boardStartX,
  boardWidthAt,
  buildNeckSide,
  fretCenterX,
  neckDepthAt,
  neckThicknessAt,
  nutFrontX,
  profileSection,
  TRUSS_HEADSTOCK_INSET,
  trussRodChannel,
  VOLUTE_DEPTH,
} from './neck';
import { DEFAULT_SPEC, PRESETS } from './presets';
import type { GuitarSpec, NeckProfileId } from './spec';
import { NeckProfileId as Profiles } from './spec';

const mod = (f: (s: GuitarSpec) => void, base: GuitarSpec = DEFAULT_SPEC): GuitarSpec => {
  const s = structuredClone(base);
  f(s);
  return s;
};

describe('neck thickness', () => {
  it.each(PRESETS.map((p) => [p.id, p.spec] as [string, GuitarSpec]))('%s: equals the spec at fret 1 and fret 12, linear between', (_id, spec) => {
    const lay = buildFretboardLayout(spec);
    const x1 = fretCenterX(lay, 1);
    const x12 = fretCenterX(lay, 12);
    expect(neckThicknessAt(spec, lay, x1)).toBeCloseTo(spec.neck.thicknessAt1, 9);
    expect(neckThicknessAt(spec, lay, x12)).toBeCloseTo(spec.neck.thicknessAt12, 9);
    expect(neckThicknessAt(spec, lay, (x1 + x12) / 2)).toBeCloseTo((spec.neck.thicknessAt1 + spec.neck.thicknessAt12) / 2, 9);
    expect(neckDepthAt(spec, lay, x1)).toBeCloseTo(spec.neck.thicknessAt1 - spec.fretboard.thickness, 9);
  });

  it('board width at a fret equals the fret length on a single-scale board', () => {
    const lay = buildFretboardLayout(DEFAULT_SPEC);
    for (const n of [1, 12]) {
      const f = lay.frets[n]!;
      expect(boardWidthAt(lay, f.center!.x)).toBeCloseTo(dist(f.treble, f.bass), 9);
    }
    expect(boardWidthAt(lay, 0)).toBeCloseTo(lay.widthAtNut, 9);
  });
});

describe('profile sections', () => {
  const W = 43;
  const D = 14.5;
  it.each(Profiles.options.map((p) => [p]))('%s: closed CCW, width and depth match', (id: NeckProfileId) => {
    const pts = profileSection(id, W, D);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    expect(pts[0]).toEqual({ x: -W / 2, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: W / 2, y: 0 });
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(W, 12);
    expect(Math.min(...ys)).toBeCloseTo(-D, 12);
    expect(Math.max(...ys)).toBeCloseTo(0, 12);
    expect(signedArea(pts)).toBeGreaterThan(0);
    for (const p of pts) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    // Fine enough for ≤ 0.05 mm chord error: no long segments.
    for (let i = 1; i < pts.length; i++) expect(dist(pts[i]!, pts[i - 1]!)).toBeLessThan(1);
  });

  it.each([['C'], ['D'], ['U'], ['V']] as [NeckProfileId][])('%s is symmetric', (id) => {
    const pts = profileSection(id, W, D);
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      expect(pts[i]!.x).toBeCloseTo(-pts[n - 1 - i]!.x, 12);
      expect(pts[i]!.y).toBeCloseTo(pts[n - 1 - i]!.y, 12);
    }
  });

  it('asym is fuller on the bass (+x) side; D and U are fuller than C; V is leaner', () => {
    const at = (id: NeckProfileId, x: number) => {
      const pts = profileSection(id, W, D);
      return pts.reduce((b, p) => (Math.abs(p.x - x) < Math.abs(b.x - x) ? p : b)).y;
    };
    const q = W / 3;
    expect(at('asym', q)).toBeLessThan(at('asym', -q));
    expect(at('D', q)).toBeLessThan(at('C', q));
    expect(at('U', q)).toBeLessThan(at('D', q));
    expect(at('V', q)).toBeGreaterThan(at('C', q));
    expect(at('flat-oval', q)).toBeLessThan(at('C', q));
  });

  it('optional fretboard radius on top', () => {
    const r = 241.3;
    const pts = profileSection('C', W, D, { radius: r });
    const sag = r - Math.sqrt(r * r - (W / 2) ** 2);
    expect(Math.max(...pts.map((p) => p.y))).toBeGreaterThan(sag - 0.05);
    expect(Math.max(...pts.map((p) => p.y))).toBeLessThanOrEqual(sag + 1e-9);
    expect(signedArea(pts)).toBeGreaterThan(0);
  });
});

describe('neck side profile', () => {
  it.each(PRESETS.map((p) => [p.id, p.spec] as [string, GuitarSpec]))('%s: closed CCW outline, back passes the spec thicknesses', (_id, spec) => {
    const lay = buildFretboardLayout(spec);
    const ns = buildNeckSide(spec, lay);
    for (const p of ns.outline) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(signedArea(ns.outline)).toBeGreaterThan(0);
    // Back line from the joint fret toward the headstock: y = board − thickness at fret 1 and 12.
    const [J, A] = ns.back as [{ x: number; y: number }, { x: number; y: number }];
    const yAt = (x: number) => J.y + ((A.y - J.y) * (x - J.x)) / (A.x - J.x);
    expect(A.x).toBeLessThan(ns.x.fret1);
    expect(yAt(ns.x.fret1)).toBeCloseTo(spec.fretboard.thickness - spec.neck.thicknessAt1, 9);
    expect(yAt(ns.x.fret12)).toBeCloseTo(spec.fretboard.thickness - spec.neck.thicknessAt12, 9);
    // Ends.
    const xs = ns.outline.map((p) => p.x);
    expect(Math.max(...xs)).toBeCloseTo(ns.x.neckEnd, 9);
    expect(ns.x.boardStart).toBeCloseTo(boardStartX(lay), 12);
    expect(ns.x.boardEnd).toBeCloseTo(boardEndX(lay), 12);
    if (spec.neck.joint !== 'neck-through') expect(ns.x.neckEnd).toBeCloseTo(ns.x.boardEnd + spec.neck.heelLength, 9);
    // Headstock face at the spec angle, tip at the spec length along the face.
    const [P, T] = ns.headstockFace;
    const ang = (Math.atan2(P.y - T.y, P.x - T.x) * 180) / Math.PI;
    expect(ang).toBeCloseTo(spec.headstock.style === 'angled' ? spec.headstock.angle : 0, 9);
    expect(dist(P, T)).toBeCloseTo(boardStartX(lay) - (nutFrontX(lay) - spec.headstock.length), 9);
    // Headstock thickness.
    expect(dist(ns.headstockBack[1], T)).toBeCloseTo(spec.headstock.thickness, 9);
  });

  it('flat headstock tip sits at the spec length from the nut face', () => {
    const lay = buildFretboardLayout(DEFAULT_SPEC);
    const ns = buildNeckSide(DEFAULT_SPEC, lay);
    expect(ns.x.tip).toBeCloseTo(nutFrontX(lay) - DEFAULT_SPEC.headstock.length, 9);
    expect(ns.headstockAngle).toBe(0);
  });

  it('volute adds wood under the transition', () => {
    for (const style of ['flat', 'angled'] as const) {
      const base = mod((s) => { s.headstock.style = style; s.headstock.angle = style === 'angled' ? 13 : 0; });
      const vol = mod((s) => { s.headstock.volute = true; }, base);
      const lay = buildFretboardLayout(base);
      const a = buildNeckSide(base, lay);
      const b = buildNeckSide(vol, lay);
      expect(a.volute).toBeUndefined();
      expect(b.volute).toBeDefined();
      const low = (o: { x: number; y: number }[]) => Math.min(...o.filter((p) => Math.abs(p.x - b.volute!.x) < 1).map((p) => p.y));
      expect(low(b.outline)).toBeLessThan(low(a.outline) - VOLUTE_DEPTH / 3);
    }
  });

  it('heel per joint type', () => {
    const lay = buildFretboardLayout(DEFAULT_SPEC);
    const bolt = buildNeckSide(DEFAULT_SPEC, lay);
    // Bolt-on: square end, full depth at the end.
    const endPts = bolt.outline.filter((p) => Math.abs(p.x - bolt.x.neckEnd) < 1e-9);
    expect(endPts.length).toBe(2);
    const set = mod((s) => { s.neck.joint = 'set-in'; s.body.neckPocketDepth = 12; });
    const ns = buildNeckSide(set, lay);
    // Tenon is shallower than the neck at the joint: a step at the joint fret.
    const atJ = ns.outline.filter((p) => Math.abs(p.x - ns.x.joint) < 1e-9).map((p) => p.y);
    expect(atJ).toHaveLength(2);
    expect(Math.max(...atJ)).toBeCloseTo(-12, 9);
    const thru = mod((s) => { s.neck.joint = 'neck-through'; });
    const nt = buildNeckSide(thru, lay);
    expect(nt.x.neckEnd).toBeGreaterThan(lay.saddleLine[0].x);
  });

  it('truss rod channel: headstock access starts behind the board start; heel access ends at the heel', () => {
    const lay = buildFretboardLayout(DEFAULT_SPEC);
    const h = trussRodChannel(DEFAULT_SPEC, lay);
    expect(h.x0).toBeCloseTo(boardStartX(lay) - TRUSS_HEADSTOCK_INSET, 9);
    expect(h.x1 - h.x0).toBeCloseTo(DEFAULT_SPEC.neck.trussRod.length, 9);
    expect(h.accessX).toBe(h.x0);
    const heel = mod((s) => { s.neck.trussRod.access = 'heel'; });
    const t = trussRodChannel(heel, lay);
    expect(t.x1).toBeCloseTo(boardEndX(lay) + DEFAULT_SPEC.neck.heelLength, 9);
    expect(t.accessX).toBe(t.x1);
  });
});
