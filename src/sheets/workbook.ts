import { tabKey } from './links';

/**
 * One tab, as displayed text, anchored at A1: rows[r][c] is the text of the cell at row r, column c (0-based).
 * Sparse extras hold hyperlinks, formulas and date values keyed by "r,c".
 */
export interface Tab {
  name: string;
  gid?: string;
  hidden: boolean;
  rows: string[][];
  links?: Record<string, string>;
  formulas?: Record<string, string>;
  /** yyyy-mm-dd for numeric cells formatted as dates (e.g. a Day column showing "Saturday"). */
  dates?: Record<string, string>;
}

export interface Workbook {
  title?: string;
  tabs: Tab[];
}

export const cellKey = (r: number, c: number) => `${r},${c}`;

export function cell(tab: Tab, r: number, c: number): string {
  return tab.rows[r]?.[c] ?? '';
}

export function width(tab: Tab): number {
  let w = 0;
  for (const row of tab.rows) if (row.length > w) w = row.length;
  return w;
}

export function colName(c: number): string {
  let s = '';
  let n = c + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function findTab(wb: Workbook, name: string): Tab | undefined {
  const k = tabKey(name);
  return wb.tabs.find((t) => t.name === name) ?? wb.tabs.find((t) => tabKey(t.name) === k);
}

/** Minimal surface of the SheetJS module we use, so it can be lazily loaded. */
export interface XlsxLike {
  read(data: ArrayBuffer | Uint8Array, opts: Record<string, unknown>): any;
  utils: { decode_range(r: string): { s: { r: number; c: number }; e: { r: number; c: number } }; encode_cell(a: { r: number; c: number }): string; format_cell(c: any): string };
  SSF: { is_date(fmt: string | number): boolean; parse_date_code(v: number): { y: number; m: number; d: number } };
}

/** Build our workbook model from xlsx bytes using SheetJS. */
export function workbookFromXlsx(X: XlsxLike, data: ArrayBuffer | Uint8Array): Workbook {
  const wb = X.read(data instanceof Uint8Array ? data : new Uint8Array(data), {
    type: 'array',
    cellFormula: true,
    cellNF: true,
    cellDates: false,
    cellHTML: false,
    cellStyles: false,
  });
  const tabs: Tab[] = [];
  (wb.SheetNames as string[]).forEach((name, i) => {
    const ws = wb.Sheets[name];
    const hidden = Boolean(wb.Workbook?.Sheets?.[i]?.Hidden);
    const tab: Tab = { name, hidden, rows: [] };
    const ref = ws?.['!ref'];
    if (ref) {
      const range = X.utils.decode_range(ref);
      // Anchor at A1: iterate from row/col 0 regardless of where the used range starts.
      for (let r = 0; r <= range.e.r; r++) {
        const row: string[] = [];
        let last = -1;
        for (let c = 0; c <= range.e.c; c++) {
          const cl = ws[X.utils.encode_cell({ r, c })];
          let text = '';
          if (cl) {
            text = cl.w !== undefined ? String(cl.w) : cl.v !== undefined && cl.v !== null ? safeFormat(X, cl) : '';
            if (cl.l?.Target) (tab.links ??= {})[cellKey(r, c)] = String(cl.l.Target);
            if (cl.f) (tab.formulas ??= {})[cellKey(r, c)] = String(cl.f);
            if (cl.t === 'n' && typeof cl.v === 'number' && cl.z && cl.v > 1 && safeIsDate(X, cl.z)) {
              const dc = X.SSF.parse_date_code(cl.v);
              if (dc && dc.y > 1900) (tab.dates ??= {})[cellKey(r, c)] = `${dc.y}-${String(dc.m).padStart(2, '0')}-${String(dc.d).padStart(2, '0')}`;
            }
          }
          row.push(text);
          if (text !== '') last = c;
        }
        row.length = last + 1;
        tab.rows.push(row);
      }
      while (tab.rows.length && tab.rows[tab.rows.length - 1].length === 0) tab.rows.pop();
    }
    tabs.push(tab);
  });
  return { title: wb.Props?.Title || undefined, tabs };
}

function safeFormat(X: XlsxLike, c: any): string {
  try {
    return X.utils.format_cell(c);
  } catch {
    return String(c.v);
  }
}

function safeIsDate(X: XlsxLike, z: string): boolean {
  try {
    return X.SSF.is_date(z);
  } catch {
    return false;
  }
}

/** Replace a tab's cells with freshly fetched CSV rows, keeping links/dates from the full workbook. */
export function withCsvTab(wb: Workbook, tabName: string, rows: string[][]): Workbook {
  return {
    ...wb,
    tabs: wb.tabs.map((t) => {
      if (t.name !== tabName) return t;
      const trimmed = rows.map((r) => {
        let last = r.length - 1;
        while (last >= 0 && r[last] === '') last--;
        return r.slice(0, last + 1);
      });
      while (trimmed.length && trimmed[trimmed.length - 1].length === 0) trimmed.pop();
      return { ...t, rows: trimmed };
    }),
  };
}

/** Cheap string hash (FNV-1a) used for change detection per tab. */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function tabHash(tab: Tab): string {
  return hashString(tab.rows.map((r) => r.join('\u001f')).join('\u001e'));
}
