// SPDX-License-Identifier: GPL-3.0-or-later
/** Low-level form controls. Every control renders a real <label>. */
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Typing pauses this long before the value is applied (rebuilding every template is not free). */
export const COMMIT_DELAY_MS = 300;

/**
 * Text box editing a value of type T. While focused, what the user typed is kept (so "25."
 * is not reformatted mid-typing); any outside change (undo, preset) wins over the draft.
 * A valid value is applied after a short pause in typing, or at once on Enter / leaving the field,
 * so intermediate text ("6" on the way to "648") doesn't rebuild every template.
 */
export function DraftInput<T>(props: {
  id: string;
  value: T;
  toText: (v: T) => string;
  /** Text → value; undefined if the text is not valid yet. */
  fromText: (t: string) => T | undefined;
  onCommit: (v: T) => void;
  suffix?: string;
  describedBy?: string;
  invalid?: boolean;
  ariaLabel?: string;
  className?: string;
  inputMode?: 'decimal' | 'text';
}) {
  const { id, value, toText, fromText, onCommit, suffix, describedBy, invalid, ariaLabel, className, inputMode = 'decimal' } = props;
  const [draft, setDraft] = useState<{ text: string; committed: string; pending: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValue = useRef<{ v: T } | null>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pendingValue.current;
    pendingValue.current = null;
    if (p) {
      commitRef.current(p.v);
      setDraft((d) => (d ? { ...d, pending: false } : d));
    }
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);
  const key = JSON.stringify(value);
  const showDraft = draft !== null && (draft.pending || draft.committed === key);
  const text = showDraft ? draft.text : toText(value);
  const bad = showDraft && fromText(draft.text) === undefined;
  return (
    <span className={`num ${className ?? ''}`}>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        spellCheck={false}
        value={text}
        aria-label={ariaLabel}
        aria-invalid={bad || invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => {
          const t = e.target.value;
          const v = fromText(t);
          if (timer.current) clearTimeout(timer.current);
          timer.current = null;
          if (v !== undefined) {
            setDraft({ text: t, committed: JSON.stringify(v), pending: true });
            pendingValue.current = { v };
            timer.current = setTimeout(() => flushRef.current(), COMMIT_DELAY_MS);
          } else {
            pendingValue.current = null;
            setDraft({ text: t, committed: key, pending: false });
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') flush();
        }}
        onBlur={() => {
          flush();
          setDraft(null);
        }}
      />
      {suffix && (
        <span className="num-suffix" aria-hidden="true">
          {suffix}
        </span>
      )}
    </span>
  );
}

/** DraftInput for numbers; `fromText` returns NaN for invalid text. */
export function NumberInput(
  props: Omit<Parameters<typeof DraftInput<number>>[0], 'fromText'> & { fromText: (t: string) => number },
) {
  const { fromText, ...rest } = props;
  return (
    <DraftInput<number>
      {...rest}
      fromText={(t) => {
        const n = fromText(t);
        return Number.isFinite(n) ? n : undefined;
      }}
    />
  );
}

/** (i) toggle that reveals a one-line hint. Drawn as SVG: the ⓘ glyph is missing from many Linux fonts. */
export function HelpToggle({ id, label, open, onToggle }: { id: string; label: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="help-btn"
      aria-expanded={open}
      aria-controls={id}
      aria-label={`About ${label}`}
      title={open ? 'Hide help' : 'What is this?'}
      onClick={onToggle}
    >
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="8" cy="4.9" r="1" fill="currentColor" />
        <path d="M8 7.2v4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/** Label + control + optional help + inline errors, laid out as one row. */
export function FieldRow(props: {
  id: string;
  label: string;
  help?: string;
  messages?: { level: 'error' | 'warning' | 'info'; message: string }[];
  children: (describedBy: string | undefined) => ReactNode;
  inline?: boolean;
  labelFor?: boolean;
}) {
  const { id, label, help, messages = [], children, inline, labelFor = true } = props;
  const [open, setOpen] = useState(false);
  const helpId = `${id}-help`;
  const msgId = `${id}-msg`;
  const described = [open && help ? helpId : '', messages.length ? msgId : ''].filter(Boolean).join(' ') || undefined;
  const labelEl = labelFor ? <label htmlFor={id}>{label}</label> : <span className="label-text" id={`${id}-label`}>{label}</span>;
  return (
    <div className={`field ${inline ? 'field-inline' : ''}`}>
      <div className="field-head">
        {inline ? (
          <>
            {children(described)}
            {labelEl}
          </>
        ) : (
          labelEl
        )}
        {help && <HelpToggle id={helpId} label={label} open={open} onToggle={() => setOpen((o) => !o)} />}
      </div>
      {!inline && <div className="field-control">{children(described)}</div>}
      {open && help && (
        <p className="hint" id={helpId}>
          {help}
        </p>
      )}
      {messages.length > 0 && (
        <ul className="field-msgs" id={msgId}>
          {messages.map((m, i) => (
            <li key={i} className={`lvl-${m.level}`}>
              {m.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
