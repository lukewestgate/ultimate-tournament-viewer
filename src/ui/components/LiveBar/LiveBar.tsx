import type { ReactNode } from 'react';
import './LiveBar.css';

/** A bar pinned to the bottom of a long task, showing what's been read so far, with the action that finishes it. */
export function LiveBar({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="livebar" aria-live="polite">
      <span className="livebar-text">{children}</span>
      {action}
    </div>
  );
}
