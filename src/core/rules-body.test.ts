// SPDX-License-Identifier: GPL-3.0-or-later
import { buildBodyGeometry, saddleCenter } from './body';
import { buildFretboardLayout } from './layout';
import { DEFAULT_SPEC, PRESETS } from './presets';
import type { GuitarSpec } from './spec';
import { validateSpec } from './validate';

const issues = (s: GuitarSpec) => validateSpec(s).issues;
const mod = (f: (s: GuitarSpec) => void, base: GuitarSpec = DEFAULT_SPEC): GuitarSpec => {
  const s = structuredClone(base);
  f(s);
  return s;
};
const find = (s: GuitarSpec, path: string | RegExp, level?: 'error' | 'warning' | 'info') =>
  issues(s).filter((i) => (typeof path === 'string' ? i.path === path : path.test(i.path)) && (!level || i.level === level));

describe('body rules', () => {
  it('presets raise no body warnings or errors', () => {
    for (const p of PRESETS) {
      const bad = issues(p.spec).filter((i) => i.level !== 'info' && /^(body|neck)\./.test(i.path));
      expect(bad, p.id).toEqual([]);
    }
  });

  it('custom shape without an outline is an error that says how to fix it', () => {
    const e = find(mod((s) => { s.body.shape = 'custom'; }), 'body.shape', 'error');
    expect(e).toHaveLength(1);
    expect(e[0]!.message).toMatch(/Import an SVG outline in Body/);
    expect(find(mod((s) => { s.body.shape = 'custom'; s.body.customOutline = [{ x: 0, y: -160 }, { x: 400, y: -160 }, { x: 400, y: 160 }, { x: 0, y: 160 }]; }), 'body.shape')).toEqual([]);
  });

  it('body narrower than the bridge spread + 20 mm is an error', () => {
    expect(find(mod((s) => { s.body.width = 70; }), 'body.width', 'error')).toHaveLength(1);
    expect(find(DEFAULT_SPEC, 'body.width')).toEqual([]);
  });

  it('saddles off the body → error; too close to the tail → warning', () => {
    const off = find(mod((s) => { s.body.length = 250; }), 'body.length', 'error');
    expect(off).toHaveLength(1);
    expect(off[0]!.message).toMatch(/increase the body length, or raise the joint fret/i);
    // Default: 58 mm behind the saddle line; shrink until under 25 mm (but still on the body).
    const close = find(mod((s) => { s.body.length = 360; }), 'body.length', 'warning');
    expect(close).toHaveLength(1);
    expect(close[0]!.message).toMatch(/behind the saddles/);
    // Lowering the joint fret pulls the body toward the headstock, closer to the saddles.
    expect(find(mod((s) => { s.neck.jointFret = 13; }), 'body.length').length).toBeGreaterThan(0);
  });

  it('overlapping pickups → error', () => {
    const s = mod((x) => { x.body.pickups = [{ type: 'humbucker', fromBridge: 50, angle: 0 }, { type: 'humbucker', fromBridge: 70, angle: 0 }]; });
    expect(find(s, 'body.pickups.1.fromBridge', 'error').some((i) => /overlap/.test(i.message))).toBe(true);
  });

  it('pickup outside the body → error', () => {
    const s = mod((x) => { x.body.pickups = [{ type: 'single', fromBridge: 0, angle: 0 }, { type: 'humbucker', fromBridge: 40, angle: 0 }]; x.body.width = 75; });
    expect(find(s, /^body\.pickups\.\d+\.fromBridge$/, 'error').some((i) => /outside the body/.test(i.message))).toBe(true);
  });

  it('bolt-on: pickup cutting into the neck pocket → error; set-in → info', () => {
    const lay = buildFretboardLayout(DEFAULT_SPEC);
    const g = buildBodyGeometry(DEFAULT_SPEC, lay);
    const fromBridge = saddleCenter(lay).x - (g.anchor!.x + 25); // route starts 5 mm into the body
    const s = mod((x) => { x.body.pickups = [{ type: 'humbucker', fromBridge, angle: 0 }]; });
    expect(find(s, 'body.pickups.0.fromBridge', 'error').some((i) => /neck pocket/.test(i.message))).toBe(true);
    const set = mod((x) => { x.neck.joint = 'set-in'; }, s);
    expect(find(set, 'body.pickups.0.fromBridge', 'error').filter((i) => /neck/.test(i.message))).toEqual([]);
    expect(find(set, 'body.pickups.0.fromBridge', 'info').some((i) => /tenon/.test(i.message))).toBe(true);
    // The pocket that short is itself flagged.
    expect(find(s, 'neck.jointFret', 'warning')).toHaveLength(1);
  });

  it('pickup under the fretboard end → warning when mostly covered, info for a small overhang', () => {
    const under = mod((x) => { x.body.pickups = [{ type: 'humbucker', fromBridge: 190, angle: 0 }]; });
    expect(find(under, 'body.pickups.0.fromBridge', 'warning').some((i) => /under the fretboard/.test(i.message))).toBe(true);
    const lip = mod((x) => { x.body.pickups = [{ type: 'humbucker', fromBridge: 165, angle: 0 }]; });
    expect(find(lip, 'body.pickups.0.fromBridge', 'warning')).toEqual([]);
    expect(find(lip, 'body.pickups.0.fromBridge', 'info').some((i) => /overhangs/.test(i.message))).toBe(true);
  });
});
