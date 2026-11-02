// SPDX-License-Identifier: GPL-3.0-or-later
/** Print / download controls. Exporters may not be implemented yet: every call is guarded. */
import { useEffect, useRef, useState } from 'react';
import type { Drawing, GuitarSpec } from '../core';
import { TEMPLATES } from '../core';
import { DEFAULT_PDF_OPTIONS, drawingToDxf, drawingToPdf, drawingToSvg, drawingsToPdf, type PaperSize, type PdfOptions } from '../export';
import { buildTemplate, downloadFile, exportErrorMessage } from './build';

const PAPERS: { value: PaperSize; label: string }[] = [
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'US Letter' },
  { value: 'a3', label: 'A3' },
  { value: 'tabloid', label: 'Tabloid (11×17″)' },
];

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';

type Status = { kind: 'ok' | 'error'; text: string } | null;

export function ExportBar({ spec, templateId, blocked }: { spec: GuitarSpec; templateId: string; blocked: string | null }) {
  const [paper, setPaper] = useState<PaperSize>(DEFAULT_PDF_OPTIONS.paper);
  const [mode, setMode] = useState<PdfOptions['mode']>(DEFAULT_PDF_OPTIONS.mode);
  const [include, setInclude] = useState<Set<string>>(() => new Set(TEMPLATES.map((t) => t.id)));
  const [status, setStatus] = useState<Status>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);
  const name = slug(spec.meta.name);
  const opts: PdfOptions = { ...DEFAULT_PDF_OPTIONS, paper, mode };

  useEffect(() => {
    if (!helpOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setHelpOpen(false);
    const onDown = (e: MouseEvent) => helpRef.current && !helpRef.current.contains(e.target as Node) && setHelpOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [helpOpen]);

  const current = (): Drawing | null => {
    const r = buildTemplate(spec, templateId);
    if (!r.ok) {
      setStatus({ kind: 'error', text: `This template could not be built: ${r.error}` });
      return null;
    }
    return r.drawing;
  };

  const run = (what: string, fn: () => void) => {
    try {
      fn();
    } catch (e) {
      setStatus({ kind: 'error', text: exportErrorMessage(what, e) });
    }
  };

  const printAll = () =>
    run('PDF', () => {
      const ids = TEMPLATES.filter((t) => include.has(t.id)).map((t) => t.id);
      if (ids.length === 0) {
        setStatus({ kind: 'error', text: 'Pick at least one template to print.' });
        return;
      }
      const drawings: Drawing[] = [];
      const failed: string[] = [];
      for (const id of ids) {
        const r = buildTemplate(spec, id);
        if (r.ok) drawings.push(r.drawing);
        else failed.push(TEMPLATES.find((t) => t.id === id)?.title ?? id);
      }
      if (drawings.length === 0) {
        setStatus({ kind: 'error', text: 'None of the selected templates could be built.' });
        return;
      }
      const bytes = drawingsToPdf(drawings, opts);
      downloadFile(`${name}-templates.pdf`, bytes, 'application/pdf');
      setStatus({
        kind: 'ok',
        text: `Downloaded ${drawings.length} template${drawings.length > 1 ? 's' : ''} as PDF.` + (failed.length ? ` Skipped: ${failed.join(', ')}.` : ''),
      });
    });

  const one = (what: 'SVG' | 'DXF' | 'PDF') =>
    run(what, () => {
      const d = current();
      if (!d) return;
      const file = `${name}-${d.id}`;
      if (what === 'SVG') downloadFile(`${file}.svg`, drawingToSvg(d), 'image/svg+xml');
      else if (what === 'DXF') downloadFile(`${file}.dxf`, drawingToDxf(d), 'application/dxf');
      else downloadFile(`${file}.pdf`, drawingToPdf(d, opts), 'application/pdf');
      setStatus({ kind: 'ok', text: `Downloaded ${d.title} as ${what}.` });
    });

  const toggle = (id: string) =>
    setInclude((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const disabled = blocked !== null;

  return (
    <section className="export" aria-label="Print and export">
      <div className="export-row">
        <div className="export-main">
          <button type="button" className="primary" onClick={printAll} disabled={disabled} title={blocked ?? undefined}>
            Print templates (PDF)
          </button>
          <label className="compact">
            <span>Paper</span>
            <select value={paper} onChange={(e) => setPaper(e.target.value as PaperSize)}>
              {PAPERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="compact">
            <span>Layout</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as PdfOptions['mode'])}>
              <option value="tiled">Tiled pages (tape together)</option>
              <option value="single">One large page (plotter)</option>
            </select>
          </label>
          <button type="button" className="link" aria-expanded={pickOpen} aria-controls="export-pick" onClick={() => setPickOpen((o) => !o)}>
            Templates: {include.size}/{TEMPLATES.length}
          </button>
          <div className="popover-anchor" ref={helpRef}>
            <button type="button" className="link" aria-expanded={helpOpen} aria-controls="print-help" onClick={() => setHelpOpen((o) => !o)}>
              How to print
            </button>
            {helpOpen && (
              <div className="popover" id="print-help" role="dialog" aria-label="How to print">
                <ol>
                  <li>
                    Print at <strong>100%</strong> / <strong>Actual size</strong>. Turn off “Fit to page” and “Scale to fit”.
                  </li>
                  <li>
                    Measure the <strong>100 mm ruler</strong> on each page. If it isn’t exactly 100 mm, fix your printer’s scaling and print again.
                  </li>
                  <li>Trim one edge of each page and line up the overlap marks with the next page, then tape along the joint.</li>
                  <li>Check a long dimension (e.g. nut to fret 12) on the taped template before cutting wood.</li>
                </ol>
                <button type="button" className="secondary small" onClick={() => setHelpOpen(false)}>
                  Got it
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="export-one" role="group" aria-label="Download this template">
          <span className="subtle">This template:</span>
          <button type="button" className="secondary small" onClick={() => one('SVG')} disabled={disabled}>
            SVG
          </button>
          <button type="button" className="secondary small" onClick={() => one('DXF')} disabled={disabled}>
            DXF
          </button>
          <button type="button" className="secondary small" onClick={() => one('PDF')} disabled={disabled}>
            PDF
          </button>
        </div>
      </div>
      {pickOpen && (
        <fieldset className="export-pick" id="export-pick">
          <legend>Include in the PDF</legend>
          {TEMPLATES.map((t) => (
            <label key={t.id} className="check-item">
              <input type="checkbox" checked={include.has(t.id)} onChange={() => toggle(t.id)} />
              {t.title}
            </label>
          ))}
          <span className="pick-actions">
            <button type="button" className="link" onClick={() => setInclude(new Set(TEMPLATES.map((t) => t.id)))}>
              All
            </button>
            <button type="button" className="link" onClick={() => setInclude(new Set())}>
              None
            </button>
          </span>
        </fieldset>
      )}
      {blocked && <p className="export-status lvl-error">{blocked}</p>}
      {status && !blocked && (
        <p className={`export-status ${status.kind === 'error' ? 'lvl-warning' : 'lvl-ok'}`} role="status">
          {status.text}
          <button type="button" className="link" onClick={() => setStatus(null)} aria-label="Dismiss message">
            ×
          </button>
        </p>
      )}
    </section>
  );
}
