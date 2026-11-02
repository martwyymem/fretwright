// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Drawing → tiled PDF via jsPDF with unit 'mm': 1 PDF user unit = 1 mm, no scaling anywhere.
 *
 * Page layout (page coordinates: mm from the top-left corner, y down):
 *   [margin] [drawing window: tile.window mapped 1:1] [margin]
 *            [footer band FOOTER_H: rulers | title, tile label, print note]
 */
import { jsPDF } from 'jspdf';
import { drawingBounds, shapeBounds, type Drawing, type Shape, type Vec2 } from '../core/geom';
import type { PdfOptions, Tile, TilePlan } from './index';
import { CAP_TO_FONT, LAYER_STYLE, MM_PER_PT, fmt, rowLabel, tileLabel, type StrokeStyle } from './style';
import { FOOTER_H, PAPER_MM, planTilesImpl } from './tiles';

type Anchor = 'start' | 'middle' | 'end';
type Pt = [number, number];

const PRINT_NOTE = "Print at 100% / Actual size - do not 'fit to page'";
const GREY = '#888888';
const fmtMm = (n: number) => fmt(n, 1);

/** jsPDF's standard fonts are WinAnsi: keep Latin-1, map common typography, drop the rest. */
export function pdfSafe(s: string): string {
  return s
    .replace(/[–—−]/g, '-')
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/[‘’′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/⌀/g, 'Ø')
    .replace(/[^\x20-\xFF]/g, '?');
}

/** A PDF being assembled; the first page comes from the constructor, the rest from addPage. */
class Pdf {
  doc: jsPDF | null = null;

  page(w: number, h: number): jsPDF {
    const orientation = w > h ? 'landscape' : 'portrait';
    if (!this.doc) this.doc = new jsPDF({ unit: 'mm', format: [w, h], orientation, compress: true });
    else this.doc.addPage([w, h], orientation);
    const doc = this.doc;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    doc.setLineCap('round');
    doc.setLineJoin('round');
    return doc;
  }

  bytes(): Uint8Array {
    return new Uint8Array(this.doc!.output('arraybuffer'));
  }
}

function stroke(doc: jsPDF, st: StrokeStyle) {
  doc.setDrawColor(st.color);
  doc.setLineWidth(st.width);
  doc.setLineDashPattern(st.dash ? [...st.dash] : [], 0);
}

/** Text with `cap` height in mm at page point (x, y) on the baseline; rotate is CCW degrees. */
function text(doc: jsPDF, s: string, x: number, y: number, cap: number, anchor: Anchor = 'start', rotate = 0) {
  const str = pdfSafe(s);
  doc.setFontSize((cap * CAP_TO_FONT) / MM_PER_PT);
  const w = doc.getTextWidth(str);
  const k = anchor === 'middle' ? 0.5 : anchor === 'end' ? 1 : 0;
  const a = (rotate * Math.PI) / 180;
  // Page y points down, so the baseline direction of CCW-rotated text is (cos a, -sin a).
  doc.text(str, x - Math.cos(a) * w * k, y + Math.sin(a) * w * k, rotate ? { angle: rotate } : {});
}

function fitText(doc: jsPDF, s: string, cap: number, maxW: number): string {
  doc.setFontSize((cap * CAP_TO_FONT) / MM_PER_PT);
  let str = pdfSafe(s);
  if (doc.getTextWidth(str) <= maxW) return str;
  while (str.length > 1 && doc.getTextWidth(str + '...') > maxW) str = str.slice(0, -1);
  return str + '...';
}

function path(doc: jsPDF, pts: Pt[], closed: boolean) {
  if (pts.length === 0) return;
  doc.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) doc.lineTo(pts[i]![0], pts[i]![1]);
  if (closed) doc.close();
  doc.stroke();
}

/** Draw one shape through a drawing → page mapping with uniform scale `k` (1 for 1:1). */
function shape(doc: jsPDF, s: Shape, map: (p: Vec2) => Pt, k: number) {
  switch (s.kind) {
    case 'polyline':
      path(doc, s.points.map(map), s.closed);
      return;
    case 'circle': {
      const [x, y] = map(s.center);
      doc.circle(x, y, s.r * k, 'S');
      return;
    }
    case 'text': {
      const [x, y] = map(s.at);
      text(doc, s.text, x, y, s.size * k, s.anchor, s.rotate ?? 0);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Footer: calibration rulers + labels
// ---------------------------------------------------------------------------

function ruler(doc: jsPDF, x: number, y: number, step: number, n: number, majorEvery: number, label: string) {
  stroke(doc, { width: 0.25, color: '#000000' });
  doc.line(x, y, x + step * n, y);
  doc.setLineWidth(0.15);
  for (let i = 0; i <= n; i++) {
    const h = i % majorEvery === 0 ? 3.5 : 2;
    doc.line(x + i * step, y, x + i * step, y - h);
  }
  text(doc, label, x + step * n + 2, y + 0.4, 1.8);
}

function footer(doc: jsPDF, pageW: number, pageH: number, margin: number, title: string, lines: string[]) {
  const pw = pageW - 2 * margin;
  const top = pageH - margin - FOOTER_H;
  stroke(doc, { width: 0.1, color: GREY });
  doc.line(margin, top + 1, margin + pw, top + 1);
  ruler(doc, margin, top + 6, 10, 10, 5, '100 mm');
  ruler(doc, margin, top + 13, 25.4 / 2, 8, 2, '4 in');
  const right = margin + pw;
  const textW = pw - 118;
  doc.setFont('helvetica', 'bold');
  text(doc, fitText(doc, title, 2.4, textW), right, top + 5.5, 2.4, 'end');
  doc.setFont('helvetica', 'normal');
  lines.forEach((l, i) => text(doc, fitText(doc, l, 1.8, textW), right, top + 9.5 + i * 3.4, 1.8, 'end'));
}

// ---------------------------------------------------------------------------
// Tile pages
// ---------------------------------------------------------------------------

interface TileCtx {
  doc: jsPDF;
  d: Drawing;
  plan: TilePlan;
  tile: Tile;
  margin: number;
  overlap: number;
}

const toPage = (tile: Tile, margin: number) => (p: Vec2): Pt => [
  margin + p.x - tile.window.minX,
  margin + tile.window.maxY - p.y,
];

function crosshair(doc: jsPDF, [x, y]: Pt, r: number) {
  doc.circle(x, y, r * 0.5, 'S');
  doc.line(x - r, y, x + r, y);
  doc.line(x, y - r, x, y + r);
}

/** Overlap guides, drawn in drawing coordinates so they coincide on neighbouring sheets. */
function overlapGuides({ doc, plan, tile, margin, overlap }: TileCtx) {
  const map = toPage(tile, margin);
  const w = tile.window;
  const r = Math.min(5, Math.max(1.5, overlap * 0.4));
  const inset = Math.max(overlap / 2, 2.5);
  const tw = w.maxX - w.minX;
  const th = w.maxY - w.minY;
  const hint = (s: string, x: number, y: number, rot = 0) => {
    doc.setTextColor(GREY);
    text(doc, s, x, y, 2, 'middle', rot);
    doc.setTextColor(0);
  };
  const sides = [
    { has: tile.col < plan.cols - 1, edge: 'right', n: tileLabel(tile.row, tile.col + 1) },
    { has: tile.col > 0, edge: 'left', n: tileLabel(tile.row, tile.col - 1) },
    { has: tile.row > 0, edge: 'top', n: tileLabel(tile.row - 1, tile.col) },
    { has: tile.row < plan.rows - 1, edge: 'bottom', n: tileLabel(tile.row + 1, tile.col) },
  ] as const;
  for (const s of sides) {
    if (!s.has) continue;
    const vertical = s.edge === 'left' || s.edge === 'right';
    // Where the neighbour's window edge lies on this sheet, and the middle of the shared band.
    const edge =
      s.edge === 'right' ? w.maxX - overlap : s.edge === 'left' ? w.minX + overlap
      : s.edge === 'top' ? w.maxY - overlap : w.minY + overlap;
    const mid =
      s.edge === 'right' ? w.maxX - overlap / 2 : s.edge === 'left' ? w.minX + overlap / 2
      : s.edge === 'top' ? w.maxY - overlap / 2 : w.minY + overlap / 2;
    stroke(doc, { width: 0.15, color: GREY, dash: [2, 2] });
    if (vertical) path(doc, [map({ x: edge, y: w.minY }), map({ x: edge, y: w.maxY })], false);
    else path(doc, [map({ x: w.minX, y: edge }), map({ x: w.maxX, y: edge })], false);
    stroke(doc, { width: 0.15, color: '#000000' });
    for (const f of [0.25, 0.75]) {
      crosshair(doc, map(vertical ? { x: mid, y: w.minY + th * f } : { x: w.minX + tw * f, y: mid }), r);
    }
    const [px, py] = map(vertical ? { x: mid, y: (w.minY + w.maxY) / 2 } : { x: (w.minX + w.maxX) / 2, y: mid });
    // Side hints run along the edge with the tops of the letters facing the neighbour.
    if (s.edge === 'right') hint(`tape to ${s.n} (right)`, margin + tw - inset - 1, py, -90);
    if (s.edge === 'left') hint(`tape to ${s.n} (left)`, margin + inset + 1, py, 90);
    if (s.edge === 'top') hint(`tape to ${s.n} (above)`, px, margin + inset + 1);
    if (s.edge === 'bottom') hint(`tape to ${s.n} (below)`, px, margin + th - inset + 1);
  }
}

/** Points ≈1 mm apart along every shape (text: its rough box), to find empty paper. */
function samplePoints(d: Drawing): Vec2[] {
  const out: Vec2[] = [];
  const along = (a: Vec2, b: Vec2) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  };
  for (const l of d.layers) {
    for (const s of l.shapes) {
      if (s.kind === 'polyline') {
        const pts = s.closed ? [...s.points, ...s.points.slice(0, 1)] : s.points;
        pts.forEach((p, k) => (k + 1 < pts.length ? along(p, pts[k + 1]!) : out.push(p)));
      } else if (s.kind === 'circle') {
        const n = Math.max(8, Math.ceil(2 * Math.PI * s.r));
        for (let k = 0; k < n; k++) {
          const a = (2 * Math.PI * k) / n;
          out.push({ x: s.center.x + s.r * Math.cos(a), y: s.center.y + s.r * Math.sin(a) });
        }
      } else {
        const b = shapeBounds(s)!;
        along({ x: b.minX, y: b.minY }, { x: b.maxX, y: b.maxY });
        along({ x: b.minX, y: b.maxY }, { x: b.maxX, y: b.minY });
      }
    }
  }
  return out;
}

/**
 * Notes on the first sheet, at the spot (clear of overlap bands) that covers the least geometry,
 * preferring the top-left. The box is only painted white when it hides nothing.
 */
function notesBox({ doc, d, tile, margin, overlap }: TileCtx) {
  const notes = d.notes ?? [];
  if (notes.length === 0) return;
  const cap = 2;
  const lh = 3.6;
  doc.setFontSize((cap * CAP_TO_FONT) / MM_PER_PT);
  const bw = Math.max(...notes.map((n) => doc.getTextWidth(pdfSafe(n)))) + 4;
  const bh = notes.length * lh + 2;
  const w = tile.window;
  const inset = overlap + 2;
  const map = toPage(tile, margin);
  const pts = samplePoints(d).map(map);
  const score = (x: number, y: number) =>
    pts.reduce((n, [px, py]) => (px >= x && px <= x + bw && py >= y && py <= y + bh ? n + 1 : n), 0);
  let best = { x: margin + inset, y: margin + inset, n: Infinity };
  const x1 = margin + w.maxX - w.minX - inset - bw;
  const y1 = margin + w.maxY - w.minY - inset - bh;
  for (let y = margin + inset; y <= y1 && best.n > 0; y += 5) {
    for (let x = margin + inset; x <= x1 && best.n > 0; x += 5) {
      const n = score(x, y);
      if (n < best.n) best = { x, y, n };
    }
  }
  const { x, y } = best;
  if (best.n === 0) {
    doc.setFillColor('#ffffff');
    stroke(doc, { width: 0.15, color: GREY });
    doc.rect(x, y, bw, bh, 'FD');
  }
  notes.forEach((n, i) => text(doc, n, x + 2, y + 1 + lh * (i + 1) - 0.9, cap));
}

function tilePage(ctx: TileCtx, index: number, title: string) {
  const { doc, d, plan, tile, margin } = ctx;
  const w = tile.window;
  const tw = w.maxX - w.minX;
  const th = w.maxY - w.minY;
  const map = toPage(tile, margin);

  doc.saveGraphicsState();
  doc.rect(margin, margin, tw, th, null);
  doc.clip();
  doc.discardPath();
  for (const l of d.layers) {
    stroke(doc, LAYER_STYLE[l.kind]);
    for (const s of l.shapes) shape(doc, s, map, 1);
  }
  overlapGuides(ctx);
  doc.restoreGraphicsState();

  // Window frame: the printed edge of this sheet's share of the drawing.
  stroke(doc, { width: 0.1, color: GREY });
  doc.rect(margin, margin, tw, th, 'S');
  if (index === 0) notesBox(ctx);

  const row = tile.label.replace(/\d+$/, '');
  footer(doc, plan.pageWidth, plan.pageHeight, margin, title, [
    `${tile.label} (row ${row}, col ${tile.col + 1}) - page ${index + 1} of ${plan.tiles.length}`,
    PRINT_NOTE,
  ]);
}

function renderDrawing(pdf: Pdf, d: Drawing, plan: TilePlan, opts: PdfOptions) {
  const overlap = opts.mode === 'single' ? 0 : Math.max(0, opts.overlap);
  const margin = Math.max(0, opts.margin);
  plan.tiles.forEach((tile, i) => {
    const doc = pdf.page(plan.pageWidth, plan.pageHeight);
    tilePage({ doc, d, plan, tile, margin, overlap }, i, d.title);
  });
}

// ---------------------------------------------------------------------------
// Cover
// ---------------------------------------------------------------------------

const COVER_HEADER = 26;
const ENTRY_H = 42;
const MAP_W = 60;
const MAP_H = 36;

/** Assembly mini-map: tile grid with labels plus the drawing's outline, scaled into a box. */
function miniMap(doc: jsPDF, d: Drawing, plan: TilePlan, x: number, y: number) {
  const ws = plan.tiles.map((t) => t.window);
  const minX = Math.min(...ws.map((w) => w.minX));
  const maxX = Math.max(...ws.map((w) => w.maxX));
  const minY = Math.min(...ws.map((w) => w.minY));
  const maxY = Math.max(...ws.map((w) => w.maxY));
  const k = Math.min(MAP_W / (maxX - minX), MAP_H / (maxY - minY));
  const map = (p: Vec2): Pt => [x + (p.x - minX) * k, y + (maxY - p.y) * k];
  const outline = d.layers.some((l) => l.kind === 'cut')
    ? d.layers.filter((l) => l.kind === 'cut')
    : d.layers.filter((l) => l.kind !== 'annotation');
  stroke(doc, { width: 0.2, color: '#000000' });
  for (const l of outline) for (const s of l.shapes) if (s.kind !== 'text') shape(doc, s, map, k);
  stroke(doc, { width: 0.15, color: GREY });
  doc.setTextColor(GREY);
  for (const t of plan.tiles) {
    const [x0, y0] = map({ x: t.window.minX, y: t.window.maxY });
    const tw = (t.window.maxX - t.window.minX) * k;
    const th = (t.window.maxY - t.window.minY) * k;
    doc.rect(x0, y0, tw, th, 'S');
    const cap = Math.min(2.5, th * 0.25, tw * 0.15);
    text(doc, t.label, x0 + tw / 2, y0 + th / 2 + cap / 2, cap, 'middle');
  }
  doc.setTextColor(0);
}

function renderCover(
  pdf: Pdf,
  ds: Drawing[],
  plans: TilePlan[],
  opts: PdfOptions,
  perPage: number,
  coverPages: number,
) {
  const [pageW, pageH] = PAPER_MM[opts.paper];
  const margin = Math.max(0, opts.margin);
  const total = coverPages + plans.reduce((n, p) => n + p.tiles.length, 0);
  let first = coverPages + 1;
  const ranges = plans.map((p) => {
    const r = [first, first + p.tiles.length - 1] as const;
    first += p.tiles.length;
    return r;
  });
  for (let page = 0; page < coverPages; page++) {
    const doc = pdf.page(pageW, pageH);
    doc.setFont('helvetica', 'bold');
    text(doc, 'Fretwright templates', margin, margin + 7, 5);
    doc.setFont('helvetica', 'normal');
    const how =
      opts.mode === 'single'
        ? 'Each template is one full-size page for a large-format printer or plotter.'
        : `Sheets overlap by ${opts.overlap} mm: trim one edge, line up the crosshair marks, then tape.`;
    text(doc, `${ds.length} template(s), ${total} pages. ${how}`, margin, margin + 13, 2);
    text(doc, `${PRINT_NOTE}. Check both rulers below with a real ruler before cutting.`, margin, margin + 17.5, 2);
    const entries = ds.slice(page * perPage, (page + 1) * perPage);
    entries.forEach((d, j) => {
      const i = page * perPage + j;
      const plan = plans[i]!;
      const [a, bEnd] = ranges[i]!;
      const y = margin + COVER_HEADER + j * ENTRY_H;
      miniMap(doc, d, plan, margin, y);
      const tx = margin + MAP_W + 6;
      const maxW = pageW - margin - tx;
      doc.setFont('helvetica', 'bold');
      text(doc, fitText(doc, `${i + 1}. ${d.title}`, 3, maxW), tx, y + 3, 3);
      doc.setFont('helvetica', 'normal');
      const b = drawingBounds(d);
      const size = b ? `${fmtMm(b.maxX - b.minX)} x ${fmtMm(b.maxY - b.minY)} mm` : 'empty';
      const paper =
        opts.mode === 'single'
          ? `one ${fmtMm(plan.pageWidth)} x ${fmtMm(plan.pageHeight)} mm page`
          : `${opts.paper.toUpperCase()} ${plan.orientation}`;
      const lines = [
        `PDF pages ${a === bEnd ? a : `${a}-${bEnd}`} (${plan.tiles.length} sheet${plan.tiles.length > 1 ? 's' : ''})`,
        `Grid: rows A-${rowLabel(plan.rows - 1)} x columns 1-${plan.cols}, ${paper}`,
        `Drawing size ${size}. Id: ${d.id}`,
      ];
      lines.forEach((l, n) => text(doc, fitText(doc, l, 2, maxW), tx, y + 8.5 + n * 4.2, 2));
    });
    footer(doc, pageW, pageH, margin, 'Fretwright: cover', [
      `Cover page ${page + 1} of ${coverPages} - PDF page ${page + 1} of ${total}`,
      PRINT_NOTE,
    ]);
  }
}

// ---------------------------------------------------------------------------
// Public implementations
// ---------------------------------------------------------------------------

export function drawingToPdfImpl(d: Drawing, opts: PdfOptions): Uint8Array {
  const pdf = new Pdf();
  renderDrawing(pdf, d, planTilesImpl(d, opts), opts);
  return pdf.bytes();
}

/** Cover entries per cover page for a given paper and margin. */
export function coverCapacity(opts: PdfOptions): number {
  const pageH = PAPER_MM[opts.paper][1];
  return Math.max(1, Math.floor((pageH - 2 * Math.max(0, opts.margin) - FOOTER_H - COVER_HEADER) / ENTRY_H));
}

export function drawingsToPdfImpl(ds: Drawing[], opts: PdfOptions): Uint8Array {
  const plans = ds.map((d) => planTilesImpl(d, opts));
  const perPage = coverCapacity(opts);
  const coverPages = Math.max(1, Math.ceil(ds.length / perPage));
  const pdf = new Pdf();
  renderCover(pdf, ds, plans, opts, perPage, coverPages);
  ds.forEach((d, i) => renderDrawing(pdf, d, plans[i]!, opts));
  return pdf.bytes();
}
