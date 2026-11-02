// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * App state: one GuitarSpec with undo/redo history. Pure reducer; side effects (storage,
 * downloads) live in the components.
 */
import type { GuitarSpec } from '../core';
import { DEFAULT_SPEC, checkSchema, migrateSpec, validateSpec } from '../core';
import { setMany, type Path } from './paths';

export const HISTORY_LIMIT = 200;
/** Consecutive edits to the same field within this window merge into one undo step. */
export const COALESCE_MS = 1000;

export interface SpecState {
  past: GuitarSpec[];
  present: GuitarSpec;
  future: GuitarSpec[];
  /** Most recent spec that passed the schema (what the preview and exports use). */
  lastValid: GuitarSpec;
  /** JSON of the spec as last loaded / saved / reset; used for "discard edits?" prompts. */
  baseline: string;
  /** Coalescing key + time of the last edit. */
  lastEdit: { key: string; at: number } | null;
}

export type SpecAction =
  | { type: 'edit'; writes: ReadonlyArray<readonly [Path, unknown]>; key?: string; at?: number }
  | { type: 'replace'; spec: GuitarSpec }
  | { type: 'markSaved' }
  | { type: 'undo' }
  | { type: 'redo' };

const json = (s: GuitarSpec): string => JSON.stringify(s);

export function initState(spec: GuitarSpec): SpecState {
  return { past: [], present: spec, future: [], lastValid: spec, baseline: json(spec), lastEdit: null };
}

const validOr = (spec: GuitarSpec, fallback: GuitarSpec): GuitarSpec => (checkSchema(spec).spec ? spec : fallback);

function commit(state: SpecState, next: GuitarSpec, lastEdit: SpecState['lastEdit'], merge: boolean): SpecState {
  if (next === state.present) return state;
  const past = merge ? state.past : [...state.past, state.present].slice(-HISTORY_LIMIT);
  return { ...state, past, present: next, future: [], lastValid: validOr(next, state.lastValid), lastEdit };
}

export function specReducer(state: SpecState, action: SpecAction): SpecState {
  switch (action.type) {
    case 'edit': {
      const next = setMany(state.present, action.writes);
      const at = action.at ?? 0;
      const merge =
        !!action.key && !!state.lastEdit && state.lastEdit.key === action.key && at - state.lastEdit.at < COALESCE_MS && state.past.length > 0;
      return commit(state, next, action.key ? { key: action.key, at } : null, merge);
    }
    case 'replace': {
      const s = commit(state, action.spec, null, false);
      return { ...s, baseline: json(action.spec), lastValid: validOr(action.spec, s.lastValid) };
    }
    case 'markSaved':
      return { ...state, baseline: json(state.present) };
    case 'undo': {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return {
        ...state,
        past: state.past.slice(0, -1),
        present: prev,
        future: [state.present, ...state.future],
        lastValid: validOr(prev, state.lastValid),
        lastEdit: null,
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
        lastValid: validOr(next, state.lastValid),
        lastEdit: null,
      };
    }
  }
}

export const isDirty = (s: SpecState): boolean => json(s.present) !== s.baseline;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export const STORAGE_KEY = 'fretwright.autosave.v1';
export const UNIT_KEY = 'fretwright.unit';

/** Parse any saved form (project file wrapper or bare spec) → a valid spec, or the issues. */
export function parseProject(raw: unknown): ReturnType<typeof validateSpec> {
  const body = raw && typeof raw === 'object' && 'spec' in raw && (raw as { app?: unknown }).app === 'fretwright' ? (raw as { spec: unknown }).spec : raw;
  return validateSpec(migrateSpec(body));
}

export function loadAutosave(): GuitarSpec {
  try {
    const txt = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!txt) return DEFAULT_SPEC;
    const { spec } = parseProject(JSON.parse(txt));
    return spec ?? DEFAULT_SPEC;
  } catch {
    return DEFAULT_SPEC;
  }
}

export function saveAutosave(spec: GuitarSpec): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(spec));
  } catch {
    /* storage full or blocked: autosave is best-effort */
  }
}

export function projectFile(spec: GuitarSpec): string {
  return JSON.stringify({ app: 'fretwright', savedAt: new Date().toISOString(), spec }, null, 2);
}

export function projectFileName(spec: GuitarSpec): string {
  const base = spec.meta.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';
  return `${base}.fretwright.json`;
}

// ---------------------------------------------------------------------------
// Common string sets (gauges in thousandths of an inch, treble → bass)
// ---------------------------------------------------------------------------

export interface GaugeSet {
  label: string;
  thou: number[];
}

export const GAUGE_SETS: Record<'guitar' | 'bass', Record<number, GaugeSet[]>> = {
  guitar: {
    6: [
      { label: 'Light 9–42', thou: [9, 11, 16, 24, 32, 42] },
      { label: 'Regular 10–46', thou: [10, 13, 17, 26, 36, 46] },
      { label: 'Medium 11–49', thou: [11, 14, 18, 28, 38, 49] },
      { label: 'Heavy bottom 10–52', thou: [10, 13, 17, 30, 42, 52] },
    ],
    7: [
      { label: 'Light 9–54', thou: [9, 11, 16, 24, 32, 42, 54] },
      { label: 'Regular 10–56', thou: [10, 13, 17, 26, 36, 46, 56] },
      { label: 'Heavy 10–59', thou: [10, 13, 17, 26, 36, 46, 59] },
    ],
    8: [
      { label: 'Light 9–65', thou: [9, 11, 16, 24, 32, 42, 54, 65] },
      { label: 'Regular 10–74', thou: [10, 13, 17, 26, 36, 46, 64, 74] },
    ],
  },
  bass: {
    4: [
      { label: 'Light 40–100', thou: [40, 60, 80, 100] },
      { label: 'Regular 45–105', thou: [45, 65, 85, 105] },
      { label: 'Heavy 50–110', thou: [50, 70, 85, 110] },
    ],
    5: [
      { label: 'Light 40–125', thou: [40, 60, 80, 100, 125] },
      { label: 'Regular 45–130', thou: [45, 65, 80, 100, 130] },
    ],
    6: [
      { label: 'Light 30–125', thou: [30, 40, 60, 80, 100, 125] },
      { label: 'Regular 32–130', thou: [32, 45, 65, 80, 100, 130] },
    ],
  },
};

/** Gauges (thou) for a new string count: a common set if one exists, else extend/trim the current one. */
export function gaugesForCount(instrument: 'guitar' | 'bass', count: number, currentThou: number[]): number[] {
  const sets = GAUGE_SETS[instrument][count];
  const regular = sets?.find((s) => s.label.startsWith('Regular')) ?? sets?.[0];
  if (regular) return [...regular.thou];
  const out = currentThou.slice(0, count);
  while (out.length < count) {
    const last = out[out.length - 1] ?? 10;
    out.push(Math.round(last * 1.3));
  }
  return out;
}
