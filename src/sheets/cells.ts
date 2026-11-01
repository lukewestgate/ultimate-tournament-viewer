/** Cell text parsing (spec §7.2). All functions take displayed cell text. */

const PLACEHOLDER = /^(#n\/?a|#ref!?|#value!?|#div\/0!?|#name\??|#num!?|#null!?|#error!?|x|tbc|tbd|-+|\?+|n\/a|none)$/i;

export function clean(s: string | undefined): string {
  return (s ?? '').replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** True for cells meaning "unknown" (#N/A, TBC, X, - …) or empty. */
export function isBlank(s: string | undefined): boolean {
  const c = clean(s);
  return c === '' || PLACEHOLDER.test(c) || c.startsWith('#');
}

/** Parse a score cell: "12", "12.0". */
export function parseNumber(s: string | undefined): number | undefined {
  const c = clean(s);
  if (!/^-?\d+(\.0+)?$/.test(c)) return undefined;
  return Number(c);
}

export type ScoreMark = { n?: number; mark?: 'W' | 'L' | 'D'; forfeit?: boolean };

/** Parse a score cell that may hold a number, a result mark (w/l/d) or a forfeit marker. */
export function parseScore(s: string | undefined): ScoreMark | undefined {
  const c = clean(s);
  if (!c) return undefined;
  const n = parseNumber(c);
  if (n !== undefined) return { n };
  const lc = c.toLowerCase();
  if (lc === 'w' || lc === 'win') return { mark: 'W' };
  if (lc === 'l' || lc === 'loss' || lc === 'lose') return { mark: 'L' };
  if (lc === 'd' || lc === 'draw') return { mark: 'D' };
  if (lc === 'f' || lc === 'ff' || lc === 'forfeit' || lc === 'forfeited') return { forfeit: true };
  return undefined;
}

/**
 * Parse a time cell into minutes after midnight.
 * Handles 09:30, 0900, 1633.0, 9:00 AM, 2:05 PM, 14:14:00, 1900-01-08 09:27:00, Sat @ 09:15, 0.3958 (day fraction).
 */
export function parseTime(s: string | undefined): number | undefined {
  let c = clean(s);
  if (!c) return undefined;
  // Strip a leading date ("1900-01-08 09:27:00") or day ("Sat @ 09:15", "Saturday 09:30")
  const at = /@\s*(.+)$/.exec(c);
  if (at) c = at[1];
  c = c.replace(/^\d{4}-\d{2}-\d{2}[ T]/, '');
  c = c.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s+/i, '');
  let m = /^(\d{1,2})[:.](\d{2})(?::(\d{2}))?\s*([ap])\.?m?\.?$/i.exec(c);
  if (m) {
    let h = Number(m[1]) % 12;
    if (m[4].toLowerCase() === 'p') h += 12;
    return h * 60 + Number(m[2]);
  }
  m = /^(\d{1,2})\s*([ap])\.?m\.?$/i.exec(c);
  if (m) {
    let h = Number(m[1]) % 12;
    if (m[2].toLowerCase() === 'p') h += 12;
    return h * 60;
  }
  m = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(c);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 24 && min < 60) return h * 60 + min;
    return undefined;
  }
  m = /^(\d{1,2})\.(\d{2})$/.exec(c);
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60 && Number(m[1]) >= 6) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d{3,4})(?:\.0+)?$/.exec(c);
  if (m) {
    const v = m[1].padStart(4, '0');
    const h = Number(v.slice(0, 2));
    const min = Number(v.slice(2));
    if (h < 24 && min < 60) return h * 60 + min;
    return undefined;
  }
  m = /^0?\.(\d+)$/.exec(c);
  if (m) {
    const frac = Number(`0.${m[1]}`);
    if (frac > 0 && frac < 1) return Math.round(frac * 24 * 60);
  }
  return undefined;
}

export function formatTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Parse a duration like "00:24", "01:30", "25 mins", "1 hour" into minutes. */
export function parseDuration(s: string | undefined): number | undefined {
  const c = clean(s).toLowerCase();
  if (!c) return undefined;
  let m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(c);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /(\d+(?:\.\d+)?)\s*(?:min|mins|minutes|m)\b/.exec(c);
  if (m) return Math.round(Number(m[1]));
  m = /(\d+(?:\.\d+)?)\s*(?:hour|hours|hr|hrs|h)\b/.exec(c);
  if (m) return Math.round(Number(m[1]) * 60);
  m = /^0?\.(\d+)$/.exec(c);
  if (m) return Math.round(Number(`0.${m[1]}`) * 24 * 60);
  return undefined;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function monthIndex(s: string): number {
  return MONTHS.indexOf(s.slice(0, 3).toLowerCase());
}

export function isoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1;
}

/** Pick the year that puts month/day nearest to the reference date. */
export function nearestYear(m: number, d: number, ref: Date = new Date()): number {
  const y = ref.getUTCFullYear();
  let best = y;
  let bestDiff = Infinity;
  for (const cand of [y - 1, y, y + 1]) {
    const diff = Math.abs(Date.UTC(cand, m - 1, d) - ref.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      best = cand;
    }
  }
  return best;
}

/**
 * Parse a date cell: 2026-10-24, 24/10/2026, Saturday 24 October, Sunday 25th October, 24 Oct 2026, October 24 2026.
 * Returns yyyy-mm-dd.
 */
export function parseDate(s: string | undefined, ref: Date = new Date()): string | undefined {
  const c = clean(s);
  if (!c) return undefined;
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(c);
  if (m && validDate(+m[1], +m[2], +m[3])) return isoDate(+m[1], +m[2], +m[3]);
  m = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/.exec(c);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    if (validDate(y, +m[2], +m[1])) return isoDate(y, +m[2], +m[1]);
  }
  m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,9})\.?,?(?:\s+(\d{4}))?\b/i.exec(c);
  if (m && monthIndex(m[2]) >= 0) {
    const mo = monthIndex(m[2]) + 1;
    const y = m[3] ? +m[3] : nearestYear(mo, +m[1], ref);
    if (validDate(y, mo, +m[1])) return isoDate(y, mo, +m[1]);
  }
  m = /\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?\b/i.exec(c);
  if (m && monthIndex(m[1]) >= 0) {
    const mo = monthIndex(m[1]) + 1;
    const y = m[3] ? +m[3] : nearestYear(mo, +m[2], ref);
    if (validDate(y, mo, +m[2])) return isoDate(y, mo, +m[2]);
  }
  return undefined;
}

/** Weekday name in a cell ("SATURDAY", "Sat", "Saturday 24 October"). Returns e.g. "Saturday". */
export function parseWeekday(s: string | undefined): string | undefined {
  const c = clean(s).toLowerCase();
  if (!c) return undefined;
  const m = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/.exec(c);
  if (!m) return undefined;
  const full = WEEKDAYS.find((w) => w.startsWith(m[1]));
  return full ? full[0].toUpperCase() + full.slice(1) : undefined;
}

export function weekdayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const w = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return w[0].toUpperCase() + w.slice(1);
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return isoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * Dates from a sheet title: "(28-29 March)", "19 Sep 2026", "11-12 July", "28th - 29th March 2026".
 * Returns the list of dates (first..last).
 */
export function datesFromTitle(title: string | undefined, ref: Date = new Date()): string[] {
  const c = clean(title);
  if (!c) return [];
  const range = /\b(\d{1,2})(?:st|nd|rd|th)?\s*[-–&]\s*(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?(?:\s+(\d{4}))?/i.exec(c);
  if (range && monthIndex(range[3]) >= 0) {
    const mo = monthIndex(range[3]) + 1;
    const d1 = +range[1];
    const d2 = +range[2];
    const y = range[4] ? +range[4] : nearestYear(mo, d1, ref);
    if (validDate(y, mo, d1) && validDate(y, mo, d2) && d2 >= d1 && d2 - d1 < 7) {
      const out: string[] = [];
      for (let d = d1; d <= d2; d++) out.push(isoDate(y, mo, d));
      return out;
    }
  }
  const single = parseDate(c, ref);
  return single ? [single] : [];
}
