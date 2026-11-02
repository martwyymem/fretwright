// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Neck geometry: thickness taper, cross-section profiles and the side profile.
 * OWNER: wave-2 "neck & headstock" agent.
 *
 * SIDE FRAME (neck side view): x = the top-view x along the centerline (+x toward the bridge,
 * x = 0 at fret 0), +y up, y = 0 on the fretboard GLUE FACE (top of the neck wood). The fretboard
 * occupies 0 ≤ y ≤ fretboard.thickness; the neck back is below y = 0.
 *
 * SECTION FRAME (profile cross-sections): x across the neck, +x = BASS side, +y up, y = 0 on the
 * glue face (flat top), the back curve below. Viewed so that the labels BASS/TREBLE on the gauges
 * are authoritative.
 *
 * Profile families are superellipse-style curves (after the B-spline idea in MarzWorkbench's
 * neck_profile.py, GPL-3.0, re-derived as closed-form curves so they can be sampled exactly).
 */
import type { Vec2 } from './geom';
import { add, arcPoints, dist, flattenCubic, lerp, lineIntersection, scale, sub, v } from './geom';
import type { FretboardLayout } from './layout';
import type { GuitarSpec, NeckProfileId } from './spec';

// ---------------------------------------------------------------------------
// Positions and thickness
// ---------------------------------------------------------------------------

/** Where fret n crosses the centerline (x). */
export function fretCenterX(layout: FretboardLayout, n: number): number {
  const f = layout.frets[Math.max(0, Math.min(n, layout.frets.length - 1))]!;
  if (f.center) return f.center.x;
  return (lineIntersection(f.treble, f.bass, v(0, 0), v(1, 0)) ?? f.treble).x;
}

const centerCross = (a: Vec2, b: Vec2): number => (lineIntersection(a, b, v(0, 0), v(1, 0)) ?? lerp(a, b, 0.5)).x;

/** Board start (headstock end) and board end, measured on the centerline. */
export function boardStartX(layout: FretboardLayout): number {
  return centerCross(layout.outline[0], layout.outline[3]);
}
export function boardEndX(layout: FretboardLayout): number {
  return centerCross(layout.outline[1], layout.outline[2]);
}
/** Nut front face on the centerline (where `headstock.length` is measured from). */
export function nutFrontX(layout: FretboardLayout): number {
  return centerCross(layout.nut[0]!, layout.nut[1]!);
}
export function nutBackX(layout: FretboardLayout): number {
  return centerCross(layout.nut[3]!, layout.nut[2]!);
}

/** Fretboard width measured perpendicular to the centerline at top-view x. */
export function boardWidthAt(layout: FretboardLayout, x: number): number {
  const [nt, et, eb, nb] = layout.outline;
  const a = lineIntersection(nt, et, v(x, 0), v(x, 1));
  const b = lineIntersection(nb, eb, v(x, 0), v(x, 1));
  return a && b ? dist(a, b) : layout.widthAtNut;
}

/**
 * Total neck thickness (fretboard + neck wood) at top-view x: linear through the spec values at
 * fret 1 and fret 12 (centerline crossings), extrapolated beyond them.
 */
export function neckThicknessAt(spec: GuitarSpec, layout: FretboardLayout, x: number): number {
  const x1 = fretCenterX(layout, 1);
  const x12 = fretCenterX(layout, 12);
  const { thicknessAt1: t1, thicknessAt12: t12 } = spec.neck;
  return t1 + ((t12 - t1) * (x - x1)) / (x12 - x1);
}

/** Neck wood depth below the glue face (total thickness minus fretboard). */
export function neckDepthAt(spec: GuitarSpec, layout: FretboardLayout, x: number): number {
  return neckThicknessAt(spec, layout, x) - spec.fretboard.thickness;
}

// ---------------------------------------------------------------------------
// Cross-section profiles
// ---------------------------------------------------------------------------

/**
 * Back-curve depth fraction f(s) for s = |x| / (width/2) in [0, 1]; f(0) = 1, f(1) = 0.
 * `bass` selects the bass half for the asymmetric profile.
 */
function profileFn(id: NeckProfileId, s: number, bass: boolean): number {
  const se = (a: number, b: number) => Math.pow(Math.max(0, 1 - Math.pow(s, a)), 1 / b);
  switch (id) {
    case 'C':
      return se(2, 2); // ellipse
    case 'D':
      return se(2.6, 2.6); // fuller shoulders, flatter back
    case 'U':
      return se(3.5, 3); // very full, "baseball bat"
    case 'V':
      return 0.6 * (1 - Math.pow(s, 1.25)) + 0.4 * se(2, 2); // soft V
    case 'flat-oval':
      return se(3, 2); // flat back, round sides
    case 'asym':
      return bass ? se(2.8, 2.6) : se(2, 2); // fuller on the bass side, C on the treble side
  }
}

/** Number of samples per half of a profile (dense enough for ≤ 0.05 mm chord error at neck sizes). */
const PROFILE_SAMPLES = 360;

/**
 * Closed cross-section (CCW, no repeated point): the back curve from (−width/2, 0) through the
 * deepest point (0, −depth) to (width/2, 0); the closing segment is the flat glue face.
 * With `radius`, the top is the convex fretboard radius arc instead (rising above y = 0 in the middle).
 */
export function profileSection(id: NeckProfileId, width: number, depth: number, opts: { radius?: number } = {}): Vec2[] {
  const h = width / 2;
  const back: Vec2[] = [];
  for (let i = -PROFILE_SAMPLES; i <= PROFILE_SAMPLES; i++) {
    // x = h·sin(θ): dense near the edges where the curve is steep.
    const th = (i / PROFILE_SAMPLES) * (Math.PI / 2);
    const x = h * Math.sin(th);
    const s = Math.min(1, Math.abs(x) / h);
    const y = -depth * profileFn(id, s, x > 0);
    back.push(v(x, i === 0 ? -depth : y));
  }
  back[0] = v(-h, 0);
  back[back.length - 1] = v(h, 0);
  if (opts.radius && opts.radius > h) {
    const r = opts.radius;
    const sag = r - Math.sqrt(r * r - h * h);
    const a0 = Math.atan2(r - sag, h);
    const arc = arcPoints(v(0, sag - r), r, a0, Math.PI - a0); // right → left over the top
    return [...back, ...arc.slice(1, -1)];
  }
  return back;
}

// ---------------------------------------------------------------------------
// Side profile
// ---------------------------------------------------------------------------

/** Extra depth of a volute below the transition curve (mm). */
export const VOLUTE_DEPTH = 3;
/** Headstock-access truss rods start this far behind the board start (adjuster pocket). */
export const TRUSS_HEADSTOCK_INSET = 8;
/** Nut height above the fretboard, for drawing only. */
export const NUT_DRAW_HEIGHT = 4;

export interface TrussRodChannel {
  /** Channel start / end x (side frame). */
  x0: number;
  x1: number;
  depth: number;
  width: number;
  /** x of the adjustment end. */
  accessX: number;
}

export interface NeckSide {
  /** Closed outline of the neck wood (incl. headstock and heel/tenon), CCW. */
  outline: Vec2[];
  /** Fretboard rectangle, CCW. */
  fretboard: Vec2[];
  /** Nut, drawn as a rectangle on top of the board. */
  nut: Vec2[];
  trussRod: TrussRodChannel;
  /** Neck back line (headstock transition excluded), from the transition to the joint fret. */
  back: Vec2[];
  /** Headstock face and back lines, from the board start / transition to the tip. */
  headstockFace: [Vec2, Vec2];
  headstockBack: [Vec2, Vec2];
  /** Deepest point of the volute, when enabled. */
  volute?: Vec2;
  x: {
    nutFront: number;
    nutBack: number;
    boardStart: number;
    boardEnd: number;
    fret1: number;
    fret12: number;
    joint: number;
    neckEnd: number;
    tip: number;
  };
  /** Effective headstock angle (0 when flat). */
  headstockAngle: number;
}

/** Where the neck ends on the body side (heel / tenon end; neck-through: the blank end). */
export function neckEndX(spec: GuitarSpec, layout: FretboardLayout): number {
  const be = boardEndX(layout);
  if (spec.neck.joint === 'neck-through') return Math.max(be + spec.neck.heelLength, fretCenterX(layout, spec.neck.jointFret) + spec.body.length);
  return be + spec.neck.heelLength;
}

export function trussRodChannel(spec: GuitarSpec, layout: FretboardLayout): TrussRodChannel {
  const tr = spec.neck.trussRod;
  const bs = boardStartX(layout);
  if (tr.access === 'headstock') {
    const x0 = bs - TRUSS_HEADSTOCK_INSET;
    return { x0, x1: x0 + tr.length, depth: tr.depth, width: tr.width, accessX: x0 };
  }
  // Heel access: adjuster at the end of the neck (bolt-on heel) or at the board end (set-in / neck-through).
  const x1 = spec.neck.joint === 'bolt-on' ? neckEndX(spec, layout) : boardEndX(layout);
  return { x0: x1 - tr.length, x1, depth: tr.depth, width: tr.width, accessX: x1 };
}

/** Hermite cubic between two points with unit tangents, flattened. */
function hermite(a: Vec2, ta: Vec2, b: Vec2, tb: Vec2): Vec2[] {
  const k = dist(a, b) / 3;
  return flattenCubic(a, add(a, scale(ta, k)), sub(b, scale(tb, k)), b);
}

const unit = (p: Vec2): Vec2 => {
  const l = Math.hypot(p.x, p.y);
  return l === 0 ? v(1, 0) : v(p.x / l, p.y / l);
};

export function buildNeckSide(spec: GuitarSpec, layout: FretboardLayout): NeckSide {
  const tFb = spec.fretboard.thickness;
  const hs = spec.headstock;
  const xs = boardStartX(layout);
  const xe = boardEndX(layout);
  const xnf = nutFrontX(layout);
  const xnb = nutBackX(layout);
  const xJ = fretCenterX(layout, spec.neck.jointFret);
  const xEnd = neckEndX(spec, layout);
  const backY = (x: number) => tFb - neckThicknessAt(spec, layout, x);
  const angled = hs.style === 'angled' && hs.angle >= 1;
  const th = angled ? (hs.angle * Math.PI) / 180 : 0;

  // Headstock face: from the pivot at the board start, toward the tip (−x), tilted down by the angle.
  const pivot = v(xs, 0);
  const faceDir = v(-Math.cos(th), -Math.sin(th));
  const faceLen = Math.max(xs - (xnf - hs.length), 1);
  const tipTop = add(pivot, scale(faceDir, faceLen));
  const nrm = v(Math.sin(th), -Math.cos(th)); // into the wood, below the face
  const tipBottom = add(tipTop, scale(nrm, hs.thickness));
  const hsBackAt = (s: number) => add(add(pivot, scale(nrm, hs.thickness)), scale(faceDir, s)); // s along the face from the pivot

  // Neck back near the nut as a line.
  const backA0 = v(xs, backY(xs));
  const backDir = unit(sub(v(xs - 1, backY(xs - 1)), backA0)); // pointing toward the headstock

  let transition: Vec2[]; // from the neck back (A) to the headstock back (B), heading toward the tip
  let volute: Vec2 | undefined;
  let A: Vec2;
  let B: Vec2;
  const Xi = angled ? lineIntersection(backA0, add(backA0, backDir), hsBackAt(0), hsBackAt(1)) : null;
  const fillet = Xi !== null && Xi.x < xs + 30 && Xi.x > xs - 0.6 * faceLen;
  if (fillet) {
    const X = Xi;
    const rA = hs.volute ? 30 : 20;
    const rB = hs.volute ? 45 : 30;
    const xA = Math.min(X.x + rA, xJ - 10);
    A = v(xA, backY(xA));
    const sX = dot2(sub(X, hsBackAt(0)), faceDir);
    B = hsBackAt(Math.min(Math.max(sX + rB, 5), faceLen - 5));
    if (hs.volute) {
      const mid = flattenCubic(A, lerp(A, X, 0.6), lerp(B, X, 0.6), B);
      const m = mid[Math.floor(mid.length / 2)]!;
      volute = v(m.x, m.y - VOLUTE_DEPTH);
      const tv = unit(sub(B, A));
      transition = [...hermite(A, backDir, volute, tv), ...hermite(volute, tv, B, faceDir).slice(1)];
    } else {
      transition = flattenCubic(A, lerp(A, X, 0.6), lerp(B, X, 0.6), B);
    }
  } else {
    const xA = Math.min(xs + (hs.volute ? 25 : 12), xJ - 10);
    A = v(xA, backY(xA));
    B = hsBackAt(Math.min(hs.volute ? 40 : 25, faceLen - 5));
    if (hs.volute) {
      volute = v(xs - 5, Math.min(A.y, B.y) - VOLUTE_DEPTH);
      transition = [...hermite(A, backDir, volute, v(-1, 0)), ...hermite(volute, v(-1, 0), B, faceDir).slice(1)];
    } else {
      transition = hermite(A, backDir, B, faceDir);
    }
  }

  // Neck back from the joint fret back to A (sampled; it is a straight line).
  const back: Vec2[] = [v(xJ, backY(xJ)), A];

  // Heel / tenon / through-blank beyond the joint fret.
  const tan = Math.tan((spec.neck.angle * Math.PI) / 180);
  const yJ = backY(xJ);
  let heel: Vec2[]; // from the joint (bottom) toward the end, ending at the end bottom
  if (spec.neck.joint === 'set-in') {
    const depthJ = -yJ;
    const tenon = Math.min(spec.body.neckPocketDepth > 0 ? spec.body.neckPocketDepth : depthJ, depthJ);
    const yT = -tenon;
    const yTEnd = Math.min(yT + (xEnd - xJ) * tan, -2);
    heel = tenon < depthJ - 1e-6 ? [v(xJ, yJ), v(xJ, yT), v(xEnd, yTEnd)] : [v(xJ, yJ), v(xEnd, Math.min(yJ + (xEnd - xJ) * tan, -2))];
  } else if (spec.neck.joint === 'bolt-on') {
    heel = [v(xJ, yJ), v(xEnd, Math.min(yJ + (xEnd - xJ) * tan, -2))];
  } else {
    heel = [v(xJ, yJ), v(xEnd, yJ)];
  }

  // Assemble CCW: top (glue face) from the end toward the headstock, face, tip, headstock back,
  // transition, neck back, heel, up the end.
  const outline: Vec2[] = [v(xEnd, 0)];
  if (angled) outline.push(pivot);
  outline.push(tipTop, tipBottom);
  if (dist(tipBottom, B) > 1e-6) outline.push(B);
  outline.push(...[...transition].reverse().slice(1)); // B → A
  outline.push(...heel); // A is followed by the joint point
  if (dist(outline[outline.length - 1]!, v(xEnd, 0)) < 1e-9) outline.pop();
  const clean = outline.filter((p, i) => i === 0 || dist(p, outline[i - 1]!) > 1e-9);

  const fretboard = [v(xe, 0), v(xe, tFb), v(xs, tFb), v(xs, 0)];
  const nut = [v(xnf, tFb), v(xnf, tFb + NUT_DRAW_HEIGHT), v(xnb, tFb + NUT_DRAW_HEIGHT), v(xnb, tFb)];

  return {
    outline: clean,
    fretboard,
    nut,
    trussRod: trussRodChannel(spec, layout),
    back,
    headstockFace: [pivot, tipTop],
    headstockBack: [B, tipBottom],
    volute,
    x: {
      nutFront: xnf,
      nutBack: xnb,
      boardStart: xs,
      boardEnd: xe,
      fret1: fretCenterX(layout, 1),
      fret12: fretCenterX(layout, 12),
      joint: xJ,
      neckEnd: xEnd,
      tip: tipTop.x,
    },
    headstockAngle: angled ? hs.angle : 0,
  };
}

function dot2(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}
