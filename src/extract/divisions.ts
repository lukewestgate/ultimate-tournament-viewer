import { clean } from '../sheets/cells';
import type { Division, Game } from '../model/types';
import { splitSlot } from '../format/labels';
import { likelySame } from './names';

/**
 * Teams are identified per division: the same name can appear in two divisions (outdoor events),
 * so graph nodes are (name, division code) pairs.
 */
export const nodeKey = (name: string, code: string | undefined) => `${name}\u0001${code ?? ''}`;
const nodeName = (k: string) => k.split('\u0001')[0];

interface Input {
  games: Game[];
  /** Effective raw division code per game (same order as games). */
  codes: (string | undefined)[];
  seedRows: { seed: number; team: string; label?: string; code?: string }[];
  standingsLabels: string[];
  poolTabs: { pool: string; tab: string }[];
  names: Record<string, string>;
  /** Overrides: team ("div::name" for the copy read into that division) -> division. */
  teamDivisions?: Record<string, string>;
}

export interface DivisionResult {
  divisions: Division[];
  /** Division for a team as seen in a game with this effective code. */
  divisionOf: (name: string, code: string | undefined) => string | undefined;
  gameDivision: (g: Game, code: string | undefined) => string | undefined;
  /** All (name, division) teams. */
  teams: { name: string; division?: string }[];
}

/** Normalise a raw division cell. "#N/A" and blanks mean no division. */
export function rawDiv(s: string | undefined): string | undefined {
  const c = clean(s);
  if (!c || c.startsWith('#')) return undefined;
  return c;
}

/** "EXPERIENCED DIVISION" -> "Experienced"; "Womens Pool" -> "Womens"; "Beginners Results" -> "Beginners". */
export function divisionLabel(label: string): string {
  const s = clean(label)
    .replace(/\b(division|div|results?|final standings|standings|initial pools|pools?|seeding|seeds?|teams?|competition)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return s.replace(/\p{L}+/gu, (w) => (w.length >= 5 && w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w));
}

const edgeKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/** Bridges in an undirected multigraph (edges with multiplicity > 1 are never bridges). */
function bridges(adj: Map<string, Map<string, number>>): Set<string> {
  const out = new Set<string>();
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  let time = 0;
  for (const root of adj.keys()) {
    if (disc.has(root)) continue;
    const stack: { v: string; parent?: string; it: Iterator<[string, number]> }[] = [{ v: root, it: adj.get(root)!.entries() }];
    disc.set(root, time);
    low.set(root, time++);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const nx = top.it.next();
      if (!nx.done) {
        const [w, mult] = nx.value;
        if (w === top.parent && mult === 1) continue;
        if (!disc.has(w)) {
          disc.set(w, time);
          low.set(w, time++);
          stack.push({ v: w, parent: top.v, it: adj.get(w)!.entries() });
        } else low.set(top.v, Math.min(low.get(top.v)!, disc.get(w)!));
      } else {
        stack.pop();
        if (top.parent !== undefined) {
          low.set(top.parent, Math.min(low.get(top.parent)!, low.get(top.v)!));
          if (low.get(top.v)! > disc.get(top.parent)! && adj.get(top.parent)!.get(top.v) === 1) out.add(edgeKey(top.parent, top.v));
        }
      }
    }
  }
  return out;
}

function components(nodes: Iterable<string>, adj: Map<string, Map<string, number>>, skip: Set<string>): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const n of nodes) {
    if (seen.has(n)) continue;
    const comp: string[] = [];
    const stack = [n];
    seen.add(n);
    while (stack.length) {
      const v = stack.pop()!;
      comp.push(v);
      for (const w of adj.get(v)?.keys() ?? []) {
        if (seen.has(w) || skip.has(edgeKey(v, w))) continue;
        seen.add(w);
        stack.push(w);
      }
    }
    out.push(comp);
  }
  return out;
}

export function splitDivisions(input: Input): DivisionResult {
  const { games, codes, seedRows } = input;
  const adj = new Map<string, Map<string, number>>();
  const addNode = (k: string) => adj.has(k) || adj.set(k, new Map());
  const link = (a: string, b: string, mult = 1) => {
    if (a === b) return;
    addNode(a);
    addNode(b);
    adj.get(a)!.set(b, (adj.get(a)!.get(b) ?? 0) + mult);
    adj.get(b)!.set(a, (adj.get(b)!.get(a) ?? 0) + mult);
  };
  // Names appearing with each code (to resolve codeless games to a node).
  const codesOfName = new Map<string, Set<string>>();
  // A name seen once with a code but 3+ times with another: the odd one is a typo in the division column.
  const nameCodeCount = new Map<string, Map<string, number>>();
  games.forEach((g, i) => {
    for (const t of g.teams) if (t) {
      const m = nameCodeCount.get(t) ?? new Map<string, number>();
      m.set(codes[i] ?? '', (m.get(codes[i] ?? '') ?? 0) + 1);
      nameCodeCount.set(t, m);
    }
  });
  const fixCode = (name: string, code: string) => {
    const m = nameCodeCount.get(name);
    if (!m || (m.get(code) ?? 0) > 1) return code;
    const best = [...m.entries()].sort((x, y) => y[1] - x[1])[0];
    return best && best[0] !== code && best[1] >= 3 ? best[0] : code;
  };
  games.forEach((g, i) => {
    const code = codes[i] ?? '';
    for (const t of g.teams) if (t) {
      const c = fixCode(t, code);
      addNode(nodeKey(t, c));
      const s = codesOfName.get(t) ?? new Set<string>();
      s.add(c);
      codesOfName.set(t, s);
    }
  });
  /** Node for a name in a game with `code`; codeless games use the name's only coded node. */
  const resolve = (name: string, code: string | undefined): string => {
    const c = fixCode(name, code ?? '');
    if (adj.has(nodeKey(name, c))) return nodeKey(name, c);
    const cs = [...(codesOfName.get(name) ?? [])];
    if (cs.length === 1) return nodeKey(name, cs[0]);
    return nodeKey(name, c);
  };
  games.forEach((g, i) => {
    const [a, b] = g.teams;
    if (a && b && a !== b) link(resolve(a, codes[i]), resolve(b, codes[i]));
  });
  // Seeds: team of seed n in a list.
  const seedNode = new Map<number, string>();
  for (const s of seedRows) {
    const k = resolve(s.team, s.code);
    addNode(k);
    if (!seedNode.has(s.seed)) seedNode.set(s.seed, k);
  }
  // Placement games with plain-number slots link the teams holding those seeds (before results are in).
  games.forEach((g) => {
    const [x, y] = g.slots.map(splitSlot);
    if (!x || !y || x.prefix || y.prefix) return;
    const a = seedNode.get(x.n);
    const b = seedNode.get(y.n);
    if (a && b) link(a, b, 2);
  });
  // Pool slots in the same pool link (pools with no games played yet).
  const poolNodes = new Map<string, string[]>();
  games.forEach((g, i) => {
    if (!g.pool) return;
    for (const t of g.teams) if (t) {
      const arr = poolNodes.get(g.pool) ?? [];
      arr.push(resolve(t, codes[i]));
      poolNodes.set(g.pool, arr);
    }
  });

  // Ignore a single game that alone connects two groups of 3+ teams (almost always a typo).
  const skip = new Set<string>();
  for (const e of bridges(adj)) {
    const [a, b] = e.split('\u0000');
    const comps = components([a, b], adj, new Set([e]));
    const ca = comps.find((c) => c.includes(a))!;
    const cb = comps.find((c) => c.includes(b))!;
    if (ca !== cb && ca.length >= 3 && cb.length >= 3) skip.add(e);
  }
  let comps = components(adj.keys(), adj, skip);

  const codeOf = (k: string) => k.split('\u0001')[1] || undefined;
  const compCode = (c: string[]) => {
    const m = new Map<string, number>();
    for (const k of c) {
      const code = codeOf(k);
      if (code) m.set(code, (m.get(code) ?? 0) + 1);
    }
    return [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
  };
  const seedLabel = new Map<string, string | undefined>();
  for (const s of seedRows) {
    const k = resolve(s.team, s.code);
    if (!seedLabel.has(k)) seedLabel.set(k, s.label);
  }
  // Attach tiny components (1-2 teams) to a group with the same seed label or code.
  const big = comps.filter((c) => c.length >= 3);
  for (const c of comps.filter((x) => x.length < 3)) {
    const code = compCode(c);
    const lbl = seedLabel.get(c[0]);
    const target =
      big.find((b) => lbl !== undefined && b.some((t) => seedLabel.get(t) === lbl)) ??
      big.find((b) => code !== undefined && compCode(b) === code) ??
      big.find((b) => b.some((t) => c.some((x) => likelySame(nodeName(t), nodeName(x))))) ??
      big.find((b) => b.some((t) => nodeName(t) === nodeName(c[0])));
    if (target) target.push(...c);
    else if (big.length) big[0].push(...c);
    else big.push(c);
  }
  comps = big.length ? big : comps;
  void poolNodes;

  const nodeDivision = new Map<string, string>();
  const allTeams = () => [...adj.keys()].map((k) => ({ name: nodeName(k), division: nodeDivision.get(k) }));
  const pins = input.teamDivisions ?? {};
  if (comps.length <= 1 && !Object.keys(pins).length) {
    return { divisions: [], divisionOf: () => undefined, gameDivision: () => undefined, teams: dedupeTeams(allTeams()) };
  }

  const codeCount = new Map<string, number>();
  comps.forEach((c) => {
    const code = compCode(c);
    if (code) codeCount.set(code, (codeCount.get(code) ?? 0) + 1);
  });
  const seedLabels = [...new Set(seedRows.map((s) => s.label).filter((l): l is string => Boolean(l)))];
  const minSeed = (c: string[]) => {
    let m = Infinity;
    for (const s of seedRows) if (c.includes(resolve(s.team, s.code)) && s.seed < m) m = s.seed;
    return m;
  };
  comps.sort((a, b) => minSeed(a) - minSeed(b) || b.length - a.length);
  const used = new Set<string>();
  const divs: Division[] = [];
  comps.forEach((c, i) => {
    const code = compCode(c);
    let name: string | undefined;
    // 1. Seeding label covering a good share of the group.
    const lblCount = new Map<string, number>();
    for (const k of c) {
      const l = seedLabel.get(k);
      if (l) lblCount.set(l, (lblCount.get(l) ?? 0) + 1);
    }
    const top = [...lblCount.entries()].sort((x, y) => y[1] - x[1])[0];
    if (top && top[1] >= Math.min(3, c.length * 0.4) && !used.has(divisionLabel(top[0]))) name = divisionLabel(top[0]);
    // 2. A multi-letter code ("Open"), or a letter expanded from labels ("O" -> "Open").
    if (!name && code && (codeCount.get(code) ?? 0) === 1) {
      if (code.length > 2) name = code;
      else {
        const pool = [...seedLabels, ...input.standingsLabels].map(divisionLabel).filter(Boolean);
        name = pool.find((l) => l.toUpperCase().startsWith(code.toUpperCase()) && !used.has(l));
        name ??= ({ O: 'Open', W: 'Women', M: 'Men', X: 'Mixed' } as Record<string, string>)[code.toUpperCase()];
      }
    }
    // 3. Standings / pool tab names ("Beginners Results", "Beg Pools").
    if (!name) {
      const cand = [...input.standingsLabels, ...new Set(input.poolTabs.map((p) => p.tab))]
        .map(divisionLabel)
        .filter((l) => l && !used.has(l) && !/^\d+$/.test(l));
      name = cand.find((l) => !divs.some((d) => d.name.slice(0, 3).toLowerCase() === l.slice(0, 3).toLowerCase()));
    }
    name ??= `Division ${i + 1}`;
    let unique = name;
    for (let n = 2; used.has(unique); n++) unique = `${name} ${n}`;
    used.add(unique);
    const display = input.names[unique] ?? (code ? input.names[code] : undefined) ?? unique;
    const group = /^(.*?)\s+(d\d|div\s*\d|division\s*\d)$/i.exec(display)?.[1];
    divs.push({ name: display, code, group });
    for (const k of c) nodeDivision.set(k, display);
  });

  // User or AI overrides win over the grouping; a new name makes a new division, emptied ones go.
  for (const k of adj.keys()) {
    const n = nodeName(k);
    const to = pins[`${nodeDivision.get(k) ?? ''}::${n}`] ?? pins[n];
    if (!to) continue;
    const name = input.names[to] ?? to;
    if (!divs.some((d) => d.name === name)) divs.push({ name });
    nodeDivision.set(k, name);
  }
  const held = new Set(nodeDivision.values());
  for (let i = divs.length - 1; i >= 0; i--) if (!held.has(divs[i].name)) divs.splice(i, 1);

  const codeDivision = new Map<string, string>();
  for (const d of divs) if (d.code && (codeCount.get(d.code) ?? 0) === 1) codeDivision.set(d.code, d.name);
  const seedDivision = new Map<number, string>();
  for (const [seed, k] of seedNode) {
    const d = nodeDivision.get(k);
    if (d) seedDivision.set(seed, d);
  }
  const divisionOf = (name: string, code: string | undefined) => nodeDivision.get(resolve(name, code));
  const gameDivision = (g: Game, code: string | undefined): string | undefined => {
    const [a, b] = g.teams;
    const da = a ? divisionOf(a, code) : undefined;
    const db = b ? divisionOf(b, code) : undefined;
    if (da && db && da === db) return da;
    if (da && !db) return da;
    if (db && !da) return db;
    if (code && codeDivision.has(code)) return codeDivision.get(code);
    for (const s of g.slots) {
      const sp = splitSlot(s);
      if (sp && !sp.prefix && seedDivision.has(sp.n)) return seedDivision.get(sp.n);
    }
    return da ?? db;
  };
  return { divisions: divs, divisionOf, gameDivision, teams: dedupeTeams(allTeams()) };
}

function dedupeTeams(ts: { name: string; division?: string }[]) {
  const seen = new Set<string>();
  return ts.filter((t) => {
    const k = `${t.division ?? ''}::${t.name}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
