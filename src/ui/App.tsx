// SPDX-License-Identifier: GPL-3.0-or-later
/** Fretwright main window: top bar, stepped spec panel, live template preview, check panel, export bar. */
import { Component, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ErrorInfo, type KeyboardEvent as RKeyboardEvent, type ReactNode } from 'react';
import type { DisplayUnit, GuitarSpec } from '../core';
import { DEFAULT_SPEC, PRESETS, TEMPLATES, checkSchema, validateSpec } from '../core';
import { buildTemplate, downloadFile } from './build';
import { DrawingView } from './DrawingView';
import { ExportBar } from './ExportBar';
import { SECTIONS, fieldForPath, type SectionId } from './fields';
import { toUiIssues, type UiIssue } from './issues';
import { fieldDomId, type Path } from './paths';
import { CheckPanel, KeyDimensions } from './SidePanels';
import { SpecPanel, fannedWrites } from './SpecPanel';
import {
  UNIT_KEY,
  initState,
  isDirty,
  loadAutosave,
  parseProject,
  projectFile,
  projectFileName,
  saveAutosave,
  specReducer,
} from './state';

class PreviewBoundary extends Component<{ children: ReactNode; resetKey: unknown }, { error: string | null; key: unknown }> {
  state = { error: null as string | null, key: this.props.resetKey };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  static getDerivedStateFromProps(p: { resetKey: unknown }, s: { error: string | null; key: unknown }) {
    return p.resetKey !== s.key ? { error: null, key: p.resetKey } : null;
  }
  componentDidCatch(_e: unknown, _info: ErrorInfo) {
    /* shown in the preview area */
  }
  render() {
    if (this.state.error) return <PreviewError message={this.state.error} />;
    return this.props.children;
  }
}

function PreviewError({ message }: { message: string }) {
  return (
    <div className="preview-error" role="alert">
      <strong>This template couldn’t be drawn.</strong>
      <p>{message}</p>
      <p className="subtle">Try another template, or check the settings flagged in the Check panel.</p>
    </div>
  );
}

const loadUnit = (): DisplayUnit => {
  try {
    return globalThis.localStorage?.getItem(UNIT_KEY) === 'in' ? 'in' : 'mm';
  } catch {
    return 'mm';
  }
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');
const MOD = isMac ? '⌘' : 'Ctrl+';

export function App() {
  const [state, dispatch] = useReducer(specReducer, undefined, () => initState(loadAutosave()));
  const spec = state.present;
  const [unit, setUnit] = useState<DisplayUnit>(loadUnit);
  const [uiFanned, setUiFanned] = useState(false);
  const fanned = uiFanned || spec.scale.treble !== spec.scale.bass;
  const [open, setOpen] = useState<SectionId | null>('instrument');
  const [advancedOpen, setAdvancedOpen] = useState<ReadonlySet<SectionId>>(new Set());
  const [templateId, setTemplateId] = useState(TEMPLATES[0]?.id ?? '');
  const [focusReq, setFocusReq] = useState<{ path: string; n: number } | null>(null);
  const [notice, setNotice] = useState<{ title: string; lines: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ---- persistence -------------------------------------------------------
  // Save the last schema-valid spec so a half-typed value never makes the autosave unloadable.
  useEffect(() => saveAutosave(state.lastValid), [state.lastValid]);
  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(UNIT_KEY, unit);
    } catch {
      /* ignore */
    }
  }, [unit]);

  // ---- editing -----------------------------------------------------------
  const edit = useCallback(
    (writes: ReadonlyArray<readonly [Path, unknown]>, key?: string) => dispatch({ type: 'edit', writes, key, at: Date.now() }),
    [],
  );
  const setFanned = (on: boolean) => {
    setUiFanned(on);
    const w = fannedWrites(spec, on);
    if (w.length) edit(w);
  };
  const replace = (next: GuitarSpec) => {
    setUiFanned(false);
    dispatch({ type: 'replace', spec: next });
  };
  const confirmDiscard = (what: string): boolean => {
    if (!isDirty(state)) return true;
    try {
      return window.confirm(`${what} will replace your current design. Unsaved changes stay available with Undo. Continue?`);
    } catch {
      return true;
    }
  };

  // ---- undo / redo shortcuts --------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (k === 'y' && !isMac) {
        e.preventDefault();
        dispatch({ type: 'redo' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- validation --------------------------------------------------------
  const { issues, schemaOk } = useMemo(() => {
    const schema = checkSchema(spec);
    if (!schema.spec) return { issues: toUiIssues(schema.issues, true), schemaOk: false };
    return { issues: toUiIssues(validateSpec(spec).issues, false), schemaOk: true };
  }, [spec]);

  const issuesByField = useMemo(() => {
    const m = new Map<string, UiIssue[]>();
    for (const i of issues) if (i.fieldPath) m.set(i.fieldPath, [...(m.get(i.fieldPath) ?? []), i]);
    return m;
  }, [issues]);
  const issuesFor = useCallback((p: string) => issuesByField.get(p) ?? [], [issuesByField]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(SECTIONS.map((s) => [s.id, { error: 0, warning: 0 }])) as Record<SectionId, { error: number; warning: number }>;
    for (const i of issues) {
      const f = i.fieldPath ? fieldForPath(i.fieldPath) : undefined;
      if (f && i.level !== 'info') c[f.section][i.level]++;
    }
    return c;
  }, [issues]);
  const hasErrors = issues.some((i) => i.level === 'error');

  const pickIssue = (i: UiIssue) => {
    const f = i.fieldPath ? fieldForPath(i.fieldPath) : undefined;
    if (!f) return;
    setOpen(f.section);
    if (f.advanced) setAdvancedOpen((s) => new Set(s).add(f.section));
    setFocusReq({ path: i.path, n: Date.now() });
  };

  useEffect(() => {
    if (!focusReq) return;
    const segs = focusReq.path.split('.');
    for (let k = segs.length; k > 0; k--) {
      const el = document.getElementById(fieldDomId(segs.slice(0, k).join('.')));
      if (el) {
        if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.focus();
        break;
      }
    }
  }, [focusReq]);

  // ---- files ---------------------------------------------------------------
  const save = () => {
    downloadFile(projectFileName(spec), projectFile(spec), 'application/json');
    dispatch({ type: 'markSaved' });
  };
  const onOpenFile = async (file: File) => {
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      setNotice({ title: `“${file.name}” isn’t a Fretwright project`, lines: ['The file could not be read as JSON.'] });
      return;
    }
    const { spec: loaded, issues: errs } = parseProject(raw);
    if (!loaded) {
      setNotice({
        title: `“${file.name}” couldn’t be opened`,
        lines: toUiIssues(errs, true)
          .slice(0, 8)
          .map((i) => i.message),
      });
      return;
    }
    if (!confirmDiscard('Opening this project')) return;
    replace(loaded);
    setNotice(null);
  };

  // ---- preview -----------------------------------------------------------
  const previewSpec = state.lastValid;
  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
  const built = template ? buildTemplate(previewSpec, template.id) : null;

  const onTabKey = (e: RKeyboardEvent, idx: number) => {
    const n = TEMPLATES.length;
    const go = e.key === 'ArrowRight' ? idx + 1 : e.key === 'ArrowLeft' ? idx - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (go === null) return;
    e.preventDefault();
    const t = TEMPLATES[(go + n) % n]!;
    setTemplateId(t.id);
    document.getElementById(`tab-${t.id}`)?.focus();
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="logo" src="./assets/icon.svg" alt="" width={26} height={26} />
          <span className="brand-name">Fretwright</span>
          <span className="brand-sub">{spec.meta.name}</span>
        </div>
        <div className="toolbar">
          <label className="compact">
            <span>Start from…</span>
            <select
              value=""
              aria-label="Start from a preset"
              onChange={(e) => {
                const p = PRESETS.find((x) => x.id === e.target.value);
                if (p && confirmDiscard(`“${p.name}”`)) replace(structuredClone(p.spec));
              }}
            >
              <option value="" disabled>
                Choose a preset
              </option>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="seg" role="radiogroup" aria-label="Units">
            {(['mm', 'in'] as const).map((u) => (
              <button key={u} type="button" role="radio" aria-checked={unit === u} className={unit === u ? 'on' : ''} onClick={() => setUnit(u)}>
                {u === 'mm' ? 'mm' : 'inches'}
              </button>
            ))}
          </div>
          <div className="btn-group">
            <button type="button" onClick={() => dispatch({ type: 'undo' })} disabled={state.past.length === 0} title={`Undo (${MOD}Z)`}>
              Undo
            </button>
            <button type="button" onClick={() => dispatch({ type: 'redo' })} disabled={state.future.length === 0} title={`Redo (${MOD}Shift+Z)`}>
              Redo
            </button>
          </div>
          <div className="btn-group">
            <button type="button" onClick={() => confirmDiscard('A new design') && replace(structuredClone(DEFAULT_SPEC))}>
              New
            </button>
            <button type="button" onClick={() => fileRef.current?.click()}>
              Open…
            </button>
            <button type="button" onClick={save} title="Download a .fretwright.json project file">
              Save{isDirty(state) ? ' •' : ''}
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label="Open project file"
            data-testid="open-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void onOpenFile(f);
            }}
          />
        </div>
      </header>

      {notice && (
        <div className="notice" role="alert">
          <strong>{notice.title}</strong>
          <ul>
            {notice.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
          <button type="button" className="link" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="workspace">
        <aside className="left" aria-label="Design settings">
          <SpecPanel
            spec={spec}
            unit={unit}
            edit={edit}
            fanned={fanned}
            setFanned={setFanned}
            issuesFor={issuesFor}
            open={open}
            setOpen={setOpen}
            advancedOpen={advancedOpen}
            toggleAdvanced={(id) =>
              setAdvancedOpen((s) => {
                const n = new Set(s);
                if (n.has(id)) n.delete(id);
                else n.add(id);
                return n;
              })
            }
            counts={counts}
          />
        </aside>

        <main className="centre">
          <div className="tabs" role="tablist" aria-label="Templates">
            {TEMPLATES.map((t, idx) => (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={t.id === template?.id}
                aria-controls="preview-panel"
                tabIndex={t.id === template?.id ? 0 : -1}
                className="tab"
                title={t.description}
                onClick={() => setTemplateId(t.id)}
                onKeyDown={(e) => onTabKey(e, idx)}
              >
                {t.title}
              </button>
            ))}
          </div>
          <div className="preview" id="preview-panel" role="tabpanel" aria-labelledby={template ? `tab-${template.id}` : undefined}>
            {template && <p className="tpl-desc">{template.description}</p>}
            {!schemaOk && (
              <p className="stale" role="status">
                Showing the last valid design. Fix the errors in Check to update the preview.
              </p>
            )}
            <div className="canvas">
              {built && !built.ok && <PreviewError message={built.error} />}
              {built && built.ok && (
                <PreviewBoundary resetKey={built.drawing}>
                  <DrawingView drawing={built.drawing} unit={unit} />
                </PreviewBoundary>
              )}
            </div>
            <p className="canvas-help subtle">Scroll to zoom · drag to pan · double-click to fit</p>
          </div>
          <ExportBar spec={previewSpec} templateId={template?.id ?? ''} blocked={hasErrors ? 'Fix the errors in the Check panel before printing.' : null} />
        </main>

        <aside className="right" aria-label="Check and key dimensions">
          <CheckPanel issues={issues} onPick={pickIssue} />
          <KeyDimensions spec={previewSpec} unit={unit} />
        </aside>
      </div>
    </div>
  );
}
