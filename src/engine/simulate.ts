import type { Tournament } from '../model/types';
import type { EffResult } from './resolve';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Plausible scores for games after `at` (Diagnostics testing), so brackets and paths can be tried before an event.
 * Deterministic per game; the better seed usually wins. Clearly marked as simulated.
 */
export function simulateResults(t: Tournament, at: number, seedOf: (team: string | undefined) => number | undefined): Map<string, EffResult> {
  const out = new Map<string, EffResult>();
  for (const g of t.games) {
    if (g.start < at || g.isBye || g.unscheduled) continue;
    const h = hash(g.id);
    const sa = seedOf(g.teams[0]) ?? 50;
    const sb = seedOf(g.teams[1]) ?? 50;
    const favA = sa <= sb;
    const upset = h % 100 < 25;
    const aWins = favA !== upset;
    const win = 11 + (h % 4);
    const lose = 4 + ((h >> 3) % 6);
    out.set(g.id, aWins ? { sa: win, sb: lose, outcome: 'A', simulated: true } : { sa: lose, sb: win, outcome: 'B', simulated: true });
  }
  return out;
}
