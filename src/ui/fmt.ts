import { hhmm, wallClock } from '../engine/time';

/** "10:30" in the tournament's zone. */
export const timeOf = (epoch: number, tz: string) => hhmm(epoch, tz);

export function dayShort(epoch: number, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: tz }).format(new Date(epoch));
}

export function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function dateRange(dates: string[]): string {
  if (!dates.length) return '';
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  };
  const a = dates[0];
  const b = dates[dates.length - 1];
  if (a === b) return fmt(a, { weekday: 'short', day: 'numeric', month: 'short' });
  if (a.slice(0, 7) === b.slice(0, 7)) return `${fmt(a, { day: 'numeric' })}–${fmt(b, { day: 'numeric', month: 'short' })}`;
  return `${fmt(a, { day: 'numeric', month: 'short' })} – ${fmt(b, { day: 'numeric', month: 'short' })}`;
}

/** "in 18 min", "in 2 h 5 min", "now". */
export function until(target: number, now: number): string {
  const mins = Math.round((target - now) / 60000);
  if (mins <= 0) return 'now';
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 24) return `in ${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? '' : 's'}`;
  return `in ${h} h${m ? ` ${m} min` : ''}`;
}

/** "Updated 2m ago". */
export function ago(t: number | undefined, now: number): string {
  if (!t) return 'Not updated yet';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'Updated just now';
  const m = Math.round(s / 60);
  if (m < 60) return `Updated ${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `Updated ${h}h ago`;
  return `Updated ${Math.round(h / 24)}d ago`;
}

export const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

export function dateOf(epoch: number, tz: string) {
  return wallClock(epoch, tz).date;
}

export function plural(n: number, word: string, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}

/** Initials for the primary-team avatar: "Leeds 1" -> "L1", "Sheffield Steal" -> "SS". */
export function initials(name: string): string {
  const words = name.replace(/\(.*?\)/g, '').trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + (words[words.length - 1].match(/^\d+$/) ? words[words.length - 1] : words[1][0])).slice(0, 3).toUpperCase();
}
