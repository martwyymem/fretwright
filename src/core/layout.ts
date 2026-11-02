// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Fretboard / string layout: the geometric backbone every top-view template is built on.
 * Coordinates follow the convention in geom.ts (origin = fret 0 on the centerline,
 * +x toward the bridge, +y = bass side, mm).
 *
 * OWNER: wave-1 "geometry" agent. The interface below is the contract; do not rename
 * fields without updating docs/ARCHITECTURE.md.
 *
 * Construction (maths after MarzWorkbench's fretboard_builder.py, GPL-3.0, re-derived for our axes):
 *
 * 1. Outer strings. The fan is symmetric about the centerline: the treble string runs from
 *    y = −nutSpread/2 to y = −bridgeSpread/2, the bass string from +nutSpread/2 to +bridgeSpread/2,
 *    each with its own scale length L measured ALONG the string (so its x-extent is √(L² − h²),
 *    h = half the spread difference).
 * 2. Multiscale stagger. The treble and bass nut points are shifted along x so that fret
 *    `perpendicularFret` lands at the same x on both outer strings, and so that the fret-0 line
 *    crosses the centerline at the origin.
 * 3. Frets. Fret n is the straight line through the outer strings' points at fretDistance(n, L),
 *    clipped to the fretboard edges. Inner strings cross it wherever they cross it (this is how
 *    every fanned or straight fretboard works). The error vs. an exact per-string fret is < 0.06 mm,
 *    except multiscale + equal-gap nut, where inner strings start off the fan's "constant position"
 *    lines and drift up to ~0.45 mm at the top frets (7-string 25.5–27″) — well inside saddle
 *    adjustment range. Tested in layout.test.ts.
 * 4. Inner strings. String i starts on the fret-0 line (spacing per `nut.spacing`), aims at its
 *    equal-centre point on the outer saddle line, and its saddle is placed exactly at its own scale
 *    L_i = lerp(treble, bass, i/(N−1)) along that direction. Compensation is lerped the same way.
 *    The interpolation parameter is the string's index position i/(N−1), which equals its
 *    fractional position across the (always equal-centre) bridge.
 * 5. Edges = outer string lines offset outward by sideMargin + gauge/2. The board starts
 *    startMargin behind the nut's back face and ends endMargin past the last fret (offsets along x).
 */
import type { Vec2 } from './geom';
import { add, dist, lerp, lineIntersection, norm, perp, scale, sub, v } from './geom';
import type { GuitarSpec } from './spec';

/** Distance from fret 0 to fret n along a string of the given scale length. */
export function fretDistance(n: number, scaleLength: number): number {
  return scaleLength * (1 - Math.pow(2, -n / 12));
}

export interface StringLine {
  /** 0 = treble (string 1). */
  index: number;
  gauge: number;
  /** Where the string crosses fret 0 (start of its speaking length). */
  nut: Vec2;
  /** Uncompensated saddle point (nut + this string's scale length along the string). */
  saddle: Vec2;
  /** Compensated saddle point (saddle moved further along the string by its compensation). */
  compensatedSaddle: Vec2;
  /** This string's (interpolated) scale length, nut → uncompensated saddle. */
  scale?: number;
  /** This string's (interpolated) intonation compensation. */
  compensation?: number;
}

export interface FretLine {
  /** 0 = zero fret / nut line, 1..count = frets. */
  n: number;
  /** Full fret line, clipped to the fretboard edges. */
  treble: Vec2;
  bass: Vec2;
  /** Slot actually cut: the fret line shortened by `frets.nipping` at each end. */
  slotTreble: Vec2;
  slotBass: Vec2;
  /** Where the fret line crosses the centerline (y = 0). */
  center?: Vec2;
}

export interface InlayMark {
  fret: number;
  kind: 'dot' | 'double-dot' | 'block';
  /**
   * Dot centres (1 for dot, 2 for double-dot), or the 4 corners of a block (CCW).
   * Empty when inlay style is 'none' and the mark exists only for its side dot.
   */
  points: Vec2[];
  /** Dot diameter (dots only). */
  diameter?: number;
  /** Side-dot position on the bass edge, when sideDots is on. */
  side?: Vec2;
  /** All side-dot positions on the bass edge (2 for double frets), when sideDots is on. */
  sides?: Vec2[];
}

export interface FretboardLayout {
  strings: StringLine[];
  frets: FretLine[];
  /** Closed fretboard outline, CCW: nut-treble, end-treble, end-bass, nut-bass. */
  outline: [Vec2, Vec2, Vec2, Vec2];
  /** Nut footprint, closed CCW: front-treble, front-bass, back-bass, back-treble (front = bridge side). */
  nut: Vec2[];
  /** Uncompensated saddle line across the outer strings: [treble, bass]. */
  saddleLine: [Vec2, Vec2];
  inlays: InlayMark[];
  /** Fretboard width measured across at fret 0 and at the last fret (perpendicular to centerline). */
  widthAtNut: number;
  widthAtLastFret: number;
  /** Fret-to-fret distances for the bass and treble sides (n, distance from fret 0). */
  fretTable: { n: number; bass: number; treble: number }[];
  /** Fretboard edge lines (treble and bass), each from the board start to the board end. */
  edges?: { treble: [Vec2, Vec2]; bass: [Vec2, Vec2] };
  /** Clear gaps between adjacent strings at fret 0, measured across the centerline (N−1 values, treble → bass). */
  nutGaps?: number[];
}

/** Block inlays: inset from each fret = min(BLOCK_FRET_INSET, 25 % of the fret gap). */
export const BLOCK_FRET_INSET = 4;
/** Block inlays: inset from each board edge = max(BLOCK_EDGE_MIN, 1.5 × sideMargin). */
export const BLOCK_EDGE_MIN = 3;

interface Line {
  p: Vec2;
  d: Vec2;
}

function meet(a: Line, b: Line): Vec2 {
  const r = lineIntersection(a.p, add(a.p, a.d), b.p, add(b.p, b.d));
  if (!r) throw new Error('Fretboard layout: parallel lines (check scale lengths and string spreads).');
  return r;
}

const shiftX = (l: Line, dx: number): Line => ({ p: add(l.p, v(dx, 0)), d: l.d });
const vertical = (x: number): Line => ({ p: v(x, 0), d: v(0, 1) });
const CENTERLINE: Line = { p: v(0, 0), d: v(1, 0) };

/** Equal-gap / equal-centre string offsets at the nut, as distances from the treble string (0..spread). */
export function nutOffsets(spec: GuitarSpec): number[] {
  const g = spec.strings.gauges;
  const N = g.length;
  const S = spec.nut.stringSpread;
  if (spec.nut.spacing === 'equal-center') return g.map((_, i) => (S * i) / (N - 1));
  // Equal clear gap: centres differ by g[i-1]/2 + gap + g[i]/2, outer centres S apart.
  let inner = 0;
  for (let i = 1; i < N; i++) inner += (g[i - 1]! + g[i]!) / 2;
  const gap = (S - inner) / (N - 1);
  const out = [0];
  for (let i = 1; i < N; i++) out.push(out[i - 1]! + (g[i - 1]! + g[i]!) / 2 + gap);
  out[N - 1] = S; // remove rounding
  return out;
}

export function buildFretboardLayout(spec: GuitarSpec): FretboardLayout {
  const g = spec.strings.gauges;
  const N = g.length;
  const Lt = spec.scale.treble;
  const Lb = spec.scale.bass;
  const sn = spec.nut.stringSpread;
  const sb = spec.bridge.stringSpread;
  const h = (sb - sn) / 2;
  const fb = spec.fretboard;
  const count = spec.frets.count;

  // 1–2. Outer strings with the multiscale stagger.
  const run = (L: number) => Math.sqrt(Math.max(L * L - h * h, 1e-9));
  const dxT = run(Lt);
  const dxB = run(Lb);
  const fp = 1 - Math.pow(2, -spec.frets.perpendicularFret / 12);
  const xT0 = (fp * (dxB - dxT)) / 2;
  const xB0 = -xT0;
  const NT = v(xT0, -sn / 2);
  const NB = v(xB0, sn / 2);
  const ST = v(xT0 + dxT, -sb / 2);
  const SB = v(xB0 + dxB, sb / 2);
  const dT = norm(sub(ST, NT));
  const dB = norm(sub(SB, NB));

  // 4. All strings.
  const offs = nutOffsets(spec);
  const lt = (i: number) => (N > 1 ? i / (N - 1) : 0);
  const strings: StringLine[] = g.map((gauge, i) => {
    const t = lt(i);
    const nut = lerp(NT, NB, offs[i]! / sn);
    const aim = lerp(ST, SB, t);
    const d = norm(sub(aim, nut));
    const L = Lt + (Lb - Lt) * t;
    const comp = spec.bridge.compensationTreble + (spec.bridge.compensationBass - spec.bridge.compensationTreble) * t;
    return {
      index: i,
      gauge,
      nut,
      saddle: add(nut, scale(d, L)),
      compensatedSaddle: add(nut, scale(d, L + comp)),
      scale: L,
      compensation: comp,
    };
  });
  const nutGaps: number[] = [];
  for (let i = 1; i < N; i++) {
    nutGaps.push(strings[i]!.nut.y - strings[i - 1]!.nut.y - (g[i]! + g[i - 1]!) / 2);
  }

  // 5. Edges.
  const edgeT: Line = { p: add(NT, scale(perp(dT), -(fb.sideMargin + g[0]! / 2))), d: dT };
  const edgeB: Line = { p: add(NB, scale(perp(dB), fb.sideMargin + g[N - 1]! / 2)), d: dB };

  // 3. Frets.
  const fretLineAt = (n: number): Line => {
    const pt = add(NT, scale(dT, fretDistance(n, Lt)));
    const pb = add(NB, scale(dB, fretDistance(n, Lb)));
    return { p: pt, d: sub(pb, pt) };
  };
  const fretLines: Line[] = [];
  const frets: FretLine[] = [];
  for (let n = 0; n <= count; n++) {
    const l = fretLineAt(n);
    fretLines.push(l);
    const treble = meet(l, edgeT);
    const bass = meet(l, edgeB);
    const u = norm(sub(bass, treble));
    const nip = Math.min(spec.frets.nipping, dist(treble, bass) / 2 - 1e-6);
    frets.push({
      n,
      treble,
      bass,
      slotTreble: add(treble, scale(u, nip)),
      slotBass: sub(bass, scale(u, nip)),
      center: meet(l, CENTERLINE),
    });
  }
  const f0 = frets[0]!;
  const fz = frets[count]!;

  // Nut footprint and board start.
  const gap = spec.frets.zeroFret ? spec.nut.zeroFretGap : 0;
  const nutFront: Line =
    spec.nut.position === 'parallel' ? shiftX(fretLines[0]!, -gap) : vertical(Math.min(f0.treble.x, f0.bass.x) - gap);
  const nutBack = shiftX(nutFront, -spec.nut.thickness);
  const nut = [meet(nutFront, edgeT), meet(nutFront, edgeB), meet(nutBack, edgeB), meet(nutBack, edgeT)];
  const start = shiftX(nutBack, -fb.startMargin);

  // Board end.
  const end: Line =
    fb.endCut === 'parallel' ? shiftX(fretLines[count]!, fb.endMargin) : vertical(Math.max(fz.treble.x, fz.bass.x) + fb.endMargin);

  const outline: [Vec2, Vec2, Vec2, Vec2] = [meet(start, edgeT), meet(end, edgeT), meet(end, edgeB), meet(start, edgeB)];

  const widthAt = (x: number) => dist(meet(vertical(x), edgeT), meet(vertical(x), edgeB));

  // Inlays.
  const inlays: InlayMark[] = [];
  const il = fb.inlays;
  const marked = [...new Set([...il.frets, ...il.doubleFrets])].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  const edgeInset = Math.max(BLOCK_EDGE_MIN, 1.5 * fb.sideMargin);
  const innerT: Line = { p: add(edgeT.p, scale(perp(dT), edgeInset)), d: dT };
  const innerB: Line = { p: add(edgeB.p, scale(perp(dB), -edgeInset)), d: dB };
  for (const n of marked) {
    const a = frets[n - 1]!;
    const b = frets[n]!;
    const isDouble = il.doubleFrets.includes(n);
    const mt = lerp(a.treble, b.treble, 0.5);
    const mb = lerp(a.bass, b.bass, 0.5);
    const mid: Line = { p: mt, d: sub(mb, mt) };
    const c = meet(mid, CENTERLINE);
    let mark: InlayMark;
    if (il.style === 'blocks') {
      const fretGap = b.center!.x - a.center!.x;
      const inset = Math.min(BLOCK_FRET_INSET, 0.25 * fretGap);
      const near = shiftX(fretLines[n - 1]!, inset);
      const far = shiftX(fretLines[n]!, -inset);
      mark = { fret: n, kind: 'block', points: [meet(near, innerT), meet(far, innerT), meet(far, innerB), meet(near, innerB)] };
    } else if (il.style === 'dots') {
      if (isDouble) {
        const u = norm(sub(mb, mt));
        const q = dist(mt, mb) / 4;
        mark = { fret: n, kind: 'double-dot', points: [sub(c, scale(u, q)), add(c, scale(u, q))], diameter: il.dotDiameter };
      } else {
        mark = { fret: n, kind: 'dot', points: [c], diameter: il.dotDiameter };
      }
    } else {
      if (!il.sideDots) continue;
      mark = { fret: n, kind: isDouble ? 'double-dot' : 'dot', points: [] };
    }
    if (il.sideDots) {
      const s = lerp(a.bass, b.bass, 0.5);
      mark.side = s;
      if (isDouble) {
        const step = Math.min(4, 0.2 * dist(a.bass, b.bass));
        mark.sides = [sub(s, scale(dB, step)), add(s, scale(dB, step))];
      } else {
        mark.sides = [s];
      }
    }
    inlays.push(mark);
  }

  return {
    strings,
    frets,
    outline,
    nut,
    saddleLine: [ST, SB],
    inlays,
    widthAtNut: widthAt(0),
    widthAtLastFret: widthAt(fz.center!.x),
    fretTable: frets.map((f) => ({ n: f.n, bass: fretDistance(f.n, Lb), treble: fretDistance(f.n, Lt) })),
    edges: { treble: [outline[0], outline[1]], bass: [outline[3], outline[2]] },
    nutGaps,
  };
}
