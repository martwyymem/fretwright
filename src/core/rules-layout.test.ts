// SPDX-License-Identifier: GPL-3.0-or-later
import { DEFAULT_SPEC, PRESETS } from './presets';
import type { GuitarSpec } from './spec';
import { validateSpec } from './validate';

const mod = (f: (s: GuitarSpec) => void, base: GuitarSpec = DEFAULT_SPEC): GuitarSpec => {
  const s = structuredClone(base);
  f(s);
  return s;
};
const issues = (s: GuitarSpec) => validateSpec(s).issues;
const find = (s: GuitarSpec, path: string, level?: string) =>
  issues(s).filter((i) => i.path === path && (!level || i.level === level));

describe('layout rules', () => {
  it('presets raise no layout warnings or errors', () => {
    for (const p of PRESETS) expect(issues(p.spec).filter((i) => i.level !== 'info')).toEqual([]);
  });

  it('strings too close at the nut: warn under 1.5 mm, error under 0.8 mm', () => {
    // 6 strings, total gauge ≈ 3.73 mm (minus outer halves); spread 13 mm leaves ≈ 1.95 mm per gap.
    expect(find(mod((s) => { s.nut.stringSpread = 13; }), 'nut.stringSpread')).toEqual([]);
    expect(find(mod((s) => { s.nut.stringSpread = 10; }), 'nut.stringSpread', 'warning')).toHaveLength(1);
    const err = find(mod((s) => { s.nut.stringSpread = 7; }), 'nut.stringSpread', 'error');
    expect(err).toHaveLength(1);
    expect(err[0]!.message).toMatch(/Increase the nut string spread/);
  });

  it('side margin under 2.5 mm warns', () => {
    expect(find(mod((s) => { s.fretboard.sideMargin = 2; }), 'fretboard.sideMargin', 'warning')).toHaveLength(1);
  });

  it('bridge spread narrower than nut spread warns', () => {
    expect(find(mod((s) => { s.bridge.stringSpread = 30; }), 'bridge.stringSpread', 'warning')).toHaveLength(1);
  });

  it('perpendicular fret beyond the last fret is an error', () => {
    const e = find(mod((s) => { s.frets.perpendicularFret = 30; }), 'frets.perpendicularFret', 'error');
    expect(e).toHaveLength(1);
    expect(e[0]!.message).toMatch(/between 0 and 22/);
  });

  it('multiscale + perpendicular nut without zero fret warns; with zero fret it does not', () => {
    const ms = PRESETS.find((p) => p.id === 'multiscale-7')!.spec;
    expect(find(mod((s) => { s.nut.position = 'perpendicular'; }, ms), 'nut.position', 'warning')).toHaveLength(1);
    expect(find(mod((s) => { s.nut.position = 'perpendicular'; s.frets.zeroFret = true; }, ms), 'nut.position')).toEqual([]);
    expect(find(mod((s) => { s.nut.position = 'perpendicular'; }), 'nut.position')).toEqual([]); // single scale: fine
  });

  it('compound radius getting rounder toward the body warns', () => {
    expect(find(mod((s) => { s.fretboard.radiusStart = 400; s.fretboard.radiusEnd = 250; }), 'fretboard.radiusStart', 'warning')).toHaveLength(1);
  });

  it('radius tighter than the board is an error', () => {
    expect(find(mod((s) => { s.fretboard.radiusStart = 20; s.fretboard.radiusEnd = 20; }), 'fretboard.radiusEnd', 'error')).toHaveLength(1);
  });

  it('gauges out of treble → bass order warn', () => {
    expect(find(mod((s) => { s.strings.gauges = [...s.strings.gauges].reverse(); }), 'strings.gauges', 'warning')).toHaveLength(1);
  });

  it('gauges vs instrument sanity', () => {
    const bassStringsOnGuitar = mod((s) => { s.strings.gauges = [1.1, 1.6, 2.1, 2.7]; });
    const i = find(bassStringsOnGuitar, 'strings.gauges');
    expect(i.some((x) => x.level === 'info')).toBe(true); // 4 strings on a guitar
    expect(i.some((x) => x.level === 'warning' && /bass-sized/.test(x.message))).toBe(true);
    const guitarStringsOnBass = mod((s) => { s.meta.instrument = 'bass'; });
    expect(find(guitarStringsOnBass, 'strings.gauges', 'warning').some((x) => /guitar-sized/.test(x.message))).toBe(true);
  });
});
