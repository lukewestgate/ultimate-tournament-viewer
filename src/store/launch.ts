import type { TournamentSummary } from './settings';

export interface LaunchEntry {
  id: string;
  summary?: TournamentSummary;
  lastOpened?: number;
}

const HOUR = 3600000;

/** "On today": from about an hour before the first game until the last game ends. */
export function isOnToday(s: TournamentSummary | undefined, now: number): boolean {
  if (!s?.firstStart || !s.lastEnd) return false;
  return now >= s.firstStart - HOUR && now <= s.lastEnd;
}

export type LaunchTarget = { kind: 'tournament'; id: string; onToday: number } | { kind: 'home' } | { kind: 'empty' };

/**
 * Which screen opens at launch (spec §9.2): a linked tournament; the one on today; the most recently opened
 * of several on today; otherwise home (or the empty state).
 */
export function launchTarget(entries: LaunchEntry[], now: number, linkedId?: string): LaunchTarget {
  if (linkedId) return { kind: 'tournament', id: linkedId, onToday: entries.filter((e) => isOnToday(e.summary, now)).length };
  if (!entries.length) return { kind: 'empty' };
  const today = entries.filter((e) => isOnToday(e.summary, now));
  if (!today.length) return { kind: 'home' };
  const pick = [...today].sort((a, b) => (b.lastOpened ?? 0) - (a.lastOpened ?? 0))[0];
  return { kind: 'tournament', id: pick.id, onToday: today.length };
}

export type HomeGroup = 'onToday' | 'comingUp' | 'datesUnconfirmed' | 'recent';

export function homeGroup(e: LaunchEntry, now: number): HomeGroup {
  const s = e.summary;
  if (isOnToday(s, now)) return 'onToday';
  if (s?.datesGuessed && (!s.lastEnd || s.lastEnd > now - 7 * 24 * HOUR)) return 'datesUnconfirmed';
  if (s?.firstStart && s.firstStart > now) return 'comingUp';
  return 'recent';
}
