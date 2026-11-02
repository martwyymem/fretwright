// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * GuitarSpec: the single source of truth for an instrument design.
 *
 * Rules (see docs/ARCHITECTURE.md):
 * - Every length is millimetres, every angle is degrees.
 * - String arrays are ordered TREBLE → BASS (index 0 = string 1, the thinnest).
 * - The schema is versioned. Changing a field's meaning requires bumping SPEC_VERSION and
 *   adding a migration in `migrateSpec`.
 */
import { z } from 'zod';

export const SPEC_VERSION = 1;

const posMm = z.number().finite().positive();
const nonNegMm = z.number().finite().nonnegative();
const deg = z.number().finite();

export const Vec2Schema = z.object({ x: z.number().finite(), y: z.number().finite() });

export const NeckProfileId = z.enum(['C', 'D', 'U', 'V', 'flat-oval', 'asym']);
export type NeckProfileId = z.infer<typeof NeckProfileId>;

/**
 * Tuner count always equals string count.
 * - inline: all tuners on the bass side
 * - split: half per side (3+3, 2+2; odd counts put the extra on the bass side)
 * - split-offset: more tuners on the bass side (e.g. 4+2, 4+3)
 * - paddle: blank rectangle-ish shape for the builder to design on
 */
export const HeadstockShapeId = z.enum(['inline', 'split', 'split-offset', 'paddle', 'custom']);
export type HeadstockShapeId = z.infer<typeof HeadstockShapeId>;

/** Generic, original archetype outlines (not copies of trademarked bodies). */
export const BodyShapeId = z.enum(['double-cut', 'single-cut', 'offset', 'superstrat', 'bass-offset', 'custom']);
export type BodyShapeId = z.infer<typeof BodyShapeId>;

export const PickupType = z.enum(['single', 'humbucker', 'p90', 'bass-single', 'bass-split']);
export type PickupType = z.infer<typeof PickupType>;

export const GuitarSpecSchema = z.object({
  version: z.literal(SPEC_VERSION),

  meta: z.object({
    name: z.string().max(120),
    instrument: z.enum(['guitar', 'bass']),
    /** Preset this design started from (informational). */
    preset: z.string().optional(),
  }),

  /** Scale lengths. Equal values = standard single scale; different = multiscale (fanned). */
  scale: z.object({
    /** Bass-side (longest) scale length. */
    bass: posMm,
    /** Treble-side scale length; must be ≤ bass. */
    treble: posMm,
  }),

  strings: z.object({
    /** String diameters in mm, TREBLE → BASS. Length = string count. */
    gauges: z.array(posMm).min(4).max(12),
  }),

  frets: z.object({
    /** Number of frets (not counting fret 0). */
    count: z.number().int().min(12).max(36),
    /** Fret that is perpendicular to the centerline on multiscale instruments (may be fractional). */
    perpendicularFret: z.number().min(0).max(36),
    /** Use a zero fret at position 0 with the nut acting as a string guide behind it. */
    zeroFret: z.boolean(),
    /** Saw kerf / slot width for fret tangs. */
    slotWidth: posMm,
    /** How far the fret slot stops short of each fretboard edge (hidden tangs). 0 = through slots. */
    nipping: nonNegMm,
  }),

  nut: z.object({
    /** Centre-to-centre distance between the two outer strings at the nut, perpendicular to the centerline. */
    stringSpread: posMm,
    /** equal-center: equal centre spacing; equal-gap: equal clear space between strings (accounts for gauges). */
    spacing: z.enum(['equal-center', 'equal-gap']),
    /** parallel: nut parallel to fret 0; perpendicular: nut square to the centerline (multiscale). */
    position: z.enum(['parallel', 'perpendicular']),
    /** Nut thickness along the string direction. */
    thickness: posMm,
    /** Gap between the nut face and the zero fret (only used when frets.zeroFret). */
    zeroFretGap: nonNegMm,
  }),

  bridge: z.object({
    /** Centre-to-centre distance between the outer strings at the saddles. */
    stringSpread: posMm,
    /** Intonation compensation added to the scale at the saddle, treble and bass strings (interpolated between). */
    compensationTreble: nonNegMm,
    compensationBass: nonNegMm,
  }),

  fretboard: z.object({
    thickness: posMm,
    /** Radius at the nut and at the last fret (equal = cylindrical; different = compound). */
    radiusStart: posMm,
    radiusEnd: posMm,
    /** Distance from the outer string's edge to the fretboard edge. */
    sideMargin: nonNegMm,
    /** Extra fretboard on the headstock side of the nut (0 = board ends at the nut's back face). */
    startMargin: nonNegMm,
    /** Fretboard length past the last fret. */
    endMargin: nonNegMm,
    /** Shape of the fretboard end on the body side. */
    endCut: z.enum(['parallel', 'perpendicular']),
    inlays: z.object({
      style: z.enum(['none', 'dots', 'blocks']),
      /** Frets that get a marker (the marker sits midway between fret n-1 and fret n). */
      frets: z.array(z.number().int().min(1).max(36)),
      /** Frets that get a double marker (usually 12 and 24). */
      doubleFrets: z.array(z.number().int().min(1).max(36)),
      dotDiameter: posMm,
      /** Also mark side-dot positions on the bass edge. */
      sideDots: z.boolean(),
    }),
  }),

  neck: z.object({
    joint: z.enum(['bolt-on', 'set-in', 'neck-through']),
    profile: NeckProfileId,
    /** Total neck thickness (fretboard + neck, excluding frets) at fret 1 and fret 12. */
    thicknessAt1: posMm,
    thicknessAt12: posMm,
    /** Fret at which the neck meets the body. */
    jointFret: z.number().int().min(10).max(30),
    /** Heel / tenon length past the fretboard end into the body (bolt-on pocket or set-in tenon). */
    heelLength: nonNegMm,
    /** Neck break angle relative to the body top (set-in / neck-through; 0 for most bolt-ons). */
    angle: deg,
    trussRod: z.object({
      width: posMm,
      depth: posMm,
      length: posMm,
      /** Access from the headstock end or from the heel end. */
      access: z.enum(['headstock', 'heel']),
    }),
  }),

  headstock: z.object({
    shape: HeadstockShapeId,
    style: z.enum(['flat', 'angled']),
    /** Back angle for angled headstocks. */
    angle: deg,
    /** Length from the nut to the tip. */
    length: posMm,
    /** Maximum width. */
    width: posMm,
    thickness: posMm,
    tunerHoleDiameter: posMm,
    volute: z.boolean(),
    /** Closed outline in the headstock-local frame (mm), used when shape = 'custom'. */
    customOutline: z.array(Vec2Schema).optional(),
  }),

  body: z.object({
    shape: BodyShapeId,
    /** Overall body length along the centerline and width across it (outline is scaled to fit). */
    length: posMm,
    width: posMm,
    thickness: posMm,
    neckPocketDepth: nonNegMm,
    pickups: z.array(
      z.object({
        type: PickupType,
        /** Distance from the (uncompensated) saddle line to the pickup centre, along the centerline. */
        fromBridge: nonNegMm,
        /** Pickup slant in degrees (positive = bass side toward the bridge). */
        angle: deg,
      }),
    ),
    /** Closed outline in the body-local frame (mm), used when shape = 'custom'. */
    customOutline: z.array(Vec2Schema).optional(),
  }),
});

export type GuitarSpec = z.infer<typeof GuitarSpecSchema>;

export interface SpecIssue {
  level: 'error' | 'warning' | 'info';
  /** Dot path of the offending field, e.g. "scale.treble". */
  path: string;
  message: string;
}

/** Structural validation via zod. Geometric/sanity rules live in validate.ts. */
export function checkSchema(input: unknown): { spec: GuitarSpec | null; issues: SpecIssue[] } {
  const r = GuitarSpecSchema.safeParse(input);
  if (r.success) return { spec: r.data, issues: [] };
  return {
    spec: null,
    issues: r.error.issues.map((i) => ({ level: 'error', path: i.path.join('.'), message: i.message })),
  };
}

/** Upgrade older saved files to the current version. Version 1 is the first; nothing to migrate yet. */
export function migrateSpec(raw: unknown): unknown {
  return raw;
}
