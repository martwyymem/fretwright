// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
import { cleanup, render } from '@testing-library/react';
import type { Drawing } from '../core';
import { DrawingView, niceLength } from './DrawingView';

afterEach(cleanup);

const tiny: Drawing = {
  id: 'tiny',
  title: 'Tiny',
  layers: [
    {
      name: 'outline',
      kind: 'cut',
      shapes: [
        { kind: 'polyline', closed: true, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }] },
        { kind: 'polyline', closed: false, points: [{ x: 0, y: 10 }, { x: 50, y: 10 }] },
      ],
    },
    { name: 'holes', kind: 'mark', shapes: [{ kind: 'circle', center: { x: 20, y: 20 }, r: 3 }] },
    { name: 'center', kind: 'reference', shapes: [{ kind: 'polyline', closed: false, points: [{ x: -10, y: 0 }, { x: 110, y: 0 }] }] },
    { name: 'labels', kind: 'annotation', shapes: [{ kind: 'text', at: { x: 5, y: 40 }, text: 'Hello', size: 4, rotate: 90 }] },
  ],
};

describe('DrawingView', () => {
  it('renders one SVG element per shape, grouped by layer kind', () => {
    const { container } = render(<DrawingView drawing={tiny} />);
    expect(container.querySelectorAll('[data-shape]')).toHaveLength(5);
    expect(container.querySelectorAll('polygon')).toHaveLength(1);
    expect(container.querySelectorAll('polyline')).toHaveLength(2);
    expect(container.querySelectorAll('circle')).toHaveLength(1);
    expect(container.querySelectorAll('text')).toHaveLength(1);
    expect(container.querySelector('g.dv-cut')).not.toBeNull();
    expect(container.querySelector('g.dv-reference')).not.toBeNull();
    expect(container.querySelector('text')!.textContent).toBe('Hello');
  });

  it('flips y and fits the viewBox around the drawing', () => {
    const { container } = render(<DrawingView drawing={tiny} />);
    const c = container.querySelector('circle')!;
    expect(c.getAttribute('cy')).toBe('-20');
    const [x, y, w, h] = container.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number);
    // Bounds: x −10..110, y 0..50 (text estimate stays inside) → svg y −50..0.
    expect(x!).toBeLessThan(-10);
    expect(x! + w!).toBeGreaterThan(110);
    expect(y!).toBeLessThan(-50);
    expect(y! + h!).toBeGreaterThan(0);
  });

  it('niceLength picks 1/2/5 steps', () => {
    expect(niceLength(130)).toBe(100);
    expect(niceLength(230)).toBe(200);
    expect(niceLength(7)).toBe(5);
    expect(niceLength(0.3)).toBe(0.2);
  });
});
