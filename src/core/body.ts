// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Body top-view geometry, in the instrument top-view frame (origin = fret 0 on the centerline,
 * +x toward the bridge, +y = bass side, mm).
 * OWNER: wave-2 "body & layout" agent.
 *
 * Placement: the body's neck-end edge on the centerline (the archetype's "anchor", or the origin
 * of `spec.body.customOutline`) sits on the joint fret's centerline crossing (`FretLine.center` of
 * `neck.jointFret`). The body then runs `body.length` toward the bridge.
 *
 * Neck pocket (bolt-on / set-in): the fretboard edges continued from the joint fret to
 * `fretboard end + neck.heelLength`, widened by POCKET_CLEARANCE per side, square heel end with
 * POCKET_CORNER_R corners (router bit). If a pickup route would cut into it, the pocket is shortened
 * to stop POCKET_PICKUP_WALL before the route (`pocketShortenedBy` says by how much).
 * Neck-through: `neckPocket` is the centre-section strip (as wide as the board end) from the
 * neck-end edge to the tail.
 */
import type { Vec2 } from './geom';
import { add, lineIntersection, norm, perp, rotate, scale, sub, v } from './geom';
import { BODY_ARCHETYPES, bodyOutline } from './body-shapes';
import type { FretboardLayout } from './layout';
import { crossingsAtY, dedupeClosed, distToPolygon, ensureCCW, filletPolygon, pointInPolygon, polyBounds, polygonsOverlap, roundedRect } from './polygon';
import type { GuitarSpec, PickupType } from './spec';

export interface BodyGeometry {
  /** Closed body outline, CCW, no repeated last point. */
  outline: Vec2[];
  /** Neck pocket (bolt-on / set-in) or neck-through centre-section outline; null if none. */
  neckPocket: Vec2[] | null;
  /** Neck heel outline in top view (matches the pocket minus clearance); null for neck-through. */
  neckHeel: Vec2[] | null;
  pickups: { type: PickupType; outline: Vec2[]; center: Vec2; angle: number }[];
  /** Control cavity outline(s) on the back. */
  cavities: Vec2[][];
  /** Uncompensated saddle line, copied from the layout for convenience. */
  saddleLine: [Vec2, Vec2];
  /** Neck-end edge of the body on the centerline (= joint fret centre). */
  anchor?: Vec2;
  /** x of the pocket's heel end (bolt-on / set-in) or of the strip's tail end (neck-through). */
  pocketEndX?: number;
  /** How much the pocket was shortened to clear a pickup route (0 = full heel length). */
  pocketShortenedBy?: number;
}

/** Gap between the neck heel and the pocket wall, per side. */
export const POCKET_CLEARANCE = 0.1;
/** Router-bit radius left in the heel-end corners of the pocket. */
export const POCKET_CORNER_R = 6;
/** Wood left between the pocket end and a pickup route when the pocket is shortened. */
export const POCKET_PICKUP_WALL = 3;
/** Shortest pocket kept even when a pickup sits in the way (the overlap is then reported). */
export const POCKET_MIN_LENGTH = 20;
/** Wood between the pocket side and the body edge at the throat. */
export const THROAT_WALL = 6;
/** Control cavity: minimum distance from the body edge, and from pickup routes (plan view). */
export const CAVITY_EDGE_WALL = 10;
export const CAVITY_PICKUP_GAP = 5;

/** Route footprint per pickup type: `across` the strings (y) × `along` them (x), corner radius. */
export const PICKUP_ROUTES: Record<PickupType, { across: number; along: number; r: number }> = {
  single: { across: 90, along: 18, r: 9 },
  humbucker: { across: 70, along: 40, r: 3 },
  p90: { across: 86, along: 35, r: 4 },
  'bass-single': { across: 100, along: 22, r: 8 },
  /** Each half; the two halves are staggered (bass half toward the neck). */
  'bass-split': { across: 52, along: 22, r: 3 },
};

/** Route outline of one pickup at `center`, slanted `angle`° (positive = bass end toward the bridge). */
export function pickupRoute(type: PickupType, center: Vec2, angle: number): Vec2[] {
  const d = PICKUP_ROUTES[type];
  let local: Vec2[];
  if (type === 'bass-split') {
    // Treble half toward the bridge, bass half toward the neck; they overlap 2 mm along x and
    // 8 mm across the centerline, so the union is one simple route.
    const yo = 4; // each half crosses the centerline by this much
    const a = { x0: -1, x1: -1 + d.along, y0: yo - d.across, y1: yo }; // treble half
    const b = { x0: 1 - d.along, x1: 1, y0: -yo, y1: d.across - yo }; // bass half
    const raw = [
      v(a.x0, a.y0), v(a.x1, a.y0), v(a.x1, a.y1), v(b.x1, a.y1),
      v(b.x1, b.y1), v(b.x0, b.y1), v(b.x0, b.y0), v(a.x0, b.y0),
    ];
    local = filletPolygon(raw, (_i, convex) => (convex ? d.r : 0));
  } else {
    local = roundedRect(v(0, 0), d.along, d.across, d.r);
  }
  const rad = (-angle * Math.PI) / 180;
  return local.map((p) => add(rotate(p, rad), center));
}

interface EdgeLine {
  p: Vec2;
  d: Vec2;
}
const yOn = (l: EdgeLine, x: number): Vec2 => add(l.p, scale(l.d, (x - l.p.x) / l.d.x));

/** Fretboard edge lines pushed outward by `off` mm (treble toward −y, bass toward +y). */
function edgeLines(layout: FretboardLayout, off: number): { t: EdgeLine; b: EdgeLine } {
  const [nt, et, eb, nb] = layout.outline;
  const dT = norm(sub(et, nt));
  const dB = norm(sub(eb, nb));
  return {
    t: { p: add(nt, scale(perp(dT), -off)), d: dT },
    b: { p: add(nb, scale(perp(dB), off)), d: dB },
  };
}

/** Square-ended strip between two edge lines from x0 to x1, heel corners rounded. CCW. */
function pocketPolygon(layout: FretboardLayout, off: number, x0: number, x1: number, r: number): Vec2[] {
  const { t, b } = edgeLines(layout, off);
  const raw = [yOn(t, x0), yOn(t, x1), yOn(b, x1), yOn(b, x0)];
  return filletPolygon(raw, (i) => (i === 1 || i === 2 ? r : 0));
}

/** Point where the fretboard's end line crosses the centerline. */
function boardEndCenter(layout: FretboardLayout): Vec2 {
  const [, et, eb] = layout.outline;
  return lineIntersection(et, eb, v(0, 0), v(1, 0)) ?? v((et.x + eb.x) / 2, 0);
}

/** Saddle line crossing of the centerline. */
export function saddleCenter(layout: FretboardLayout): Vec2 {
  const [st, sb] = layout.saddleLine;
  return lineIntersection(st, sb, v(0, 0), v(1, 0)) ?? v((st.x + sb.x) / 2, 0);
}

export function jointFretCenter(spec: GuitarSpec, layout: FretboardLayout): Vec2 {
  const n = Math.max(0, Math.min(spec.neck.jointFret, layout.frets.length - 1));
  const f = layout.frets[n]!;
  return f.center ?? lineIntersection(f.treble, f.bass, v(0, 0), v(1, 0)) ?? v((f.treble.x + f.bass.x) / 2, 0);
}

/** Body outline in the top-view frame (no pocket / pickups). Empty when 'custom' has no outline. */
export function placedOutline(spec: GuitarSpec, anchor: Vec2, throatHalf: number): Vec2[] {
  const b = spec.body;
  if (b.shape === 'custom') {
    const pts = b.customOutline ?? [];
    if (pts.length < 3) return [];
    return ensureCCW(dedupeClosed(pts.map((p) => v(p.x + anchor.x, p.y + anchor.y))));
  }
  return bodyOutline(b.shape, b.length, b.width, throatHalf).map((p) => v(p.x + anchor.x, p.y + anchor.y));
}

/** Coarse copy of a polygon for distance checks (every k-th point). */
const coarse = (poly: readonly Vec2[], k: number): Vec2[] => poly.filter((_, i) => i % k === 0);

/** Control cavity near the lower bout (treble side), ≥ CAVITY_EDGE_WALL inside the outline. */
function placeCavity(spec: GuitarSpec, outline: Vec2[], pickups: Vec2[][], anchor: Vec2): Vec2[] | null {
  if (outline.length < 3) return null;
  const bb = polyBounds(outline);
  const pref =
    spec.body.shape === 'custom' ? { u: 0.76, w: -0.27 } : BODY_ARCHETYPES[spec.body.shape].cavity;
  const target = v(bb.minX + pref.u * (bb.maxX - bb.minX), anchor.y + pref.w * (bb.maxY - bb.minY));
  const bass = spec.meta.instrument === 'bass';
  const W = bass ? 100 : 80;
  const H = bass ? 56 : 50;
  const R = 14;
  const k = Math.max(1, Math.floor(outline.length / 400));
  const ol = coarse(outline, k);
  // Coarse sampling can miss up to a chord's sagitta; keep a small safety margin.
  const wall = CAVITY_EDGE_WALL + 0.5;
  const offsets: Vec2[] = [];
  for (let dx = -60; dx <= 60; dx += 10) for (let dy = -40; dy <= 40; dy += 10) offsets.push(v(dx, dy));
  offsets.sort((a, b) => a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y));
  for (const s of [1, 0.9, 0.8, 0.7, 0.6, 0.5]) {
    for (const o of offsets) {
      const c = add(target, o);
      if (!pointInPolygon(c, outline)) continue;
      const probe = roundedRect(c, W * s, H * s, R * s, 0, 1);
      if (!probe.every((p) => pointInPolygon(p, outline) && distToPolygon(p, ol) >= wall)) continue;
      if (pickups.some((pk) => polygonsOverlap(probe, pk) || probe.some((p) => distToPolygon(p, pk) < CAVITY_PICKUP_GAP))) continue;
      return roundedRect(c, W * s, H * s, R * s);
    }
  }
  return null;
}

export function buildBodyGeometry(spec: GuitarSpec, layout: FretboardLayout): BodyGeometry {
  const anchor = jointFretCenter(spec, layout);
  const sc = saddleCenter(layout);

  // Pickups first: they can limit the pocket length.
  const pickups = spec.body.pickups.map((p) => {
    const center = v(sc.x - p.fromBridge, 0);
    return { type: p.type, outline: pickupRoute(p.type, center, p.angle), center, angle: p.angle };
  });

  const joint = spec.neck.joint;
  const off = POCKET_CLEARANCE;
  const halfAt = (x: number) => {
    const { t, b } = edgeLines(layout, off);
    return Math.max(-yOn(t, x).y, yOn(b, x).y);
  };

  let neckPocket: Vec2[] | null = null;
  let neckHeel: Vec2[] | null = null;
  let pocketEndX: number | undefined;
  let pocketShortenedBy = 0;
  let throatHalf: number;
  const finish = (outline: Vec2[]): BodyGeometry => {
    const cav = placeCavity(spec, outline, pickups.map((p) => p.outline), anchor);
    return {
      outline,
      neckPocket,
      neckHeel,
      pickups,
      cavities: cav ? [cav] : [],
      saddleLine: layout.saddleLine,
      anchor,
      pocketEndX,
      pocketShortenedBy,
    };
  };

  if (joint === 'neck-through') {
    const [, et, eb] = layout.outline;
    const h = Math.max(Math.abs(et.y), Math.abs(eb.y));
    throatHalf = h + THROAT_WALL;
    const outline = placedOutline(spec, anchor, throatHalf);
    if (outline.length >= 3) {
      const tail = (y: number) => Math.max(anchor.x + 1, ...crossingsAtY(outline, y));
      pocketEndX = Math.min(tail(-h), tail(h), tail(0));
      neckPocket = [v(anchor.x, -h), v(pocketEndX, -h), v(pocketEndX, h), v(anchor.x, h)];
    }
    return finish(outline);
  }

  const wanted = boardEndCenter(layout).x + spec.neck.heelLength;
  let endX = wanted;
  const hEnd = halfAt(wanted);
  for (const p of pickups) {
    const b = polyBounds(p.outline);
    if (b.minX <= anchor.x || b.maxY < -hEnd - POCKET_PICKUP_WALL || b.minY > hEnd + POCKET_PICKUP_WALL) continue;
    endX = Math.min(endX, b.minX - POCKET_PICKUP_WALL);
  }
  endX = Math.max(endX, anchor.x + POCKET_MIN_LENGTH);
  pocketShortenedBy = Math.max(0, wanted - endX);
  pocketEndX = endX;
  neckPocket = pocketPolygon(layout, off, anchor.x, endX, POCKET_CORNER_R);
  neckHeel = pocketPolygon(layout, 0, anchor.x, endX, POCKET_CORNER_R - off);
  throatHalf = halfAt(anchor.x) + THROAT_WALL;
  return finish(placedOutline(spec, anchor, throatHalf));
}
