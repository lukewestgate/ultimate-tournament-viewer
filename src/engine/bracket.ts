import type { Format, Game, Tournament } from '../model/types';
import { divKey } from '../model/types';
import { gameKey, positionOf } from '../format/infer';

export interface Board {
  division?: string;
  title: string;
  /** Place range covered (relative places, 1-based). */
  from: number;
  to: number;
  rounds: string[][];
  /** Absolute position numbers in this board (for final places). */
  positions: number[];
}

const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/** Input games of a game, from its format sources (winner/loser of an earlier game). */
export function inputGames(g: Game, format: Format): string[] {
  const f = format.divisions[divKey(g.division)];
  const out: string[] = [];
  for (const side of [0, 1] as const) {
    const s = f?.sources[gameKey(g.id, side)]?.source;
    if (s?.kind === 'gameResult') out.push(s.game);
  }
  return out;
}

/**
 * Bracket boards derived from the format's graph: per division, and per block of places when large
 * (never by halving the largest position number). Rounds are graph depth.
 */
export function buildBoards(t: Tournament, format: Format): Board[] {
  const boards: Board[] = [];
  const divs = t.divisions.length ? t.divisions.map((d) => d.name) : [undefined];
  for (const d of divs) {
    const f = format.divisions[divKey(d)];
    const games = t.games.filter((g) => g.division === d && g.stage === 'placement' && !g.isBye && !g.unscheduled);
    const known = games.filter((g) => f?.sources[gameKey(g.id, 0)] || f?.sources[gameKey(g.id, 1)]);
    if (!known.length) continue;
    const pos = (g: Game) => {
      const a = positionOf(g, 0, t.pools);
      const b = positionOf(g, 1, t.pools);
      return a && b ? Math.min(a.n, b.n) : undefined;
    };
    const allPos = known.map(pos).filter((x): x is number => x !== undefined);
    const minPos = allPos.length ? Math.min(...allPos) : 1;
    const maxPos = allPos.length ? Math.max(...known.flatMap((g) => [positionOf(g, 0, t.pools)?.n, positionOf(g, 1, t.pools)?.n]).filter((x): x is number => x !== undefined)) : 0;
    const span = maxPos - minPos + 1;
    const block = (g: Game) => {
      const p = pos(g);
      if (p === undefined || span <= 12) return 0;
      return Math.floor((p - minPos) / 8);
    };
    const blocks = new Map<number, Game[]>();
    for (const g of known) blocks.set(block(g), [...(blocks.get(block(g)) ?? []), g]);
    for (const [b, gs] of [...blocks.entries()].sort((x, y) => x[0] - y[0])) {
      const ids = new Set(gs.map((g) => g.id));
      const round = new Map<string, number>();
      const depth = (g: Game): number => {
        const hit = round.get(g.id);
        if (hit !== undefined) return hit;
        round.set(g.id, 0);
        const ins = inputGames(g, format).filter((id) => ids.has(id));
        const r = ins.length ? 1 + Math.max(...ins.map((id) => depth(gs.find((x) => x.id === id)!))) : 0;
        round.set(g.id, r);
        return r;
      };
      gs.forEach(depth);
      const rounds: string[][] = [];
      for (const g of [...gs].sort((x, y) => x.start - y.start || x.pitch.order - y.pitch.order)) {
        const r = round.get(g.id)!;
        (rounds[r] ??= []).push(g.id);
      }
      const lo = blocks.size > 1 ? minPos + b * 8 : -Infinity;
      const hi = blocks.size > 1 ? lo + 7 : Infinity;
      const positions = [...new Set(gs.flatMap((g) => [positionOf(g, 0, t.pools)?.n, positionOf(g, 1, t.pools)?.n]).filter((x): x is number => x !== undefined && x >= lo && x <= hi))].sort((x, y) => x - y);
      const from = positions.length ? positions[0] - minPos + 1 : 1;
      const to = positions.length ? positions[positions.length - 1] - minPos + 1 : gs.length * 2;
      const title = positions.length ? `${ord(from)}–${ord(to)}` : 'Placement games';
      boards.push({ division: d, title, from, to, rounds: rounds.filter(Boolean), positions });
    }
  }
  return boards;
}
