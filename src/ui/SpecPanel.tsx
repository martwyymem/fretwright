// SPDX-License-Identifier: GPL-3.0-or-later
/** The stepped parameter panel (left column). */
import type { DisplayUnit, GuitarSpec } from '../core';
import { gaugeToMm, importOutlineFromSvg, inToMm } from '../core';
import { useState, type ChangeEvent } from 'react';
import {
  FIELDS,
  PICKUP_TYPES,
  SECTIONS,
  displayToLength,
  lengthToDisplay,
  mmToThou,
  parseNumber,
  unitSuffix,
  type FieldDef,
  type SectionId,
} from './fields';
import { DraftInput, FieldRow, NumberInput } from './inputs';
import type { UiIssue } from './issues';
import { fieldDomId, getAt, type Path } from './paths';
import { GAUGE_SETS, gaugesForCount } from './state';

export type EditFn = (writes: ReadonlyArray<readonly [Path, unknown]>, key?: string) => void;

interface Ctx {
  spec: GuitarSpec;
  unit: DisplayUnit;
  edit: EditFn;
  fanned: boolean;
  setFanned: (on: boolean) => void;
  issuesFor: (fieldPath: string) => UiIssue[];
}

const trimNum = (n: number, d = 3) => String(Number(n.toFixed(d)));

const parseInt10 = (t: string): number => {
  const n = parseNumber(t);
  return Number.isFinite(n) ? Math.round(n) : NaN;
};

// ---------------------------------------------------------------------------
// One field
// ---------------------------------------------------------------------------

function labelFor(f: FieldDef, ctx: Ctx): string {
  if (f.path === 'scale.bass' && ctx.fanned) return 'Bass scale length';
  return f.label;
}

/** Extra writes that keep related fields consistent. */
function writesFor(f: FieldDef, value: unknown, ctx: Ctx): [Path, unknown][] {
  const w: [Path, unknown][] = [[f.path, value]];
  if (f.path === 'scale.bass' && !ctx.fanned) w.push(['scale.treble', value]);
  if (f.path === 'meta.instrument' && value !== ctx.spec.meta.instrument) {
    const inst = value as 'guitar' | 'bass';
    const n = ctx.spec.strings.gauges.length;
    if (GAUGE_SETS[inst][n]) w.push(['strings.gauges', gaugesForCount(inst, n, []).map(gaugeToMm)]);
  }
  return w;
}

function Field({ f, ctx }: { f: FieldDef; ctx: Ctx }) {
  const id = fieldDomId(f.path);
  const value = getAt(ctx.spec, f.path);
  const label = labelFor(f, ctx);
  const messages = ctx.issuesFor(f.path);
  const invalid = messages.some((m) => m.level === 'error');
  const set = (v: unknown) => ctx.edit(writesFor(f, v, ctx), f.path);

  switch (f.kind) {
    case 'gauges':
      return <GaugesEditor ctx={ctx} messages={messages} help={f.help} />;
    case 'pickups':
      return <PickupsEditor ctx={ctx} messages={messages} help={f.help} />;
    case 'bool':
      return (
        <FieldRow id={id} label={label} help={f.help} messages={messages} inline>
          {(d) => <input id={id} type="checkbox" checked={!!value} aria-describedby={d} onChange={(e) => set(e.target.checked)} />}
        </FieldRow>
      );
    case 'select':
      return (
        <FieldRow id={id} label={label} help={f.help} messages={messages}>
          {(d) => (
            <select id={id} value={String(value)} aria-describedby={d} aria-invalid={invalid || undefined} onChange={(e) => set(e.target.value)}>
              {f.options!.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </FieldRow>
      );
    case 'text':
      return (
        <FieldRow id={id} label={label} help={f.help} messages={messages}>
          {(d) => <input id={id} type="text" value={String(value ?? '')} maxLength={120} aria-describedby={d} onChange={(e) => set(e.target.value)} />}
        </FieldRow>
      );
    case 'intlist': {
      const list = Array.isArray(value) ? (value as number[]) : [];
      return (
        <FieldRow id={id} label={label} help={f.help} messages={messages}>
          {(d) => (
            <DraftInput<number[]>
              id={id}
              value={list}
              describedBy={d}
              invalid={invalid}
              className="wide"
              inputMode="text"
              toText={(v) => v.join(', ')}
              fromText={(t) => {
                const parts = t.split(/[,\s]+/).filter(Boolean).map(parseInt10);
                return parts.some((n) => !Number.isFinite(n)) ? undefined : parts;
              }}
              onCommit={set}
            />
          )}
        </FieldRow>
      );
    }
    case 'length':
      return (
        <FieldRow id={id} label={label} help={f.help} messages={messages}>
          {(d) => (
            <NumberInput
              id={id}
              value={Number(value)}
              describedBy={d}
              invalid={invalid}
              suffix={unitSuffix(ctx.unit)}
              toText={(v) => lengthToDisplay(v, ctx.unit)}
              fromText={(t) => displayToLength(t, ctx.unit)}
              onCommit={set}
            />
          )}
        </FieldRow>
      );
    case 'angle':
    case 'number':
    case 'int':
      return (
        <FieldRow id={id} label={label} help={f.help} messages={messages}>
          {(d) => (
            <NumberInput
              id={id}
              value={Number(value)}
              describedBy={d}
              invalid={invalid}
              suffix={f.kind === 'angle' ? '°' : undefined}
              toText={(v) => trimNum(v)}
              fromText={f.kind === 'int' ? parseInt10 : parseNumber}
              onCommit={set}
            />
          )}
        </FieldRow>
      );
  }
}

// ---------------------------------------------------------------------------
// Strings editor
// ---------------------------------------------------------------------------

function GaugesEditor({ ctx, messages, help }: { ctx: Ctx; messages: UiIssue[]; help: string }) {
  const { spec, edit } = ctx;
  const inst = spec.meta.instrument;
  const thou = spec.strings.gauges.map(mmToThou);
  const count = thou.length;
  const sets = GAUGE_SETS[inst][count] ?? [];
  const match = sets.find((s) => s.thou.length === count && s.thou.every((t, i) => Math.abs(t - thou[i]!) < 0.05));
  const countId = fieldDomId('strings.gauges');
  const setId = 'f-strings-gauge-set';
  const counts = Array.from({ length: 9 }, (_, i) => i + 4);
  return (
    <fieldset className="group">
      <legend>Strings</legend>
      <FieldRow id={countId} label="Number of strings" help={help}>
        {(d) => (
          <select
            id={countId}
            value={count}
            aria-describedby={d}
            onChange={(e) => edit([['strings.gauges', gaugesForCount(inst, Number(e.target.value), thou).map(gaugeToMm)]])}
          >
            {counts.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
      </FieldRow>
      <FieldRow id={setId} label="String set">
        {() => (
          <select
            id={setId}
            value={match ? match.label : ''}
            onChange={(e) => {
              const s = sets.find((x) => x.label === e.target.value);
              if (s) edit([['strings.gauges', s.thou.map(gaugeToMm)]]);
            }}
          >
            <option value="" disabled={!!match}>
              {match ? 'Custom…' : 'Custom gauges'}
            </option>
            {sets.map((s) => (
              <option key={s.label} value={s.label}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </FieldRow>
      <p className="hint subtle">Gauges in thousandths of an inch, thinnest (treble) first.</p>
      <ol className="gauges">
        {thou.map((t, i) => {
          const id = fieldDomId(`strings.gauges.${i}`);
          const note = i === 0 ? ' (thinnest)' : i === count - 1 ? ' (thickest)' : '';
          return (
            <li key={i}>
              <label htmlFor={id}>
                String {i + 1}
                <span className="subtle">{note}</span>
              </label>
              <NumberInput
                id={id}
                value={t}
                toText={(x) => String(x)}
                fromText={parseNumber}
                onCommit={(x) => edit([[`strings.gauges.${i}`, gaugeToMm(x)]], `strings.gauges.${i}`)}
              />
            </li>
          );
        })}
      </ol>
      {messages.length > 0 && (
        <ul className="field-msgs">
          {messages.map((m, i) => (
            <li key={i} className={`lvl-${m.level}`}>
              {m.message}
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Pickups editor
// ---------------------------------------------------------------------------

function PickupsEditor({ ctx, messages, help }: { ctx: Ctx; messages: UiIssue[]; help: string }) {
  const { spec, edit, unit } = ctx;
  const pickups = spec.body.pickups;
  const add = () => {
    const last = pickups[pickups.length - 1];
    const type = spec.meta.instrument === 'bass' ? 'bass-single' : 'humbucker';
    const fromBridge = last ? last.fromBridge + 60 : 45;
    edit([['body.pickups', [...pickups, { type, fromBridge, angle: 0 }]]]);
  };
  const remove = (i: number) => edit([['body.pickups', pickups.filter((_, j) => j !== i)]]);
  return (
    <fieldset className="group">
      <legend>
        Pickups <span className="subtle">({pickups.length})</span>
      </legend>
      <p className="hint subtle">{help}</p>
      {pickups.length === 0 && <p className="subtle">No pickups.</p>}
      <ol className="pickups">
        {pickups.map((p, i) => {
          const base = `body.pickups.${i}`;
          const tId = fieldDomId(`${base}.type`);
          const dId = fieldDomId(`${base}.fromBridge`);
          const aId = fieldDomId(`${base}.angle`);
          return (
            <li key={i} className="pickup">
              <div className="pickup-head">
                <span className="pickup-n">#{i + 1}</span>
                <button type="button" className="link danger" onClick={() => remove(i)} aria-label={`Remove pickup ${i + 1}`}>
                  Remove
                </button>
              </div>
              <div className="pickup-grid">
                <label htmlFor={tId}>Type</label>
                <select id={tId} value={p.type} onChange={(e) => edit([[`${base}.type`, e.target.value]])}>
                  {PICKUP_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <label htmlFor={dId}>From bridge</label>
                <NumberInput
                  id={dId}
                  value={p.fromBridge}
                  suffix={unitSuffix(unit)}
                  toText={(v) => lengthToDisplay(v, unit)}
                  fromText={(t) => displayToLength(t, unit)}
                  onCommit={(v) => edit([[`${base}.fromBridge`, v]], `${base}.fromBridge`)}
                />
                <label htmlFor={aId}>Slant</label>
                <NumberInput
                  id={aId}
                  value={p.angle}
                  suffix="°"
                  toText={(v) => trimNum(v)}
                  fromText={parseNumber}
                  onCommit={(v) => edit([[`${base}.angle`, v]], `${base}.angle`)}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <button type="button" id={fieldDomId('body.pickups')} className="secondary small" onClick={add}>
        + Add pickup
      </button>
      {messages.length > 0 && (
        <ul className="field-msgs">
          {messages.map((m, i) => (
            <li key={i} className={`lvl-${m.level}`}>
              {m.message}
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Custom outline import (body / headstock)
// ---------------------------------------------------------------------------

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * SVG file picker for a custom outline. The SVG is drawn with the attachment end on the LEFT
 * (body: neck end; headstock: nut end, tip pointing right). The result is stored in the local
 * frame of `customOutline`: body — origin at the neck-pocket anchor, +x toward the tail;
 * headstock — origin at the nut centre, +x toward the tip; +y = up in the drawing. It is scaled so
 * its overall length equals the current body / headstock length (re-import after changing it).
 */
export function OutlineImport({ ctx, target }: { ctx: Ctx; target: 'body' | 'headstock' }) {
  const [warnings, setWarnings] = useState<string[]>([]);
  const id = `f-${target}-outline-import`;
  const current = target === 'body' ? ctx.spec.body.customOutline : ctx.spec.headstock.customOutline;
  const length = target === 'body' ? ctx.spec.body.length : ctx.spec.headstock.length;
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const r = importOutlineFromSvg(await file.text(), { targetLength: length });
    setWarnings(r.warnings);
    if (r.points.length >= 3) ctx.edit([[`${target}.customOutline`, r.points.map((p) => ({ x: round3(p.x), y: round3(p.y) }))]]);
    input.value = '';
  };
  const what = target === 'body' ? 'neck end' : 'nut end';
  return (
    <FieldRow
      id={id}
      label="Import outline from SVG…"
      help={`Draw the outline with the ${what} on the left and save as SVG. The largest closed shape is used, scaled to the ${target} length (${length.toFixed(0)} mm); re-import after changing the length.`}
      messages={warnings.map((message) => ({ level: 'warning' as const, message }))}
    >
      {(d) => (
        <>
          <input id={id} type="file" accept=".svg,image/svg+xml" aria-describedby={d} onChange={onFile} />
          <p className="hint subtle" data-outline-status={target}>
            {current && current.length >= 3 ? `Outline loaded (${current.length} points).` : 'No outline imported yet.'}
          </p>
        </>
      )}
    </FieldRow>
  );
}

// ---------------------------------------------------------------------------
// Fanned-frets toggle
// ---------------------------------------------------------------------------

export const FANNED_ID = 'f-scale-fanned';

function FannedToggle({ ctx }: { ctx: Ctx }) {
  return (
    <FieldRow
      id={FANNED_ID}
      label="Fanned frets (multiscale)"
      help="Gives the bass strings a longer scale than the treble strings, so the frets fan out. Off = one scale for all strings."
      inline
    >
      {(d) => (
        <input
          id={FANNED_ID}
          type="checkbox"
          checked={ctx.fanned}
          aria-describedby={d}
          onChange={(e) => ctx.setFanned(e.target.checked)}
        />
      )}
    </FieldRow>
  );
}

/** Writes for turning fanned frets on/off. */
export function fannedWrites(spec: GuitarSpec, on: boolean): [Path, unknown][] {
  if (on) {
    if (spec.scale.treble !== spec.scale.bass) return [];
    return [
      ['scale.treble', Math.max(spec.scale.bass - inToMm(1.5), 1)],
      ['frets.perpendicularFret', spec.frets.perpendicularFret || 8],
    ];
  }
  return [
    ['scale.treble', spec.scale.bass],
    ['frets.perpendicularFret', 0],
  ];
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export interface SpecPanelProps extends Ctx {
  open: SectionId | null;
  setOpen: (id: SectionId | null) => void;
  advancedOpen: ReadonlySet<SectionId>;
  toggleAdvanced: (id: SectionId) => void;
  /** Error/warning counts per section, for the badges. */
  counts: Record<SectionId, { error: number; warning: number }>;
}

export function SpecPanel(props: SpecPanelProps) {
  const { open, setOpen, advancedOpen, toggleAdvanced, counts, ...ctx } = props;
  const visible = (f: FieldDef) => !f.showIf || f.showIf(ctx.spec, { fanned: ctx.fanned });
  return (
    <nav className="steps" aria-label="Design steps">
      {SECTIONS.map((s, idx) => {
        const isOpen = open === s.id;
        const fields = FIELDS.filter((f) => f.section === s.id && visible(f));
        const basic = fields.filter((f) => !f.advanced);
        const adv = fields.filter((f) => f.advanced);
        const advOpen = advancedOpen.has(s.id);
        const next = SECTIONS[idx + 1];
        const c = counts[s.id];
        const bodyId = `step-${s.id}`;
        return (
          <section key={s.id} className={`step ${isOpen ? 'open' : ''}`}>
            <h2 className="step-h">
              <button type="button" className="step-btn" aria-expanded={isOpen} aria-controls={bodyId} onClick={() => setOpen(isOpen ? null : s.id)}>
                <span className="step-n" aria-hidden="true">
                  {s.step}
                </span>
                <span className="step-title">
                  {s.title}
                  {!isOpen && <span className="step-blurb">{s.blurb}</span>}
                </span>
                {c.error > 0 && <span className="badge err" title={`${c.error} error(s)`}>{c.error}</span>}
                {c.error === 0 && c.warning > 0 && <span className="badge warn" title={`${c.warning} warning(s)`}>{c.warning}</span>}
                <span className="chev" aria-hidden="true">
                  ▾
                </span>
              </button>
            </h2>
            {isOpen && (
              <div className="step-body" id={bodyId}>
                {s.id === 'scale' && (
                  <>
                    {basic.filter((f) => f.path === 'scale.bass').map((f) => <Field key={f.path} f={f} ctx={ctx} />)}
                    <FannedToggle ctx={ctx} />
                    {basic.filter((f) => f.path !== 'scale.bass').map((f) => <Field key={f.path} f={f} ctx={ctx} />)}
                  </>
                )}
                {s.id !== 'scale' && basic.map((f) => <Field key={f.path} f={f} ctx={ctx} />)}
                {s.id === 'body' && ctx.spec.body.shape === 'custom' && <OutlineImport ctx={ctx} target="body" />}
                {s.id === 'headstock' && ctx.spec.headstock.shape === 'custom' && <OutlineImport ctx={ctx} target="headstock" />}
                {adv.length > 0 && (
                  <div className="advanced">
                    <button type="button" className="link" aria-expanded={advOpen} onClick={() => toggleAdvanced(s.id)}>
                      {advOpen ? 'Fewer options' : `More options (${adv.length})`}
                    </button>
                    {advOpen && (
                      <div className="advanced-body">
                        {adv.map((f) => (
                          <Field key={f.path} f={f} ctx={ctx} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {next && (
                  <div className="step-next">
                    <button type="button" className="secondary small" onClick={() => setOpen(next.id)}>
                      Next: {next.title} →
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </nav>
  );
}
