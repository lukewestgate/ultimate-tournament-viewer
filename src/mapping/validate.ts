import { findTab, width, type Workbook } from '../sheets/workbook';
import type { Mapping } from './types';

/** Check a mapping against the workbook: tabs exist, required columns are set, indices are in range. */
export function validateMapping(wb: Workbook, m: Mapping): string[] {
  const errs: string[] = [];
  const tabOk = (name: string, what: string) => {
    const t = findTab(wb, name);
    if (!t) errs.push(`The ${what} tab “${name}” is missing.`);
    return t;
  };
  m.games.forEach((g) => {
    const t = tabOk(g.tab, 'games');
    if (!t) return;
    const w = Math.max(width(t), 1);
    if (g.kind === 'list') {
      const { time, team1, team2 } = g.cols;
      if ([time, team1, team2].some((c) => c === undefined || c < 0)) errs.push(`Games in “${g.tab}” need time and both team columns.`);
      if (Object.values(g.cols).some((c) => c !== undefined && (c < 0 || c >= w + 2))) errs.push(`A column in “${g.tab}” is out of range.`);
      if (g.headerRow >= t.rows.length) errs.push(`The header row in “${g.tab}” is past the end of the tab.`);
    } else {
      if (!g.blocks.length) errs.push(`The grid in “${g.tab}” has no pitch blocks.`);
      if (g.offsets.time === undefined && g.timeCol === undefined) errs.push(`The grid in “${g.tab}” has no time column.`);
      if (g.blocks.some((b) => b.sep + g.offsets.team1 < 0 || b.sep + g.offsets.team2 >= w + 2)) errs.push(`A pitch block in “${g.tab}” is out of range.`);
    }
  });
  m.pools.forEach((p) => {
    const t = tabOk(p.tab, 'pool table');
    if (t && p.headerRow >= t.rows.length) errs.push(`Pool ${p.name} starts past the end of “${p.tab}”.`);
  });
  m.seeding.forEach((s) => tabOk(s.tab, 'seeding'));
  m.standings.forEach((s) => tabOk(s.tab, 'standings'));
  return [...new Set(errs)];
}

export function isMappingUsable(wb: Workbook, m: Mapping): boolean {
  return m.games.length > 0 && validateMapping(wb, m).length === 0;
}
