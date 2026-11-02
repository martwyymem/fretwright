// SPDX-License-Identifier: GPL-3.0-or-later
import { BODY_ARCHETYPES, archetypeFrame, bodyOutline, type BodyArchetypeId } from './body-shapes';
import { CAVITY_EDGE_WALL, POCKET_CLEARANCE, POCKET_PICKUP_WALL, buildBodyGeometry, jointFretCenter, pickupRoute, saddleCenter } from './body';
import type { Vec2 } from './geom';
import { v } from './geom';
import { buildFretboardLayout } from './layout';
import { crossingsAtY, distToPolygon, pointInPolygon, polyBounds, selfIntersections, signedArea } from './polygon';
import { DEFAULT_SPEC, PRESETS } from './presets';
import type { GuitarSpec } from './spec';

const clone = (s: GuitarSpec): GuitarSpec => structuredClone(s);

/** y values where the vertical line x = x0 crosses the polygon. */
function crossingsAtX(poly: readonly Vec2[], x0: number): number[] {
  const ys: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    if (a.x > x0 !== b.x > x0) ys.push(a.y + ((x0 - a.x) * (b.y - a.y)) / (b.x - a.x));
  }
  return ys;
}

function expectSimpleCCW(poly: Vec2[]) {
  expect(poly.length).toBeGreaterThan(3);
  for (const p of poly) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  const first = poly[0]!, last = poly[poly.length - 1]!;
  expect(first.x === last.x && first.y === last.y).toBe(false); // no repeated last point
  expect(signedArea(poly)).toBeGreaterThan(0);
  expect(selfIntersections(poly)).toEqual([]);
}

describe('body archetypes', () => {
  const ids = Object.keys(BODY_ARCHETYPES) as BodyArchetypeId[];
  it.each(ids)('%s: closed, CCW, simple, fills length × width exactly', (id) => {
    for (const [L, W] of [[400, 325], [470, 350], [300, 260]] as const) {
      const pts = bodyOutline(id, L, W);
      expectSimpleCCW(pts);
      const b = polyBounds(pts);
      expect(b.maxX - b.minX).toBeCloseTo(L, 1);
      expect(b.maxY - b.minY).toBeCloseTo(W, 1);
      // Anchor at the origin on the neck-end edge: the outline crosses (0, 0).
      expect(Math.min(...crossingsAtY(pts, 0))).toBeCloseTo(0, 9);
      const f = archetypeFrame(id);
      expect(b.minX).toBeCloseTo(-f.anchorU * L, 6);
    }
  });

  it.each(ids)('%s: throat widens for a wide neck and stays simple', (id) => {
    const pts = bodyOutline(id, 400, 325, 55);
    expectSimpleCCW(pts);
    // The neck-end edge is straight across |y| < 55 at x = 0.
    for (const y of [-48, 0, 48]) expect(pointInPolygon(v(0.5, y), pts)).toBe(true);
    for (const y of [-48, 0, 48]) expect(pointInPolygon(v(-0.5, y), pts)).toBe(false);
  });
});

describe('pickup routes', () => {
  it('positive slant moves the bass end toward the bridge', () => {
    const c = v(500, 0);
    const pts = pickupRoute('single', c, 10);
    const top = pts.reduce((a, b) => (b.y > a.y ? b : a));
    const bottom = pts.reduce((a, b) => (b.y < a.y ? b : a));
    expect(top.x).toBeGreaterThan(c.x);
    expect(bottom.x).toBeLessThan(c.x);
  });

  it.each(['single', 'humbucker', 'p90', 'bass-single', 'bass-split'] as const)('%s route is a simple CCW polygon of the right size', (t) => {
    const pts = pickupRoute(t, v(0, 0), 0);
    expectSimpleCCW(pts);
    const b = polyBounds(pts);
    const want = { single: [18, 90], humbucker: [40, 70], p90: [35, 86], 'bass-single': [22, 100], 'bass-split': [42, 96] }[t];
    expect(b.maxX - b.minX).toBeCloseTo(want[0]!, 6);
    expect(b.maxY - b.minY).toBeCloseTo(want[1]!, 6);
  });
});

describe.each(PRESETS.map((p) => [p.id, p.spec] as [string, GuitarSpec]))('preset %s', (_id, spec) => {
  const lay = buildFretboardLayout(spec);
  const g = buildBodyGeometry(spec, lay);

  it('outline is closed, CCW, non-self-intersecting and anchored at the joint fret', () => {
    expectSimpleCCW(g.outline);
    const anchor = jointFretCenter(spec, lay);
    expect(g.anchor).toEqual(anchor);
    const b = polyBounds(g.outline);
    expect(b.maxX - b.minX).toBeCloseTo(spec.body.length, 1);
    expect(b.maxY - b.minY).toBeCloseTo(spec.body.width, 1);
    // The neck-end edge on the centerline is exactly at the joint fret centre.
    const xs = g.outline.filter((p) => Math.abs(p.y) < 2).map((p) => p.x).filter((x) => x < anchor.x + 50);
    expect(Math.min(...xs)).toBeCloseTo(anchor.x, 6);
  });

  it('pocket follows the fretboard edges at the joint fret (+ clearance)', () => {
    const pocket = g.neckPocket!;
    const anchor = g.anchor!;
    const [nt, et, eb, nb] = lay.outline;
    const edgeY = (a: Vec2, b: Vec2, x: number) => a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x);
    const x = anchor.x + 0.5;
    const ys = crossingsAtX(pocket, x);
    if (spec.neck.joint === 'neck-through') return;
    expect(Math.min(...ys)).toBeCloseTo(edgeY(nt, et, x) - POCKET_CLEARANCE, 1);
    expect(Math.abs(Math.min(...ys) - (edgeY(nt, et, x) - POCKET_CLEARANCE))).toBeLessThan(0.2);
    expect(Math.abs(Math.max(...ys) - (edgeY(nb, eb, x) + POCKET_CLEARANCE))).toBeLessThan(0.2);
    // Heel matches the pocket minus clearance.
    const hy = crossingsAtX(g.neckHeel!, x);
    expect(Math.abs(Math.min(...hy) - edgeY(nt, et, x))).toBeLessThan(0.01);
    // Pocket sits inside the body (except its open mouth on the neck-end edge).
    for (const p of pocket) if (p.x > anchor.x + 0.5) expect(pointInPolygon(p, g.outline)).toBe(true);
  });

  it('pickup routes are inside the body and clear of the pocket', () => {
    expect(g.pickups).toHaveLength(spec.body.pickups.length);
    const sc = saddleCenter(lay);
    g.pickups.forEach((p, i) => {
      expect(p.center.x).toBeCloseTo(sc.x - spec.body.pickups[i]!.fromBridge, 9);
      for (const q of p.outline) expect(pointInPolygon(q, g.outline)).toBe(true);
      if (g.pocketEndX !== undefined && spec.neck.joint !== 'neck-through') {
        expect(polyBounds(p.outline).minX).toBeGreaterThanOrEqual(g.pocketEndX - 1e-9);
      }
    });
  });

  it('saddle line and compensated saddles are inside the body', () => {
    for (const p of [...g.saddleLine, ...lay.strings.map((s) => s.compensatedSaddle)]) expect(pointInPolygon(p, g.outline)).toBe(true);
  });

  it('control cavity is at least 10 mm inside the outline', () => {
    expect(g.cavities).toHaveLength(1);
    for (const p of g.cavities[0]!) {
      expect(pointInPolygon(p, g.outline)).toBe(true);
      expect(distToPolygon(p, g.outline)).toBeGreaterThanOrEqual(CAVITY_EDGE_WALL - 1e-6);
    }
  });
});

describe('neck pocket', () => {
  it('stops before the neck pickup instead of running into it', () => {
    const lay = buildFretboardLayout(DEFAULT_SPEC);
    const g = buildBodyGeometry(DEFAULT_SPEC, lay);
    const neckPickup = polyBounds(g.pickups[2]!.outline);
    expect(g.pocketShortenedBy).toBeGreaterThan(0);
    expect(g.pocketEndX).toBeCloseTo(neckPickup.minX - POCKET_PICKUP_WALL, 9);
  });

  it('uses the full heel length when nothing is in the way', () => {
    const s = clone(DEFAULT_SPEC);
    s.body.pickups = [{ type: 'humbucker', fromBridge: 40, angle: 0 }];
    s.neck.heelLength = 10;
    const lay = buildFretboardLayout(s);
    const g = buildBodyGeometry(s, lay);
    expect(g.pocketShortenedBy).toBe(0);
    const [, et, eb] = lay.outline;
    expect(g.pocketEndX).toBeCloseTo((et.x + eb.x) / 2 + 10, 6);
    expect(polyBounds(g.neckPocket!).maxX).toBeCloseTo(g.pocketEndX!, 9);
  });

  it('neck-through: centre strip to the tail, no heel', () => {
    const s = clone(DEFAULT_SPEC);
    s.neck.joint = 'neck-through';
    const g = buildBodyGeometry(s, buildFretboardLayout(s));
    expect(g.neckHeel).toBeNull();
    const b = polyBounds(g.neckPocket!);
    expect(b.minX).toBeCloseTo(g.anchor!.x, 9);
    expect(b.maxX).toBeGreaterThan(polyBounds(g.outline).maxX - 30);
    for (const p of g.neckPocket!) expect(distToPolygon(p, g.outline) < 0.5 || pointInPolygon(p, g.outline)).toBe(true);
  });
});

describe('custom outline', () => {
  it('is translated so its origin sits on the joint fret centre', () => {
    const s = clone(DEFAULT_SPEC);
    s.body.shape = 'custom';
    s.body.customOutline = [v(0, -150), v(380, -150), v(380, 150), v(0, 150)].reverse(); // CW on purpose
    const lay = buildFretboardLayout(s);
    const g = buildBodyGeometry(s, lay);
    const a = jointFretCenter(s, lay);
    expect(signedArea(g.outline)).toBeGreaterThan(0);
    const b = polyBounds(g.outline);
    expect(b.minX).toBeCloseTo(a.x, 9);
    expect(b.maxX).toBeCloseTo(a.x + 380, 9);
  });

  it('builds an empty outline when none was imported', () => {
    const s = clone(DEFAULT_SPEC);
    s.body.shape = 'custom';
    const g = buildBodyGeometry(s, buildFretboardLayout(s));
    expect(g.outline).toEqual([]);
    expect(g.cavities).toEqual([]);
  });
});
