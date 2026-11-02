// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Body top-view geometry, in the instrument top-view frame.
 * OWNER: wave-2 "body & layout" agent.
 */
import type { Vec2 } from './geom';
import type { FretboardLayout } from './layout';
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
}

/** STUB. */
export function buildBodyGeometry(_spec: GuitarSpec, layout: FretboardLayout): BodyGeometry {
  return { outline: [], neckPocket: null, neckHeel: null, pickups: [], cavities: [], saddleLine: layout.saddleLine };
}
