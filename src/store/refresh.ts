import type { Mapping } from '../mapping/types';
import { findTab, tabHash, withCsvTab, type Workbook } from '../sheets/workbook';

export const FULL_EVERY = 10 * 60000;
export const HOT_EVERY = 60000;
const BACKOFF = [60000, 120000, 240000, 480000];

/** Delay before the next attempt after `failures` consecutive failures: 1 → 2 → 4 → 8 min, capped. */
export function backoffDelay(failures: number): number {
  if (failures <= 0) return HOT_EVERY;
  return BACKOFF[Math.min(failures - 1, BACKOFF.length - 1)];
}

/** Tabs the mapping uses for games and pool tables, with their gids. Undefined when any hot tab has no gid. */
export function hotTabs(wb: Workbook, mapping: Mapping): { name: string; gid: string }[] | undefined {
  const names = [...new Set([...mapping.games.map((g) => g.tab), ...mapping.pools.map((p) => p.tab)])];
  const out: { name: string; gid: string }[] = [];
  for (const n of names) {
    const t = findTab(wb, n);
    if (!t?.gid) return undefined;
    out.push({ name: t.name, gid: t.gid });
  }
  return out;
}

export type RefreshKind = 'full' | 'hot';

/** Decide what the next refresh should fetch. */
export function nextRefreshKind(lastFull: number | undefined, now: number, hot: unknown[] | undefined): RefreshKind {
  if (lastFull === undefined || now - lastFull >= FULL_EVERY || !hot) return 'full';
  return 'hot';
}

/** Apply freshly fetched hot tabs; returns the new workbook and whether anything changed. */
export function applyHotTabs(wb: Workbook, fetched: { name: string; rows: string[][] }[]): { workbook: Workbook; changed: boolean } {
  let next = wb;
  let changed = false;
  for (const f of fetched) {
    const before = findTab(next, f.name);
    const candidate = withCsvTab(next, f.name, f.rows);
    const after = findTab(candidate, f.name);
    if (before && after && tabHash(before) !== tabHash(after)) {
      changed = true;
      next = candidate;
    }
  }
  return { workbook: next, changed };
}

/** Per-tab hashes, to compare two workbooks. */
export function workbookHash(wb: Workbook): string {
  return wb.tabs.map((t) => `${t.name}:${tabHash(t)}`).join('|');
}
