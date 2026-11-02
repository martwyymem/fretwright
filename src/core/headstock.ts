// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Headstock top-view geometry, in the instrument top-view frame (headstock at x < 0).
 * OWNER: wave-2 "neck & headstock" agent. Interface is the contract (full-layout uses it).
 *
 * Conventions:
 * - Reference point = where the nut's FRONT face (bridge side) crosses the centerline (`nutCenter`).
 *   `headstock.length` is measured from there along −x to the tip; the tip is at x = nutCenter.x − length.
 * - Headstock-local frame (used for the built-in shapes and for `customOutline`): origin at `nutCenter`,
 *   +u toward the TIP (= our −x), +y = bass side (unchanged). Global = (nutCenter.x − u, y).
 * - Right-handed instrument: an inline headstock carries all tuners on the BASS side, i.e. the +y (top) edge.
 * - The outline starts exactly at the fretboard's bass corner at the board start (layout.outline[3]),
 *   runs out along the bass side to the tip, back along the treble side and ends exactly at the treble
 *   corner (layout.outline[0]); the closing segment runs across the board start. The first and last
 *   curve pieces leave the fretboard edges tangentially (G1), forming the fillet-like transition.
 * - Tuner groups: strings on one side are served nearest-first from the outermost string inward, so
 *   strings fan out without crossing the other posts (inline: the bass string has the post nearest the
 *   nut, the treble string the farthest). Posts sit on a straight line parallel to the centerline.
 *
 * Shapes are original generic archetypes, not copies of any manufacturer's headstock.
 */
import type { Vec2 } from './geom';
import { add, dist, flattenCubic, lineIntersection, norm, scale, sub, v } from './geom';
import type { FretboardLayout } from './layout';
import type { GuitarSpec } from './spec';

export interface TunerHole {
  /** String this tuner serves (0 = treble). */
  stringIndex: number;
  center: Vec2;
  diameter: number;
  /** Which side of the headstock the tuner is on. */
  side?: 'bass' | 'treble';
}

export interface HeadstockGeometry {
  /** Closed outline (no repeated last point), including the neck-to-headstock transition, CCW. */
  outline: Vec2[];
  tuners: TunerHole[];
  /** Nut line [treble, bass] the headstock template aligns to (the nut's front face, clipped to the edges). */
  nutLine: [Vec2, Vec2];
  /** Optional string paths from nut to tuner posts, for the template. */
  stringPaths?: [Vec2, Vec2][];
  /** Where the nut's front face crosses the centerline; `headstock.length` is measured from here. */
  nutCenter?: Vec2;
  /** Assumed tuner post diameter used for the string paths (string touches the post's inner side). */
  postDiameter?: number;
}

/** Clearance required from a tuner hole's edge to the headstock edge (mm). */
export const TUNER_EDGE_CLEARANCE = 4;
/** Minimum centre-to-centre tuner spacing as a multiple of the hole diameter. */
export const TUNER_MIN_PITCH = 1.2;
/** Preferred centre-to-centre tuner spacing as a multiple of the hole diameter (room for the keys). */
export const TUNER_PREF_PITCH = 2;
/** Post diameter as a fraction of the hole diameter (bushing holes are larger than the post). */
export const POST_FRACTION = 0.6;
/** Extra safety added to the clearance when placing tuners, so flattening never breaks the rule. */
const PLACE_MARGIN = 1.5;
/** Spacing (mm) traded per mm the tuner line moves inward from the edge. */
const INWARD_COST = 0.5;

// ---------------------------------------------------------------------------
// Polygon helpers
// ---------------------------------------------------------------------------

export function signedArea(poly: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Even-odd point-in-polygon test. */
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
  const d = sub(b, a);
  const l2 = d.x * d.x + d.y * d.y;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / l2));
  return dist(p, add(a, scale(d, t)));
}

/** Distance from p to the boundary of a closed polygon. */
export function distToPolygon(p: Vec2, poly: readonly Vec2[]): number {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) m = Math.min(m, distToSegment(p, poly[i]!, poly[(i + 1) % poly.length]!));
  return m;
}

// ---------------------------------------------------------------------------
// Outline construction
// ---------------------------------------------------------------------------

/** Waypoint in the headstock-local frame (u toward the tip, y bass side), with a unit tangent. */
interface Wp {
  p: Vec2;
  /** Unit tangent; omitted = automatic (Catmull-Rom: direction from the previous to the next point). */
  d?: Vec2;
  /** Tangent length factor for the segment ENDING here and the one STARTING here (default 1). */
  k?: number;
}

const dirDeg = (deg: number): Vec2 => v(Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180));
/** Waypoint with an explicit tangent (degrees; 0 = toward the tip, 90 = bass side, 180 = toward the nut). */
const wp = (u: number, y: number, deg: number, k?: number): Wp => ({ p: v(u, y), d: dirDeg(deg), k });
/** Waypoint with an automatic tangent. */
const ap = (u: number, y: number): Wp => ({ p: v(u, y) });

/** Hermite chain through the waypoints, flattened (≤ 0.05 mm). */
function hermiteChain(pts: Wp[]): Vec2[] {
  const dirs = pts.map((w, i) => w.d ?? norm(sub(pts[Math.min(i + 1, pts.length - 1)]!.p, pts[Math.max(i - 1, 0)]!.p)));
  const out: Vec2[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const c = dist(a.p, b.p);
    const ka = ((a.k ?? 1) * c) / 3;
    const kb = ((b.k ?? 1) * c) / 3;
    const seg = flattenCubic(a.p, add(a.p, scale(dirs[i]!, ka)), sub(b.p, scale(dirs[i + 1]!, kb)), b.p);
    out.push(...(i === 0 ? seg : seg.slice(1)));
  }
  return out;
}

/** Mirror the bass-side waypoints (outward order) to treble-side waypoints (return order). */
function mirrorReturn(bass: Wp[]): Wp[] {
  return [...bass].reverse().map((w) => ({ p: v(w.p.x, -w.p.y), d: w.d ? v(-w.d.x, w.d.y) : undefined, k: w.k }));
}

interface Frame {
  xRef: number;
  toGlobal: (p: Vec2) => Vec2;
  toLocal: (p: Vec2) => Vec2;
  /** Junctions in local coords and their tangents pointing toward the tip (bass) / toward the nut (treble). */
  jb: Wp;
  jt: Wp;
}

function makeFrame(layout: FretboardLayout): Frame {
  const [nt, et, eb, nb] = layout.outline;
  const c = lineIntersection(layout.nut[0]!, layout.nut[1]!, v(0, 0), v(1, 0)) ?? v(0, 0);
  const xRef = c.x;
  const toGlobal = (p: Vec2) => v(xRef - p.x, p.y);
  const toLocal = (p: Vec2) => v(xRef - p.x, p.y);
  const back = (from: Vec2, to: Vec2) => {
    const g = norm(sub(from, to)); // board start minus board end: toward the headstock
    return v(-g.x, g.y);
  };
  const tb = back(nb, eb);
  const tt = back(nt, et);
  return {
    xRef,
    toGlobal,
    toLocal,
    jb: { p: toLocal(nb), d: tb },
    jt: { p: toLocal(nt), d: v(-tt.x, -tt.y) }, // arriving at the treble corner heading toward the nut
  };
}

interface ShapePlan {
  wps: Wp[];
  /** Intended extreme y on the bass / treble side (the outline is squeezed to stay within). */
  yHi: number;
  yLo: number;
}

/** Waypoints from the bass junction, out to the tip and back to the treble junction (local frame). */
function shapePlan(spec: GuitarSpec, f: Frame): ShapePlan {
  const hs = spec.headstock;
  const L = hs.length;
  const neckHalf = Math.max(f.jb.p.y, -f.jt.p.y);
  const W = Math.max(hs.width, 2 * neckHalf + 2);
  const u0 = Math.max(f.jb.p.x, f.jt.p.x);
  const span = Math.max(L - u0, 10);
  const at = (t: number) => u0 + span * t; // fraction of the free length behind the board start
  const { jb, jt } = f;

  switch (hs.shape) {
    case 'inline': {
      // Long straight-ish bass edge carrying the tuners, a slanted, gently convex end whose farthest
      // point is on the treble side, and a nearly straight treble edge with a shallow fillet at the neck.
      const yLo = Math.min(jt.p.y - Math.max(3, 0.08 * W), -neckHalf - 1);
      const yHi = yLo + W;
      return {
        yHi,
        yLo,
        wps: [
          jb,
          ap(at(0.24), yHi - 0.11 * W),
          wp(at(0.45), yHi, 0),
          wp(L - 0.3 * W, yHi - 0.015 * W, -6),
          wp(L - 0.16 * W, yHi - 0.12 * W, -60),
          wp(L, yLo + 0.2 * W, -90),
          wp(L - 0.1 * W, yLo + 0.01 * W, 192),
          wp(at(0.55), yLo, 180),
          jt,
        ],
      };
    }
    case 'split': {
      // Symmetric, widest just past the middle, with a shallow notch in the middle of the tip.
      const h = W / 2;
      const bass = [ap(at(0.25), 0.78 * h), wp(at(0.55), h, 0), ap(at(0.86), 0.93 * h), wp(L - 0.03 * span, 0.6 * h, -65), wp(L, 0.25 * h, -90)];
      return { yHi: h, yLo: -h, wps: [jb, ...bass, wp(L - Math.min(6, 0.03 * span), 0, -90), ...mirrorReturn(bass), jt] };
    }
    case 'split-offset': {
      const yHi = 0.55 * W;
      const yLo = yHi - W;
      return {
        yHi,
        yLo,
        wps: [
          jb,
          ap(at(0.2), 0.82 * yHi),
          wp(at(0.5), yHi, 0),
          wp(at(0.85), 0.92 * yHi, -20),
          wp(L, 0.25 * yHi, -90),
          wp(L - 0.03 * span, 0.7 * yLo, -125),
          wp(at(0.72), yLo, 180),
          ap(at(0.5), 0.82 * yLo),
          wp(at(0.3), Math.min(0.6 * yLo, jt.p.y - 2), 174),
          jt,
        ],
      };
    }
    case 'paddle':
    case 'custom': {
      // Simple tapered blank: widens slightly toward a square, softly rounded tip.
      const h = W / 2;
      const r = Math.min(8, 0.15 * h);
      const uS = Math.min(u0 + 25, u0 + 0.3 * span);
      const h0 = Math.max(0.9 * h, neckHalf + 1);
      const taper = (Math.atan2(h - h0, L - r - uS) * 180) / Math.PI;
      const bass = [wp(uS, h0, taper), wp(L - r, h, taper, 1.17), wp(L, h - r, -90, 1.17)];
      return { yHi: h, yLo: -h, wps: [jb, ...bass, ...mirrorReturn(bass), jt] };
    }
  }
}

/** Squeeze y beyond the neck edges so the outline stays within [yLo, yHi] (removes curve overshoot). */
function squeeze(pts: Vec2[], plan: ShapePlan, f: Frame): Vec2[] {
  const yb = f.jb.p.y;
  const yt = f.jt.p.y;
  const maxY = Math.max(...pts.map((p) => p.y));
  const minY = Math.min(...pts.map((p) => p.y));
  const kb = maxY > plan.yHi && plan.yHi > yb ? (plan.yHi - yb) / (maxY - yb) : 1;
  const kt = minY < plan.yLo && plan.yLo < yt ? (yt - plan.yLo) / (yt - minY) : 1;
  return pts.map((p) => (p.y > yb ? v(p.x, yb + (p.y - yb) * kb) : p.y < yt ? v(p.x, yt + (p.y - yt) * kt) : p));
}

function customOutline(spec: GuitarSpec, f: Frame): Vec2[] | null {
  const c = spec.headstock.customOutline;
  if (!c || c.length < 3) return null;
  const pts = c.map((p) => f.toGlobal(v(p.x, p.y)));
  return signedArea(pts) < 0 ? pts.reverse() : pts;
}

// ---------------------------------------------------------------------------
// Tuners
// ---------------------------------------------------------------------------

/** Number of tuners on the bass side for N strings. */
export function bassSideCount(spec: GuitarSpec): number {
  const N = spec.strings.gauges.length;
  switch (spec.headstock.shape) {
    case 'inline':
      return N;
    case 'split-offset':
      return Math.min(N, Math.ceil((N * 2) / 3));
    default:
      return Math.ceil(N / 2);
  }
}

interface Interval {
  lo: number;
  hi: number;
}

/** Longest u-interval on the line y = yLine where a hole centre keeps `need` clearance inside the outline. */
function feasible(outline: Vec2[], xRef: number, yLine: number, need: number, uMax: number): Interval | null {
  const step = 1;
  let best: Interval | null = null;
  let cur: number | null = null;
  for (let u = 0; u <= uMax + step; u += step) {
    const p = v(xRef - u, yLine);
    const ok = u <= uMax && pointInPolygon(p, outline) && distToPolygon(p, outline) >= need;
    if (ok && cur === null) cur = u;
    if (!ok && cur !== null) {
      const iv = { lo: cur + step, hi: u - 2 * step }; // shrink by one sample each side: conservative
      if (iv.hi >= iv.lo && (!best || iv.hi - iv.lo > best.hi - best.lo)) best = iv;
      cur = null;
    }
  }
  return best;
}

/**
 * Place one side's tuners on a line parallel to the centerline. Candidate lines step inward from the
 * outermost one that keeps the edge clearance; the line giving the largest spacing (up to the
 * preferred pitch) wins, ties going to the outer line. Lines stay clear of the group's outermost
 * string at the nut, so strings fan out without touching other posts.
 */
function placeGroup(
  spec: GuitarSpec,
  outline: Vec2[],
  xRef: number,
  side: 1 | -1,
  strings: number[],
  innerLimit: number,
): TunerHole[] {
  const n = strings.length;
  if (n === 0) return [];
  const d = spec.headstock.tunerHoleDiameter;
  const need = d / 2 + TUNER_EDGE_CLEARANCE + PLACE_MARGIN;
  const ys = outline.map((p) => p.y);
  const ySide = side > 0 ? Math.max(...ys) : Math.min(...ys);
  const uMax = spec.headstock.length + 50;
  const pref = TUNER_PREF_PITCH * d;
  let best: { y: number; iv: Interval; pitch: number; score: number } | null = null;
  for (let k = 0; k <= 40; k++) {
    const y = ySide - side * (need + k);
    if (side * y < innerLimit) break;
    const iv = feasible(outline, xRef, y, need, uMax);
    if (!iv) continue;
    const pitch = n > 1 ? Math.min(pref, (iv.hi - iv.lo) / (n - 1)) : pref;
    // Wider spacing is better, but each mm away from the edge costs half a mm of spacing.
    const score = pitch - INWARD_COST * k;
    if (!best || score > best.score + 1e-9) best = { y, iv, pitch, score };
    if (pitch >= pref) break;
  }
  const L = spec.headstock.length;
  const pick = best ?? { y: ySide / 2, iv: { lo: 0.3 * L, hi: 0.9 * L }, pitch: n > 1 ? (0.6 * L) / (n - 1) : 0 };
  const len = pick.iv.hi - pick.iv.lo;
  const pitch = n > 1 ? pick.pitch : 0;
  const start = pick.iv.lo + (len - pitch * (n - 1)) / 2;
  return strings.map((s, i) => ({
    stringIndex: s,
    center: v(xRef - (start + i * pitch), pick.y),
    diameter: d,
    side: side > 0 ? 'bass' : 'treble',
  }));
}

/** Tangent point on circle (c, r) seen from p, on the side with the smaller `side`·y (toward the centerline). */
function innerTangent(p: Vec2, c: Vec2, r: number, side: 1 | -1): Vec2 {
  const dd = dist(p, c);
  if (dd <= r) return c;
  const base = Math.atan2(p.y - c.y, p.x - c.x);
  const a = Math.acos(r / dd);
  const t1 = v(c.x + r * Math.cos(base + a), c.y + r * Math.sin(base + a));
  const t2 = v(c.x + r * Math.cos(base - a), c.y + r * Math.sin(base - a));
  return side * t1.y < side * t2.y ? t1 : t2;
}

// ---------------------------------------------------------------------------

export function buildHeadstockGeometry(spec: GuitarSpec, layout: FretboardLayout): HeadstockGeometry {
  const f = makeFrame(layout);
  const [nt, , , nb] = layout.outline;
  let outline = spec.headstock.shape === 'custom' ? customOutline(spec, f) : null;
  if (!outline) {
    const plan = shapePlan(spec, f);
    const L = spec.headstock.length;
    outline = squeeze(hermiteChain(plan.wps), plan, f).map((p) => f.toGlobal(v(Math.min(p.x, L), p.y)));
    // Pin the junctions exactly on the fretboard corners.
    outline[0] = v(nb.x, nb.y);
    outline[outline.length - 1] = v(nt.x, nt.y);
  }

  const N = spec.strings.gauges.length;
  const nb2 = bassSideCount(spec);
  const bassStrings = Array.from({ length: nb2 }, (_, i) => N - 1 - i); // outermost (bass) first = nearest the nut
  const trebleStrings = Array.from({ length: N - nb2 }, (_, i) => i); // string 1 nearest the nut
  // Post lines stay this far outside the group's outermost string (at the nut) so strings clear the posts.
  const postD = POST_FRACTION * spec.headstock.tunerHoleDiameter;
  const limit = (i: number | undefined, side: 1 | -1) =>
    i === undefined ? 0 : Math.max(0, side * layout.strings[i]!.nut.y + postD / 2 + 4);
  const tuners = [
    ...placeGroup(spec, outline, f.xRef, 1, bassStrings, limit(bassStrings[0], 1)),
    ...placeGroup(spec, outline, f.xRef, -1, trebleStrings, limit(trebleStrings[0], -1)),
  ].sort((a, b) => a.stringIndex - b.stringIndex);

  // String paths: from where each string crosses the nut's back face to the inner side of its post.
  const nutBackA = layout.nut[3]!;
  const nutBackB = layout.nut[2]!;
  const stringPaths: [Vec2, Vec2][] = tuners.map((t) => {
    const s = layout.strings[t.stringIndex]!;
    const start = lineIntersection(s.saddle, s.nut, nutBackA, nutBackB) ?? s.nut;
    return [start, innerTangent(start, t.center, postD / 2, t.side === 'treble' ? -1 : 1)];
  });

  return {
    outline,
    tuners,
    nutLine: [layout.nut[0]!, layout.nut[1]!],
    stringPaths,
    nutCenter: v(f.xRef, 0),
    postDiameter: postD,
  };
}
