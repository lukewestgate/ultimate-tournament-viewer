import { endOfDay } from '../engine/time';
import type { TournamentSummary } from './settings';

export interface LaunchEntry {
  id: string;
  summary?: TournamentSummary;
  lastOpened?: number;
}

const HOUR = 3600000;

/** Home works in one zone, as its cards do: a tournament that hasn't loaded has none of its own. */
export const HOME_ZONE = 'Europe/London';

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

export type TournamentStatus = 'live' | 'between' | 'awaiting' | 'upcoming' | 'guessed' | 'completed' | 'unknown';

/**
 * Where a tournament is (SpecHome, Status rules). It's over as soon as every game has a result or the final standings
 * are filled in, and otherwise when its last day ends. Standings only count from the last day, as a sheet can fill them
 * from seeds beforehand.
 */
export function tournamentStatus(s: TournamentSummary | undefined, now: number): TournamentStatus {
  if (!s?.firstStart || !s.lastEnd) return 'unknown';
  const allIn = Boolean(s.counted) && s.unresolved === 0 && now >= (s.ifRequiredUntil ?? 0);
  if (allIn || (s.standingsDone && now >= (s.sessions?.at(-1)?.start ?? s.firstStart))) return 'completed';
  if (s.datesGuessed && !isOnToday(s, now)) return s.lastEnd < now - 7 * 24 * HOUR ? 'completed' : 'guessed';
  if (now >= (s.finishBy ?? endOfDay(s.lastEnd, HOME_ZONE))) return 'completed';
  if (now > s.lastEnd) return 'awaiting';
  if (resumesAt(s, now) !== undefined) return 'between';
  return now >= s.firstStart - HOUR ? 'live' : 'upcoming';
}

/** When play restarts, if the tournament has begun and there's nothing more until a later day. */
export function resumesAt(s: TournamentSummary, now: number): number | undefined {
  const days = s.sessions ?? [];
  if (!s.firstStart || now < s.firstStart || days.some((d) => now >= d.start - HOUR && now <= d.end)) return undefined;
  return days.find((d) => d.start > now)?.start;
}
