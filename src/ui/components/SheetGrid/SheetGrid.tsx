import type { CSSProperties } from 'react';
import './SheetGrid.css';

export interface SheetGridProps {
  rows: number;
  cols: number;
  /** Cell text, trimmed to fit. */
  text: (r: number, c: number) => string;
  /** Column letter and, when it has one, its role and colour. */
  col: (c: number) => { name: string; role?: string; color?: string };
  /** Header rows are bold and tinted. */
  isHeader?: (r: number) => boolean;
  /** A tint for a cell that's read (its column's role colour). */
  tint?: (r: number, c: number) => string | undefined;
  selected?: (r: number, c: number) => boolean;
  onCell?: (r: number, c: number) => void;
  /** Tapping a row number. */
  onRow?: (r: number) => void;
  rowLabel?: (r: number) => string;
  label: string;
}

/** A preview of a sheet tab to tap: row numbers, column letters with their roles, and tinted cells that are read. */
export function SheetGrid({ rows, cols, text, col, isHeader, tint, selected, onCell, onRow, rowLabel, label }: SheetGridProps) {
  return (
    <div className="sgrid-wrap" role="grid" aria-label={label}>
      <table className="sgrid">
        <thead>
          <tr>
            <th />
            {Array.from({ length: cols }, (_, c) => {
              const x = col(c);
              return (
                <th key={c} style={x.color ? { boxShadow: `inset 0 3px 0 ${x.color}` } : undefined}>
                  {x.name}
                  {x.role && <span className="sgrid-role">{x.role}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r} className={isHeader?.(r) ? 'hdr' : undefined}>
              <th className="sgrid-rn">
                {onRow ? (
                  <button onClick={() => onRow(r)} aria-label={rowLabel?.(r) ?? `Row ${r + 1}`}>
                    {r + 1}
                  </button>
                ) : (
                  r + 1
                )}
              </th>
              {Array.from({ length: cols }, (_, c) => {
                const t = tint?.(r, c);
                const style: CSSProperties | undefined = t ? { background: `color-mix(in srgb, ${t} 18%, transparent)` } : undefined;
                return (
                  <td key={c} className={selected?.(r, c) ? 'sel' : undefined} style={style} onClick={onCell ? () => onCell(r, c) : undefined}>
                    {text(r, c).slice(0, 30)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
