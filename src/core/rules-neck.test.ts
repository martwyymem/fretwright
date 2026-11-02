// SPDX-License-Identifier: GPL-3.0-or-later
import { DEFAULT_SPEC, PRESETS } from './presets';
import type { GuitarSpec } from './spec';
import { validateSpec } from './validate';

const mod = (f: (s: GuitarSpec) => void, base: GuitarSpec = DEFAULT_SPEC): GuitarSpec => {
  const s = structuredClone(base);
  f(s);
  return s;
};
const find = (s: GuitarSpec, path: string, level?: string) =>
  validateSpec(s).issues.filter((i) => i.path === path && (!level || i.level === level));

describe('neck & headstock rules', () => {
  it('presets raise no neck/headstock issues', () => {
    for (const p of PRESETS) {
      const issues = validateSpec(p.spec).issues.filter((i) => /^(neck|headstock)\./.test(i.path));
      expect(issues).toEqual([]);
    }
  });

  it('truss rod longer than the neck is an error with the maximum length', () => {
    const e = find(mod((s) => { s.neck.trussRod.length = 700; }), 'neck.trussRod.length', 'error');
    expect(e).toHaveLength(1);
    expect(e[0]!.message).toMatch(/at most \d+\.\d mm/);
    expect(find(mod((s) => { s.neck.trussRod.length = 700; s.neck.trussRod.access = 'heel'; }), 'neck.trussRod.length', 'error')).toHaveLength(1);
  });

  it('truss rod channel leaving < 3 mm of wood warns', () => {
    expect(find(mod((s) => { s.neck.trussRod.depth = 12.5; }), 'neck.trussRod.depth', 'warning')).toHaveLength(1);
    expect(find(mod((s) => { s.neck.thicknessAt1 = 18; }), 'neck.trussRod.depth', 'warning')).toHaveLength(1);
    expect(find(DEFAULT_SPEC, 'neck.trussRod.depth')).toEqual([]);
  });

  it('headstock too small for the tuners warns or errors', () => {
    const narrow = mod((s) => { s.headstock.width = 50; });
    const n = [...find(narrow, 'headstock.width'), ...find(narrow, 'headstock.length')];
    expect(n.some((i) => i.level !== 'info')).toBe(true);
    const short = mod((s) => { s.headstock.length = 80; });
    const sh = [...find(short, 'headstock.width'), ...find(short, 'headstock.length')];
    expect(sh.some((i) => i.level !== 'info')).toBe(true);
    const hugeHoles = mod((s) => { s.headstock.tunerHoleDiameter = 28; });
    expect([...find(hugeHoles, 'headstock.width'), ...find(hugeHoles, 'headstock.length')].some((i) => i.level === 'error')).toBe(true);
  });

  it('angled at 0° / flat with an angle are info', () => {
    expect(find(mod((s) => { s.headstock.style = 'angled'; s.headstock.angle = 0; }), 'headstock.angle', 'info')).toHaveLength(1);
    expect(find(mod((s) => { s.headstock.angle = 8; }), 'headstock.angle', 'info')).toHaveLength(1);
  });

  it('neck thinner at 12 than at 1 is info', () => {
    expect(find(mod((s) => { s.neck.thicknessAt12 = 20; }), 'neck.thicknessAt12', 'info')).toHaveLength(1);
  });

  it('bolt-on with no heel warns; set-in with no tenon length does not', () => {
    expect(find(mod((s) => { s.neck.heelLength = 0; }), 'neck.heelLength', 'warning')).toHaveLength(1);
    expect(find(mod((s) => { s.neck.heelLength = 0; s.neck.joint = 'set-in'; }), 'neck.heelLength')).toEqual([]);
  });
});
