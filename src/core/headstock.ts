// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Headstock top-view geometry, in the instrument top-view frame (headstock at x < 0).
 * OWNER: wave-2 "neck & headstock" agent. Interface is the contract (full-layout uses it).
 */
import type { Vec2 } from './geom';
import { v } from './geom';
import type { FretboardLayout } from './layout';
import type { GuitarSpec } from './spec';

export interface TunerHole {
  /** String this tuner serves (0 = treble). */
  stringIndex: number;
  center: Vec2;
  diameter: number;
}

export interface HeadstockGeometry {
  /** Closed outline (no repeated last point), including the neck-to-headstock transition, CCW. */
  outline: Vec2[];
  tuners: TunerHole[];
  /** Nut line [treble, bass] the headstock template aligns to. */
  nutLine: [Vec2, Vec2];
  /** Optional string paths from nut to tuner posts, for the template. */
  stringPaths?: [Vec2, Vec2][];
}

/** STUB: rectangle behind the nut. */
export function buildHeadstockGeometry(spec: GuitarSpec, layout: FretboardLayout): HeadstockGeometry {
  const [nt, , , nb] = layout.outline;
  const L = spec.headstock.length;
  const w = spec.headstock.width / 2;
  return {
    outline: [v(nt.x, nt.y), v(nb.x, nb.y), v(-L, w), v(-L, -w)],
    tuners: [],
    nutLine: [nt, nb],
  };
}
