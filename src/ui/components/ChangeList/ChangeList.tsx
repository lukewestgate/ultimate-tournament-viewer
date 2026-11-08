import type { ReactNode } from 'react';
import './ChangeList.css';

export interface ChangeItem {
  /** add: something new is read · fix: read differently · remove: no longer read. */
  kind: 'add' | 'fix' | 'remove';
  text: ReactNode;
  sub?: ReactNode;
}

const SIGN = { add: '+', fix: '~', remove: '−' };
const SR = { add: 'Added', fix: 'Changed', remove: 'Removed' };

/** What one reading does differently from another: the AI's result, or a reading in History. */
export function ChangeList({ items, empty = 'No differences.' }: { items: ChangeItem[]; empty?: string }) {
  if (!items.length) return <p className="small muted changes-empty">{empty}</p>;
  return (
    <ul className="changes">
      {items.map((x, i) => (
        <li key={i} className="change">
          <span className={`change-sign ${x.kind}`} aria-label={SR[x.kind]}>
            {SIGN[x.kind]}
          </span>
          <span>
            {x.text}
            {x.sub && <small>{x.sub}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}
