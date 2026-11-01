/** Wall-clock <-> epoch conversion in a tournament's time zone (DST-safe, via Intl). */

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

/** Offset of `tz` from UTC at instant `epoch`, in ms. */
export function tzOffset(epoch: number, tz: string): number {
  const parts: Record<string, number> = {};
  for (const p of dtf(tz).formatToParts(new Date(epoch))) if (p.type !== 'literal') parts[p.type] = Number(p.value);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
  return asUtc - Math.floor(epoch / 1000) * 1000;
}

/** Epoch ms for a wall-clock time (yyyy-mm-dd + minutes after midnight) in `tz`. */
export function zonedEpoch(date: string, mins: number, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0) + mins * 60000;
  let off = tzOffset(guess - 0, tz);
  let t = guess - off;
  const off2 = tzOffset(t, tz);
  if (off2 !== off) {
    off = off2;
    t = guess - off;
  }
  return t;
}

/** Wall-clock date and minutes for an instant in `tz`. */
export function wallClock(epoch: number, tz: string): { date: string; mins: number } {
  const parts: Record<string, string> = {};
  for (const p of dtf(tz).formatToParts(new Date(epoch))) if (p.type !== 'literal') parts[p.type] = p.value;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, mins: (Number(parts.hour) % 24) * 60 + Number(parts.minute) };
}

export function hhmm(epoch: number, tz: string): string {
  const { mins } = wallClock(epoch, tz);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/** Today's date in `tz` as yyyy-mm-dd. */
export function todayIn(tz: string, now = Date.now()): string {
  return wallClock(now, tz).date;
}

export const MIN = 60000;
