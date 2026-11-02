import type { Board } from '../engine/bracket';
import type { DivisionFormat, Game } from '../model/types';
import { gameKey } from '../format/infer';

export interface Input {
  game: string;
  take: 'winner' | 'loser';
  side: 0 | 1;
}

export interface BoardSections {
  /** Winners' tree plus medal games, as columns of game ids (graph depth order). */
  upper: string[][];
  /** Placement games for teams knocked out of the tree, as columns. */
  lower: string[][];
  inputs: Map<string, Input[]>;
  /** Places decided by each game's winner and loser (absolute place numbers). */
  decides: Map<string, { winner?: number; loser?: number }>;
}

/** Winner/loser inputs of a game from the format's sources. */
export function inputsOf(id: string, f: DivisionFormat | undefined): Input[] {
  const out: Input[] = [];
  for (const side of [0, 1] as const) {
    const s = f?.sources[gameKey(id, side)]?.source;
    if (s?.kind === 'gameResult') out.push({ game: s.game, take: s.take, side });
  }
  return out;
}

/**
 * Split a board into the winners' tree (the game deciding the board's top place and every game
 * that feeds it through winners, plus medal games fed by losers of the tree's second-last round)
 * and the lower placement section (everything else). Columns follow the board's rounds.
 */
export function boardSections(board: Board, f: DivisionFormat | undefined): BoardSections {
  const ids = new Set(board.rounds.flat());
  const roundOf = new Map<string, number>();
  board.rounds.forEach((r, i) => r.forEach((id) => roundOf.set(id, i)));
  const inputs = new Map<string, Input[]>();
  for (const id of ids) inputs.set(id, inputsOf(id, f).filter((x) => ids.has(x.game)));
  const decides = new Map<string, { winner?: number; loser?: number }>();
  for (const [n, e] of Object.entries(f?.places ?? {})) {
    if (e.source.kind !== 'gameResult' || !ids.has(e.source.game)) continue;
    const d = decides.get(e.source.game) ?? {};
    d[e.source.take] = Number(n);
    decides.set(e.source.game, d);
  }
  const top = board.positions[0];
  const champ = [...decides.entries()].find(([, d]) => d.winner === top)?.[0];
  if (!champ) return { upper: bracketOrder(board.rounds.map((r) => [...r]), inputs), lower: [], inputs, decides };
  const tree = new Set<string>();
  const walk = (id: string) => {
    if (tree.has(id)) return;
    tree.add(id);
    for (const x of inputs.get(id) ?? []) if (x.take === 'winner') walk(x.game);
  };
  walk(champ);
  const champRound = roundOf.get(champ)!;
  const semis = new Set([...tree].filter((id) => roundOf.get(id) === champRound - 1));
  for (const id of ids) {
    if (tree.has(id)) continue;
    const ins = inputs.get(id) ?? [];
    if (ins.length && ins.every((x) => x.take === 'loser' && semis.has(x.game))) tree.add(id);
  }
  const cols = (keep: (id: string) => boolean) => bracketOrder(board.rounds.map((r) => r.filter(keep)).filter((r) => r.length), inputs);
  return { upper: cols((id) => tree.has(id)), lower: cols((id) => !tree.has(id)), inputs, decides };
}

/**
 * Reorder each column so games feeding the same later game sit together (1v8 next to 4v5 when
 * both feed SF1): a depth-first walk from the last column through winner inputs.
 */
export function bracketOrder(cols: string[][], inputs: Map<string, Input[]>): string[][] {
  const order = new Map<string, number>();
  const inCols = new Set(cols.flat());
  const visit = (id: string) => {
    if (order.has(id) || !inCols.has(id)) return;
    order.set(id, -1);
    for (const x of [...(inputs.get(id) ?? [])].sort((a, b) => a.side - b.side)) if (x.take === 'winner') visit(x.game);
    order.set(id, order.size);
  };
  for (let i = cols.length - 1; i >= 0; i--) for (const id of cols[i]) visit(id);
  return cols.map((col) => [...col].sort((a, b) => order.get(a)! - order.get(b)!));
}

export interface Placed {
  col: number;
  y: number;
  h: number;
}

/**
 * Vertical positions for columns of games: the first column stacks; later games sit at the middle
 * of the games whose winners feed them, and games fed only by losers go underneath.
 */
export function layoutColumns(cols: string[][], inputs: Map<string, Input[]>, heightOf: (id: string) => number, gap: number, below = gap): { pos: Map<string, Placed>; height: number } {
  const pos = new Map<string, Placed>();
  let height = 0;
  cols.forEach((col, ci) => {
    const center = (id: string) => {
      const p = pos.get(id)!;
      return p.y + p.h / 2;
    };
    const items = col.map((id, i) => {
      const h = heightOf(id);
      const placed = (inputs.get(id) ?? []).filter((x) => pos.has(x.game));
      const winners = placed.filter((x) => x.take === 'winner');
      const from = winners.length ? winners : placed;
      const target = ci === 0 || !from.length ? undefined : from.reduce((n, x) => n + center(x.game), 0) / from.length - h / 2;
      return { id, h, target, byWinner: winners.length > 0, i };
    });
    const ordered = [...items].sort((a, b) => Number(b.byWinner) - Number(a.byWinner) || (a.target ?? Infinity) - (b.target ?? Infinity) || a.i - b.i);
    let bottom = -Infinity;
    let lastByWinner = true;
    for (const it of ordered) {
      const space = bottom === -Infinity ? 0 : bottom + (lastByWinner && !it.byWinner ? below : gap);
      const y = Math.max(it.target ?? 0, space);
      pos.set(it.id, { col: ci, y, h: it.h });
      bottom = y + it.h;
      lastByWinner = it.byWinner;
      height = Math.max(height, bottom);
    }
  });
  return { pos, height };
}

/** Elbow connector from the right middle of one node to the left middle of another. */
export function elbow(x1: number, y1: number, x2: number, y2: number, r = 10): string {
  if (Math.abs(y2 - y1) < 1) return `M${x1},${y1} H${x2}`;
  const xm = x1 + (x2 - x1) / 2;
  const dir = y2 > y1 ? 1 : -1;
  const rr = Math.min(r, Math.abs(y2 - y1) / 2, (x2 - x1) / 2);
  return `M${x1},${y1} H${xm - rr} Q${xm},${y1} ${xm},${y1 + dir * rr} V${y2 - dir * rr} Q${xm},${y2} ${xm + rr},${y2} H${x2}`;
}

/** Column names counted from the final: Final / Medal games, Semi-finals, Quarter-finals, then Round N. */
export function columnNames(cols: string[][]): { long: string; short: string; one: string }[] {
  const n = cols.length;
  return cols.map((col, i) => {
    const fromEnd = n - 1 - i;
    if (fromEnd === 0) return col.length > 1 ? { long: 'Medal games', short: n > 1 ? 'Final' : 'Games', one: 'final' } : { long: 'Final', short: 'Final', one: 'final' };
    if (fromEnd === 1) return { long: 'Semi-finals', short: 'Semis', one: 'semi-final' };
    if (fromEnd === 2) return { long: 'Quarter-finals', short: 'QF', one: 'quarter-final' };
    return { long: `Round ${i + 1}`, short: `R${i + 1}`, one: `round ${i + 1}` };
  });
}

/** Display name for a game: Final, 3rd place, 5th/6th, Game to go, or its code. */
export function gameTitle(g: Game, d: { winner?: number; loser?: number } | undefined, minPlace: number, ord: (n: number) => string, fallback = 'Game'): string {
  if (g.isGameToGo || g.conditional) return 'Game to go';
  const w = d?.winner !== undefined ? d.winner - minPlace + 1 : undefined;
  const l = d?.loser !== undefined ? d.loser - minPlace + 1 : undefined;
  if (w === 1 && l === 2) return 'Final';
  if (w === 3) return '3rd place';
  if (w !== undefined && l !== undefined) return `${ord(w)}/${ord(l)}`;
  if (l !== undefined && l > 1) return `${ord(l - 1)}/${ord(l)}`;
  return g.code?.replace(/[[\]]/g, '') ?? fallback;
}
