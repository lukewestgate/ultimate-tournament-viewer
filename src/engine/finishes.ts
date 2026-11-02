import type { Rules } from '../model/types';
import { rankTeams, type Result } from './standings';

export interface OpenGame {
  id: string;
  a: string;
  b: string;
}

export interface Finishes {
  /** team -> places it can still reach */
  places: Map<string, Set<number>>;
  approximate: boolean;
  open: number;
}

const OUTCOMES: Result['outcome'][] = ['A', 'D', 'B'];

/** Places a team occupies in a ranking; tied groups can take any place in their range. */
export function placesOf(rk: ReturnType<typeof rankTeams>, team: string): number[] {
  const row = rk.rows.find((r) => r.team === team);
  if (!row) return [];
  const out: number[] = [];
  for (let i = 0; i <= row.tiedWith.length; i++) out.push(row.rank + i);
  return out;
}

/**
 * Enumerate every outcome (W/D/L) of the remaining games when there are few enough; otherwise sample and say so.
 * Result-only outcomes leave score-based tie-breaks undecided, so tied teams can take any place in their range.
 */
export function possibleFinishes(teams: string[], played: Result[], open: OpenGame[], rules: Rules, seeds: Record<string, number> = {}, maxExact = 8): Finishes {
  const places = new Map<string, Set<number>>(teams.map((t) => [t, new Set<number>()]));
  const outcomes = rules.drawsAllowed.pool ? OUTCOMES : (['A', 'B'] as const);
  const record = (extra: Result[]) => {
    const rk = rankTeams(teams, [...played, ...extra], rules, seeds);
    for (const t of teams) for (const p of placesOf(rk, t)) places.get(t)!.add(p);
  };
  if (open.length <= maxExact) {
    const n = outcomes.length ** open.length;
    for (let i = 0; i < n; i++) {
      let k = i;
      const extra: Result[] = open.map((g) => {
        const o = outcomes[k % outcomes.length];
        k = Math.floor(k / outcomes.length);
        return { a: g.a, b: g.b, outcome: o };
      });
      record(extra);
    }
    return { places, approximate: false, open: open.length };
  }
  // Sample: deterministic pseudo-random outcomes.
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 3000; i++) {
    record(open.map((g) => ({ a: g.a, b: g.b, outcome: outcomes[Math.floor(rnd() * outcomes.length)] })));
  }
  return { places, approximate: true, open: open.length };
}

export interface Outlook {
  best: number;
  worst: number;
  /** "Through to Pool E" style statements come from the UI using `leads`; these are the raw facts. */
  clinched?: number; // guaranteed top-N
  eliminatedFrom?: number; // can't finish top-N
}

/** Best/worst place and clinched/eliminated facts for a team. */
export function outlook(f: Finishes, team: string, size: number): Outlook {
  const ps = [...(f.places.get(team) ?? [])].sort((a, b) => a - b);
  if (!ps.length) return { best: 1, worst: size };
  const best = ps[0];
  const worst = ps[ps.length - 1];
  return { best, worst, clinched: worst < size ? worst : undefined, eliminatedFrom: best > 1 ? best - 1 : undefined };
}
