import type { Game } from '../model/types';

export type GameStatus = 'upcoming' | 'live' | 'finishing' | 'awaiting' | 'final' | 'ifRequired' | 'notPlayed' | 'bye';

export const STATUS_LABEL: Record<GameStatus, string> = {
  upcoming: 'Upcoming',
  live: 'Live',
  finishing: 'Finishing',
  awaiting: 'Awaiting result',
  final: 'Final',
  ifRequired: 'If required',
  notPlayed: 'Not played',
  bye: 'Bye',
};

/**
 * Status from the (possibly replayed) clock plus result (spec §5):
 * upcoming → live → finishing (until the next game on the pitch starts) → awaiting result; final once there's a result.
 */
export function gameStatus(g: Game, now: number, hasResult: boolean, nextOnPitchStart: number | undefined, ended: boolean, teamsKnown: boolean): GameStatus {
  if (g.isBye) return 'bye';
  if (hasResult) return 'final';
  if (g.conditional) {
    if (ended && now >= g.end) return 'notPlayed';
    if (!teamsKnown) return 'ifRequired';
  }
  if (now < g.start) return 'upcoming';
  if (now < g.end) return 'live';
  if (nextOnPitchStart === undefined || now < nextOnPitchStart) return now < g.slotEnd + 15 * 60000 ? 'finishing' : 'awaiting';
  return 'awaiting';
}

/** Map game id -> start of the next game on the same pitch and day. */
export function nextOnPitch(games: Game[]): Map<string, number> {
  const by = new Map<string, Game[]>();
  for (const g of games) {
    if (g.unscheduled || g.isBye) continue;
    const k = `${g.day}|${g.pitch.label}`;
    by.set(k, [...(by.get(k) ?? []), g]);
  }
  const out = new Map<string, number>();
  for (const list of by.values()) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 0; i < list.length - 1; i++) out.set(list[i].id, list[i + 1].start);
  }
  return out;
}
