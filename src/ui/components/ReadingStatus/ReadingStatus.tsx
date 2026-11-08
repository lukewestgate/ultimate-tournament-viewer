import type { ReactNode } from 'react';
import './ReadingStatus.css';

export interface ReadingStatusProps {
  /** ok: reads fine · warn: things to check · bad: nothing usable was read. */
  tone: 'ok' | 'warn' | 'bad';
  /** The verdict: "Looks right", "3 things to check", "Couldn’t find the games". */
  title: string;
  /** One quiet line under the verdict, such as "2 likely wrong · 1 worth a look". */
  detail?: ReactNode;
  /** What was read, in the order shown. Use the same counts as every other screen (readingCounts). */
  counts?: { label: string; value: number }[];
  /** A last muted line, such as how far predictions reach. */
  note?: ReactNode;
}

/** The verdict at the top of Reading: one glance says whether the sheet was read well. */
export function ReadingStatus({ tone, title, detail, counts, note }: ReadingStatusProps) {
  return (
    <section className="card rstatus" aria-live="polite">
      <div className="rstatus-head">
        <i className={`rstatus-dot ${tone}`} aria-hidden="true" />
        <h2>{title}</h2>
      </div>
      {detail && <span className="rstatus-detail">{detail}</span>}
      {counts && counts.length > 0 && (
        <div className="rstatus-counts">
          {counts.map((c) => (
            <span key={c.label}>
              <b className="d">{c.value}</b> {c.label}
            </span>
          ))}
        </div>
      )}
      {note && <span className="rstatus-note">{note}</span>}
    </section>
  );
}
