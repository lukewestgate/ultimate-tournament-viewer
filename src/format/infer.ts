import type { DivisionFormat, EngineLevel, Format, Game, Pool, Source, SourceEntry, SourceOrigin, Tournament } from '../model/types';
import { divKey } from '../model/types';
import { parseSlotLabel, splitSlot } from './labels';

export const gameKey = (gameId: string, side: 0 | 1) => `game:${gameId}:${side + 1}`;
export const poolSlotKey = (pool: string, slot: string) => `pool:${pool}:${slot}`;

/** A placement position: namespace (division prefix like "W", "Ex", or "") and number. */
export interface Position {
  ns: string;
  n: number;
}

/**
 * Position for one side of a game from its slot code, or undefined when the slot is a pool slot or isn't a position.
 * "8" -> {ns:"", n:8}; "W3" (with "6") -> {ns:"W", n:3}; "6" in "W3v6" -> {ns:"W", n:6}; "A1" in pool A -> undefined.
 */
export function positionOf(g: Game, side: 0 | 1, pools: Pool[]): Position | undefined {
  const a = splitSlot(g.slots[0]);
  const b = splitSlot(g.slots[1]);
  const me = side === 0 ? a : b;
  if (!me || !a || !b) return undefined;
  const isPoolSlot = (s: { prefix: string; n: number }) => {
    const p = pools.find((x) => x.name === s.prefix && (!g.division || !x.division || x.division === g.division));
    return Boolean(p && s.n <= Math.max(p.slots.length, 2));
  };
  if ((a.prefix && isPoolSlot(a)) || (b.prefix && isPoolSlot(b))) return undefined;
  const ns = a.prefix || b.prefix;
  if (a.prefix && b.prefix && a.prefix !== b.prefix) return undefined;
  return { ns, n: me.n };
}

export const posKey = (division: string | undefined, p: Position) => `${division ?? ''}|${p.ns}|${p.n}`;

/** Sorted placement games of a division that use positions on both sides. */
export function positionGames(t: Tournament, division: string | undefined): Game[] {
  return t.games.filter((g) => g.division === division && g.stage === 'placement' && !g.isBye && positionOf(g, 0, t.pools) && positionOf(g, 1, t.pools));
}

/** The last game at position n that starts before `at`, and which of its results holds n afterwards (R4). */
function lastAtPosition(posGames: Game[], pools: Pool[], n: number, at: number): { game: Game; take: 'winner' | 'loser' } | undefined {
  for (const g of posGames.filter((x) => x.start < at).reverse()) {
    const a = positionOf(g, 0, pools)!.n;
    const b = positionOf(g, 1, pools)!.n;
    if (a === n || b === n) return { game: g, take: n === Math.min(a, b) ? 'winner' : 'loser' };
  }
  return undefined;
}

/**
 * [finish, place] pairs of a pool that decides a run of places: the Nth finisher takes the Nth seed (R2/R3).
 * Seeds with a gap (9, 10, 17) mean a pool of teams from different groups, whose finishing order isn't the final order.
 */
function poolPlaces(p: Pool): [number, number][] {
  const pairs: [number, number][] = p.finishToSeed
    ? Object.entries(p.finishToSeed).map(([finish, seed]) => [Number(finish), seed])
    : p.slots
        .map((s) => s.seed)
        .filter((s): s is number => s !== undefined)
        .sort((a, b) => a - b)
        .map((seed, i) => [i + 1, seed]);
  if (pairs.length !== p.slots.length) return [];
  const seeds = pairs.map(([, seed]) => seed);
  return Math.max(...seeds) - Math.min(...seeds) === seeds.length - 1 ? pairs : [];
}

const entry = (source: Source, origin: SourceOrigin): SourceEntry => ({ source, origin, status: 'unverified' });

/** Find a game a slot label refers to ("8v9", "QF1", game number "12"). */
function findGameRef(t: Tournament, g: Game, ref: string): Game | undefined {
  const r = ref.replace(/[[\]\s]/g, '').toLowerCase();
  const earlier = t.games.filter((x) => x.start < g.start && x.division === g.division);
  return (
    earlier.find((x) => x.code && x.code.replace(/[[\]\s]/g, '').toLowerCase() === r) ??
    earlier.find((x) => (x.labels ?? []).some(() => false)) ??
    (/^\d+$/.test(r) ? earlier.find((x) => x.ref.endsWith(`!${Number(r) + 1}`)) : undefined)
  );
}

function sourceFromLabel(t: Tournament, g: Game, label: string): Source | undefined {
  const l = parseSlotLabel(label, true);
  if (!l) return undefined;
  switch (l.kind) {
    case 'game': {
      const ref = findGameRef(t, g, l.ref);
      return ref ? { kind: 'gameResult', game: ref.id, take: l.take } : { kind: 'unknown', label };
    }
    case 'poolFinish':
      return t.pools.some((p) => p.name === l.pool) ? { kind: 'poolFinish', pool: l.pool, place: l.place } : undefined;
    case 'seed':
      return { kind: 'seed', seed: l.seed };
    case 'ranked': {
      const pools = t.pools.filter((p) => p.division === g.division && p.stage === 'pool').map((p) => p.name);
      return { kind: 'rankedFinish', pools, place: l.place, rank: l.rank };
    }
    case 'unknown':
      return { kind: 'unknown', label };
    default:
      return undefined;
  }
}

/**
 * Fill in a format, layer by layer (spec §6.7). Each layer only fills slots still unknown; `existing` user edits always win.
 */
export function inferFormat(t: Tournament, existing?: Format, opts: { template?: 'uku' } = {}): Format {
  const out: Format = { divisions: {} };
  const divs = t.divisions.length ? t.divisions.map((d) => d.name) : [undefined];
  const conventionOrigin: SourceOrigin = opts.template === 'uku' ? 'template' : 'convention';
  for (const d of divs) {
    const dk = divKey(d);
    const prev = existing?.divisions[dk];
    const f: DivisionFormat = { sources: {}, carried: [], places: {}, qualification: prev?.qualification ?? qualificationFromInfo(t) };
    const set = (key: string, e: SourceEntry | undefined) => {
      if (!e) return;
      if (f.sources[key]) return;
      f.sources[key] = e;
    };
    // User (and AI) edits first.
    if (prev) for (const [k, e] of Object.entries(prev.sources)) if (e.origin === 'user' || e.origin === 'ai') f.sources[k] = e;

    // Power-pool slots: held by whoever holds the mapped seed after the earlier stage (R3), which is a crossover at that position if there was one.
    const posGames = positionGames(t, d);
    const powerPools = t.pools.filter((x) => x.division === d && x.stage === 'powerPool');
    const poolStarts = (p: Pool) => t.games.filter((g) => g.pool === p.name).map((g) => g.start);
    for (const p of powerPools) {
      const start = Math.min(...poolStarts(p));
      for (const s of p.slots) {
        if (s.seed === undefined) continue;
        const prior = lastAtPosition(posGames, t.pools, s.seed, start);
        set(poolSlotKey(p.name, s.slot), entry(prior ? { kind: 'gameResult', game: prior.game.id, take: prior.take } : { kind: 'seed', seed: s.seed }, conventionOrigin));
      }
      if (p.carried?.length) f.carried!.push({ pool: p.name, rule: 'earlierGameBetweenSameTeams' });
    }

    const games = t.games.filter((g) => g.division === d && g.stage === 'placement' && !g.isBye);
    // Layer 2-3: explicit labels in unresolved team cells.
    for (const g of games) {
      for (const side of [0, 1] as const) {
        const lbl = g.labels?.[side];
        if (lbl) set(gameKey(g.id, side), entry(sourceFromLabel(t, g, lbl) ?? { kind: 'unknown', label: lbl }, 'label'));
      }
    }
    // Layer 4: code conventions (R4): in XvY the winner takes X, the loser Y.
    const lastAt = new Map<string, { game: Game; take: 'winner' | 'loser' }>();
    for (const g of posGames) {
      const p0 = positionOf(g, 0, t.pools)!;
      const p1 = positionOf(g, 1, t.pools)!;
      for (const [side, p] of [
        [0, p0],
        [1, p1],
      ] as const) {
        const prior = lastAt.get(posKey(d, p));
        set(gameKey(g.id, side), entry(prior ? { kind: 'gameResult', game: prior.game.id, take: prior.take } : { kind: 'seed', seed: p.n }, conventionOrigin));
      }
      const [hi, lo] = p0.n <= p1.n ? [p0, p1] : [p1, p0];
      lastAt.set(posKey(d, hi), { game: g, take: 'winner' });
      lastAt.set(posKey(d, lo), { game: g, take: 'loser' });
    }
    // R5: final place N is whoever holds position N after its last game.
    for (const [k, v] of lastAt) {
      const n = Number(k.split('|')[2]);
      f.places![n] = entry({ kind: 'gameResult', game: v.game.id, take: v.take }, conventionOrigin);
    }
    // A power pool that ends a position's run decides that place, unless the finish feeds a later game.
    const lastStart = (p: Pool) => Math.max(...poolStarts(p));
    for (const p of [...powerPools].sort((a, b) => lastStart(a) - lastStart(b))) {
      for (const [finish, place] of poolPlaces(p)) {
        const feeds = Object.values(f.sources).some(({ source: s }) => s.kind === 'poolFinish' && s.pool === p.name && s.place === finish);
        const after = lastAtPosition(posGames, t.pools, place, Infinity);
        if (feeds || (after && after.game.start > lastStart(p))) continue;
        f.places![place] = entry({ kind: 'poolFinish', pool: p.name, place: finish }, conventionOrigin);
      }
    }
    out.divisions[dk] = f;
  }
  return out;
}

function qualificationFromInfo(t: Tournament): { label: string; from: number; to: number }[] | undefined {
  const sec = t.info.find((s) => /^qualification/i.test(s.title));
  if (!sec) return undefined;
  const out: { label: string; from: number; to: number }[] = [];
  let next = 1;
  for (const line of sec.lines) {
    const m = /^(.+?)\s*·\s*(\d+)$/.exec(line);
    if (!m) continue;
    const n = Number(m[2]);
    out.push({ label: m[1].trim(), from: next, to: next + n - 1 });
    next += n;
  }
  return out.length ? out : undefined;
}

/** Keys of every slot whose team isn't fixed from the start. */
export function futureSlotKeys(t: Tournament, division: string | undefined): string[] {
  const keys: string[] = [];
  for (const p of t.pools.filter((x) => x.division === division && x.stage === 'powerPool')) for (const s of p.slots) keys.push(poolSlotKey(p.name, s.slot));
  for (const g of t.games.filter((x) => x.division === division && x.stage === 'placement' && !x.isBye)) keys.push(gameKey(g.id, 0), gameKey(g.id, 1));
  return keys;
}

/** Full / Partial / Basic, from how many future slots have a known source (spec §8.1). */
export function engineLevel(t: Tournament, format: Format, division: string | undefined, override?: EngineLevel): EngineLevel {
  if (override) return override;
  const keys = futureSlotKeys(t, division);
  if (!keys.length) return 'full';
  const f = format.divisions[divKey(division)];
  if (!f) return 'basic';
  const known = keys.filter((k) => f.sources[k] && f.sources[k].source.kind !== 'unknown').length;
  if (known === 0) return 'basic';
  return known === keys.length ? 'full' : 'partial';
}
