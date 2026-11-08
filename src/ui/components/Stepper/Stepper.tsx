import type { ReactNode } from 'react';

/** − value + for small numbers (minutes, points). Styled by `.stepper` in shell.css; `amber` marks a value that shifts the schedule. */
export function Stepper({ value, onMinus, onPlus, amber, label }: { value: ReactNode; onMinus: () => void; onPlus: () => void; amber?: boolean; label: string }) {
  return (
    <div className={`stepper${amber ? ' amber' : ''}`} role="group" aria-label={label}>
      <button className="ib" aria-label={`Less ${label.toLowerCase()}`} onClick={onMinus}>
        −
      </button>
      <output className="d step-val">{value}</output>
      <button className="ib" aria-label={`More ${label.toLowerCase()}`} onClick={onPlus}>
        +
      </button>
    </div>
  );
}
