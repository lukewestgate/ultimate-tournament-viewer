import type { RGame, Resolved } from './resolve';
import type { Game } from './types';

export type Status = 'upcoming' | 'live' | 'finishing' | 'awaiting' | 'final';

/** When the next game on the same pitch starts (or the slot end if none). */
export function pitchFreeAt(g: Game, games: Game[]): number {
  const next = games
    .filter((x) => x.pitch === g.pitch && x.day === g.day && x.start > g.start)
    .sort((a, b) => a.start - b.start)[0];
  return next ? next.start : g.slotEnd;
}

export function gameStatus(rg: RGame, now: number, games: Game[]): Status {
  const g = rg.game;
  if (rg.real && rg.outcome) return 'final';
  if (g.scoreLo !== undefined && g.scoreHi !== undefined) return 'final';
  if (now < g.start) return 'upcoming';
  if (now < g.end) return 'live';
  if (now < pitchFreeAt(g, games)) return 'finishing';
  return 'awaiting';
}

export interface NowBoard {
  onNow: RGame[];
  upNext: RGame[];
  upNextAt?: number;
  justFinished: RGame[];
  justFinishedTime?: string;
  slotLabel?: string;
  phase: 'before' | 'during' | 'between' | 'after';
  nextStart?: number;
}

export function nowBoard(r: Resolved, now: number): NowBoard {
  const games = r.games.map((x) => x.game);
  const sorted = [...r.games].sort((a, b) => a.game.start - b.game.start || a.game.pitch - b.game.pitch);
  const onNow = sorted.filter((rg) => {
    const g = rg.game;
    return g.start <= now && now < pitchFreeAt(g, games) && (now < g.slotEnd || !(rg.real && rg.outcome));
  });
  const future = sorted.filter((rg) => rg.game.start > now);
  const upNextAt = future[0]?.game.start;
  const upNext = future.filter((rg) => rg.game.start === upNextAt);
  const onIds = new Set(onNow.map((x) => x.game.id));
  const past = sorted.filter((rg) => rg.game.start <= now && !onIds.has(rg.game.id));
  const lastStart = past.length ? past[past.length - 1].game.start : undefined;
  const justFinished = past.filter((rg) => rg.game.start === lastStart);

  const first = sorted[0]?.game;
  const last = sorted[sorted.length - 1]?.game;
  let phase: NowBoard['phase'] = 'during';
  if (!first || now < first.start) phase = 'before';
  else if (last && now >= last.slotEnd && !onNow.length) phase = 'after';
  else if (!onNow.length && upNextAt && upNextAt - now > 3 * 3600_000) phase = 'between';

  let slotLabel: string | undefined;
  if (onNow.length) {
    const s = Math.min(...onNow.map((x) => x.game.start));
    const g = onNow.find((x) => x.game.start === s)!.game;
    slotLabel = `${g.time}–${fmtMins(g.end)}`;
  }
  return {
    onNow,
    upNext,
    upNextAt,
    justFinished,
    justFinishedTime: justFinished[0]?.game.time,
    slotLabel,
    phase,
    nextStart: upNextAt,
  };
}

function fmtMins(ts: number) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ts);
}
