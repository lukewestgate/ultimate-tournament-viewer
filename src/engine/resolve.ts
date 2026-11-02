import type { Format, Game, Pool, Source, SourceEntry, SourceStatus, Tournament } from '../model/types';
import { divKey } from '../model/types';
import { gameKey, poolSlotKey, positionOf } from '../format/infer';
import { splitSlot } from '../format/labels';
import { poolStanding, type PoolStanding } from './standings';

/** A game result as the engine uses it: real, hypothetical (what-if) or simulated. */
export interface EffResult {
  sa?: number;
  sb?: number;
  outcome: 'A' | 'B' | 'D';
  forfeit?: [boolean, boolean];
  hypothetical?: boolean;
  simulated?: boolean;
}

export interface SideRes {
  /** Team to show (the sheet's name, or the engine's when the sheet has none). */
  team?: string;
  /** Teams that could still occupy this slot. */
  possible: string[];
  /** "1E", "Winner 8v9", "Seed 16", or the sheet's placeholder text. */
  label?: string;
  source?: Source;
  fromSheet: boolean;
  /** Depends on a hypothetical result. */
  hypothetical?: boolean;
  /** The sheet named a team the format didn't predict. */
  doubtful?: boolean;
}

export interface ResolveInput {
  t: Tournament;
  format: Format;
  results: Map<string, EffResult>;
  /** Replay: hide sheet names that depend on results not known yet. */
  hideUnknownNames?: boolean;
  /** Tournament over: conditional games with no result fall back. */
  ended?: boolean;
  /** Possible finishing places per pool (team -> places), from the finishes module. */
  finishes?: Map<string, Map<string, Set<number>>>;
}

export interface Resolution {
  sides: Map<string, [SideRes, SideRes]>;
  standings: Map<string, PoolStanding>;
  places: Map<string, { place: number; team?: string; possible: string[]; label?: string }[]>;
  checks: Map<string, SourceStatus>;
  mismatches: string[];
  /** "A#1" -> where 1st in pool A goes (game labels or pools). */
  leads: Map<string, Set<string>>;
}

interface Val {
  team?: string;
  possible: string[];
  label?: string;
  hyp?: boolean;
}

const uniq = (xs: string[]) => [...new Set(xs)];
const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

export function resolve(input: ResolveInput): Resolution {
  const { t, format, results } = input;
  const byId = new Map(t.games.map((g) => [g.id, g]));
  const poolByName = new Map(t.pools.map((p) => [p.name, p]));
  const sides = new Map<string, [SideRes, SideRes]>();
  const standings = new Map<string, PoolStanding>();
  const checks = new Map<string, SourceStatus>();
  const mismatches: string[] = [];
  const seedTeam = new Map<string, string>();
  const teamSeed = new Map<string, number>();
  for (const s of t.seeding) {
    const k = `${s.division ?? ''}|${s.seed}`;
    if (!seedTeam.has(k)) seedTeam.set(k, s.team);
    const tk = `${s.division ?? ''}|${s.team}`;
    if (!teamSeed.has(tk)) teamSeed.set(tk, s.seed);
  }
  const fmt = (d: string | undefined) => format.divisions[divKey(d)];
  const poolGames = new Map<string, Game[]>();
  for (const g of t.games) if (g.pool) poolGames.set(g.pool, [...(poolGames.get(g.pool) ?? []), g]);
  const poolEnd = (p: Pool) => Math.max(...(poolGames.get(p.name) ?? []).map((g) => g.start), -Infinity);
  const poolStart = (p: Pool) => Math.min(...(poolGames.get(p.name) ?? []).map((g) => g.start), Infinity);

  const visiting = new Set<string>();
  const consumers: string[] = [];
  const leads = new Map<string, Set<string>>();

  // ---------- pool slots and standings
  const slotSeed = (p: Pool, i: number): number | undefined => {
    const s = p.slots[i];
    if (s.seed !== undefined) return s.seed;
    if (s.team) return teamSeed.get(`${p.division ?? ''}|${s.team}`);
    return undefined;
  };

  const poolSlotVal = (p: Pool, slot: string): Val => {
    const key = poolSlotKey(p.name, slot);
    const s = p.slots.find((x) => x.slot === slot);
    const entry = fmt(p.division)?.sources[key];
    if (p.stage === 'powerPool' && entry) {
      consumers.push(`Pool ${p.name}`);
      const v = evalSource(entry.source, p.division, poolStart(p), key);
      consumers.pop();
      return v;
    }
    return { team: s?.team, possible: s?.team ? [s.team] : [], label: slot };
  };

  const standingOf = (p: Pool): PoolStanding => {
    const hit = standings.get(p.name);
    if (hit) return hit;
    if (visiting.has(`pool:${p.name}`)) return poolStanding(p, [], t.rules);
    visiting.add(`pool:${p.name}`);
    const own = (poolGames.get(p.name) ?? []).map((g) => effectiveGame(g));
    // Carried results come from earlier first-stage games between the same teams.
    const earlier = p.carried?.length ? t.games.filter((g) => g.stage === 'pool' && g.division === p.division).map((g) => effectiveGame(g)) : [];
    const games = [...own, ...earlier];
    const slots = p.slots.map((s) => ({ ...s, team: poolSlotVal(p, s.slot).team ?? s.team }));
    const seeds: Record<string, number> = {};
    for (const s of t.seeding) if (s.division === p.division && seeds[s.team] === undefined) seeds[s.team] = s.seed;
    const st = poolStanding({ ...p, slots }, games, t.rules, seeds, !anyHypothetical(games));
    visiting.delete(`pool:${p.name}`);
    standings.set(p.name, st);
    if (st.disagreement) mismatches.push(st.disagreement);
    return st;
  };
  const anyHypothetical = (gs: Game[]) => gs.some((g) => results.get(g.id)?.hypothetical);

  /** A copy of the game with resolved teams and effective scores. */
  const effectiveGame = (g: Game): Game => {
    const [a, b] = sidesOf(g);
    const r = results.get(g.id);
    const out: Game = { ...g, teams: [a.team, b.team], scores: [undefined, undefined], marks: undefined };
    if (r) {
      if (r.sa !== undefined && r.sb !== undefined) out.scores = [r.sa, r.sb];
      else out.marks = r.outcome === 'A' ? ['W', 'L'] : r.outcome === 'B' ? ['L', 'W'] : ['D', 'D'];
      out.forfeit = r.forfeit;
    }
    return out;
  };

  // ---------- sources
  const holderOfSeed = (division: string | undefined, seed: number, before: number): Val => {
    // The latest pool stage (ending before `before`) whose seeds include `seed` (R2/R3).
    const cands = t.pools
      .filter((p) => p.division === division && poolEnd(p) < before && poolEnd(p) > -Infinity)
      .sort((a, b) => poolEnd(b) - poolEnd(a));
    for (const p of cands) {
      let place: number | undefined;
      if (p.finishToSeed) {
        const hit = Object.entries(p.finishToSeed).find(([, s]) => s === seed);
        if (hit) place = Number(hit[0]);
      } else {
        const seeds = p.slots.map((_, i) => slotSeed(p, i)).filter((s): s is number => s !== undefined);
        if (seeds.length === p.slots.length && seeds.includes(seed)) place = [...seeds].sort((a, b) => a - b).indexOf(seed) + 1;
      }
      if (place !== undefined) return poolFinishVal(p, place);
    }
    const team = seedTeam.get(`${division ?? ''}|${seed}`);
    return { team, possible: team ? [team] : [], label: `Seed ${seed}` };
  };

  const poolFinishVal = (p: Pool, place: number): Val => {
    const top = consumers[consumers.length - 1];
    if (top) {
      const k = `${p.name}#${place}`;
      const set = leads.get(k) ?? new Set<string>();
      set.add(top);
      leads.set(k, set);
    }
    const st = standingOf(p);
    const label = `${place}${p.name}`;
    const hyp = anyHypothetical(poolGames.get(p.name) ?? []);
    if (st.complete && st.rows[place - 1]) {
      const row = st.rows[place - 1];
      if (!row.tiedWith.length) return { team: row.team, possible: [row.team], label, hyp };
      return { possible: uniq([row.team, ...row.tiedWith]), label, hyp };
    }
    const fin = input.finishes?.get(p.name);
    const teams = st.rows.map((r) => r.team);
    const possible = fin ? teams.filter((tm) => fin.get(tm)?.has(place)) : teams;
    if (possible.length === 1) return { team: possible[0], possible, label, hyp };
    return { possible: possible.length ? possible : teams, label, hyp };
  };

  const evalSource = (s: Source, division: string | undefined, at: number, key: string): Val => {
    if (visiting.has(key)) return { possible: [] };
    visiting.add(key);
    let v: Val;
    switch (s.kind) {
      case 'team':
        v = { team: s.team, possible: [s.team], label: s.team };
        break;
      case 'seed':
        v = holderOfSeed(division, s.seed, at);
        break;
      case 'poolFinish': {
        const p = poolByName.get(s.pool);
        v = p ? poolFinishVal(p, s.place) : { possible: [], label: `${s.place}${s.pool}` };
        break;
      }
      case 'rankedFinish':
        v = rankedFinishVal(s.pools, s.place, s.rank);
        break;
      case 'gameResult': {
        const g = byId.get(s.game);
        v = g ? gameResultVal(g, s.take) : { possible: [] };
        break;
      }
      default:
        v = { possible: [], label: s.label };
    }
    visiting.delete(key);
    return v;
  };

  const rankedFinishVal = (pools: string[], place: number, rank: number): Val => {
    const label = `${ord(rank)} best ${ord(place)}`;
    const ps = pools.map((n) => poolByName.get(n)).filter((p): p is Pool => Boolean(p));
    const sts = ps.map(standingOf);
    const rows = sts.map((s) => s.rows[place - 1]).filter(Boolean);
    if (sts.every((s) => s.complete) && rows.length) {
      const sorted = [...rows].sort((a, b) => b.pts - a.pts || b.diff - a.diff || b.pf - a.pf);
      const pick = sorted[rank - 1];
      return pick ? { team: pick.team, possible: [pick.team], label } : { possible: [], label };
    }
    return { possible: uniq(sts.flatMap((s) => s.rows.map((r) => r.team))), label };
  };

  const gameLabel = (g: Game) => g.code?.replace(/[[\]]/g, '') ?? `${g.day.slice(0, 3)} ${g.time} P${g.pitch.label}`;

  const gameResultVal = (g: Game, take: 'winner' | 'loser'): Val => {
    const [a, b] = sidesOf(g);
    const r = results.get(g.id);
    const label = `${take === 'winner' ? 'Winner' : 'Loser'} ${gameLabel(g)}`;
    const hyp = Boolean(r?.hypothetical || a.hypothetical || b.hypothetical);
    if (r && a.team && b.team && r.outcome !== 'D') {
      const winner = r.outcome === 'A' ? a.team : b.team;
      const loser = r.outcome === 'A' ? b.team : a.team;
      const team = take === 'winner' ? winner : loser;
      return { team, possible: [team], label, hyp };
    }
    // Conditional game never played: fall back to the earlier holder.
    if (!r && g.conditional && input.ended) {
      const p0 = positionOf(g, 0, t.pools);
      const p1 = positionOf(g, 1, t.pools);
      const hiSide = p0 && p1 && p1.n < p0.n ? b : a;
      const loSide = hiSide === a ? b : a;
      const s = take === 'winner' ? hiSide : loSide;
      return { team: s.team, possible: s.possible, label, hyp };
    }
    const possible = uniq([...(a.team ? [a.team] : a.possible), ...(b.team ? [b.team] : b.possible)]);
    return { possible, label, hyp };
  };

  // ---------- sides
  /** Have all games of the division that started before `at` got a result? */
  const allEarlierDone = (division: string | undefined, at: number) =>
    t.games.every((g) => g.division !== division || g.start >= at || g.isBye || g.unscheduled || results.has(g.id));

  const sideOf = (g: Game, i: 0 | 1): SideRes => {
    const sheet = g.teams[i];
    const sheetLabel = g.labels?.[i];
    let key: string | undefined;
    let entry: SourceEntry | undefined;
    if (g.stage === 'powerPool' && g.pool) {
      const p = poolByName.get(g.pool);
      const slot = g.slots[i];
      if (p && slot) {
        key = poolSlotKey(p.name, slot);
        entry = fmt(g.division)?.sources[key];
      }
    } else if (g.stage === 'placement') {
      key = gameKey(g.id, i);
      entry = fmt(g.division)?.sources[key];
    }
    if (!entry || !key) {
      // First-stage pools, or no known source (Basic): the sheet's name.
      const hidden = input.hideUnknownNames && g.stage !== 'pool' && !allEarlierDone(g.division, g.start);
      const team = hidden ? undefined : sheet;
      return { team, possible: team ? [team] : [], label: sheetLabel ?? (hidden ? 'To be decided' : g.slots[i]), fromSheet: Boolean(team) };
    }
    consumers.push(g.stage === 'powerPool' && g.pool ? `Pool ${g.pool}` : gameLabel(g));
    const v = evalSource(entry.source, g.division, g.start, key);
    consumers.pop();
    const projected = v.team;
    let team = projected;
    let fromSheet = false;
    let doubtful = false;
    if (sheet) {
      const hidden = input.hideUnknownNames && !projected;
      if (!hidden) {
        if (projected && projected !== sheet) {
          // The sheet wins; the source is doubtful.
          doubtful = true;
          checks.set(key, 'doubtful');
          mismatches.push(`${gameLabel(g)}: the sheet has ${sheet} where the format predicted ${projected}.`);
        } else if (projected === sheet) checks.set(key, 'confirmed');
        team = sheet;
        fromSheet = true;
      }
    }
    const possible = team ? [team] : v.possible;
    return { team, possible, label: v.label ?? sheetLabel, source: entry.source, fromSheet, hypothetical: v.hyp, doubtful };
  };

  const sidesOf = (g: Game): [SideRes, SideRes] => {
    const hit = sides.get(g.id);
    if (hit) return hit;
    const key = `sides:${g.id}`;
    if (visiting.has(key)) return [{ possible: [], fromSheet: false }, { possible: [], fromSheet: false }];
    visiting.add(key);
    const r: [SideRes, SideRes] = [sideOf(g, 0), sideOf(g, 1)];
    visiting.delete(key);
    sides.set(g.id, r);
    return r;
  };

  for (const g of t.games) sidesOf(g);
  for (const p of t.pools) standingOf(p);

  // ---------- final places (R5)
  const places = new Map<string, { place: number; team?: string; possible: string[]; label?: string }[]>();
  for (const [dk, f] of Object.entries(format.divisions)) {
    const list: { place: number; team?: string; possible: string[]; label?: string }[] = [];
    for (const [n, e] of Object.entries(f.places ?? {})) {
      const v = evalSource(e.source, dk || undefined, Infinity, `place:${dk}:${n}`);
      list.push({ place: Number(n), team: v.team, possible: v.possible, label: v.label });
    }
    list.sort((a, b) => a.place - b.place);
    if (list.length) places.set(dk, list);
  }
  return { sides, standings, places, checks, mismatches: uniq(mismatches), leads };
}

/** Position number of a slot code ("8" -> 8, "W3" -> 3). */
export const slotNumber = (s: string | undefined) => splitSlot(s)?.n;
