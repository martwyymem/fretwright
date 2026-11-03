// SPDX-License-Identifier: GPL-3.0-or-later
/** Independent accuracy checks (QA): published fret positions, multiscale geometry, unit conversion. */
import type { StringLine } from './layout';
import { buildFretboardLayout, fretDistance } from './layout';
import { PRESETS } from './presets';
import { dist } from './geom';
import { gaugeToMm, inToMm } from './units';

describe('fret positions vs published tables (distance from the nut)', () => {
  it.each([
    // [scale mm, fret, published mm]
    [647.7, 1, 36.35], // 25.5″: 1.431″
    [647.7, 12, 323.85],
    [647.7, 22, 465.94], // 18.344″
    [647.7, 24, 485.78],
    [628.65, 12, 314.33], // 24.75″
    [863.6, 12, 431.8], // 34″ bass
  ])('scale %f fret %i = %f mm', (L, n, mm) => {
    expect(Math.abs(fretDistance(n, L) - mm)).toBeLessThan(0.01);
  });

  it('inch presets store exact millimetres', () => {
    expect(inToMm(25.5)).toBe(647.7);
    expect(inToMm(24.75)).toBe(628.65);
    expect(inToMm(34)).toBe(863.6);
    expect(gaugeToMm(10)).toBe(0.254);
  });
});

/** Distance along the string from its fret-0 point to where it crosses the fret line. */
function alongString(s: StringLine, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const L = dist(s.nut, s.saddle);
  const d = { x: (s.saddle.x - s.nut.x) / L, y: (s.saddle.y - s.nut.y) / L };
  const e = { x: b.x - a.x, y: b.y - a.y };
  return ((a.x - s.nut.x) * e.y - (a.y - s.nut.y) * e.x) / (d.x * e.y - d.y * e.x);
}

describe.each(PRESETS.map((p) => [p.id, p.spec] as const))('preset %s geometry', (_id, spec) => {
  const lay = buildFretboardLayout(spec);
  const N = lay.strings.length;

  it('nut → saddle length of every string equals its scale', () => {
    for (const s of lay.strings) {
      const t = N > 1 ? s.index / (N - 1) : 0;
      const L = spec.scale.treble + (spec.scale.bass - spec.scale.treble) * t;
      expect(Math.abs(dist(s.nut, s.saddle) - L)).toBeLessThan(1e-6);
    }
  });

  it('along each outer string, fret n sits at fretDistance(n, that string’s scale) ± 0.01 mm', () => {
    for (const s of [lay.strings[0]!, lay.strings[N - 1]!]) {
      for (const f of lay.frets) expect(Math.abs(alongString(s, f.treble, f.bass) - fretDistance(f.n, s.scale!))).toBeLessThan(0.01);
    }
  });

  it('fret 0 crosses the centerline at the origin', () => {
    expect(Math.hypot(lay.frets[0]!.center!.x, lay.frets[0]!.center!.y)).toBeLessThan(1e-9);
  });

  it.runIf(spec.scale.bass !== spec.scale.treble)('the perpendicular fret is square to the centerline', () => {
    const pf = spec.frets.perpendicularFret;
    const at = (s: StringLine) => {
      const k = fretDistance(pf, s.scale!) / s.scale!;
      return s.nut.x + (s.saddle.x - s.nut.x) * k;
    };
    expect(Math.abs(at(lay.strings[0]!) - at(lay.strings[N - 1]!))).toBeLessThan(1e-9);
    if (Number.isInteger(pf)) {
      const f = lay.frets[pf]!;
      expect(Math.abs(f.bass.x - f.treble.x)).toBeLessThan(1e-9);
    }
  });
});
