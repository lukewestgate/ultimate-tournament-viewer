import type { EngineLevel, Format, Game, Tournament } from '../model/types';
import { divKey } from '../model/types';
import { engineLevel, gameKey } from '../format/infer';
import { resolve, type EffResult, type Resolution, type SideRes } from './resolve';
import { effectiveResults, type Scenario } from './scenario';
import { gameStatus, nextOnPitch, type GameStatus } from './status';
import { possibleFinishes, type Finishes, type OpenGame } from './finishes';
import { poolResults, poolTeams, type PoolStanding, type Result } from './standings';
import { simulateResults } from './simulate';

export interface GameView {
  g: Game;
  sides: [SideRes, SideRes];
  result?: EffResult;
  status: GameStatus;
  hypothetical: boolean;
  simulated: boolean;
}

export interface ViewOptions {
  /** Real clock (ms). */
  now: number;
  /** Replay time: the tournament as it was then. */
  at?: number;
  scenario?: Scenario;
  /** Diagnostics: generate scores for games after the (replay) time. */
  simulate?: boolean;
  levelOverride?: Record<string, EngineLevel>;
}

export interface View {
  t: Tournament;
  format: Format;
  /** The clock the view runs on (replay time or now). */
  clock: number;
  replay: boolean;
  games: GameView[];
  byId: Map<string, GameView>;
  standings: Map<string, PoolStanding>;
  finishes: Map<string, Finishes>;
  places: Resolution['places'];
  leads: Resolution['leads'];
  levels: Record<string, EngineLevel>;
  mismatches: string[];
  checks: Resolution['checks'];
  /** Hypothetical results dropped because real ones arrived. */
  dropped: string[];
  ended: boolean;
  started: boolean;
}

/**
 * The engine as one pure function: (tournament, format, scenario, time) -> resolved view.
 * Replay and what-if are just different inputs.
 */
export function buildView(t: Tournament, format: Format, opts: ViewOptions): View {
  const replay = opts.at !== undefined;
  const clock = opts.at ?? opts.now;
  const scheduled = t.games.filter((g) => !g.unscheduled);
  const lastEnd = Math.max(...scheduled.map((g) => g.end), 0);
  const firstStart = Math.min(...scheduled.map((g) => g.start), Infinity);
  const ended = clock > lastEnd + 30 * 60000;
  const seedOf = (team: string | undefined) => (team ? t.seeding.find((s) => s.team === team)?.seed : undefined);
  const simulated = opts.simulate ? simulateResults(t, clock, seedOf) : undefined;
  const { results, dropped } = effectiveResults(t, { at: opts.at, scenario: opts.scenario, simulated });

  // First pass without finishes, to know pool teams; then finishes; then the final pass.
  const base = resolve({ t, format, results, hideUnknownNames: replay, ended });
  const finishes = new Map<string, Finishes>();
  const finishPlaces = new Map<string, Map<string, Set<number>>>();
  for (const p of t.pools) {
    const st = base.standings.get(p.name);
    if (!st || st.complete) continue;
    const ctx = poolContext(t, base, p.name, results);
    if (!ctx || !ctx.teams.length) continue;
    const f = possibleFinishes(ctx.teams, ctx.played, ctx.open, t.rules, ctx.seeds);
    finishes.set(p.name, f);
    finishPlaces.set(p.name, f.places);
  }
  const res = finishes.size ? resolve({ t, format, results, hideUnknownNames: replay, ended, finishes: finishPlaces }) : base;

  const next = nextOnPitch(t.games);
  const games: GameView[] = t.games.map((g) => {
    const sides = res.sides.get(g.id)!;
    const result = results.get(g.id);
    const status = gameStatus(g, clock, Boolean(result), next.get(g.id), ended, Boolean(sides[0].team && sides[1].team));
    return {
      g,
      sides,
      result,
      status,
      hypothetical: Boolean(result?.hypothetical || sides[0].hypothetical || sides[1].hypothetical),
      simulated: Boolean(result?.simulated),
    };
  });
  const levels: Record<string, EngineLevel> = {};
  for (const d of t.divisions.length ? t.divisions.map((x) => x.name) : [undefined]) {
    levels[divKey(d)] = engineLevel(t, format, d, opts.levelOverride?.[divKey(d)]);
  }
  return {
    t,
    format,
    clock,
    replay,
    games,
    byId: new Map(games.map((v) => [v.g.id, v])),
    standings: res.standings,
    finishes,
    places: res.places,
    leads: res.leads,
    levels,
    mismatches: res.mismatches,
    checks: res.checks,
    dropped,
    ended,
    started: clock >= firstStart,
  };
}

export interface PoolContext {
  teams: string[];
  played: Result[];
  open: OpenGame[];
  seeds: Record<string, number>;
}

/** Teams, played results and open games of a pool, with resolved teams (for finishes and "what do we need?"). */
export function poolContext(t: Tournament, res: Pick<Resolution, 'sides' | 'standings'>, poolName: string, results: Map<string, EffResult>): PoolContext | undefined {
  const p = t.pools.find((x) => x.name === poolName);
  if (!p) return undefined;
  const st = res.standings.get(poolName);
  const games = t.games.filter((g) => g.pool === poolName && g.division === p.division && !g.isBye);
  const resolved = games.map((g) => {
    const s = res.sides.get(g.id);
    return { ...g, teams: [s?.[0].team ?? g.teams[0], s?.[1].team ?? g.teams[1]] as Game['teams'] };
  });
  const teams = st ? st.rows.map((r) => r.team) : poolTeams(p, resolved);
  const played: Result[] = st ? [...st.results] : poolResults(p, resolved).results;
  const open: OpenGame[] = [];
  for (const g of resolved) {
    if (results.has(g.id)) continue;
    const [a, b] = g.teams;
    if (a && b) open.push({ id: g.id, a, b });
  }
  const seeds: Record<string, number> = {};
  for (const s of t.seeding) if (s.division === p.division && seeds[s.team] === undefined) seeds[s.team] = s.seed;
  return { teams, played, open, seeds };
}

// ---------------------------------------------------------------- team helpers

export const sameTeam = (v: GameView, i: 0 | 1, team: string, division?: string) => v.sides[i].team === team && (division === undefined || v.g.division === division);

/** Games a team is (or will be) in, in time order. */
export function teamGames(view: View, team: string, division?: string): GameView[] {
  return view.games.filter((v) => !v.g.unscheduled && (sameTeam(v, 0, team, division) || sameTeam(v, 1, team, division)));
}

/** Games a team might play depending on results (it's a possible occupant of an unresolved side). */
export function possibleGames(view: View, team: string, division?: string): GameView[] {
  return view.games.filter(
    (v) =>
      !v.g.unscheduled &&
      (division === undefined || v.g.division === division) &&
      v.status !== 'final' &&
      ([0, 1] as const).some((i) => !v.sides[i].team && v.sides[i].possible.includes(team)),
  );
}

export interface PathNode {
  game: GameView;
  side: 0 | 1;
  opponents: string[];
  win?: PathNode | { place: number };
  lose?: PathNode | { place: number };
}

/** Win/lose tree from a team's next placement game (spec §9.8), to `depth`. */
export function pathsAhead(view: View, team: string, division: string | undefined, depth = 3): PathNode | undefined {
  const f = view.format.divisions[divKey(division)];
  if (!f) return undefined;
  const next = view.games.find(
    (v) => v.g.stage === 'placement' && v.g.division === division && v.status !== 'final' && v.status !== 'notPlayed' && (sameTeam(v, 0, team) || sameTeam(v, 1, team)),
  );
  if (!next) return undefined;
  // where does the winner / loser of a game go?
  const goes = new Map<string, { gameId?: string; side?: 0 | 1; place?: number }>();
  for (const [key, e] of Object.entries(f.sources)) {
    if (e.source.kind !== 'gameResult') continue;
    const [kind, id, side] = key.split(':');
    if (kind === 'game') goes.set(`${e.source.game}:${e.source.take}`, { gameId: id, side: (Number(side) - 1) as 0 | 1 });
  }
  for (const [n, e] of Object.entries(f.places ?? {})) {
    if (e.source.kind === 'gameResult') {
      const k = `${e.source.game}:${e.source.take}`;
      if (!goes.has(k)) goes.set(k, { place: Number(n) });
    }
  }
  const build = (v: GameView, side: 0 | 1, d: number): PathNode => {
    const other = v.sides[side === 0 ? 1 : 0];
    const node: PathNode = { game: v, side, opponents: other.team ? [other.team] : other.possible };
    if (d <= 1) return node;
    for (const take of ['winner', 'loser'] as const) {
      const to = goes.get(`${v.g.id}:${take}`);
      if (!to) continue;
      const out = to.gameId ? build(view.byId.get(to.gameId)!, to.side!, d - 1) : { place: to.place! };
      if (take === 'winner') node.win = out;
      else node.lose = out;
    }
    return node;
  };
  const side: 0 | 1 = sameTeam(next, 0, team) ? 0 : 1;
  return build(next, side, depth);
}

/** Pretty place relative to the division's first position (101 -> 1st). */
export function relativePlace(view: View, division: string | undefined, place: number): number {
  const list = view.places.get(divKey(division));
  const min = list?.length ? Math.min(...list.map((p) => p.place)) : 1;
  return place - min + 1;
}

export { gameKey };
