import type { Game, Tournament } from './types';

export interface Source {
  game?: Game;
  take?: 'W' | 'L';
  seed?: number;
}

const ord = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
export { ord };

export class BracketModel {
  readonly games: Game[];
  readonly maxPos: number;
  private reachMemo = new Map<string, number[]>();

  constructor(t: Tournament) {
    this.games = t.games.filter((g) => g.stage === 'placement');
    this.maxPos = Math.max(0, ...this.games.flatMap((g) => [Number(g.lo), Number(g.hi)]));
  }

  pos(g: Game): [number, number] {
    const a = Number(g.lo);
    const b = Number(g.hi);
    return a < b ? [a, b] : [b, a];
  }

  /** Where position `p` comes from going into game `g`. */
  source(g: Game, p: number): Source {
    const prev = [...this.games].reverse().find((x) => x.ordinal < g.ordinal && this.pos(x).includes(p));
    if (!prev) return { seed: p };
    return { game: prev, take: this.pos(prev)[0] === p ? 'W' : 'L' };
  }

  /** The next game a position plays after `afterOrdinal`. */
  next(p: number, afterOrdinal: number, includeGtg = true): Game | undefined {
    return this.games.find(
      (x) => x.ordinal > afterOrdinal && this.pos(x).includes(p) && (includeGtg || !x.isGameToGo),
    );
  }

  /** Final places reachable from a game (ignoring games-to-go). */
  reach(g: Game): number[] {
    const hit = this.reachMemo.get(g.id);
    if (hit) return hit;
    const out = new Set<number>();
    for (const p of this.pos(g)) {
      const n = g.isGameToGo ? undefined : this.next(p, g.ordinal, false);
      if (n) this.reach(n).forEach((x) => out.add(x));
      else out.add(p);
    }
    const arr = [...out].sort((a, b) => a - b);
    this.reachMemo.set(g.id, arr);
    return arr;
  }

  /** Human name: "Crossover", "Quarter-final", "5th–8th semi", "Final", "3rd place", "Game to go". */
  name(g: Game): string {
    if (g.isGameToGo) return 'Game to go';
    const r = this.reach(g);
    const lo = r[0];
    const hi = r[r.length - 1];
    const span = r.length;
    if (span <= 2) {
      if (lo === 1) return 'Final';
      if (lo === 3) return '3rd place';
      return `${ord(lo)} / ${ord(hi)}`;
    }
    if (span <= 4) return lo === 1 ? 'Semi-final' : `${ord(lo)}–${ord(hi)} semi`;
    if (span <= 8) return lo === 1 ? 'Quarter-final' : `${ord(lo)}–${ord(hi)} QF`;
    return 'Crossover';
  }

  shortName(g: Game): string {
    const n = this.name(g);
    return n.replace('Quarter-final', 'QF').replace('Semi-final', 'SF').replace('Game to go', 'GTG').replace(' semi', ' SF');
  }

  /** Is position p decided by a game-to-go? */
  inGameToGo(p: number): Game | undefined {
    return this.games.find((g) => g.isGameToGo && this.pos(g).includes(p));
  }

  /** The game that finally decides place p, and whether the winner or loser takes it. */
  decider(p: number): Source {
    const last = [...this.games].reverse().find((g) => this.pos(g).includes(p));
    if (!last) return { seed: p };
    return { game: last, take: this.pos(last)[0] === p ? 'W' : 'L' };
  }

  // ---------------------------------------------------------------- layout

  board(g: Game): 0 | 1 {
    return this.pos(g)[0] <= this.maxPos / 2 ? 0 : 1;
  }

  layout(board: 0 | 1, opts: { colW: number; gap: number; unit: number; treeGap: number }) {
    const games = this.games.filter((g) => this.board(g) === board);
    const inBoard = new Set(games.map((g) => g.id));
    const depth = new Map<string, number>();
    const depthOf = (g: Game): number => {
      if (depth.has(g.id)) return depth.get(g.id)!;
      let d = 1;
      for (const p of this.pos(g)) {
        const s = this.source(g, p);
        if (s.game && inBoard.has(s.game.id)) d = Math.max(d, depthOf(s.game) + 1);
      }
      depth.set(g.id, d);
      return d;
    };
    games.forEach(depthOf);

    // Tree parent: whoever takes this game's winner, else its loser (same board only).
    const parent = new Map<string, Game | undefined>();
    for (const g of games) {
      const [w, l] = this.pos(g);
      const nw = this.next(w, g.ordinal);
      const nl = this.next(l, g.ordinal);
      const pick = nw && inBoard.has(nw.id) ? nw : nl && inBoard.has(nl.id) ? nl : undefined;
      parent.set(g.id, pick);
    }
    const children = (g: Game) =>
      games.filter((c) => parent.get(c.id)?.id === g.id).sort((a, b) => this.pos(a)[0] - this.pos(b)[0]);
    const roots = games.filter((g) => !parent.get(g.id)).sort((a, b) => this.pos(a)[0] - this.pos(b)[0]);

    // Bigger trees first, keep the championship on top.
    const size = (g: Game): number => 1 + children(g).reduce((n, c) => n + size(c), 0);
    roots.sort((a, b) => size(b) - size(a) || this.pos(a)[0] - this.pos(b)[0]);

    const yUnits = new Map<string, number>();
    let cursor = 0;
    const place = (g: Game): number => {
      const kids = children(g);
      let y: number;
      if (!kids.length) y = cursor++;
      else {
        const ys = kids.map(place);
        y = (ys[0] + ys[ys.length - 1]) / 2;
      }
      yUnits.set(g.id, y);
      return y;
    };
    const treeStarts: number[] = [];
    let extra = 0;
    const offsets = new Map<string, number>();
    for (const r of roots) {
      const startCursor = cursor;
      treeStarts.push(startCursor);
      place(r);
      const mark = (g: Game) => {
        offsets.set(g.id, extra);
        children(g).forEach(mark);
      };
      mark(r);
      extra += opts.treeGap;
    }

    const maxDepth = Math.max(1, ...games.map((g) => depth.get(g.id)!));
    const nodes = games.map((g) => ({
      game: g,
      col: depth.get(g.id)! - 1,
      x: (depth.get(g.id)! - 1) * (opts.colW + opts.gap),
      y: yUnits.get(g.id)! * opts.unit + offsets.get(g.id)!,
      parent: parent.get(g.id),
    }));
    const cols = Array.from({ length: maxDepth }, (_, c) => {
      const inCol = nodes.filter((n) => n.col === c).map((n) => n.game);
      inCol.sort((a, b) => this.pos(a)[0] - this.pos(b)[0]);
      const lead = inCol[0];
      return {
        x: c * (opts.colW + opts.gap),
        title: lead ? this.columnTitle(lead) : '',
        time: lead ? [...inCol].sort((a, b) => a.start - b.start)[0].time : '',
      };
    });
    const height = cursor * opts.unit + Math.max(0, extra - opts.treeGap);
    const width = maxDepth * opts.colW + (maxDepth - 1) * opts.gap;
    return { nodes, cols, width, height };
  }

  private columnTitle(g: Game): string {
    const n = this.name(g);
    if (n === 'Crossover') return 'Crossovers';
    if (/Quarter-final|QF/.test(n)) return 'Quarter-finals';
    if (/semi|Semi/.test(n)) return 'Semi-finals';
    if (n === 'Game to go') return 'Game to go';
    if (n === 'Final') return 'Medal games';
    return 'Placings';
  }
}

export type QualBadge = 'Q' | 'q' | 'GTG';

/** Qualification badges for a final place. */
export function placeBadges(p: number, t: Tournament, b: BracketModel): QualBadge[] {
  const { div1, div2 } = t.header.qualification;
  const out: QualBadge[] = [];
  if (b.inGameToGo(p)) out.push('GTG');
  if (p <= div1) out.push('Q');
  else if (p <= div1 + div2) out.push('q');
  return out;
}

/** Badges for the best outcome reachable from a game. */
export function gameBadges(g: Game, t: Tournament, b: BracketModel): QualBadge[] {
  const { div1, div2 } = t.header.qualification;
  const r = b.reach(g);
  const out: QualBadge[] = [];
  if (r[0] <= div1) out.push('Q');
  else if (r[0] <= div1 + div2) out.push('q');
  if (r.some((p) => b.inGameToGo(p))) out.push('GTG');
  return out;
}
