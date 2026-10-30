import { BracketModel, gameBadges, ord, type QualBadge } from './bracket';
import { flip, resolve, sideTeam, teamSide, type RGame, type Resolved, type Scenario, type Side } from './resolve';
import type { Tournament } from './types';

export interface PathNode {
  kind: 'game';
  rg: RGame;
  name: string;
  opponent: Side;
  badges: QualBadge[];
  win?: PathNode | PathLeaf;
  lose?: PathNode | PathLeaf;
}

export interface PathLeaf {
  kind: 'leaf';
  text: string;
  badges: QualBadge[];
}

export interface PoolOutlook {
  kind: 'pool';
  pool: string;
  remaining: RGame[];
  now: number[];
  winAll: number[];
  loseAll: number[];
  dest: (pos: number) => string;
}

/** Positions (1-based) `team` could finish in `pool` under `r`. */
function finishes(r: Resolved, pool: string, team: string): number[] {
  const p = r.pools.get(pool);
  if (!p) return [];
  return Object.entries(p.possible)
    .filter(([, ts]) => ts.includes(team))
    .map(([k]) => Number(k))
    .sort((a, b) => a - b);
}

export function teamGames(r: Resolved, team: string) {
  return r.games.filter((rg) => teamSide(rg, team));
}

/** The team's next game without a result, if it is certainly playing in it. */
export function nextOpenGame(r: Resolved, team: string): RGame | undefined {
  return r.games.find((rg) => teamSide(rg, team) && !rg.outcome);
}

export function poolOutlook(t: Tournament, scenario: Scenario, team: string): PoolOutlook | undefined {
  const r = resolve(t, scenario);
  const next = nextOpenGame(r, team);
  if (!next || next.game.stage === 'placement' || !next.game.pool) return undefined;
  const pool = next.game.pool;
  const remaining = r.games.filter((rg) => rg.game.pool === pool && teamSide(rg, team) && !rg.outcome);
  const fixAll = (win: boolean): Scenario => {
    const s = { ...scenario };
    for (const rg of remaining) {
      const side = teamSide(rg, team)!;
      s[rg.game.id] = win ? side : flip(side);
    }
    return s;
  };
  const b = new BracketModel(t);
  const info = t.pools.find((p) => p.letter === pool)!;
  const dest = (pos: number) => {
    const seed = info.finishToSeed[pos];
    if (seed === undefined) return '';
    const nextPool = t.pools.find((p) => p.stage > info.stage && p.slots.some((s) => s.seed === seed));
    if (nextPool) return `Power pool ${nextPool.letter}`;
    const g = b.games.find((x) => b.pos(x).includes(seed));
    if (g) return `${b.name(g)} · ${g.day.slice(0, 3)} ${g.time}`;
    return `Seed ${seed}`;
  };
  return {
    kind: 'pool',
    pool,
    remaining,
    now: finishes(r, pool, team),
    winAll: finishes(resolve(t, fixAll(true)), pool, team),
    loseAll: finishes(resolve(t, fixAll(false)), pool, team),
    dest,
  };
}

export function placementPaths(t: Tournament, scenario: Scenario, team: string, depth = 3): PathNode | PathLeaf | undefined {
  const b = new BracketModel(t);
  const build = (s: Scenario, d: number): PathNode | PathLeaf => {
    const r = resolve(t, s);
    const rg = nextOpenGame(r, team);
    if (!rg || rg.game.stage !== 'placement') {
      for (const [p, side] of r.places) {
        if (sideTeam(side) === team && p <= b.maxPos) {
          return { kind: 'leaf', text: `Finish ${ord(p)}`, badges: placeBadgesFor(p, t, b) };
        }
      }
      return { kind: 'leaf', text: 'No more games', badges: [] };
    }
    const side = teamSide(rg, team)!;
    const node: PathNode = {
      kind: 'game',
      rg,
      name: b.name(rg.game),
      opponent: side === 'lo' ? rg.hi : rg.lo,
      badges: gameBadges(rg.game, t, b),
    };
    if (d > 1) {
      node.win = build({ ...s, [rg.game.id]: side }, d - 1);
      node.lose = build({ ...s, [rg.game.id]: flip(side) }, d - 1);
    }
    return node;
  };
  const r = resolve(t, scenario);
  const first = nextOpenGame(r, team);
  if (!first || first.game.stage !== 'placement') return undefined;
  return build(scenario, depth);
}

function placeBadgesFor(p: number, t: Tournament, b: BracketModel): QualBadge[] {
  const { div1, div2 } = t.header.qualification;
  const out: QualBadge[] = [];
  if (p <= div1) out.push('Q');
  else if (p <= div1 + div2) out.push('q');
  if (b.inGameToGo(p)) out.push('GTG');
  return out;
}
