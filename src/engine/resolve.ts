import type { Game, Outcome, PoolInfo, Tournament } from './types';

/** Hypothetical results picked by the user, keyed by game id. */
export type Scenario = Record<string, Outcome>;

/** Who occupies a slot: one team when certain, several when it depends on other results. */
export interface Side {
  teams: string[];
  /** Where the occupant comes from: "A1", "1E", "Winner 8v9", "Seed 16". */
  label: string;
  /** Depends on a hypothetical pick somewhere upstream. */
  hyp: boolean;
  /** Everything upstream has a real result, so the sheet's own names can be trusted. */
  settled: boolean;
}

export interface RGame {
  game: Game;
  lo: Side;
  hi: Side;
  outcome?: Outcome;
  /** Outcome comes from real scores (vs. a hypothetical pick). */
  real: boolean;
}

export interface StandingRow {
  slot: string;
  side: Side;
  team?: string;
  played: number;
  w: number;
  l: number;
  d: number;
  pts: number;
  pf: number;
  pa: number;
  /** Current rank (shared by tied teams). */
  rank?: number;
  tied: boolean;
}

export interface PoolResult {
  pool: PoolInfo;
  rows: StandingRow[];
  games: RGame[];
  carried: RGame[];
  complete: boolean;
  /** Teams that could still finish in each position (1-based). */
  possible: Record<number, string[]>;
  hyp: boolean;
}

export interface Resolved {
  games: RGame[];
  byId: Map<string, RGame>;
  pools: Map<string, PoolResult>;
  /** Final places (1-based) after every placement game. */
  places: Map<number, Side>;
  mismatches: string[];
}

export const WIN_PTS = 2;
export const DRAW_PTS = 1;

export function realOutcome(g: Game): Outcome | undefined {
  if (g.scoreLo === undefined || g.scoreHi === undefined) return undefined;
  if (g.scoreLo > g.scoreHi) return 'lo';
  if (g.scoreHi > g.scoreLo) return 'hi';
  return g.stage === 'placement' ? undefined : 'draw';
}

const certain = (team: string, label: string): Side => ({ teams: [team], label, hyp: false, settled: true });
const merge = (a: Side, b: Side, label: string, extra: Partial<Side> = {}): Side => ({
  teams: [...new Set([...a.teams, ...b.teams])].sort(),
  label,
  hyp: a.hyp || b.hyp,
  settled: false,
  ...extra,
});

export const sideTeam = (s: Side) => (s.teams.length === 1 ? s.teams[0] : undefined);

// ---------------------------------------------------------------- pool ranking

interface Result {
  a: string;
  b: string;
  outcome: Outcome; // relative to a
  sa?: number;
  sb?: number;
}

function points(team: string, results: Result[]) {
  let pts = 0;
  for (const r of results) {
    if (r.a === team) pts += r.outcome === 'lo' ? WIN_PTS : r.outcome === 'draw' ? DRAW_PTS : 0;
    else if (r.b === team) pts += r.outcome === 'hi' ? WIN_PTS : r.outcome === 'draw' ? DRAW_PTS : 0;
  }
  return pts;
}

function scoreKeys(team: string, results: Result[]) {
  let f = 0;
  let a = 0;
  for (const r of results) {
    if (r.a === team) {
      f += r.sa ?? 0;
      a += r.sb ?? 0;
    } else if (r.b === team) {
      f += r.sb ?? 0;
      a += r.sa ?? 0;
    }
  }
  return [f - a, f];
}

const scored = (r: Result) => r.sa !== undefined && r.sb !== undefined;

/**
 * UKU-style tie-break among `group` (all on equal points): head-to-head points, then
 * head-to-head point difference and points scored, then overall difference and scored.
 * Restarts with any smaller tied subgroup. Returns ordered groups; groups of size > 1
 * are still tied (e.g. hypothetical results without scores).
 */
function breakTie(group: string[], results: Result[]): string[][] {
  const h2h = results.filter((r) => group.includes(r.a) && group.includes(r.b));
  const involved = results.filter((r) => group.includes(r.a) || group.includes(r.b));
  const h2hScored = h2h.every(scored);
  const allScored = involved.every(scored);
  const keys = new Map(
    group.map((t) => {
      const k = [points(t, h2h)];
      if (h2hScored) k.push(...scoreKeys(t, h2h));
      if (h2hScored && allScored) k.push(...scoreKeys(t, involved));
      return [t, k];
    }),
  );
  const cmp = (x: string, y: string) => {
    const a = keys.get(x)!;
    const b = keys.get(y)!;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i];
    return 0;
  };
  const sorted = [...group].sort(cmp);
  const parts: string[][] = [];
  for (const t of sorted) {
    const last = parts[parts.length - 1];
    if (last && cmp(last[0], t) === 0) last.push(t);
    else parts.push([t]);
  }
  if (parts.length === 1) return [group.slice().sort()];
  return parts.flatMap((p) => (p.length > 1 ? breakTie(p, results) : [p]));
}

export function rankTeams(teams: string[], results: Result[]): string[][] {
  const byPts = new Map<number, string[]>();
  for (const t of teams) {
    const p = points(t, results);
    byPts.set(p, [...(byPts.get(p) ?? []), t]);
  }
  return [...byPts.entries()]
    .sort((a, b) => b[0] - a[0])
    .flatMap(([, g]) => (g.length > 1 ? breakTie(g, results) : [g]));
}

const MAX_ENUM = 8;

function possibleFinishes(teams: string[], known: Result[], open: { a: string; b: string }[]) {
  const possible: Record<number, Set<string>> = {};
  const add = (groups: string[][]) => {
    let pos = 1;
    for (const g of groups) {
      for (let k = 0; k < g.length; k++) for (const t of g) (possible[pos + k] ??= new Set()).add(t);
      pos += g.length;
    }
  };
  if (open.length > MAX_ENUM) {
    teams.forEach((_, k) => (possible[k + 1] = new Set(teams)));
  } else {
    const opts: Outcome[] = ['lo', 'hi', 'draw'];
    const total = 3 ** open.length;
    for (let n = 0; n < total; n++) {
      let x = n;
      const extra: Result[] = open.map((o) => {
        const outcome = opts[x % 3];
        x = Math.floor(x / 3);
        return { a: o.a, b: o.b, outcome };
      });
      add(rankTeams(teams, [...known, ...extra]));
    }
  }
  return Object.fromEntries(Object.entries(possible).map(([k, v]) => [Number(k), [...v].sort()]));
}

// ---------------------------------------------------------------- resolve

export function resolve(t: Tournament, scenario: Scenario = {}): Resolved {
  const mismatches: string[] = [];
  const byId = new Map<string, RGame>();
  const holder = new Map<number, Side>();
  for (const s of t.seeds) holder.set(s.seed, certain(s.team, `Seed ${s.seed}`));

  const outcomeFor = (g: Game): { outcome?: Outcome; real: boolean } => {
    const r = realOutcome(g);
    if (r) return { outcome: r, real: true };
    const pick = scenario[g.id];
    if (pick && !(pick === 'draw' && g.stage === 'placement')) return { outcome: pick, real: false };
    return { real: false };
  };

  /** Prefer the sheet's resolved name once everything upstream is real. */
  const withSheet = (side: Side, name: string | undefined, where: string): Side => {
    if (!name || !side.settled) return side;
    if (side.teams.length === 1 && side.teams[0] === name) return side;
    if (side.teams.length && !side.teams.includes(name)) mismatches.push(`${where}: sheet says ${name}, engine says ${side.teams.join(' / ')}`);
    return { ...side, teams: [name] };
  };

  const pools = new Map<string, PoolResult>();
  const allPoolGames = t.games.filter((g) => g.stage !== 'placement');

  for (const stage of [1, 2] as const) {
    const updates: [number, Side][] = [];
    for (const p of t.pools.filter((x) => x.stage === stage)) {
      const slotSide = new Map<string, Side>();
      for (const s of p.slots) {
        let side: Side = s.team
          ? certain(s.team, s.slot)
          : { ...(holder.get(s.seed) ?? { teams: [], hyp: false, settled: false, label: '' }) };
        const sheetName = p.sheetRows.find((r) => r.slot === s.slot)?.team;
        side = withSheet(side, sheetName, `Slot ${s.slot}`);
        slotSide.set(s.slot, side);
      }
      const games = t.games.filter((g) => g.pool === p.letter && g.stage !== 'placement');
      for (const g of games) {
        if (g.sheetLo && slotSide.has(g.lo)) slotSide.set(g.lo, withSheet(slotSide.get(g.lo)!, g.sheetLo, g.id));
        if (g.sheetHi && slotSide.has(g.hi)) slotSide.set(g.hi, withSheet(slotSide.get(g.hi)!, g.sheetHi, g.id));
      }
      const blank: Side = { teams: [], label: '?', hyp: false, settled: false };
      const rgames: RGame[] = games.map((g) => {
        const o = outcomeFor(g);
        const rg: RGame = { game: g, lo: slotSide.get(g.lo) ?? blank, hi: slotSide.get(g.hi) ?? blank, ...o };
        byId.set(g.id, rg);
        return rg;
      });

      // Carried results: the earlier game between the same two teams.
      const carried: RGame[] = p.carried.map((c) => {
        const lo = slotSide.get(c.lo) ?? blank;
        const hi = slotSide.get(c.hi) ?? blank;
        const a = sideTeam(lo);
        const b = sideTeam(hi);
        const prev = a && b ? allPoolGames.find((g) => g.pool !== p.letter && byId.get(g.id) && sameTeams(byId.get(g.id)!, a, b)) : undefined;
        const prevR = prev ? byId.get(prev.id)! : undefined;
        let outcome: Outcome | undefined;
        let scoreLo: number | undefined;
        let scoreHi: number | undefined;
        if (prevR?.outcome) {
          const flipped = sideTeam(prevR.lo) !== a;
          outcome = flipped ? flip(prevR.outcome) : prevR.outcome;
          scoreLo = flipped ? prevR.game.scoreHi : prevR.game.scoreLo;
          scoreHi = flipped ? prevR.game.scoreLo : prevR.game.scoreHi;
        }
        const fake: Game = {
          ...(prev ?? games[0] ?? t.games[0]),
          id: `${p.letter}:carried:${c.lo}v${c.hi}`,
          code: `${c.lo}v${c.hi}`,
          lo: c.lo,
          hi: c.hi,
          pool: p.letter,
          stage: 'powerPool',
          scoreLo,
          scoreHi,
          isGameToGo: false,
        };
        return { game: fake, lo, hi, outcome, real: !!prevR?.real };
      });

      const all = [...carried, ...rgames];
      const sides = p.slots.map((s) => slotSide.get(s.slot)!);
      const allCertain = sides.every((s) => s.teams.length === 1);
      const anyHyp = sides.some((s) => s.hyp) || all.some((g) => g.outcome && !g.real);
      const complete = all.every((g) => g.outcome);
      const settled = sides.every((s) => s.settled) && all.every((g) => g.real);

      const rows: StandingRow[] = p.slots.map((s) => {
        const side = slotSide.get(s.slot)!;
        return { slot: s.slot, side, team: sideTeam(side), played: 0, w: 0, l: 0, d: 0, pts: 0, pf: 0, pa: 0, tied: false };
      });
      let possible: Record<number, string[]> = {};

      if (allCertain) {
        const teams = rows.map((r) => r.team!);
        const known: Result[] = [];
        const open: { a: string; b: string }[] = [];
        for (const g of all) {
          const a = sideTeam(g.lo)!;
          const b = sideTeam(g.hi)!;
          if (g.outcome) known.push({ a, b, outcome: g.outcome, sa: g.game.scoreLo, sb: g.game.scoreHi });
          else open.push({ a, b });
        }
        for (const r of rows) {
          for (const k of known) {
            if (k.a !== r.team && k.b !== r.team) continue;
            const isA = k.a === r.team;
            r.played++;
            if (k.outcome === 'draw') r.d++;
            else if ((k.outcome === 'lo') === isA) r.w++;
            else r.l++;
            if (k.sa !== undefined && k.sb !== undefined) {
              r.pf += isA ? k.sa : k.sb;
              r.pa += isA ? k.sb : k.sa;
            }
          }
          r.pts = r.w * WIN_PTS + r.d * DRAW_PTS;
        }
        let order = rankTeams(teams, known);
        // Use the sheet's ranking for a finished, real pool when it is a clean permutation.
        if (complete && settled) {
          const sheet = p.sheetRows.filter((r) => r.team && r.rank);
          const ranks = sheet.map((r) => r.rank!).sort((a, b) => a - b);
          if (sheet.length === teams.length && ranks.every((r, i) => r === i + 1)) {
            const sheetOrder = [...sheet].sort((a, b) => a.rank! - b.rank!).map((r) => [r.team!]);
            if (sheetOrder.every(([n]) => teams.includes(n))) order = sheetOrder;
          }
        }
        let pos = 1;
        for (const grp of order) {
          for (const tm of grp) {
            const row = rows.find((r) => r.team === tm)!;
            row.rank = pos;
            row.tied = grp.length > 1;
          }
          pos += grp.length;
        }
        rows.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
        possible = complete
          ? Object.fromEntries(order.flatMap((g, i, arr) => {
              const start = arr.slice(0, i).reduce((n, x) => n + x.length, 0) + 1;
              return g.map((_, k) => [start + k, [...g].sort()]);
            }))
          : possibleFinishes(teams, known, open);
      } else {
        const union = [...new Set(sides.flatMap((s) => s.teams))].sort();
        p.slots.forEach((_, k) => (possible[k + 1] = union));
      }

      pools.set(p.letter, { pool: p, rows, games: rgames, carried, complete, possible, hyp: anyHyp });

      for (const [k, seed] of Object.entries(p.finishToSeed)) {
        const pos = Number(k);
        const teams = possible[pos] ?? [];
        updates.push([seed, { teams, label: `${pos}${p.letter}`, hyp: anyHyp, settled: settled && complete && teams.length === 1 }]);
      }
    }
    for (const [seed, side] of updates) holder.set(seed, side);
  }

  // Placement games: in XvY (X < Y) the winner takes position X and the loser Y.
  for (const g of t.games.filter((x) => x.stage === 'placement')) {
    const a = Number(g.lo);
    const b = Number(g.hi);
    const none: Side = { teams: [], label: `Seed ${a}`, hyp: false, settled: false };
    let lo = holder.get(a) ?? none;
    let hi = holder.get(b) ?? { ...none, label: `Seed ${b}` };
    lo = withSheet(lo, g.sheetLo, g.id);
    hi = withSheet(hi, g.sheetHi, g.id);
    const o = outcomeFor(g);
    const rg: RGame = { game: g, lo, hi, ...o };
    byId.set(g.id, rg);
    const name = g.code;
    const hyp = lo.hyp || hi.hyp || (!!o.outcome && !o.real);
    const settled = lo.settled && hi.settled && o.real;
    const [x, y] = a < b ? [a, b] : [b, a];
    if (o.outcome === 'lo' || o.outcome === 'hi') {
      const win = o.outcome === 'lo' ? lo : hi;
      const lose = o.outcome === 'lo' ? hi : lo;
      holder.set(x, { teams: win.teams, label: `Winner ${name}`, hyp, settled });
      holder.set(y, { teams: lose.teams, label: `Loser ${name}`, hyp, settled });
    } else {
      holder.set(x, merge(lo, hi, `Winner ${name}`, { hyp }));
      holder.set(y, merge(lo, hi, `Loser ${name}`, { hyp }));
    }
  }

  const games = t.games.map((g) => byId.get(g.id)!).filter(Boolean);
  return { games, byId, pools, places: holder, mismatches };
}

function sameTeams(rg: RGame, a: string, b: string) {
  const x = sideTeam(rg.lo);
  const y = sideTeam(rg.hi);
  return (x === a && y === b) || (x === b && y === a);
}

export const flip = (o: Outcome): Outcome => (o === 'lo' ? 'hi' : o === 'hi' ? 'lo' : 'draw');

/** Which side a team is on, if it is certainly playing. */
export function teamSide(rg: RGame, team: string): 'lo' | 'hi' | undefined {
  if (sideTeam(rg.lo) === team) return 'lo';
  if (sideTeam(rg.hi) === team) return 'hi';
  return undefined;
}

export function mayPlay(rg: RGame, team: string): boolean {
  return rg.lo.teams.includes(team) || rg.hi.teams.includes(team);
}
