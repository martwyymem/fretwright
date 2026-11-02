// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Starting points. Values are generic, commonly published dimensions, not any one
 * manufacturer's specification.
 */
import type { GuitarSpec } from './spec';
import { SPEC_VERSION } from './spec';
import { gaugeToMm, inToMm } from './units';

const gauges = (...thou: number[]) => thou.map(gaugeToMm);

const STD_INLAYS = {
  style: 'dots' as const,
  frets: [3, 5, 7, 9, 12, 15, 17, 19, 21, 24],
  doubleFrets: [12, 24],
  dotDiameter: 6,
  sideDots: true,
};

export const DEFAULT_SPEC: GuitarSpec = {
  version: SPEC_VERSION,
  meta: { name: 'My guitar', instrument: 'guitar', preset: 'classic-bolt-on' },
  scale: { bass: inToMm(25.5), treble: inToMm(25.5) },
  strings: { gauges: gauges(10, 13, 17, 26, 36, 46) },
  frets: { count: 22, perpendicularFret: 0, zeroFret: false, slotWidth: 0.6, nipping: 2 },
  nut: { stringSpread: 35, spacing: 'equal-gap', position: 'parallel', thickness: 5, zeroFretGap: 3 },
  bridge: { stringSpread: 52.5, compensationTreble: 1.5, compensationBass: 3.5 },
  fretboard: {
    thickness: 6.5,
    radiusStart: inToMm(9.5),
    radiusEnd: inToMm(9.5),
    sideMargin: 3.2,
    startMargin: 0,
    endMargin: 4,
    endCut: 'parallel',
    inlays: STD_INLAYS,
  },
  neck: {
    joint: 'bolt-on',
    profile: 'C',
    thicknessAt1: 21,
    thicknessAt12: 23,
    jointFret: 16,
    heelLength: 76,
    angle: 0,
    trussRod: { width: 6.35, depth: 11, length: 460, access: 'headstock' },
  },
  headstock: {
    shape: 'inline',
    style: 'flat',
    angle: 0,
    length: 185,
    width: 85,
    thickness: 14,
    tunerHoleDiameter: 10,
    volute: false,
  },
  body: {
    shape: 'double-cut',
    length: 400,
    width: 325,
    thickness: 44.5,
    neckPocketDepth: 16,
    pickups: [
      { type: 'single', fromBridge: 41, angle: -8 },
      { type: 'single', fromBridge: 98, angle: 0 },
      { type: 'single', fromBridge: 160, angle: 0 },
    ],
  },
};

const clone = (s: GuitarSpec): GuitarSpec => structuredClone(s);

function preset(id: string, name: string, mutate: (s: GuitarSpec) => void): { id: string; name: string; spec: GuitarSpec } {
  const s = clone(DEFAULT_SPEC);
  s.meta.preset = id;
  s.meta.name = name;
  mutate(s);
  return { id, name, spec: s };
}

export const PRESETS = [
  preset('classic-bolt-on', 'Classic bolt-on 25.5″ (6)', () => {}),
  preset('single-cut-set', 'Single-cut set-neck 24.75″ (6)', (s) => {
    s.scale = { bass: inToMm(24.75), treble: inToMm(24.75) };
    s.frets.count = 22;
    s.nut.stringSpread = 35.5;
    s.bridge = { stringSpread: 50.5, compensationTreble: 1.5, compensationBass: 3.5 };
    s.fretboard.radiusStart = inToMm(12);
    s.fretboard.radiusEnd = inToMm(12);
    s.fretboard.startMargin = 0;
    s.neck = { ...s.neck, joint: 'set-in', profile: 'D', thicknessAt1: 22, thicknessAt12: 24, jointFret: 16, heelLength: 50, angle: 4 };
    s.headstock = { ...s.headstock, shape: 'split', style: 'angled', angle: 14, length: 180, width: 95 };
    s.body = {
      ...s.body,
      shape: 'single-cut',
      length: 440,
      width: 330,
      thickness: 50,
      pickups: [
        { type: 'humbucker', fromBridge: 43, angle: 0 },
        { type: 'humbucker', fromBridge: 160, angle: 0 },
      ],
    };
  }),
  preset('superstrat-24', 'Superstrat 25.5″ 24 frets, compound radius', (s) => {
    s.frets.count = 24;
    s.fretboard.radiusStart = inToMm(10);
    s.fretboard.radiusEnd = inToMm(16);
    s.neck = { ...s.neck, profile: 'U', thicknessAt1: 19.5, thicknessAt12: 21.5, jointFret: 18, trussRod: { ...s.neck.trussRod, depth: 9.5 } }; // thin neck: low-profile rod
    s.headstock = { ...s.headstock, shape: 'inline', length: 190 };
    s.body = {
      ...s.body,
      shape: 'superstrat',
      pickups: [
        { type: 'humbucker', fromBridge: 43, angle: 0 },
        { type: 'single', fromBridge: 98, angle: 0 },
        { type: 'humbucker', fromBridge: 150, angle: 0 },
      ],
    };
  }),
  preset('multiscale-7', 'Multiscale 7-string 25.5–27″', (s) => {
    s.scale = { bass: inToMm(27), treble: inToMm(25.5) };
    s.strings.gauges = gauges(10, 13, 17, 26, 36, 46, 59);
    s.frets = { ...s.frets, count: 24, perpendicularFret: 8 };
    s.nut = { ...s.nut, stringSpread: 42, position: 'parallel' };
    s.bridge = { stringSpread: 62, compensationTreble: 1.5, compensationBass: 4 };
    s.fretboard.radiusStart = inToMm(16);
    s.fretboard.radiusEnd = inToMm(20);
    s.neck = { ...s.neck, profile: 'D', thicknessAt1: 20, thicknessAt12: 22, jointFret: 17, trussRod: { ...s.neck.trussRod, depth: 9.5 } }; // thin neck: low-profile rod
    s.headstock = { ...s.headstock, shape: 'split-offset', width: 90, length: 200 };
    s.body = { ...s.body, shape: 'superstrat', width: 340, pickups: [
      { type: 'humbucker', fromBridge: 45, angle: 0 },
      { type: 'humbucker', fromBridge: 155, angle: 0 },
    ] };
  }),
  preset('bass-4-34', 'Bass 34″ 4-string', (s) => {
    s.meta.instrument = 'bass';
    s.scale = { bass: inToMm(34), treble: inToMm(34) };
    s.strings.gauges = gauges(45, 65, 85, 105);
    s.frets = { ...s.frets, count: 20 };
    s.nut = { ...s.nut, stringSpread: 31, thickness: 6, spacing: 'equal-center' };
    s.bridge = { stringSpread: 57, compensationTreble: 2, compensationBass: 5 };
    s.fretboard = { ...s.fretboard, radiusStart: inToMm(9.5), radiusEnd: inToMm(9.5), sideMargin: 3.5,
      inlays: { ...STD_INLAYS, frets: [3, 5, 7, 9, 12, 15, 17, 19] , doubleFrets: [12] } };
    s.neck = { ...s.neck, profile: 'C', thicknessAt1: 22, thicknessAt12: 24, jointFret: 16 };
    s.headstock = { ...s.headstock, shape: 'inline', length: 230, width: 95, tunerHoleDiameter: 19 };
    s.body = { ...s.body, shape: 'bass-offset', length: 470, width: 345, pickups: [
      { type: 'bass-single', fromBridge: 70, angle: 0 },
      { type: 'bass-split', fromBridge: 150, angle: 0 },
    ] };
  }),
  preset('bass-5-multiscale', 'Bass multiscale 5-string 34–37″', (s) => {
    s.meta.instrument = 'bass';
    s.scale = { bass: inToMm(37), treble: inToMm(34) };
    s.strings.gauges = gauges(45, 65, 80, 100, 130);
    s.frets = { ...s.frets, count: 24, perpendicularFret: 7 };
    s.nut = { ...s.nut, stringSpread: 38, thickness: 6, spacing: 'equal-center' };
    s.bridge = { stringSpread: 74, compensationTreble: 2, compensationBass: 5.5 };
    s.fretboard = { ...s.fretboard, radiusStart: inToMm(14), radiusEnd: inToMm(20), sideMargin: 3.5 };
    s.neck = { ...s.neck, profile: 'D', thicknessAt1: 22, thicknessAt12: 24, jointFret: 20 };
    s.headstock = { ...s.headstock, shape: 'inline', length: 240, width: 100, tunerHoleDiameter: 19 };
    s.body = { ...s.body, shape: 'bass-offset', length: 470, width: 350, pickups: [
      { type: 'humbucker', fromBridge: 60, angle: 0 },
      { type: 'humbucker', fromBridge: 140, angle: 0 },
    ] };
  }),
];

export type Preset = (typeof PRESETS)[number];
export const presetById = (id: string): Preset | undefined => PRESETS.find((p) => p.id === id);
