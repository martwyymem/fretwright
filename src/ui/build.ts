// SPDX-License-Identifier: GPL-3.0-or-later
/** Memoised, crash-proof wrappers around core builders. Specs are immutable, so identity is a safe key. */
import type { Drawing, FretboardLayout, GuitarSpec } from '../core';
import { buildFretboardLayout, geometryBlocker, templateById } from '../core';

export type BuildResult = { ok: true; drawing: Drawing } | { ok: false; error: string };

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const drawingCache = new WeakMap<GuitarSpec, Map<string, BuildResult>>();

export function buildTemplate(spec: GuitarSpec, templateId: string): BuildResult {
  let perSpec = drawingCache.get(spec);
  if (!perSpec) drawingCache.set(spec, (perSpec = new Map()));
  const hit = perSpec.get(templateId);
  if (hit) return hit;
  let result: BuildResult;
  try {
    const blocker = geometryBlocker(spec);
    if (blocker) throw new Error(blocker.message);
    const t = templateById(templateId);
    if (!t) throw new Error(`Unknown template "${templateId}"`);
    result = { ok: true, drawing: t.build(spec) };
  } catch (e) {
    result = { ok: false, error: errorText(e) };
  }
  perSpec.set(templateId, result);
  return result;
}

const layoutCache = new WeakMap<GuitarSpec, { layout: FretboardLayout | null; error?: string }>();

export function safeLayout(spec: GuitarSpec): { layout: FretboardLayout | null; error?: string } {
  const hit = layoutCache.get(spec);
  if (hit) return hit;
  let r: { layout: FretboardLayout | null; error?: string };
  try {
    const blocker = geometryBlocker(spec);
    if (blocker) throw new Error(blocker.message);
    r = { layout: buildFretboardLayout(spec) };
  } catch (e) {
    r = { layout: null, error: errorText(e) };
  }
  layoutCache.set(spec, r);
  return r;
}

/** Trigger a browser download. Returns false if the environment can't do it. */
export function downloadFile(name: string, data: string | Uint8Array, mime: string): boolean {
  try {
    const part: BlobPart = typeof data === 'string' ? data : new Uint8Array(data);
    const url = URL.createObjectURL(new Blob([part], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

/** Human message for an exporter failure. */
export function exportErrorMessage(what: string, e: unknown): string {
  const msg = errorText(e);
  if (/not implemented/i.test(msg)) return `${what} export isn’t available in this build yet. Try again after the next update.`;
  return `${what} export failed: ${msg}`;
}
