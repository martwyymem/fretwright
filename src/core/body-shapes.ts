// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Generic body archetypes. These are ORIGINAL outlines drawn for Fretwright (not traced from, or
 * copies of, any manufacturer's body); they only share the broad family traits every builder
 * knows (horns, waist, lower bout).
 *
 * Each archetype is a closed cubic Bézier path given as smooth "nodes" in a reference frame
 * (mm, drawn at a typical size): x runs from the neck end (x = 0 is the most neck-ward point,
 * usually a horn tip) to the tail, y across the body, +y = bass side, centerline at y = 0.
 * `anchorX` is the neck-pocket anchor: where the body's neck-end edge crosses the centerline.
 * Between the two `throat` nodes the neck-end edge is straight and square to the centerline,
 * so a pocket of any width up to the throat opens cleanly onto it.
 *
 * `bodyOutline()` scales a shape to the requested length × width (independently along and across,
 * so it fills the box exactly), widens the throat if the neck is wider than drawn, flattens it
 * with `flattenCubic` (≤ 0.05 mm) and returns it in the BODY-LOCAL frame: origin at the anchor,
 * +x toward the tail, +y bass side (the same frame as `spec.body.customOutline`).
 */
import type { Vec2 } from './geom';
import { flattenCubic, v } from './geom';
import type { BodyShapeId } from './spec';

export type BodyArchetypeId = Exclude<BodyShapeId, 'custom'>;

/** One path node. `a` = direction of travel (degrees); `a2` = leaving direction for a corner. */
interface Node {
  x: number;
  y: number;
  a: number;
  a2?: number;
  /** Incoming / outgoing handle lengths. */
  hi: number;
  ho: number;
  /** Throat node on the treble (−1) or bass (+1) side: moved outward when the neck needs room. */
  throat?: -1 | 1;
}

export interface BodyArchetype {
  id: BodyArchetypeId;
  label: string;
  /** Nodes, counter-clockwise, in the reference frame (mm). */
  nodes: Node[];
  /** Neck-pocket anchor x in the reference frame. */
  anchorX: number;
  /** Half-width of the straight throat in the reference frame (|y| of the throat nodes on the shelf). */
  throatHalf: number;
  /** Preferred control-cavity centre, as fractions of length (0 = neck end) and width (−0.5 = treble edge). */
  cavity: { u: number; w: number };
}

const n = (x: number, y: number, a: number, hi: number, ho: number, extra: Partial<Node> = {}): Node => ({ x, y, a, hi, ho, ...extra });

// Reference sizes are only the drawing scale; outlines are rescaled to the spec's length × width.
export const BODY_ARCHETYPES: Record<BodyArchetypeId, BodyArchetype> = {
  'double-cut': {
    id: 'double-cut',
    label: 'Double cutaway',
    anchorX: 85,
    throatHalf: 32,
    cavity: { u: 0.76, w: -0.27 },
    nodes: [
      n(85, 0, -90, 10, 10),
      n(85, -32, -90, 10, 20, { throat: -1 }),
      n(62, -62, 220, 14, 12),
      n(42, -88, -90, 8, 6),
      n(60, -108, -12, 10, 14),
      n(94, -126, -42, 14, 14),
      n(128, -150, -4, 18, 30),
      n(210, -132, 0, 35, 40),
      n(310, -165, 0, 40, 35),
      n(388, -95, 65, 30, 25),
      n(400, 0, 90, 40, 40),
      n(388, 95, 115, 25, 30),
      n(305, 165, 180, 35, 40),
      n(205, 132, 180, 40, 32),
      n(125, 154, 180, 28, 24),
      n(72, 130, 207, 18, 18),
      n(24, 122, 176, 14, 10),
      n(0, 100, -90, 9, 9),
      n(40, 64, -25, 22, 18),
      n(85, 32, -90, 20, 10, { throat: 1 }),
    ],
  },
  'single-cut': {
    id: 'single-cut',
    label: 'Single cutaway',
    anchorX: 30,
    throatHalf: 33,
    cavity: { u: 0.74, w: -0.26 },
    nodes: [
      n(30, 0, -90, 8, 8),
      n(30, -27, -90, 8, 3.5, { throat: -1 }),
      n(36, -33, 0, 3.5, 18, { throat: -1 }),
      n(70, -52, -55, 12, 10),
      n(76, -80, -112, 9, 9),
      n(60, -100, 222, 7, 5),
      n(53, -110, -75, 4, 12),
      n(108, -148, -22, 30, 28),
      n(220, -152, -3, 40, 40),
      n(325, -165, 0, 40, 40),
      n(424, -95, 62, 40, 30),
      n(440, 0, 90, 50, 50),
      n(424, 95, 118, 30, 40),
      n(325, 165, 180, 40, 45),
      n(215, 150, 180, 40, 40),
      n(100, 155, 182, 40, 40),
      n(20, 110, 240, 30, 22),
      n(0, 66, -90, 14, 12),
      n(10, 40, -40, 10, 5),
      n(24, 33, 0, 4, 3.5, { throat: 1 }),
      n(30, 27, -90, 3.5, 8, { throat: 1 }),
    ],
  },
  offset: {
    id: 'offset',
    label: 'Offset',
    anchorX: 92,
    throatHalf: 32,
    cavity: { u: 0.8, w: -0.28 },
    nodes: [
      n(92, 0, -90, 10, 10),
      n(92, -32, -90, 10, 18, { throat: -1 }),
      n(76, -58, 228, 12, 10),
      n(60, -84, -90, 8, 10),
      n(84, -112, -30, 14, 20),
      n(150, -138, -12, 30, 40),
      n(262, -146, 4, 45, 40),
      n(352, -165, 0, 35, 36),
      n(406, -96, 75, 30, 30),
      n(408, 6, 98, 40, 40),
      n(376, 106, 142, 30, 30),
      n(280, 158, 178, 40, 45),
      n(170, 124, 182, 40, 32),
      n(98, 152, 182, 26, 22),
      n(50, 136, 205, 16, 16),
      n(18, 128, 182, 12, 10),
      n(0, 104, -90, 9, 10),
      n(44, 64, -28, 22, 18),
      n(92, 32, -90, 18, 10, { throat: 1 }),
    ],
  },
  superstrat: {
    id: 'superstrat',
    label: 'Superstrat',
    anchorX: 100,
    throatHalf: 34,
    cavity: { u: 0.76, w: -0.27 },
    nodes: [
      n(100, 0, -90, 10, 10),
      n(100, -34, -90, 10, 22, { throat: -1 }),
      n(70, -62, 208, 16, 14),
      n(38, -82, 205, 8, 3, { a2: -40 }),
      n(70, -114, -28, 14, 14),
      n(104, -134, -45, 12, 12),
      n(136, -150, -4, 14, 30),
      n(215, -128, 0, 38, 42),
      n(310, -165, 0, 42, 36),
      n(388, -92, 64, 32, 26),
      n(400, 0, 90, 40, 40),
      n(388, 92, 116, 26, 32),
      n(305, 165, 180, 36, 42),
      n(208, 128, 180, 42, 32),
      n(132, 152, 182, 22, 18),
      n(88, 128, 212, 14, 14),
      n(40, 112, 178, 16, 12),
      n(0, 92, 205, 6, 3, { a2: -42 }),
      n(54, 62, -22, 20, 20),
      n(100, 34, -90, 22, 10, { throat: 1 }),
    ],
  },
  'bass-offset': {
    id: 'bass-offset',
    label: 'Offset bass',
    anchorX: 80,
    throatHalf: 40,
    cavity: { u: 0.78, w: -0.27 },
    nodes: [
      n(80, 0, -90, 10, 10),
      n(80, -40, -90, 10, 18, { throat: -1 }),
      n(62, -64, 222, 12, 10),
      n(42, -90, -90, 9, 12),
      n(90, -138, -40, 30, 36),
      n(260, -148, 3, 60, 50),
      n(380, -172, 0, 42, 40),
      n(458, -94, 68, 36, 32),
      n(470, 6, 94, 44, 44),
      n(440, 112, 135, 34, 34),
      n(330, 168, 180, 48, 50),
      n(195, 128, 180, 50, 42),
      n(100, 156, 182, 28, 26),
      n(55, 134, 208, 16, 16),
      n(18, 120, 180, 12, 10),
      n(0, 96, -90, 10, 12),
      n(40, 58, -22, 20, 18),
      n(80, 40, -90, 18, 10, { throat: 1 }),
    ],
  },
};

const dir = (deg: number): Vec2 => v(Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180));

interface Seg {
  p0: Vec2;
  c1: Vec2;
  c2: Vec2;
  p3: Vec2;
}

/** Bézier segments of a node path after per-axis scaling and node offsets. */
function segments(nodes: readonly Node[], kx: number, ky: number, dy: (nd: Node) => number): Seg[] {
  const pts = nodes.map((nd) => v(nd.x * kx, (nd.y + dy(nd)) * ky));
  const segs: Seg[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]!;
    const b = nodes[(i + 1) % nodes.length]!;
    const pa = pts[i]!;
    const pb = pts[(i + 1) % nodes.length]!;
    const da = dir(a.a2 ?? a.a);
    const db = dir(b.a);
    segs.push({
      p0: pa,
      c1: v(pa.x + da.x * a.ho * kx, pa.y + da.y * a.ho * ky),
      c2: v(pb.x - db.x * b.hi * kx, pb.y - db.y * b.hi * ky),
      p3: pb,
    });
  }
  return segs;
}

function flattenSegs(segs: readonly Seg[], tol: number): Vec2[] {
  const out: Vec2[] = [];
  for (const s of segs) {
    const pts = flattenCubic(s.p0, s.c1, s.c2, s.p3, tol);
    for (let i = out.length === 0 ? 0 : 1; i < pts.length; i++) out.push(pts[i]!);
  }
  out.pop(); // last point repeats the first
  return dedupe(out);
}

/** Remove consecutive near-duplicates (and a closing duplicate). */
export function dedupe(pts: readonly Vec2[], eps = 1e-6): Vec2[] {
  const out: Vec2[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q.x - p.x) > eps || Math.abs(q.y - p.y) > eps) out.push(p);
  }
  while (out.length > 1 && Math.abs(out[0]!.x - out[out.length - 1]!.x) <= eps && Math.abs(out[0]!.y - out[out.length - 1]!.y) <= eps) out.pop();
  return out;
}

interface Extent {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
const extentCache = new Map<BodyArchetypeId, Extent>();

/** Exact-ish extents of the reference path (from a fine flattening). */
function referenceExtent(shape: BodyArchetype): Extent {
  const hit = extentCache.get(shape.id);
  if (hit) return hit;
  const pts = flattenSegs(segments(shape.nodes, 1, 1, () => 0), 0.01);
  const e: Extent = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const p of pts) {
    e.minX = Math.min(e.minX, p.x);
    e.maxX = Math.max(e.maxX, p.x);
    e.minY = Math.min(e.minY, p.y);
    e.maxY = Math.max(e.maxY, p.y);
  }
  extentCache.set(shape.id, e);
  return e;
}

/** Normalised frame of an archetype: anchor u (0..1 along length) and throat half-width as a fraction of width. */
export function archetypeFrame(id: BodyArchetypeId): { anchorU: number; throatW: number } {
  const s = BODY_ARCHETYPES[id];
  const e = referenceExtent(s);
  return { anchorU: (s.anchorX - e.minX) / (e.maxX - e.minX), throatW: s.throatHalf / (e.maxY - e.minY) };
}

/**
 * Archetype outline scaled to `length` × `width`, in the body-local frame (origin = neck-pocket
 * anchor, +x toward the tail). `minThroatHalf` widens the throat (both sides) when the neck needs it.
 * Closed, CCW, no repeated last point.
 */
export function bodyOutline(id: BodyArchetypeId, length: number, width: number, minThroatHalf = 0, tolerance = 0.05): Vec2[] {
  const s = BODY_ARCHETYPES[id];
  const e = referenceExtent(s);
  const kx = length / (e.maxX - e.minX);
  const ky = width / (e.maxY - e.minY);
  // Throat offset in reference units, so the scaled throat half-width is at least minThroatHalf.
  const grow = Math.max(0, minThroatHalf / ky - s.throatHalf);
  const segs = segments(s.nodes, kx, ky, (nd) => (nd.throat ? nd.throat * grow : 0));
  const ax = (s.anchorX - e.minX) * kx;
  const x0 = e.minX * kx;
  return flattenSegs(segs, tolerance).map((p) => v(p.x - x0 - ax, p.y));
}
