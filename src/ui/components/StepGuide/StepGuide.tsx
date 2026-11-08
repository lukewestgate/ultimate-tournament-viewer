import type { ReactNode } from 'react';
import './StepGuide.css';

export type StepState = 'done' | 'warn' | 'todo';

/** The steps of a guided task, as tabs: each shows done (✓), needs attention (!) or its number. */
export function StepTabs<K extends string>({ steps, current, onPick, label }: { steps: { key: K; label: string; state: StepState }[]; current: K; onPick: (k: K) => void; label: string }) {
  return (
    <div className="steptabs" role="tablist" aria-label={label}>
      {steps.map((s, i) => (
        <button key={s.key} role="tab" aria-selected={s.key === current} className={s.key === current ? 'on' : ''} onClick={() => onPick(s.key)}>
          <span className={`steptabs-n ${s.state}`} aria-hidden="true">
            {s.state === 'done' ? '✓' : s.state === 'warn' ? '!' : i + 1}
          </span>
          {s.label}
          {s.state !== 'todo' && <span className="sr-only">{s.state === 'done' ? ' (done)' : ' (needs attention)'}</span>}
        </button>
      ))}
    </div>
  );
}

/** What to tap, in order. Exactly one item is "now"; done items tick off. */
export function TapList({ items }: { items: { text: ReactNode; state: 'done' | 'now' | 'todo' }[] }) {
  return (
    <ol className="taplist">
      {items.map((x, i) => (
        <li key={i} className={x.state} aria-current={x.state === 'now' ? 'step' : undefined}>
          <span className="taplist-n" aria-hidden="true">
            {x.state === 'done' ? '✓' : i + 1}
          </span>
          <span className="taplist-text">{x.text}</span>
        </li>
      ))}
    </ol>
  );
}
