// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { drawingBounds } from '../core/geom';
import { drawingToSvg } from './index';
import { SVG_MARGIN } from './svg';
import { sampleDrawing } from './fixtures.test-util';

describe('drawingToSvg', () => {
  const d = sampleDrawing(100, 50);
  const svg = drawingToSvg(d);
  const b = drawingBounds(d)!;
  const W = b.maxX - b.minX + 2 * SVG_MARGIN;
  const H = b.maxY - b.minY + 2 * SVG_MARGIN;

  it('is sized in mm with a matching mm viewBox (1:1)', () => {
    const w = Number(/width="([\d.]+)mm"/.exec(svg)![1]);
    const h = Number(/height="([\d.]+)mm"/.exec(svg)![1]);
    expect(w).toBeCloseTo(W, 3);
    expect(h).toBeCloseTo(H, 3);
    const vb = /viewBox="([^"]+)"/.exec(svg)![1]!.split(' ').map(Number);
    expect(vb[0]).toBe(0);
    expect(vb[1]).toBe(0);
    expect(vb[2]).toBeCloseTo(W, 3);
    expect(vb[3]).toBeCloseTo(H, 3);
  });

  it('flips y: a point with larger y is higher on the page (smaller SVG y)', () => {
    const pts = /<polygon points="([^"]+)"/.exec(svg)![1]!.split(' ').map((p) => p.split(',').map(Number));
    // Input order: (0,0) (100,0) (100,50) (0,50).
    expect(pts[0]![1]).toBeGreaterThan(pts[3]![1]!);
    expect(pts[3]).toEqual([b.minX * -1 + SVG_MARGIN, b.maxY - 50 + SVG_MARGIN]);
    expect(pts[0]![1]! - pts[3]![1]!).toBeCloseTo(50, 6);
    // x is not mirrored.
    expect(pts[1]![0]! - pts[0]![0]!).toBeCloseTo(100, 6);
  });

  it('never mirrors text: no negative scale anywhere, rotation counter-flipped', () => {
    expect(svg).not.toMatch(/scale\(/);
    expect(svg).not.toMatch(/matrix\(/);
    // Math CCW 45° is SVG rotate(-45).
    expect(svg).toMatch(/<text [^>]*transform="rotate\(-45 /);
    expect(svg).toMatch(/text-anchor="middle"/);
  });

  it('has one group per layer, styled by kind, plus a title, with text escaped', () => {
    for (const l of d.layers) expect(svg).toContain(`<g id="${l.name}"`);
    expect(svg).toMatch(/<g id="outline"[^>]*stroke-width="0.35"/);
    expect(svg).toMatch(/<g id="centerline"[^>]*stroke-dasharray/);
    expect(svg).toContain('<title>Sample &lt;&amp;&gt; &quot;template&quot;</title>');
    expect(svg).toMatch(/<circle cx="[\d.]+" cy="[\d.]+" r="4"\/>/);
  });
});
