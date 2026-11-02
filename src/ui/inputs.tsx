// SPDX-License-Identifier: GPL-3.0-or-later
/** Low-level form controls. Every control renders a real <label>. */
import { useState, type ReactNode } from 'react';

/**
 * Text box editing a value of type T. While focused, what the user typed is kept (so "25."
 * is not reformatted mid-typing); any outside change (undo, preset) wins over the draft.
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
  const [draft, setDraft] = useState<{ text: string; committed: string } | null>(null);
  const key = JSON.stringify(value);
  const showDraft = draft !== null && draft.committed === key;
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
          if (v !== undefined) {
            setDraft({ text: t, committed: JSON.stringify(v) });
            onCommit(v);
          } else {
            setDraft({ text: t, committed: key });
          }
        }}
        onBlur={() => setDraft(null)}
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

/** "ⓘ" toggle that reveals a one-line hint. */
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
      ⓘ
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
