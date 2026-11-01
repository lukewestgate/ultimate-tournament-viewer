import type { Game, Pool, Rules, Tiebreak } from '../model/types';
import { TIEBREAK_LABEL, UNCOMPUTABLE } from './rulesPresets';

/** One result as the ranking sees it. Scores may be missing for result-only entries. */
export interface Result {
  a: string;
  b: string;
  sa?: number;
  sb?: number;
  outcome: 'A' | 'B' | 'D';
  forfeit?: 'A' | 'B';
  gameId?: string;
  hypothetical?: boolean;
  carried?: boolean;
}

export interface Row {
  team: string;
  p: number;
  w: number;
  d: number;
  l: number;
  pf: number;
  pa: number;
  diff: number;
  pts: number;
  rank: number;
  /** Teams this one is still level with after every computable criterion. */
  tiedWith: string[];
  seed?: number;
}

export interface Explanation {
  above: string;
  below: string;
  rule: Tiebreak | 'points' | 'wins' | 'sheet' | 'td';
  text: string;
}

export interface TiedGroup {
  teams: string[];
  reason: string;
}

export interface Ranking {
  rows: Row[];
  explanations: Explanation[];
  tied: TiedGroup[];
}

/** A game's result if it has one (both scores, or result marks). */
export function resultOf(g: Game): Result | undefined {
  const [a, b] = g.teams;
  if (!a || !b || g.isBye) return undefined;
  const [sa, sb] = g.scores;
  const ff = g.forfeit ? (g.forfeit[0] ? 'A' : g.forfeit[1] ? 'B' : undefined) : undefined;
  if (sa !== undefined && sb !== undefined) {
    return { a, b, sa, sb, outcome: sa > sb ? 'A' : sb > sa ? 'B' : 'D', forfeit: ff, gameId: g.id };
  }
  const m = g.marks;
  if (m && (m[0] || m[1])) {
    const o = m[0] === 'W' || m[1] === 'L' ? 'A' : m[1] === 'W' || m[0] === 'L' ? 'B' : 'D';
    return { a, b, outcome: o, forfeit: ff, gameId: g.id };
  }
  if (ff) return { a, b, outcome: ff === 'A' ? 'B' : 'A', forfeit: ff, gameId: g.id };
  return undefined;
}

function stats(teams: string[], results: Result[], rules: Rules): Map<string, Row> {
  const m = new Map<string, Row>();
  for (const t of teams) m.set(t, { team: t, p: 0, w: 0, d: 0, l: 0, pf: 0, pa: 0, diff: 0, pts: 0, rank: 0, tiedWith: [] });
  for (const r of results) {
    const A = m.get(r.a);
    const B = m.get(r.b);
    if (!A || !B) continue;
    A.p++;
    B.p++;
    if (r.sa !== undefined && r.sb !== undefined) {
      A.pf += r.sa;
      A.pa += r.sb;
      B.pf += r.sb;
      B.pa += r.sa;
    }
    if (r.outcome === 'A') {
      A.w++;
      B.l++;
      A.pts += rules.points.win;
      B.pts += rules.points.loss;
    } else if (r.outcome === 'B') {
      B.w++;
      A.l++;
      B.pts += rules.points.win;
      A.pts += rules.points.loss;
    } else {
      A.d++;
      B.d++;
      A.pts += rules.points.draw;
      B.pts += rules.points.draw;
    }
  }
  for (const r of m.values()) r.diff = r.pf - r.pa;
  return m;
}

type Value = { ok: true; v: Map<string, number>; show: (t: string) => string } | { ok: false; reason: string };

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const fmt1 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** Value of a criterion for each team in `group` (higher is better). */
function criterion(tb: Tiebreak, group: string[], all: Result[], rules: Rules, seeds: Record<string, number>): Value {
  if (UNCOMPUTABLE.includes(tb)) return { ok: false, reason: tb === 'spirit' ? 'decided by spirit scores (TD)' : tb === 'coinToss' ? 'decided by a coin toss' : 'decided at the field (disc throw)' };
  const set = new Set(group);
  const among = all.filter((r) => set.has(r.a) && set.has(r.b));
  const scored = (rs: Result[]) => rs.every((r) => r.sa !== undefined && r.sb !== undefined);
  const v = new Map<string, number>();
  const per = (rs: Result[], f: (t: string, r: Result, mine: number, theirs: number, won: boolean, drew: boolean) => number) => {
    for (const t of group) v.set(t, 0);
    for (const r of rs) {
      for (const [t, me, them, w] of [
        [r.a, r.sa, r.sb, r.outcome === 'A'],
        [r.b, r.sb, r.sa, r.outcome === 'B'],
      ] as [string, number | undefined, number | undefined, boolean][]) {
        if (!set.has(t)) continue;
        v.set(t, v.get(t)! + f(t, r, me ?? 0, them ?? 0, w, r.outcome === 'D'));
      }
    }
  };
  // Common opponents: teams every tied team played, excluding the tied teams.
  const common = () => {
    let opp: Set<string> | undefined;
    for (const t of group) {
      const mine = new Set(all.filter((r) => r.a === t || r.b === t).map((r) => (r.a === t ? r.b : r.a)).filter((o) => !set.has(o)));
      opp = opp ? new Set([...opp].filter((o) => mine.has(o))) : mine;
    }
    const c = opp ?? new Set<string>();
    return all.filter((r) => (set.has(r.a) && c.has(r.b)) || (set.has(r.b) && c.has(r.a)));
  };
  const perGame = (rs: Result[]) => {
    const games = new Map<string, number>();
    const goals = new Map<string, number>();
    for (const t of group) {
      games.set(t, 0);
      goals.set(t, 0);
    }
    for (const r of rs) {
      if (set.has(r.a)) {
        games.set(r.a, games.get(r.a)! + 1);
        goals.set(r.a, goals.get(r.a)! + (r.sa ?? 0));
      }
      if (set.has(r.b)) {
        games.set(r.b, games.get(r.b)! + 1);
        goals.set(r.b, goals.get(r.b)! + (r.sb ?? 0));
      }
    }
    for (const t of group) v.set(t, games.get(t)! ? goals.get(t)! / games.get(t)! : 0);
  };
  switch (tb) {
    case 'h2hWins':
      per(among, (_t, _r, _m, _th, w) => (w ? 1 : 0));
      return { ok: true, v, show: (t) => `${v.get(t)}` };
    case 'h2hPoints':
      per(among, (_t, _r, _m, _th, w, d) => (w ? rules.points.win : d ? rules.points.draw : rules.points.loss));
      return { ok: true, v, show: (t) => `${v.get(t)}` };
    case 'forfeits':
      per(all.filter((r) => set.has(r.a) || set.has(r.b)), (t, r) => -((r.forfeit === 'A' && r.a === t) || (r.forfeit === 'B' && r.b === t) ? 1 : 0));
      return { ok: true, v, show: (t) => `${-v.get(t)!}` };
    case 'h2hDiff':
      if (!scored(among)) return { ok: false, reason: 'depends on scores' };
      per(among, (_t, _r, me, them) => me - them);
      return { ok: true, v, show: (t) => signed(v.get(t)!) };
    case 'commonDiff': {
      const rs = common();
      if (!scored(rs)) return { ok: false, reason: 'depends on scores' };
      per(rs, (_t, _r, me, them) => me - them);
      return { ok: true, v, show: (t) => signed(v.get(t)!) };
    }
    case 'h2hScoredPerGame':
      if (!scored(among)) return { ok: false, reason: 'depends on scores' };
      perGame(among);
      return { ok: true, v, show: (t) => fmt1(v.get(t)!) };
    case 'commonScoredPerGame': {
      const rs = common();
      if (!scored(rs)) return { ok: false, reason: 'depends on scores' };
      perGame(rs);
      return { ok: true, v, show: (t) => fmt1(v.get(t)!) };
    }
    case 'diff':
    case 'scored':
    case 'conceded': {
      const mine = all.filter((r) => set.has(r.a) || set.has(r.b));
      if (!scored(mine)) return { ok: false, reason: 'depends on scores' };
      per(mine, (_t, _r, me, them) => (tb === 'diff' ? me - them : tb === 'scored' ? me : -them));
      return {
        ok: true,
        v,
        show: (t) => (tb === 'diff' ? signed(v.get(t)!) : tb === 'scored' ? `${v.get(t)}` : `${-v.get(t)!}`),
      };
    }
    case 'seed':
      if (group.some((t) => seeds[t] === undefined)) return { ok: false, reason: 'seeds unknown' };
      for (const t of group) v.set(t, -seeds[t]);
      return { ok: true, v, show: (t) => `${seeds[t]}` };
    default:
      return { ok: false, reason: 'not computable' };
  }
}

/** Rank teams in a pool (spec §8.3 algorithm, used for every preset). */
export function rankTeams(teams: string[], results: Result[], rules: Rules, seeds: Record<string, number> = {}): Ranking {
  const st = stats(teams, results, rules);
  const byWins = rules.rankBy === 'wins';
  const primary = (t: string) => (byWins ? st.get(t)!.w : st.get(t)!.pts);
  const explanations: Explanation[] = [];
  const tied: TiedGroup[] = [];
  const primaryText = (t: string) => (byWins ? `${st.get(t)!.w} wins` : `${st.get(t)!.pts} pts`);

  const resolve = (group: string[]): string[][] => {
    // returns ordered list of subgroups (each subgroup still tied if length > 1)
    if (group.length <= 1) return [group];
    for (const tb of rules.tiebreaks) {
      const val = criterion(tb, group, results, rules, seeds);
      if (!val.ok) {
        tied.push({ teams: group, reason: val.reason });
        return [group];
      }
      const sorted = [...group].sort((x, y) => val.v.get(y)! - val.v.get(x)!);
      const parts: string[][] = [];
      for (const t of sorted) {
        const last = parts[parts.length - 1];
        if (last && val.v.get(last[0]) === val.v.get(t)) last.push(t);
        else parts.push([t]);
      }
      if (parts.length === 1) continue;
      for (let i = 1; i < parts.length; i++) {
        const above = parts[i - 1][parts[i - 1].length - 1];
        const below = parts[i][0];
        explanations.push({
          above,
          below,
          rule: tb,
          text: `${above} above ${below}: level on ${primaryText(above)}; ${TIEBREAK_LABEL[tb].toLowerCase()} ${val.show(above)} vs ${val.show(below)}`,
        });
      }
      // Subgroups that are still tied start again from the first criterion.
      return parts.flatMap((p) => (p.length > 1 ? resolve(p) : [p]));
    }
    tied.push({ teams: group, reason: 'still tied after every tie-break' });
    return [group];
  };

  const order = [...teams].sort((x, y) => primary(y) - primary(x));
  const groups: string[][] = [];
  for (const t of order) {
    const last = groups[groups.length - 1];
    if (last && primary(last[0]) === primary(t)) last.push(t);
    else groups.push([t]);
  }
  const rows: Row[] = [];
  for (const g of groups) {
    for (const sub of resolve(g)) {
      const rank = rows.length + 1;
      for (const t of sub.sort((x, y) => (seeds[x] ?? 999) - (seeds[y] ?? 999))) {
        rows.push({ ...st.get(t)!, rank, tiedWith: sub.filter((x) => x !== t), seed: seeds[t] });
      }
    }
  }
  return { rows, explanations, tied };
}

export interface PoolStanding extends Ranking {
  pool: Pool;
  complete: boolean;
  played: number;
  total: number;
  /** Order the app shows: computed, or the sheet's/TD's when the pool is complete. */
  source: 'computed' | 'sheet' | 'td';
  /** Disagreement between the sheet's rank and the computed order (for Diagnostics). */
  disagreement?: string;
  results: Result[];
}

/** Results for a pool, including carried results from an earlier game between the same two teams. */
export function poolResults(pool: Pool, games: Game[]): { results: Result[]; total: number } {
  const own = games.filter((g) => g.pool === pool.name && g.division === pool.division && !g.isBye);
  const results = own.map(resultOf).filter((r): r is Result => Boolean(r));
  let total = own.length;
  if (pool.carried?.length) {
    const teams = new Set(pool.slots.map((s) => s.team).filter(Boolean));
    const firstStart = Math.min(...own.map((g) => g.start));
    for (const g of games) {
      if (g.pool === pool.name || g.start >= firstStart || g.stage !== 'pool' || g.division !== pool.division) continue;
      const [a, b] = g.teams;
      if (a && b && teams.has(a) && teams.has(b)) {
        total++;
        const r = resultOf(g);
        if (r) results.push({ ...r, carried: true });
      }
    }
  }
  return { results, total };
}

export function poolTeams(pool: Pool, games: Game[]): string[] {
  const out: string[] = [];
  for (const s of pool.slots) if (s.team && !out.includes(s.team)) out.push(s.team);
  for (const g of games) if (g.pool === pool.name && g.division === pool.division) for (const t of g.teams) if (t && !out.includes(t)) out.push(t);
  return out;
}

export function poolStanding(pool: Pool, games: Game[], rules: Rules, seeds: Record<string, number> = {}, useSheet = true): PoolStanding {
  const teams = poolTeams(pool, games);
  const { results, total } = poolResults(pool, games);
  const ranking = rankTeams(teams, results, rules, seeds);
  const complete = total > 0 && results.length >= total;
  let source: PoolStanding['source'] = 'computed';
  let disagreement: string | undefined;
  const computedOrder = ranking.rows.map((r) => r.team);
  let order = computedOrder;
  if (complete && useSheet) {
    const sheet = pool.sheetTable?.filter((r) => r.rank !== undefined && teams.includes(r.team));
    if (sheet && sheet.length === teams.length && new Set(sheet.map((r) => r.rank)).size === sheet.length) {
      const sheetOrder = [...sheet].sort((a, b) => a.rank! - b.rank!).map((r) => r.team);
      if (sheetOrder.join('|') !== computedOrder.join('|')) disagreement = `Pool ${pool.name}: sheet order ${sheetOrder.join(', ')}; computed ${computedOrder.join(', ')}`;
      order = sheetOrder;
      source = 'sheet';
    }
    if (pool.tdOrder?.length) {
      const fixed = new Map(pool.tdOrder.map((x) => [x.rank, x.team]));
      const rest = order.filter((t) => ![...fixed.values()].includes(t));
      const next: string[] = [];
      for (let i = 1; i <= order.length; i++) next.push(fixed.get(i) ?? rest.shift()!);
      if (next.every(Boolean)) {
        order = next;
        source = 'td';
      }
    }
  }
  if (order !== computedOrder) {
    const byTeam = new Map(ranking.rows.map((r) => [r.team, r]));
    ranking.rows = order.map((t, i) => ({ ...byTeam.get(t)!, rank: i + 1, tiedWith: source === 'computed' ? byTeam.get(t)!.tiedWith : [] }));
    if (source !== 'computed') ranking.tied = [];
  }
  return { ...ranking, pool, complete, played: results.length, total, source, disagreement, results };
}
