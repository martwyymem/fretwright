// SPDX-License-Identifier: GPL-3.0-or-later
import { dist } from './geom';
import {
  bassSideCount,
  buildHeadstockGeometry,
  distToPolygon,
  distToSegment,
  pointInPolygon,
  signedArea,
  TUNER_EDGE_CLEARANCE,
  TUNER_MIN_PITCH,
} from './headstock';
import { buildFretboardLayout } from './layout';
import { DEFAULT_SPEC, PRESETS } from './presets';
import type { GuitarSpec, HeadstockShapeId } from './spec';

const SHAPES: HeadstockShapeId[] = ['inline', 'split', 'split-offset', 'paddle'];
const withShape = (spec: GuitarSpec, shape: HeadstockShapeId): GuitarSpec => {
  const s = structuredClone(spec);
  s.headstock.shape = shape;
  return s;
};

const cases: [string, GuitarSpec][] = [];
for (const p of PRESETS) for (const sh of SHAPES) cases.push([`${p.id} / ${sh}`, withShape(p.spec, sh)]);

describe.each(cases)('%s', (_name, spec) => {
  const lay = buildFretboardLayout(spec);
  const g = buildHeadstockGeometry(spec, lay);
  const N = spec.strings.gauges.length;
  const d = spec.headstock.tunerHoleDiameter;

  it('outline is a finite, CCW polygon that starts and ends on the fretboard corners', () => {
    for (const p of g.outline) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(signedArea(g.outline)).toBeGreaterThan(0);
    expect(dist(g.outline[0]!, lay.outline[3])).toBeLessThan(0.01);
    expect(dist(g.outline[g.outline.length - 1]!, lay.outline[0])).toBeLessThan(0.01);
    expect(dist(g.outline[0]!, g.outline[g.outline.length - 1]!)).toBeGreaterThan(1); // no repeated last point
  });

  it('respects length (nut face → tip) and maximum width', () => {
    const xs = g.outline.map((p) => p.x);
    const ys = g.outline.map((p) => p.y);
    expect(g.nutCenter).toBeDefined();
    expect(Math.min(...xs)).toBeCloseTo(g.nutCenter!.x - spec.headstock.length, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(spec.headstock.width + 0.01);
    // Nothing of the headstock lies on the bridge side of the board start.
    expect(Math.max(...xs)).toBeLessThanOrEqual(Math.max(lay.outline[0].x, lay.outline[3].x) + 1e-9);
  });

  it('one tuner per string, split per the shape rule', () => {
    expect(g.tuners).toHaveLength(N);
    expect(g.tuners.map((t) => t.stringIndex)).toEqual([...Array(N).keys()]);
    expect(g.tuners.filter((t) => t.side === 'bass')).toHaveLength(bassSideCount(spec));
    for (const t of g.tuners) {
      expect(t.diameter).toBe(d);
      expect(t.side === 'bass' ? t.center.y > 0 : t.center.y < 0).toBe(true);
    }
  });

  it('string paths run from the nut to a post without touching any other post', () => {
    const paths = g.stringPaths!;
    expect(paths).toHaveLength(N);
    const r = g.postDiameter! / 2;
    paths.forEach(([a, b], i) => {
      expect(distToSegment(a, lay.nut[3]!, lay.nut[2]!)).toBeLessThan(1e-6); // on the nut's back face
      expect(dist(b, g.tuners[i]!.center)).toBeCloseTo(r, 6);
      g.tuners.forEach((t, j) => {
        if (j !== i) expect(distToSegment(t.center, a, b)).toBeGreaterThan(r);
      });
    });
  });
});

describe.each(PRESETS.map((p) => [p.id, p.spec] as [string, GuitarSpec]))('preset %s (own headstock)', (_id, spec) => {
  const g = buildHeadstockGeometry(spec, buildFretboardLayout(spec));
  const d = spec.headstock.tunerHoleDiameter;

  it('tuner holes inside the outline with edge clearance and spacing', () => {
    for (const t of g.tuners) {
      expect(pointInPolygon(t.center, g.outline)).toBe(true);
      expect(distToPolygon(t.center, g.outline)).toBeGreaterThanOrEqual(d / 2 + TUNER_EDGE_CLEARANCE);
    }
    for (let i = 0; i < g.tuners.length; i++)
      for (let j = i + 1; j < g.tuners.length; j++)
        expect(dist(g.tuners[i]!.center, g.tuners[j]!.center)).toBeGreaterThanOrEqual(TUNER_MIN_PITCH * d);
  });
});

describe('tuner arrangement', () => {
  it('inline: all on the bass (+y) side, posts progressively farther from the nut toward the treble string', () => {
    const g = buildHeadstockGeometry(DEFAULT_SPEC, buildFretboardLayout(DEFAULT_SPEC));
    expect(g.tuners.every((t) => t.side === 'bass' && t.center.y > 0)).toBe(true);
    for (let i = 1; i < g.tuners.length; i++) expect(g.tuners[i]!.center.x).toBeGreaterThan(g.tuners[i - 1]!.center.x);
  });

  it('split: 3+3 for six strings, 4+3 for seven (extra on the bass side); split-offset: ceil(2N/3) on the bass side', () => {
    const six = withShape(DEFAULT_SPEC, 'split');
    expect(bassSideCount(six)).toBe(3);
    const seven = withShape(PRESETS.find((p) => p.id === 'multiscale-7')!.spec, 'split');
    expect(bassSideCount(seven)).toBe(4);
    expect(bassSideCount(withShape(DEFAULT_SPEC, 'split-offset'))).toBe(4);
    expect(bassSideCount(withShape(seven, 'split-offset'))).toBe(5);
    const four = withShape(PRESETS.find((p) => p.id === 'bass-4-34')!.spec, 'split-offset');
    expect(bassSideCount(four)).toBe(3);
  });

  it('custom outline is transformed from the headstock-local frame (+x toward the tip)', () => {
    const s = withShape(DEFAULT_SPEC, 'custom');
    s.headstock.customOutline = [
      { x: 0, y: -40 },
      { x: 0, y: 40 },
      { x: 180, y: 40 },
      { x: 180, y: -40 },
    ]; // clockwise in the local frame on purpose
    const lay = buildFretboardLayout(s);
    const g = buildHeadstockGeometry(s, lay);
    expect(signedArea(g.outline)).toBeGreaterThan(0);
    const xs = g.outline.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(g.nutCenter!.x - 180, 9);
    expect(Math.max(...xs)).toBeCloseTo(g.nutCenter!.x, 9);
    expect(g.tuners).toHaveLength(6);
    for (const t of g.tuners) expect(pointInPolygon(t.center, g.outline)).toBe(true);
  });

  it('custom without an outline falls back to the paddle blank', () => {
    const lay = buildFretboardLayout(DEFAULT_SPEC);
    const a = buildHeadstockGeometry(withShape(DEFAULT_SPEC, 'custom'), lay);
    const b = buildHeadstockGeometry(withShape(DEFAULT_SPEC, 'paddle'), lay);
    expect(a.outline).toEqual(b.outline);
  });
});
