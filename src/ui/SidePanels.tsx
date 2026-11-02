// SPDX-License-Identifier: GPL-3.0-or-later
/** Right column: validation "Check" list and key dimensions. */
import type { DisplayUnit, GuitarSpec } from '../core';
import { fretDistance, mmToIn } from '../core';
import { safeLayout } from './build';
import type { UiIssue } from './issues';

const LEVEL_LABEL = { error: 'Error', warning: 'Warning', info: 'Note' } as const;

export function CheckPanel({ issues, onPick }: { issues: UiIssue[]; onPick: (issue: UiIssue) => void }) {
  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.filter((i) => i.level === 'warning').length;
  return (
    <section className="card check" aria-label="Check">
      <h2 id="check-h">
        Check
        {issues.length > 0 && (
          <span className="check-sum">
            {errors > 0 && <span className="badge err">{errors}</span>}
            {warnings > 0 && <span className="badge warn">{warnings}</span>}
          </span>
        )}
      </h2>
      {issues.length === 0 ? (
        <p className="ok" role="status">
          <span aria-hidden="true">✓</span> Everything checks out.
        </p>
      ) : (
        <ul className="issues" role="list">
          {issues.map((i, k) => (
            <li key={`${i.path}-${k}`}>
              <button type="button" className={`issue lvl-${i.level}`} onClick={() => onPick(i)} title={i.fieldPath ? 'Go to this setting' : undefined}>
                <span className="issue-lvl">{LEVEL_LABEL[i.level]}</span>
                <span className="issue-msg">{i.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const both = (mm: number, unit: DisplayUnit): string => {
  const m = `${mm.toFixed(1)} mm`;
  const i = `${mmToIn(mm).toFixed(3)}″`;
  return unit === 'in' ? `${i} (${m})` : `${m} (${i})`;
};

export function KeyDimensions({ spec, unit }: { spec: GuitarSpec; unit: DisplayUnit }) {
  const fanned = spec.scale.treble !== spec.scale.bass;
  const { layout, error } = safeLayout(spec);
  const rows: [string, string][] = [];
  if (fanned) {
    rows.push(['Bass scale', both(spec.scale.bass, unit)]);
    rows.push(['Treble scale', both(spec.scale.treble, unit)]);
    rows.push(['Perpendicular fret', String(spec.frets.perpendicularFret)]);
  } else {
    rows.push(['Scale', both(spec.scale.bass, unit)]);
  }
  rows.push(['Strings', String(spec.strings.gauges.length)]);
  rows.push(['Frets', String(spec.frets.count)]);
  if (layout) {
    rows.push(['Width at nut', both(layout.widthAtNut, unit)]);
    rows.push(['Width at last fret', both(layout.widthAtLastFret, unit)]);
  }
  const f12 = (L: number) => fretDistance(12, L);
  if (fanned) {
    rows.push(['Fret 12 (bass)', both(f12(spec.scale.bass), unit)]);
    rows.push(['Fret 12 (treble)', both(f12(spec.scale.treble), unit)]);
  } else {
    rows.push(['Nut to fret 12', both(f12(spec.scale.bass), unit)]);
  }
  return (
    <section className="card dims" aria-labelledby="dims-h">
      <h2 id="dims-h">Key dimensions</h2>
      <dl>
        {rows.map(([k, val]) => (
          <div key={k} className="dim">
            <dt>{k}</dt>
            <dd data-dim={k}>{val}</dd>
          </div>
        ))}
      </dl>
      {error && <p className="subtle">Fretboard layout unavailable: {error}</p>}
    </section>
  );
}
