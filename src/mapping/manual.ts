import { clean } from '../sheets/cells';
import { cell, findTab, type Workbook } from '../sheets/workbook';
import { detectGridSource, poolName } from './detect';
import type { GridOffsets, GridSource, ListCols, ListSource, Mapping, PoolCols, PoolTableMap } from './types';

/** Role palette for list sources (spec §6.5). */
export const LIST_ROLES = ['time', 'day', 'pitch', 'division', 'code', 'team1', 'score1', 'score2', 'team2', 'slot1', 'slot2'] as const;
export type ListRole = (typeof LIST_ROLES)[number];
export const GRID_ROLES = ['team1', 'score1', 'score2', 'team2', 'slot1', 'slot2', 'time', 'sharedTime'] as const;
export type GridRole = (typeof GRID_ROLES)[number];
export const POOL_ROLES = ['team', 'slot', 'seed', 'p', 'w', 'd', 'l', 'pf', 'pa', 'diff', 'pts', 'rank'] as const;
export type PoolRole = (typeof POOL_ROLES)[number];

export const ROLE_LABEL: Record<string, string> = {
  time: 'Time',
  day: 'Day',
  pitch: 'Pitch',
  division: 'Division',
  code: 'Code',
  team1: 'Team 1',
  score1: 'Score 1',
  score2: 'Score 2',
  team2: 'Team 2',
  slot1: 'Slot 1',
  slot2: 'Slot 2',
  sharedTime: 'Shared time column',
  team: 'Team',
  slot: 'Slot',
  seed: 'Seed',
  p: 'Played',
  w: 'Won',
  d: 'Drawn',
  l: 'Lost',
  pf: 'For',
  pa: 'Against',
  diff: 'Difference',
  pts: 'Points',
  rank: 'Rank',
  sep: 'Separator (v)',
};

/** Role colours (Spec components): colour + text label, never colour alone. */
export const ROLE_COLOR: Record<string, string> = {
  time: '#0E9CB2',
  sharedTime: '#0E9CB2',
  day: '#9C6B32',
  pitch: '#5F6774',
  division: '#B048C4',
  code: '#D39B0B',
  team1: '#1F7AE0',
  team: '#1F7AE0',
  score1: '#12A06A',
  score2: '#12A06A',
  team2: '#E0452B',
  slot1: '#7C4DDB',
  slot2: '#D63C86',
  slot: '#7C4DDB',
  seed: '#9C6B32',
  sep: '#11151B',
};

const clone = (m: Mapping): Mapping => JSON.parse(JSON.stringify(m));

function sanitizeCols<T extends object>(cols: T): T {
  for (const k of Object.keys(cols) as (keyof T)[]) if (cols[k] === undefined) delete cols[k];
  return cols;
}

/** Set the header row of a tab's list source (creating it). */
export function setListHeader(m: Mapping, tab: string, headerRow: number): Mapping {
  const next = clone(m);
  const src = next.games.find((g): g is ListSource => g.kind === 'list' && g.tab === tab);
  if (src) src.headerRow = headerRow;
  else next.games.push({ kind: 'list', tab, headerRow, cols: { time: -1, team1: -1, team2: -1 } });
  return next;
}

/** Assign (or clear) a role for a column of a tab's list source. A column holds one role. */
export function assignListRole(m: Mapping, tab: string, headerRow: number, col: number, role: ListRole | null): Mapping {
  let next = clone(m);
  let src = next.games.find((g): g is ListSource => g.kind === 'list' && g.tab === tab);
  if (!src) {
    next = setListHeader(next, tab, headerRow);
    src = next.games.find((g): g is ListSource => g.kind === 'list' && g.tab === tab)!;
  }
  src.headerRow = headerRow;
  const cols = src.cols as unknown as Record<string, number | undefined>;
  for (const k of Object.keys(cols)) if (cols[k] === col) cols[k] = ['time', 'team1', 'team2'].includes(k) ? -1 : undefined;
  if (role) cols[role] = col;
  src.cols = sanitizeCols(cols) as unknown as ListCols;
  return next;
}

export function setFixed(m: Mapping, index: number, patch: { fixedDay?: string; fixedDivision?: string }): Mapping {
  const next = clone(m);
  const g = next.games[index];
  if (g) Object.assign(g, patch);
  for (const k of ['fixedDay', 'fixedDivision'] as const) if (g && !g[k]) delete g[k];
  return next;
}

/** Tap a separator cell: every column with that separator becomes a pitch block; offsets are guessed when possible. */
export function setGridSeparator(m: Mapping, wb: Workbook, tab: string, row: number, col: number): Mapping {
  const t = findTab(wb, tab);
  if (!t) return m;
  const sepText = clean(cell(t, row, col)).toLowerCase();
  const counts = new Map<number, number>();
  let firstRow = row;
  t.rows.forEach((r, ri) =>
    r.forEach((v, ci) => {
      if (clean(v).toLowerCase() === sepText && sepText) {
        counts.set(ci, (counts.get(ci) ?? 0) + 1);
        if (ci === col && ri < firstRow) firstRow = ri;
      }
    }),
  );
  const seps = [...counts.entries()].filter(([, n]) => n >= Math.max(2, (counts.get(col) ?? 0) * 0.4)).map(([c]) => c).sort((a, b) => a - b);
  const guess = detectGridSource(t);
  const existing = m.games.find((g): g is GridSource => g.kind === 'grid' && g.tab === tab);
  const offsets: GridOffsets = existing?.offsets ?? guess?.offsets ?? { team1: -1, team2: 1 };
  const blocks = seps.map((s, i) => ({ sep: s, pitch: existing?.blocks.find((b) => b.sep === s)?.pitch ?? guess?.blocks.find((b) => b.sep === s)?.pitch ?? `Pitch ${i + 1}` }));
  const src: GridSource = { kind: 'grid', tab, firstRow, blocks, offsets, timeCol: existing?.timeCol ?? guess?.timeCol };
  if (src.timeCol === undefined) delete src.timeCol;
  const next = clone(m);
  const i = next.games.findIndex((g) => g.kind === 'grid' && g.tab === tab);
  if (i >= 0) next.games[i] = src;
  else next.games.push(src);
  return next;
}

/** Assign a role to a cell of a grid block: stored as an offset from the nearest separator to its left (or right for team 2 side). */
export function assignGridRole(m: Mapping, tab: string, col: number, role: GridRole | null): Mapping {
  const next = clone(m);
  const src = next.games.find((g): g is GridSource => g.kind === 'grid' && g.tab === tab);
  if (!src || !src.blocks.length) return m;
  if (role === 'sharedTime') {
    src.timeCol = col;
    delete src.offsets.time;
    return next;
  }
  // nearest separator
  const seps = src.blocks.map((b) => b.sep);
  const near = seps.reduce((best, s) => (Math.abs(s - col) < Math.abs(best - col) ? s : best), seps[0]);
  const off = col - near;
  const o = src.offsets as unknown as Record<string, number | undefined>;
  for (const k of Object.keys(o)) if (o[k] === off) delete o[k];
  if (role) o[role] = off;
  if (role === 'time') delete src.timeCol;
  if (o.team1 === undefined) o.team1 = -1;
  if (o.team2 === undefined) o.team2 = 1;
  return next;
}

export function setGridPitch(m: Mapping, tab: string, blockIndex: number, pitch: string): Mapping {
  const next = clone(m);
  const src = next.games.find((g): g is GridSource => g.kind === 'grid' && g.tab === tab);
  if (src?.blocks[blockIndex]) src.blocks[blockIndex].pitch = pitch;
  return next;
}

/** Assign a pool-table role. The table is identified by tab + header row; rows run until the team column is blank. */
export function assignPoolRole(m: Mapping, wb: Workbook, tab: string, headerRow: number, col: number, role: PoolRole | null, name?: string): Mapping {
  const next = clone(m);
  const t = findTab(wb, tab);
  let p = next.pools.find((x) => x.tab === tab && x.headerRow === headerRow);
  if (!p) {
    p = { tab, headerRow, lastRow: headerRow, teamCol: -1, cols: { w: -1, l: -1 }, name: name ?? '' };
    next.pools.push(p);
  }
  const all = { team: p.teamCol, slot: p.slotCol, seed: p.seedCol, ...p.cols } as Record<string, number | undefined>;
  for (const k of Object.keys(all)) if (all[k] === col) all[k] = undefined;
  if (role) all[role] = col;
  p.teamCol = all.team ?? -1;
  p.slotCol = all.slot;
  p.seedCol = all.seed;
  const { team: _t, slot: _s, seed: _d, ...stats } = all;
  void _t;
  void _s;
  void _d;
  p.cols = sanitizeCols({ ...stats, w: stats.w ?? -1, l: stats.l ?? -1 }) as unknown as PoolCols;
  if (!p.slotCol && p.slotCol !== 0) delete p.slotCol;
  if (!p.seedCol && p.seedCol !== 0) delete p.seedCol;
  if (t && p.teamCol >= 0) {
    let last = headerRow;
    for (let r = headerRow + 1; r < t.rows.length; r++) {
      if (!clean(cell(t, r, p.teamCol)) && !(p.slotCol !== undefined && clean(cell(t, r, p.slotCol)))) break;
      last = r;
    }
    p.lastRow = last;
    if (!p.name) p.name = poolName(clean(cell(t, headerRow, p.teamCol))) || `Pool ${next.pools.length}`;
  }
  if (name !== undefined) p.name = name;
  return next;
}

export function removePool(m: Mapping, i: number): Mapping {
  const next = clone(m);
  next.pools.splice(i, 1);
  return next;
}

/** Seeding from the first and last seed cells plus the team column. */
export function setSeeding(m: Mapping, tab: string, first: { r: number; c: number }, lastRow: number, teamCol: number, label?: string): Mapping {
  const next = clone(m);
  next.seeding.push({ tab, firstRow: Math.min(first.r, lastRow), lastRow: Math.max(first.r, lastRow), seedCol: first.c, teamCol, ...(label ? { label } : {}) });
  return next;
}

export function moveSource(m: Mapping, i: number, d: -1 | 1): Mapping {
  const next = clone(m);
  const j = i + d;
  if (j < 0 || j >= next.games.length) return m;
  [next.games[i], next.games[j]] = [next.games[j], next.games[i]];
  return next;
}

export function removeSource(m: Mapping, i: number): Mapping {
  const next = clone(m);
  next.games.splice(i, 1);
  return next;
}

/** Roles shown on a tab's cells (for highlighting): column -> role for list/pool, absolute columns for grids. */
export function rolesOnTab(m: Mapping, tab: string): { header?: number; cols: Map<number, string> } {
  const cols = new Map<number, string>();
  let header: number | undefined;
  for (const g of m.games) {
    if (g.tab !== tab) continue;
    if (g.kind === 'list') {
      header = g.headerRow;
      for (const [k, v] of Object.entries(g.cols)) if (v !== undefined && v >= 0) cols.set(v, k);
    } else {
      for (const b of g.blocks) {
        cols.set(b.sep, 'sep');
        for (const [k, v] of Object.entries(g.offsets)) if (v !== undefined) cols.set(b.sep + v, k);
      }
      if (g.timeCol !== undefined) cols.set(g.timeCol, 'sharedTime');
    }
  }
  for (const p of m.pools as PoolTableMap[]) {
    if (p.tab !== tab) continue;
    if (p.teamCol >= 0) cols.set(p.teamCol, 'team');
    if (p.slotCol !== undefined) cols.set(p.slotCol, 'slot');
    for (const [k, v] of Object.entries(p.cols)) if (v !== undefined && v >= 0) cols.set(v, k);
  }
  return { header, cols };
}
