// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Polygon helpers for body geometry, validation and outline import. Polygons are arrays of
 * points, implicitly closed (no repeated last point), mm, +y up.
 */
import type { Vec2 } from './geom';
import { add, arcPoints, cross, dist, dot, len, norm, rotate, scale, sub, v } from './geom';

/** Signed area (shoelace): positive = counter-clockwise. */
export function signedArea(poly: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export const ensureCCW = (poly: readonly Vec2[]): Vec2[] => (signedArea(poly) < 0 ? [...poly].reverse() : [...poly]);

export function polyBounds(poly: readonly Vec2[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Even-odd point-in-polygon (boundary points may go either way). */
export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return dist(p, add(a, scale(ab, t)));
}

/** Distance from p to the polygon's boundary. */
export function distToPolygon(p: Vec2, poly: readonly Vec2[]): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distToSegment(p, poly[i]!, poly[(i + 1) % poly.length]!));
  return d;
}

/** Proper or touching intersection of segments ab and cd. */
export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => cross(sub(q, p), sub(r, p));
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = (p: Vec2, q: Vec2, r: Vec2) =>
    Math.min(p.x, q.x) - 1e-12 <= r.x && r.x <= Math.max(p.x, q.x) + 1e-12 && Math.min(p.y, q.y) - 1e-12 <= r.y && r.y <= Math.max(p.y, q.y) + 1e-12;
  return (d1 === 0 && on(c, d, a)) || (d2 === 0 && on(c, d, b)) || (d3 === 0 && on(a, b, c)) || (d4 === 0 && on(a, b, d));
}

/** True if the two polygons' areas overlap (edges cross, or one contains the other). */
export function polygonsOverlap(A: readonly Vec2[], B: readonly Vec2[]): boolean {
  const bb = polyBounds(B);
  const ba = polyBounds(A);
  if (ba.maxX < bb.minX || bb.maxX < ba.minX || ba.maxY < bb.minY || bb.maxY < ba.minY) return false;
  for (let i = 0; i < A.length; i++) {
    const a1 = A[i]!, a2 = A[(i + 1) % A.length]!;
    if (Math.max(a1.x, a2.x) < bb.minX || Math.min(a1.x, a2.x) > bb.maxX || Math.max(a1.y, a2.y) < bb.minY || Math.min(a1.y, a2.y) > bb.maxY) continue;
    for (let j = 0; j < B.length; j++) if (segmentsIntersect(a1, a2, B[j]!, B[(j + 1) % B.length]!)) return true;
  }
  return pointInPolygon(A[0]!, B) || pointInPolygon(B[0]!, A);
}

/** Index pairs of non-adjacent edges that intersect (empty = simple polygon). O(n²); for tests/validation. */
export function selfIntersections(poly: readonly Vec2[], limit = 1): [number, number][] {
  const n = poly.length;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i]!, b = poly[(i + 1) % n]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the closing edge
      if (segmentsIntersect(a, b, poly[j]!, poly[(j + 1) % n]!)) {
        out.push([i, j]);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

/** Points where the horizontal line y = y0 crosses the polygon's edges (x values, unsorted). */
export function crossingsAtY(poly: readonly Vec2[], y0: number): number[] {
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    if (a.y > y0 !== b.y > y0) xs.push(a.x + ((y0 - a.y) * (b.x - a.x)) / (b.y - a.y));
  }
  return xs;
}

/**
 * Round polygon corners with tangent arcs (flattened, ≤ tolerance). `radius(i)` gives the radius for
 * vertex i (0 = keep sharp). The radius shrinks if the neighbouring edges are too short.
 * Works for either winding; arcs bulge the right way for convex and concave corners.
 */
export function filletPolygon(poly: readonly Vec2[], radius: number | ((i: number, convex: boolean) => number), tolerance = 0.05): Vec2[] {
  const ccw = signedArea(poly) >= 0;
  const out: Vec2[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    const a = poly[(i + n - 1) % n]!;
    const b = poly[(i + 1) % n]!;
    const turn = cross(sub(p, a), sub(b, p));
    const convex = ccw ? turn > 0 : turn < 0;
    let r = typeof radius === 'number' ? radius : radius(i, convex);
    const u1 = norm(sub(a, p));
    const u2 = norm(sub(b, p));
    const cosT = Math.max(-1, Math.min(1, dot(u1, u2)));
    const theta = Math.acos(cosT); // interior angle between the edges at p
    if (r <= 0 || theta < 1e-6 || Math.PI - theta < 1e-6) {
      out.push(p);
      continue;
    }
    let d = r / Math.tan(theta / 2);
    const dMax = Math.min(dist(a, p), dist(b, p)) / 2;
    if (d > dMax) {
      d = dMax;
      r = d * Math.tan(theta / 2);
    }
    const t1 = add(p, scale(u1, d));
    const c = add(p, scale(norm(add(u1, u2)), r / Math.sin(theta / 2)));
    const a0 = Math.atan2(t1.y - c.y, t1.x - c.x);
    const sweep = Math.PI - theta;
    // Turning left (turn > 0) → arc runs counter-clockwise.
    out.push(...arcPoints(c, r, a0, turn > 0 ? a0 + sweep : a0 - sweep, tolerance));
  }
  return dedupeClosed(out);
}

/** Drop consecutive duplicates and a repeated closing point. */
export function dedupeClosed(pts: readonly Vec2[], eps = 1e-6): Vec2[] {
  const out: Vec2[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || len(sub(p, q)) > eps) out.push(p);
  }
  while (out.length > 1 && len(sub(out[0]!, out[out.length - 1]!)) <= eps) out.pop();
  return out;
}

/** Axis-aligned rounded rectangle centred on c (w along x, h along y), CCW, rotated by `deg`. */
export function roundedRect(c: Vec2, w: number, h: number, r: number, deg = 0, tolerance = 0.05): Vec2[] {
  const hw = w / 2, hh = h / 2;
  const box = [v(-hw, -hh), v(hw, -hh), v(hw, hh), v(-hw, hh)];
  const rr = Math.min(r, hw, hh);
  const rounded = rr > 0 ? filletPolygon(box, rr, tolerance) : box;
  const rad = (deg * Math.PI) / 180;
  return rounded.map((p) => add(rotate(p, rad), c));
}
