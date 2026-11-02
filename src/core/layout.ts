// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Fretboard / string layout: the geometric backbone every top-view template is built on.
 * Coordinates follow the convention in geom.ts (origin = fret 0 on the centerline,
 * +x toward the bridge, +y = bass side, mm).
 *
 * OWNER: wave-1 "geometry" agent. The interface below is the contract; do not rename
 * fields without updating docs/ARCHITECTURE.md.
 */
import type { Vec2 } from './geom';
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
}

export interface InlayMark {
  fret: number;
  kind: 'dot' | 'double-dot' | 'block';
  /** Dot centres (1 for dot, 2 for double-dot), or the 4 corners of a block (CCW). */
  points: Vec2[];
  /** Dot diameter (dots only). */
  diameter?: number;
  /** Side-dot position on the bass edge, when sideDots is on. */
  side?: Vec2;
}

export interface FretboardLayout {
  strings: StringLine[];
  frets: FretLine[];
  /** Closed fretboard outline, CCW: nut-treble, end-treble, end-bass, nut-bass. */
  outline: [Vec2, Vec2, Vec2, Vec2];
  /** Nut footprint, closed CCW (treble-front, treble-back... builder's choice, must be closed). */
  nut: Vec2[];
  /** Uncompensated saddle line across the outer strings: [treble, bass]. */
  saddleLine: [Vec2, Vec2];
  inlays: InlayMark[];
  /** Fretboard width measured across at fret 0 and at the last fret (perpendicular to centerline). */
  widthAtNut: number;
  widthAtLastFret: number;
  /** Fret-to-fret distances for the bass and treble sides (n, distance from fret 0). */
  fretTable: { n: number; bass: number; treble: number }[];
}

/**
 * Build the layout for a spec.
 * STUB: replaced by the geometry agent. Currently a single-scale approximation so the UI
 * has something to render.
 */
export function buildFretboardLayout(spec: GuitarSpec): FretboardLayout {
  const L = spec.scale.bass;
  const half0 = spec.nut.stringSpread / 2 + spec.fretboard.sideMargin;
  const halfB = spec.bridge.stringSpread / 2 + spec.fretboard.sideMargin;
  const endX = fretDistance(spec.frets.count, L) + spec.fretboard.endMargin;
  const halfAt = (x: number) => half0 + ((halfB - half0) * x) / L;
  const frets: FretLine[] = [];
  for (let n = 0; n <= spec.frets.count; n++) {
    const x = fretDistance(n, L);
    const h = halfAt(x);
    frets.push({ n, treble: { x, y: -h }, bass: { x, y: h }, slotTreble: { x, y: -h + spec.frets.nipping }, slotBass: { x, y: h - spec.frets.nipping } });
  }
  return {
    strings: [],
    frets,
    outline: [
      { x: 0, y: -half0 },
      { x: endX, y: -halfAt(endX) },
      { x: endX, y: halfAt(endX) },
      { x: 0, y: half0 },
    ],
    nut: [],
    saddleLine: [{ x: L, y: -spec.bridge.stringSpread / 2 }, { x: L, y: spec.bridge.stringSpread / 2 }],
    inlays: [],
    widthAtNut: half0 * 2,
    widthAtLastFret: halfAt(endX) * 2,
    fretTable: frets.map((f) => ({ n: f.n, bass: f.bass.x, treble: f.treble.x })),
  };
}
