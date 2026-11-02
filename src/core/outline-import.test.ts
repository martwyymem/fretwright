// SPDX-License-Identifier: GPL-3.0-or-later
import { dist, v } from './geom';
import { importOutlineFromSvg, parsePathData, parseTransform } from './outline-import';
import { polyBounds, selfIntersections, signedArea } from './polygon';

const svg = (body: string) => `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">${body}</svg>`;

describe('importOutlineFromSvg', () => {
  it('rect path: 4 CCW points, scaled to the target length, y centred, x from 0', () => {
    const r = importOutlineFromSvg(svg('<path d="M10 20 H110 V70 H10 Z"/>'), { targetLength: 200 });
    expect(r.warnings).toEqual([]);
    expect(r.points).toHaveLength(4);
    expect(signedArea(r.points)).toBeGreaterThan(0);
    const b = polyBounds(r.points);
    expect(b.minX).toBeCloseTo(0, 9);
    expect(b.maxX).toBeCloseTo(200, 9);
    expect(b.minY).toBeCloseTo(-50, 9);
    expect(b.maxY).toBeCloseTo(50, 9);
  });

  it('scales by width when only targetWidth is given', () => {
    const r = importOutlineFromSvg(svg('<rect x="0" y="0" width="300" height="100"/>'), { targetWidth: 50 });
    const b = polyBounds(r.points);
    expect(b.maxX - b.minX).toBeCloseTo(150, 9);
    expect(b.maxY - b.minY).toBeCloseTo(50, 9);
  });

  it('flips y: what is up in the drawing (small SVG y) becomes +y', () => {
    // Triangle with its apex at the top of the drawing (y = 0) and base at y = 100.
    const r = importOutlineFromSvg(svg('<polygon points="0,100 100,100 50,0"/>'), { targetLength: 100, origin: 'min-x' });
    const apex = r.points.reduce((a, p) => (p.y > a.y ? p : a));
    expect(apex.x).toBeCloseTo(50, 9);
    expect(apex.y).toBeCloseTo(50, 9);
    expect(r.points.filter((p) => Math.abs(p.y + 50) < 1e-9)).toHaveLength(2);
  });

  it('relative commands and arcs: stadium with exact radius', () => {
    const d = 'm 50,0 h 100 a 50 50 0 0 1 0 100 h -100 a50,50 0 0,1 0,-100 z';
    const r = importOutlineFromSvg(svg(`<path d="${d}"/>`), { targetLength: 200 });
    expect(r.warnings).toEqual([]);
    const b = polyBounds(r.points);
    expect(b.maxX - b.minX).toBeCloseTo(200, 6);
    expect(b.maxY - b.minY).toBeCloseTo(100, 3);
    // Arc points stay on the 50 mm circles (cubic approximation error < 0.03 mm at this radius).
    const right = v(150, 0), left = v(50, 0);
    for (const p of r.points) {
      if (p.x > 150.5) expect(Math.abs(dist(p, right) - 50)).toBeLessThan(0.03);
      if (p.x < 49.5) expect(Math.abs(dist(p, left) - 50)).toBeLessThan(0.03);
    }
    expect(Math.abs(signedArea(r.points))).toBeCloseTo(100 * 100 + Math.PI * 50 * 50, -1);
    expect(selfIntersections(r.points)).toEqual([]);
  });

  it('cubic, smooth cubic and quadratic curves; compact arc flags', () => {
    // Cubic bulging up (SVG −y) by 0.75·40 = 30, quadratic bulging down by 30.
    const r = importOutlineFromSvg(svg('<path d="M0 0C0-40 100-40 100 0Q50 60 0 0z"/>'), { targetLength: 100 });
    const b = polyBounds(r.points);
    expect(Math.abs(b.maxY - 30)).toBeLessThan(0.05); // flattening chord tolerance
    expect(Math.abs(b.minY + 30)).toBeLessThan(0.05);
    expect(b.maxX - b.minX).toBeCloseTo(100, 6);
    // S reflects the previous control point.
    const subs = parsePathData('M0 0 C10 10 20 10 30 0 S50 -10 60 0');
    const s2 = subs[0]!.segs[1]!;
    expect(s2.k === 'C' && s2.c1.x === 40 && s2.c1.y === -10).toBe(true);
    // "a25,25 0 1150,0": flags 1,1 written without separators.
    const arc = parsePathData('M0,0 a25,25 0 1150,0');
    const last = arc[0]!.segs[arc[0]!.segs.length - 1]!;
    expect(last.p.x).toBeCloseTo(50, 9);
    expect(last.p.y).toBeCloseTo(0, 9);
    // Repeated implicit commands (M then implicit L pairs, numbers like "1.5.5" and "-1-2").
    const imp = parsePathData('M0 0 10 0 10 10 l-1.5.5-1-2');
    expect(imp[0]!.segs).toHaveLength(4);
    expect(imp[0]!.segs[2]!.p).toEqual(v(8.5, 10.5));
    expect(imp[0]!.segs[3]!.p).toEqual(v(7.5, 8.5));
  });

  it('multi-subpath file: picks the largest and says so', () => {
    const file = svg(
      '<path d="M0 0 h10 v10 h-10 z M100 100 h200 v80 h-200 z"/><circle cx="20" cy="20" r="15"/><path d="M0 300 L50 300"/>',
    );
    const r = importOutlineFromSvg(file, { targetLength: 400 });
    expect(r.points).toHaveLength(4);
    const b = polyBounds(r.points);
    expect(b.maxY - b.minY).toBeCloseTo(160, 9); // 200 × 80 rectangle scaled by 2
    expect(r.warnings.some((w) => /largest/.test(w))).toBe(true);
  });

  it('auto-closes an open path with a warning', () => {
    const r = importOutlineFromSvg(svg('<path d="M0 0 L100 0 L100 50 L0 50"/>'), { targetLength: 100 });
    expect(r.points).toHaveLength(4);
    expect(r.warnings.some((w) => /not closed/.test(w))).toBe(true);
  });

  it('warns when nothing usable is found', () => {
    const none = importOutlineFromSvg(svg('<text>hi</text>'), { targetLength: 100 });
    expect(none.points).toEqual([]);
    expect(none.warnings.join(' ')).toMatch(/No shape found/);
    const defsOnly = importOutlineFromSvg(svg('<defs><rect width="10" height="10"/></defs>'), {});
    expect(defsOnly.points).toEqual([]);
  });

  it('applies element and group transforms', () => {
    const r = importOutlineFromSvg(svg('<g transform="translate(100 0)"><rect width="50" height="50" transform="scale(2,1)"/></g>'));
    const b = polyBounds(r.points);
    expect(b.maxX - b.minX).toBeCloseTo(100, 9);
    expect(b.maxY - b.minY).toBeCloseTo(50, 9);
    expect(r.warnings.some((w) => /millimetres/.test(w))).toBe(true);
    const m = parseTransform('rotate(90)');
    expect(m[0]).toBeCloseTo(0, 12);
    expect(m[1]).toBeCloseTo(1, 12);
  });

  it('supports ellipses (and rounded rects) as outlines', () => {
    const r = importOutlineFromSvg(svg('<ellipse cx="0" cy="0" rx="100" ry="50"/>'), { targetLength: 200 });
    for (const p of r.points) expect((p.x - 100) ** 2 / 100 ** 2 + p.y ** 2 / 50 ** 2).toBeCloseTo(1, 2);
    const rr = importOutlineFromSvg(svg('<rect width="100" height="60" rx="10"/>'), { targetLength: 100 });
    expect(Math.abs(signedArea(rr.points))).toBeCloseTo(100 * 60 - (4 - Math.PI) * 100, 0);
  });

  it('puts x = 0 on the neck-end edge at the centre line, not on a horn tip', () => {
    // A U shape: two horns sticking out 40 units past a notch that ends at x = 40.
    const u = '<polygon points="0,0 200,0 200,100 0,100 0,70 40,70 40,30 0,30"/>';
    const r = importOutlineFromSvg(svg(u), { targetLength: 200 });
    expect(polyBounds(r.points).minX).toBeCloseTo(-40, 9);
    const m = importOutlineFromSvg(svg(u), { targetLength: 200, origin: 'min-x' });
    expect(polyBounds(m.points).minX).toBeCloseTo(0, 9);
  });

  it('drops duplicate points', () => {
    const r = importOutlineFromSvg(svg('<path d="M0 0 L0 0 L100 0 L100 0 L100 50 L0 50 L0 0 Z"/>'), { targetLength: 100 });
    expect(r.points).toHaveLength(4);
  });
});
