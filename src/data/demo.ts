import { resolve, sideTeam } from '../engine/resolve';
import type { Tournament } from '../engine/types';

/** Deterministic pseudo-random in [0, 1) from a string. */
function rand(key: string) {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 2 ** 32;
}

/**
 * Demo mode: invent plausible scores for every game that has finished by `now`
 * (stronger seeds usually win). Used to preview the app before real results exist.
 */
export function simulate(t: Tournament, now: number, mode: 'chalk' | 'random' = 'random'): Tournament {
  const out: Tournament = { ...t, games: t.games.map((g) => ({ ...g })) };
  const seedOf = new Map(t.seeds.map((s) => [s.team, s.seed]));
  for (const g of out.games) {
    if (g.end > now || (g.scoreLo !== undefined && g.scoreHi !== undefined)) continue;
    const r = resolve(out).byId.get(g.id);
    const a = r && sideTeam(r.lo);
    const b = r && sideTeam(r.hi);
    if (!a || !b) continue;
    const sa = seedOf.get(a) ?? 8;
    const sb = seedOf.get(b) ?? 8;
    const x = rand(g.id + a + b);
    const pA = mode === 'chalk' ? (sa < sb ? 1 : 0) : 0.5 + (sb - sa) / 24;
    const draw = mode === 'random' && g.stage !== 'placement' && x > 0.9;
    const aWins = x < pA;
    const win = 8 + Math.floor(rand(g.id + 'w') * 6);
    const lose = draw ? win : Math.max(1, win - 1 - Math.floor(rand(g.id + 'l') * 6));
    g.scoreLo = aWins ? win : lose;
    g.scoreHi = aWins ? lose : win;
  }
  return out;
}
