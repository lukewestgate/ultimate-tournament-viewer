import { clean, isBlank, parseDate, parseNumber, parseTime, parseWeekday } from '../sheets/cells';
import { cell, cellKey, colName, findTab, type Tab, type Workbook } from '../sheets/workbook';
import type { GameSource, GridSource, ListSource, PoolTableMap, SeedingMap, StandingsMap } from '../mapping/types';

export interface RawGame {
  ref: string;
  source: number;
  row: number;
  /** Day text as written ("Saturday", "SATURDAY", "Sat 24 Oct"). */
  dayRaw?: string;
  /** Date from a date cell or a dated marker row. */
  date?: string;
  timeMins?: number;
  pitchRaw?: string;
  divisionRaw?: string;
  code?: string;
  team1?: string;
  team2?: string;
  score1?: string;
  score2?: string;
  slot1?: string;
  slot2?: string;
  bracket?: boolean;
  /** Order of the pitch block in a grid (for pitches with no label). */
  blockIndex?: number;
}

const tabOf = (wb: Workbook, name: string) => findTab(wb, name);

function txt(tab: Tab, r: number, c: number | undefined): string {
  return c === undefined || c < 0 ? '' : clean(cell(tab, r, c));
}

export function readGameSource(wb: Workbook, src: GameSource, index: number): RawGame[] {
  const tab = tabOf(wb, src.tab);
  if (!tab) return [];
  return src.kind === 'list' ? readList(tab, src, index) : readGrid(tab, src, index);
}

/** Text that looks like a team or a slot placeholder (not a separator, not blank, not a header). */
export function hasTeamText(s: string): boolean {
  const c = clean(s);
  if (!c) return false;
  if (/^(v|vs|:|-|–)$/i.test(c)) return false;
  return true;
}

function readList(tab: Tab, src: ListSource, index: number): RawGame[] {
  const out: RawGame[] = [];
  const { cols } = src;
  const last = Math.min(src.lastRow ?? tab.rows.length - 1, tab.rows.length - 1);
  let lastDay: string | undefined;
  let lastDate: string | undefined;
  for (let r = src.headerRow + 1; r <= last; r++) {
    const t1 = txt(tab, r, cols.team1);
    const t2 = txt(tab, r, cols.team2);
    const s1 = txt(tab, r, cols.slot1);
    const s2 = txt(tab, r, cols.slot2);
    const code = txt(tab, r, cols.code);
    const timeText = txt(tab, r, cols.time);
    const timeMins = parseTime(timeText);
    // A game row needs a time and something in a team / slot / code position.
    const anyTeam = (hasTeamText(t1) && hasTeamText(t2)) || (!isBlank(s1) && !isBlank(s2)) || /\dv|v\d/i.test(code);
    let dayRaw = cols.day !== undefined ? txt(tab, r, cols.day) : undefined;
    let date = cols.day !== undefined ? tab.dates?.[cellKey(r, cols.day)] : undefined;
    if (dayRaw && !date) date = parseDate(dayRaw);
    if (timeMins === undefined || !anyTeam) {
      // Marker rows like "SUNDAY" carry the day for following rows when there's no day column.
      if (cols.day === undefined) {
        const row = tab.rows[r] ?? [];
        for (const c of row) {
          const wd = parseWeekday(c);
          if (wd && clean(c).length < 30) {
            lastDay = clean(c);
            lastDate = parseDate(c);
            break;
          }
        }
      }
      continue;
    }
    if (cols.day === undefined) {
      dayRaw = lastDay;
      date = lastDate;
    }
    const bracketText = txt(tab, r, cols.bracket).toLowerCase();
    out.push({
      ref: `${tab.name}!${r + 1}`,
      source: index,
      row: r,
      dayRaw: dayRaw || undefined,
      date,
      timeMins,
      pitchRaw: txt(tab, r, cols.pitch) || undefined,
      divisionRaw: txt(tab, r, cols.division) || undefined,
      code: code || undefined,
      team1: t1 || undefined,
      team2: t2 || undefined,
      score1: txt(tab, r, cols.score1) || undefined,
      score2: txt(tab, r, cols.score2) || undefined,
      slot1: s1 || undefined,
      slot2: s2 || undefined,
      bracket: bracketText === 'true' ? true : bracketText === 'false' ? false : undefined,
    });
  }
  return out;
}

/** Day / date marker in a row with no games: "SATURDAY", "Saturday 24 October". */
export function rowDayMarker(row: string[] | undefined): { day: string; date?: string } | undefined {
  if (!row) return undefined;
  for (const c of row) {
    const t = clean(c);
    if (!t || t.length > 40) continue;
    const wd = parseWeekday(t);
    const date = parseDate(t);
    if (wd && (t.split(' ').length <= 5)) return { day: wd, date };
    if (date && /[a-z]/i.test(t)) return { day: t, date };
  }
  return undefined;
}

function readGrid(tab: Tab, src: GridSource, index: number): RawGame[] {
  const out: RawGame[] = [];
  const o = src.offsets;
  const last = Math.min(src.lastRow ?? tab.rows.length - 1, tab.rows.length - 1);
  let day: string | undefined;
  let date: string | undefined;
  // Day markers above the first row also count.
  for (let r = 0; r < src.firstRow; r++) {
    const m = rowDayMarker(tab.rows[r]);
    if (m) {
      day = m.day;
      date = m.date;
    }
  }
  for (let r = src.firstRow; r <= last; r++) {
    let any = false;
    const rowGames: RawGame[] = [];
    src.blocks.forEach((b, bi) => {
      const t1 = txt(tab, r, b.sep + o.team1);
      const t2 = txt(tab, r, b.sep + o.team2);
      if (!hasTeamText(t1) || !hasTeamText(t2)) return;
      // Ignore header echoes like "PITCH 1" in a team position.
      if (/^(pitch|field|court)\b/i.test(t1) || /^(team|home)$/i.test(t1)) return;
      const timeText = o.time !== undefined ? txt(tab, r, b.sep + o.time) : txt(tab, r, src.timeCol);
      const timeMins = parseTime(timeText);
      if (timeMins === undefined) return;
      any = true;
      rowGames.push({
        ref: `${tab.name}!${colName(b.sep)}${r + 1}`,
        source: index,
        row: r,
        dayRaw: src.fixedDay ?? day,
        date: src.fixedDay ? undefined : date,
        timeMins,
        pitchRaw: b.pitch,
        divisionRaw: src.fixedDivision,
        team1: t1 || undefined,
        team2: t2 || undefined,
        score1: o.score1 !== undefined ? txt(tab, r, b.sep + o.score1) || undefined : undefined,
        score2: o.score2 !== undefined ? txt(tab, r, b.sep + o.score2) || undefined : undefined,
        slot1: o.slot1 !== undefined ? txt(tab, r, b.sep + o.slot1) || undefined : undefined,
        slot2: o.slot2 !== undefined ? txt(tab, r, b.sep + o.slot2) || undefined : undefined,
        blockIndex: bi,
      });
    });
    if (any) out.push(...rowGames);
    else {
      const m = rowDayMarker(tab.rows[r]);
      if (m) {
        day = m.day;
        date = m.date;
      }
    }
  }
  return out;
}

export interface RawPoolRow {
  team: string;
  slot?: string;
  seed?: number;
  p?: number;
  w?: number;
  d?: number;
  l?: number;
  pf?: number;
  pa?: number;
  diff?: number;
  pts?: number;
  rank?: number;
  note?: string;
  newSeed?: number;
}

export function readPoolTable(wb: Workbook, m: PoolTableMap): RawPoolRow[] {
  const tab = tabOf(wb, m.tab);
  if (!tab) return [];
  const out: RawPoolRow[] = [];
  const num = (r: number, c: number | undefined) => (c === undefined ? undefined : parseNumber(cell(tab, r, c)));
  for (let r = m.headerRow + 1; r <= Math.min(m.lastRow, tab.rows.length - 1); r++) {
    const team = txt(tab, r, m.teamCol);
    const slot = txt(tab, r, m.slotCol) || undefined;
    if (!team && !slot) continue;
    out.push({
      team,
      slot,
      seed: num(r, m.seedCol),
      p: num(r, m.cols.p),
      w: num(r, m.cols.w),
      d: num(r, m.cols.d),
      l: num(r, m.cols.l),
      pf: num(r, m.cols.pf),
      pa: num(r, m.cols.pa),
      diff: num(r, m.cols.diff),
      pts: num(r, m.cols.pts),
      rank: num(r, m.cols.rank),
      note: txt(tab, r, m.cols.note) || undefined,
      newSeed: num(r, m.cols.newSeed),
    });
  }
  return out;
}

export function readSeeding(wb: Workbook, m: SeedingMap): { seed: number; team: string }[] {
  const tab = tabOf(wb, m.tab);
  if (!tab) return [];
  const out: { seed: number; team: string }[] = [];
  for (let r = m.firstRow; r <= Math.min(m.lastRow, tab.rows.length - 1); r++) {
    const seed = parseNumber(cell(tab, r, m.seedCol));
    const team = txt(tab, r, m.teamCol);
    if (seed !== undefined && team && !isBlank(team)) out.push({ seed, team });
  }
  return out;
}

export function readStandings(wb: Workbook, m: StandingsMap): { place: number; team?: string }[] {
  const tab = tabOf(wb, m.tab);
  if (!tab) return [];
  const out: { place: number; team?: string }[] = [];
  for (let r = m.firstRow; r <= Math.min(m.lastRow, tab.rows.length - 1); r++) {
    const place = parseNumber(cell(tab, r, m.placeCol));
    if (place === undefined) continue;
    const team = txt(tab, r, m.teamCol);
    out.push({ place, team: team && !isBlank(team) ? team : undefined });
  }
  return out;
}
