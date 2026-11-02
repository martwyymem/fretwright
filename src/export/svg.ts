// SPDX-License-Identifier: GPL-3.0-or-later
/** Drawing → standalone SVG at 1:1 (1 user unit = 1 mm). */
import { drawingBounds, type Drawing, type Shape } from '../core/geom';
import { CAP_TO_FONT, FONT_FAMILY, LAYER_STYLE, fmt } from './style';

export const SVG_MARGIN = 5;

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

export function drawingToSvgImpl(d: Drawing): string {
  const b = drawingBounds(d) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const W = b.maxX - b.minX + 2 * SVG_MARGIN;
  const H = b.maxY - b.minY + 2 * SVG_MARGIN;
  // Flip y by transforming coordinates (no scale(1,-1)), so text is never mirrored.
  const X = (x: number) => fmt(x - b.minX + SVG_MARGIN);
  const Y = (y: number) => fmt(b.maxY - y + SVG_MARGIN);

  const shape = (s: Shape): string => {
    switch (s.kind) {
      case 'polyline': {
        const pts = s.points.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ');
        return `<${s.closed ? 'polygon' : 'polyline'} points="${pts}"/>`;
      }
      case 'circle':
        return `<circle cx="${X(s.center.x)}" cy="${Y(s.center.y)}" r="${fmt(s.r)}"/>`;
      case 'text': {
        const x = X(s.at.x);
        const y = Y(s.at.y);
        const anchor = s.anchor && s.anchor !== 'start' ? ` text-anchor="${s.anchor}"` : '';
        // Math CCW rotation is a negative SVG rotation (SVG y points down).
        const rot = s.rotate ? ` transform="rotate(${fmt(-s.rotate)} ${x} ${y})"` : '';
        return (
          `<text x="${x}" y="${y}" font-size="${fmt(s.size * CAP_TO_FONT)}"${anchor}${rot}` +
          ` fill="#000000" stroke="none">${escapeXml(s.text)}</text>`
        );
      }
    }
  };

  const groups = d.layers.map((l) => {
    const st = LAYER_STYLE[l.kind];
    const dash = st.dash ? ` stroke-dasharray="${st.dash.join(' ')}"` : '';
    const attrs =
      `id="${escapeXml(l.name)}" class="layer-${l.kind}" fill="none" stroke="${st.color}"` +
      ` stroke-width="${st.width}"${dash} stroke-linecap="round" stroke-linejoin="round"`;
    return `  <g ${attrs}>\n${l.shapes.map((s) => `    ${shape(s)}`).join('\n')}\n  </g>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(W)}mm" height="${fmt(H)}mm"` +
      ` viewBox="0 0 ${fmt(W)} ${fmt(H)}" font-family="${FONT_FAMILY}">`,
    `  <title>${escapeXml(d.title)}</title>`,
    ...groups,
    '</svg>',
    '',
  ].join('\n');
}
