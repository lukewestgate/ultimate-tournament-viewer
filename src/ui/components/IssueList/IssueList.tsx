import { useState, type ReactNode } from 'react';
import { IChevronDown } from '../../icons';
import { useWide } from '../useWide';
import './IssueList.css';

export interface IssueItem {
  key: string;
  /** Likely read wrongly (red dot), rather than only worth a look (amber). */
  bad: boolean;
  text: ReactNode;
  sub?: ReactNode;
  /** The fix, on the row: small buttons and link buttons. */
  actions?: ReactNode;
}

export interface IssueListProps {
  /** In the order to show; put likely-wrong items first. */
  items: IssueItem[];
  /** How many to show before "Show N more". Defaults to 3 on phones and 5 from 900px. */
  limit?: number;
}

/**
 * Problems with their fixes on the same row. Long lists show the first few and fold the rest behind "Show N more",
 * so the options below stay in reach; there is no inner scroll area.
 */
export function IssueList({ items, limit }: IssueListProps) {
  const wide = useWide();
  const [all, setAll] = useState(false);
  const max = limit ?? (wide ? 5 : 3);
  if (!items.length) return null;
  // Folding only one row away is pointless: show it.
  const folds = items.length > max + 1;
  const shown = folds && !all ? items.slice(0, max) : items;
  return (
    <section className="card issues">
      {shown.map((x) => (
        <div key={x.key} className="issue">
          <div className="issue-text">
            <i className={`issue-dot${x.bad ? ' bad' : ''}`} aria-hidden="true" />
            <span>
              <span className="sr-only">{x.bad ? 'Likely wrong: ' : 'Worth a look: '}</span>
              {x.text}
              {x.sub && <small>{x.sub}</small>}
            </span>
          </div>
          {x.actions && <div className="issue-acts">{x.actions}</div>}
        </div>
      ))}
      {folds && (
        <button className="issue-more" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? 'Show fewer' : `Show ${items.length - max} more`}
          <IChevronDown size={18} className={all ? 'up' : ''} />
        </button>
      )}
    </section>
  );
}
