import { clean, isBlank, parseNumber, parseTime, parseWeekday } from '../sheets/cells';
import { cell, width, type Tab, type Workbook } from '../sheets/workbook';
import { hasTeamText, readGameSource, rowDayMarker } from '../extract/read';
import { foldName } from '../extract/names';
import type { GameSource, GridSource, ListCols, ListSource, Mapping, PoolCols, PoolTableMap, SeedingMap, StandingsMap } from './types';
import { emptyMapping } from './types';

/** Normalised header text: lower case, single spaces, no trailing punctuation. */
export function headerText(s: string): string {
  return clean(s).toLowerCase().replace(/[:?.]+$/, '').trim();
}

const RE = {
  time: /^(time|start|start time|kick ?off|ko|times?)$/,
  team: /^(team|team ?[12ab]|home( team)?|away( team)?|team name ?[12])$/,
  day: /^(day|date)$/,
  pitch: /^(pitch|field|court|pitch no|pitch number|location)$/,
  division: /^(division|div|category|comp|competition)$/,
  code: /^(game|match|matchup|code|game code|fixture|game id|match code)$/,
  score: /^(score|score ?[12ab]|pts|points|goals)$/,
  slot1: /^(left team|slot ?1|seed ?1|left seed)$/,
  slot2: /^(right team|slot ?2|seed ?2|right seed)$/,
  bracket: /^is this a bracket game/,
};

const SEP = /^(v|vs|vs\.|:)$/i;
const visible = (wb: Workbook) => wb.tabs.filter((t) => !t.hidden);

// ---------------------------------------------------------------- lists

function colValues(tab: Tab, c: number, from: number, to: number): string[] {
  const out: string[] = [];
  for (let r = from; r <= Math.min(to, tab.rows.length - 1); r++) out.push(clean(cell(tab, r, c)));
  return out;
}

function mostlyNumericOrEmpty(vals: string[]): boolean {
  let bad = 0;
  let filled = 0;
  for (const v of vals) {
    if (!v) continue;
    filled++;
    if (parseNumber(v) === undefined && !/^[wldf]$/i.test(v)) bad++;
  }
  return bad <= Math.max(1, filled * 0.1);
}

export function detectListSource(tab: Tab, uku = false): ListSource | undefined {
  const maxR = Math.min(30, tab.rows.length);
  for (let r = 0; r < maxR; r++) {
    const row = (tab.rows[r] ?? []).map(headerText);
    const find = (re: RegExp, from = 0) => {
      for (let c = from; c < row.length; c++) if (re.test(row[c])) return c;
      return undefined;
    };
    const time = find(RE.time);
    const teamCols: number[] = [];
    row.forEach((h, c) => RE.team.test(h) && teamCols.push(c));
    if (time === undefined || teamCols.length < 2) continue;
    const [team1, team2] = teamCols;
    const cols: ListCols = { time, team1, team2 };
    cols.day = find(RE.day);
    cols.pitch = find(RE.pitch);
    cols.division = find(RE.division);
    cols.code = find(RE.code);
    cols.slot1 = find(RE.slot1);
    cols.slot2 = find(RE.slot2);
    cols.bracket = find(RE.bracket);
    // Scores: labelled columns between the teams, else the cells just inside them.
    const between: number[] = [];
    for (let c = team1 + 1; c < team2; c++) if (RE.score.test(row[c])) between.push(c);
    const sample = (c: number) => colValues(tab, c, r + 1, r + 60);
    if (between.length >= 2) {
      cols.score1 = between[0];
      cols.score2 = between[between.length - 1];
    } else if (team2 - team1 >= 3) {
      if (mostlyNumericOrEmpty(sample(team1 + 1))) cols.score1 = team1 + 1;
      if (mostlyNumericOrEmpty(sample(team2 - 1))) cols.score2 = team2 - 1;
    }
    if (uku && cols.code === undefined) cols.code = 0;
    // Validate: at least a few rows with a time and two teams / slots.
    const src: ListSource = { kind: 'list', tab: tab.name, headerRow: r, cols: clearUndef(cols) };
    const games = readGameSource({ tabs: [tab] }, src, 0);
    if (games.length >= 2) return src;
  }
  return undefined;
}

function clearUndef<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

// ---------------------------------------------------------------- grids

const isCodeLike = (s: string) => /^[\p{L}]{0,3}\d{1,3}$/u.test(s) && s.length <= 5;
const isNameLike = (s: string) => hasTeamText(s) && !/^(true|false)$/i.test(s) && !isCodeLike(s) && parseNumber(s) === undefined && parseTime(s) === undefined && s.length > 1;

export function detectGridSource(tab: Tab): GridSource | undefined {
  const w = width(tab);
  const counts: number[] = new Array(w).fill(0);
  tab.rows.forEach((row) => row.forEach((v, c) => SEP.test(clean(v)) && counts[c]++));
  const seps = counts.map((n, c) => (n >= 3 ? c : -1)).filter((c) => c >= 0);
  if (!seps.length) return undefined;
  // Merge adjacent separator columns (keep the busier one).
  const blocksCols: number[] = [];
  for (const c of seps) {
    const prev = blocksCols[blocksCols.length - 1];
    if (prev !== undefined && c - prev < 3) {
      if (counts[c] > counts[prev]) blocksCols[blocksCols.length - 1] = c;
    } else blocksCols.push(c);
  }
  const first = blocksCols[0];
  const sepRows: number[] = [];
  tab.rows.forEach((row, r) => SEP.test(clean(row[first] ?? '')) && sepRows.push(r));
  const kind = (off: number) => {
    let num = 0;
    let name = 0;
    let code = 0;
    let empty = 0;
    for (const r of sepRows) {
      const v = clean(cell(tab, r, first + off));
      if (!v) empty++;
      else if (parseNumber(v) !== undefined || /^[wld]$/i.test(v)) {
        num++;
        if (isCodeLike(v)) code++;
      } else if (isCodeLike(v)) code++;
      else if (isNameLike(v)) name++;
    }
    const n = sepRows.length || 1;
    return { num: num / n, name: name / n, code: code / n, empty: empty / n };
  };
  const side = (dir: -1 | 1) => {
    let score: number | undefined;
    let team: number | undefined;
    let slot: number | undefined;
    for (let k = 1; k <= 4; k++) {
      const off = dir * k;
      if (first + off < 0) break;
      const s = kind(off);
      if (team === undefined && score === undefined && s.num + s.empty > 0.8 && s.name < 0.15) score = off;
      else if (team === undefined && s.name > 0.4) team = off;
      else if (team !== undefined && slot === undefined && s.code + s.num > 0.5) {
        slot = off;
        break;
      } else if (team !== undefined) break;
    }
    return { score, team, slot };
  };
  const L = side(-1);
  const R = side(1);
  if (L.team === undefined || R.team === undefined) return undefined;
  const dataRows = sepRows;
  // Time: an offset that works for every block, furthest left first.
  let timeOff: number | undefined;
  for (let off = -8; off <= 8 && timeOff === undefined; off++) {
    if (off === 0) continue;
    const ok = blocksCols.every((sep) => {
      if (sep + off < 0) return false;
      let hits = 0;
      let rows = 0;
      for (const r of dataRows) {
        if (!hasTeamText(cell(tab, r, sep + L.team!))) continue;
        rows++;
        if (parseTime(cell(tab, r, sep + off)) !== undefined) hits++;
      }
      return rows > 0 && hits / rows >= 0.6;
    });
    if (ok) timeOff = off;
  }
  let timeCol: number | undefined;
  if (timeOff === undefined) {
    for (let c = 0; c < first; c++) {
      let hits = 0;
      for (const r of dataRows) if (parseTime(cell(tab, r, c)) !== undefined) hits++;
      if (hits / dataRows.length >= 0.6) {
        timeCol = c;
        break;
      }
    }
    if (timeCol === undefined) return undefined;
  }
  const firstRow = Math.min(...dataRows);
  // Pitch names from a header row with Pitch/Field/Court labels above the first data row.
  const labels = new Map<number, string>();
  for (let r = firstRow - 1; r >= Math.max(0, firstRow - 6) && !labels.size; r--) {
    (tab.rows[r] ?? []).forEach((v, c) => {
      if (/^(pitch|field|court)\b/i.test(clean(v))) labels.set(c, clean(v));
    });
  }
  const blocks = blocksCols.map((sep, i) => {
    const lo = i === 0 ? 0 : blocksCols[i - 1] + 1;
    let pitch: string | undefined;
    for (let c = sep; c >= lo; c--) {
      if (labels.has(c)) {
        pitch = labels.get(c);
        break;
      }
    }
    return { sep, pitch: pitch ?? `Pitch ${i + 1}` };
  });
  return clearUndef({
    kind: 'grid' as const,
    tab: tab.name,
    firstRow,
    blocks,
    offsets: clearUndef({ team1: L.team, team2: R.team, score1: L.score, score2: R.score, slot1: L.slot, slot2: R.slot, time: timeOff }),
    timeCol,
  });
}

// ---------------------------------------------------------------- pools

const STAT: Record<keyof Omit<PoolCols, 'note' | 'newSeed'>, RegExp> = {
  p: /^(p|gp|pld|played|gms|games|mp)$/,
  w: /^(w|won|wins|win)$/,
  d: /^(d|drawn|draws|draw|t|ties)$/,
  l: /^(l|lost|losses|loss)$/,
  pf: /^(gf|pf|for|f|scored|points for|goals for)$/,
  pa: /^(ga|pa|against|a|conceded|points against|goals against)$/,
  diff: /^(gd|pd|diff|\+\/-|±|difference|goal difference|point difference|points difference)$/,
  pts: /^(pts|points|pt|league points)$/,
  rank: /^(rank|pos|position|place|#|ranking)$/,
};

export function detectPoolTables(tab: Tab): PoolTableMap[] {
  const out: PoolTableMap[] = [];
  for (let r = 0; r < tab.rows.length; r++) {
    const row = (tab.rows[r] ?? []).map(headerText);
    let c = 0;
    while (c < row.length) {
      // Find a contiguous run of stat headers.
      const cols: Partial<PoolCols> = {};
      let start = -1;
      let end = -1;
      let gap = 0;
      for (let k = c; k < row.length; k++) {
        const h = row[k];
        const role = (Object.keys(STAT) as (keyof typeof STAT)[]).find((key) => STAT[key].test(h) && cols[key] === undefined);
        if (role) {
          if (start < 0) start = k;
          cols[role] = k;
          end = k;
          gap = 0;
        } else if (start >= 0) {
          if (++gap > 1) break;
        }
      }
      if (start < 0) break;
      c = end + 1;
      const extras = ['p', 'pts', 'diff', 'pf', 'rank'].filter((k) => cols[k as keyof PoolCols] !== undefined).length;
      if (cols.w === undefined || cols.l === undefined || extras < 1) continue;
      const pt = poolTableAt(tab, r, start, end, cols as PoolCols);
      if (pt) out.push(pt);
    }
  }
  return out;
}

const SLOT_RE = /^[\p{L}]{1,3}\d{1,2}$/u;

function poolTableAt(tab: Tab, headerRow: number, start: number, end: number, cols: PoolCols): PoolTableMap | undefined {
  const hdr = (c: number) => headerText(cell(tab, headerRow, c));
  // Team column: labelled within 3 columns to the left, else the nearest text column to the left.
  let teamCol: number | undefined;
  for (let c = start - 1; c >= Math.max(0, start - 3); c--) {
    if (/^(team|team name|name|teams)$/.test(hdr(c))) {
      teamCol = c;
      break;
    }
  }
  const rowsBelow = (c: number) => {
    const vals: string[] = [];
    for (let r = headerRow + 1; r < Math.min(tab.rows.length, headerRow + 16); r++) {
      const v = clean(cell(tab, r, c));
      if (!v || STAT.w.test(headerText(cell(tab, r, cols.w)))) break;
      vals.push(v);
    }
    return vals;
  };
  if (teamCol === undefined) {
    for (let c = start - 1; c >= Math.max(0, start - 4); c--) {
      const vals = rowsBelow(c);
      if (vals.length >= 2 && vals.filter((v) => isNameLike(v)).length >= vals.length * 0.6) {
        teamCol = c;
        break;
      }
    }
  }
  if (teamCol === undefined) return undefined;
  // Rows: until the team cell (and slot cell) is empty.
  let slotCol: number | undefined;
  let seedCol: number | undefined;
  for (let c = teamCol - 1; c >= Math.max(0, teamCol - 2); c--) {
    const vals = rowsBelow(c);
    if (slotCol === undefined && vals.length >= 2 && vals.every((v) => SLOT_RE.test(v))) slotCol = c;
    else if (seedCol === undefined && vals.length >= 2 && vals.every((v) => parseNumber(v) !== undefined)) seedCol = c;
  }
  let lastRow = headerRow;
  for (let r = headerRow + 1; r < tab.rows.length; r++) {
    const t = clean(cell(tab, r, teamCol));
    const s = slotCol !== undefined ? clean(cell(tab, r, slotCol)) : '';
    if (!t && !s) break;
    if (STAT.w.test(headerText(cell(tab, r, cols.w)))) break;
    lastRow = r;
  }
  if (lastRow - headerRow < 2) return undefined;
  // Stat cells must be mostly numeric or empty.
  const statVals = colValues(tab, cols.w, headerRow + 1, lastRow);
  if (!mostlyNumericOrEmpty(statVals)) return undefined;
  // Notes and "New Seed" columns to the right.
  for (let c = end + 1; c <= end + 6; c++) {
    if (/new seed/.test(hdr(c))) cols.newSeed = c;
    const vals = colValues(tab, c, headerRow + 1, lastRow);
    if (cols.note === undefined && vals.some((v) => /->|→|continue|qualif|crossover|bracket/i.test(v))) cols.note = c;
  }
  // Name: header cell of the team column, a label above, or slot codes.
  let name = '';
  const teamHdr = clean(cell(tab, headerRow, teamCol));
  if (teamHdr && !/^(team|team name|name|teams)$/i.test(teamHdr)) name = teamHdr;
  if (slotCol !== undefined && (!name || /^(pool|group)$/i.test(name))) {
    const s = clean(cell(tab, headerRow + 1, slotCol));
    const letter = /^([\p{L}]{1,3})\d/u.exec(s)?.[1];
    if (letter) name = letter;
  }
  if (!name) {
    for (let r = headerRow - 1; r >= Math.max(0, headerRow - 2) && !name; r--) {
      // A label row has no numbers in the stat columns (otherwise it's the previous table).
      if (parseNumber(cell(tab, r, cols.w)) !== undefined) break;
      for (let c = teamCol; c >= Math.max(0, teamCol - 2) && !name; c--) {
        const v = clean(cell(tab, r, c));
        if (v && v.length <= 40 && !/standing|result/i.test(v)) name = v;
      }
    }
  }
  if (!name) {
    // UKU Pool Results: pool letter in column B of the header row
    name = `Pool ${start}`;
  }
  return clearUndef({ tab: tab.name, headerRow, lastRow, teamCol, slotCol, seedCol, cols: clearUndef(cols), name: poolName(name) });
}

/** "Pool A" -> "A"; "Group B" -> "B"; "Open Pool" stays. */
export function poolName(raw: string): string {
  const s = clean(raw);
  const m = /^(?:pool|group)\s+(.+)$/i.exec(s);
  return m ? m[1] : s;
}

// ---------------------------------------------------------------- seeding & standings

const STANDINGS_RE = /standing|place|final|result|ranking|placing/i;

interface IntRun {
  col: number;
  first: number;
  last: number;
  seeds: number[];
}

function intRuns(tab: Tab): IntRun[] {
  const out: IntRun[] = [];
  const w = width(tab);
  for (let c = 0; c < w; c++) {
    let run: IntRun | undefined;
    let blanks = 0;
    for (let r = 0; r <= tab.rows.length; r++) {
      const n = parseNumber(cell(tab, r, c));
      const prev = run?.seeds[run.seeds.length - 1];
      if (n !== undefined && n > 0 && (prev === undefined || (n > prev && n - prev <= 2))) {
        if (!run) run = { col: c, first: r, last: r, seeds: [n] };
        else {
          run.last = r;
          run.seeds.push(n);
        }
        blanks = 0;
        continue;
      }
      if (run && n === undefined && !clean(cell(tab, r, c)) && blanks === 0) {
        blanks++;
        continue;
      }
      if (run && run.seeds.length >= 3) out.push(run);
      run = undefined;
      blanks = 0;
      if (n !== undefined && n > 0) {
        run = { col: c, first: r, last: r, seeds: [n] };
      }
    }
    if (run && run.seeds.length >= 3) out.push(run);
  }
  // Seeds are consecutive: allow at most one skipped number per run.
  return out.filter((run) => run.seeds.filter((s, i) => i > 0 && s - run.seeds[i - 1] === 2).length <= 1);
}

function labelAbove(tab: Tab, row: number, cols: number[]): string | undefined {
  for (let r = row - 1; r >= Math.max(0, row - 3); r--) {
    for (const c of cols) {
      const v = clean(cell(tab, r, c));
      if (!v) continue;
      if (/^(seed|team|team name|teams|name|#|no|pool|place|rank|seeding)$/i.test(v)) continue;
      if (v.length > 50) continue;
      return v;
    }
  }
  return undefined;
}

export function detectSeedingAndStandings(
  tab: Tab,
  gameNames: Set<string>,
  exclude: { firstRow: number; lastRow: number; firstCol: number; lastCol: number }[] = [],
): { seeding: SeedingMap[]; standings: StandingsMap[] } {
  const seeding: SeedingMap[] = [];
  const standings: StandingsMap[] = [];
  const tabIsStandings = /final standings|^standings|^results|final results|placings/i.test(tab.name.trim());
  for (const run of intRuns(tab)) {
    // Skip rank / seed columns inside pool tables.
    if (exclude.some((x) => run.col >= x.firstCol && run.col <= x.lastCol && run.first <= x.lastRow && run.last >= x.firstRow)) continue;
    // Team column: next column with names, or one over past a short code.
    let teamCol: number | undefined;
    for (let c = run.col + 1; c <= run.col + 4; c++) {
      const vals = colValues(tab, c, run.first, run.last).filter(Boolean);
      const names = vals.filter((v) => isNameLike(v));
      if (vals.length >= 3 && names.length >= vals.length * 0.6) {
        teamCol = c;
        break;
      }
    }
    if (teamCol === undefined) continue;
    const hdrAbove = headerText(cell(tab, run.first - 1, run.col));
    // Labels in the column to the left only split a run when they're sparse (UKU "Men D1", "Men D2").
    let leftFilled = 0;
    for (let r = run.first; r <= run.last; r++) if (run.col > 0 && clean(cell(tab, r, run.col - 1))) leftFilled++;
    const splitLeft = !tabIsStandings && leftFilled <= (run.last - run.first + 1) * 0.3;
    // Split the run where a label appears in the column to the left (UKU "Men D1", "Men D2").
    const parts: { first: number; last: number; label?: string }[] = [];
    let cur: { first: number; last: number; label?: string } | undefined;
    let pendingLabel: string | undefined;
    for (let r = run.first; r <= run.last; r++) {
      if (parseNumber(cell(tab, r, run.col)) === undefined) {
        // Blank place/seed with text in the team column: a section label ("Women's Trophy").
        const lbl = clean(cell(tab, r, teamCol));
        if (lbl && cur) {
          parts.push(cur);
          cur = undefined;
          pendingLabel = lbl;
        }
        continue;
      }
      const left = splitLeft && run.col > 0 ? clean(cell(tab, r, run.col - 1)) : '';
      const isLabel = Boolean(left) && !/^\d+$/.test(left) && left.length < 40 && !SLOT_RE.test(left);
      if (!cur || (isLabel && r !== cur.first)) {
        if (cur) parts.push(cur);
        cur = { first: r, last: r, label: isLabel ? left : pendingLabel };
        pendingLabel = undefined;
      } else cur.last = r;
      if (isLabel && r === cur.first) cur.label = left;
    }
    if (cur) parts.push(cur);
    for (const p of parts) {
      const label = p.label ?? (p.first === run.first ? labelAbove(tab, run.first, [teamCol, run.col]) : undefined);
      const names = colValues(tab, teamCol, p.first, p.last).filter((v) => v && !isBlank(v));
      if (names.length < 3 || (names.length < 4 && !p.label)) continue;
      const isStandings = tabIsStandings || STANDINGS_RE.test(label ?? '') || /^(place|rank|pos)$/.test(hdrAbove);
      if (isStandings) {
        standings.push(clearUndef({ tab: tab.name, firstRow: p.first, lastRow: p.last, placeCol: run.col, teamCol, label }));
        continue;
      }
      const playing = names.filter((n) => gameNames.has(foldName(n))).length;
      if (gameNames.size && playing < names.length * 0.5) continue;
      seeding.push(clearUndef({ tab: tab.name, firstRow: p.first, lastRow: p.last, seedCol: run.col, teamCol, label }));
    }
  }
  return { seeding, standings };
}

// ---------------------------------------------------------------- UKU template

export function ukuSignals(wb: Workbook): number {
  let n = 0;
  const names = new Set(wb.tabs.map((t) => t.name.toLowerCase().trim()));
  const tabNames = ['header', 'seeding and pools', 'schedule', 'pool results', 'gamelist', 'final standings'];
  n += tabNames.filter((t) => names.has(t)).length >= 4 ? 1 : 0;
  if (wb.tabs.some((t) => /sotg submissions/i.test(t.name))) n++;
  const gl = wb.tabs.find((t) => /^gamelist$/i.test(t.name.trim()));
  if (gl) {
    const hdr = (gl.rows[0] ?? []).map(headerText);
    if (hdr.includes('left team') && hdr.includes('right team')) n++;
    if (hdr.some((h) => RE.bracket.test(h))) n++;
  }
  const sch = wb.tabs.find((t) => /^schedule$/i.test(t.name.trim()));
  if (sch && sch.rows.slice(0, 10).some((r) => r.some((c) => /^saturday start/i.test(clean(c))))) n++;
  const pr = wb.tabs.find((t) => /^pool results$/i.test(t.name.trim()));
  if (pr && pr.rows.slice(0, 10).some((r) => {
    const h = r.map(headerText);
    const i = h.indexOf('pool');
    return i >= 0 && h[i + 1] === 'seed' && h[i + 2] === 'team' && h[i + 3] === 'w';
  })) n++;
  return n;
}

// ---------------------------------------------------------------- info tabs

export function detectInfoTabs(wb: Workbook, used: Set<string>): string[] {
  const out: string[] = [];
  for (const t of visible(wb)) {
    if (used.has(t.name)) continue;
    if (/sotg|spirit submissions|tie break log/i.test(t.name)) continue;
    let long = 0;
    for (const row of t.rows) for (const c of row) if (clean(c).length >= 30) long++;
    if (long >= 3 || /^(header|info|rules|rules and format|information)/i.test(t.name)) out.push(t.name);
  }
  return out;
}

// ---------------------------------------------------------------- main

export interface DetectResult {
  mapping: Mapping;
  /** Per-tab hint of what Auto thinks it contains (for the manual tab picker). */
  hints: Record<string, string>;
}

export function detectMapping(wb: Workbook): DetectResult {
  const mapping = emptyMapping('auto');
  const hints: Record<string, string> = {};
  const uku = ukuSignals(wb) >= 3;
  if (uku) mapping.template = 'uku';
  const tabs = visible(wb);
  const lists: ListSource[] = [];
  for (const t of tabs) {
    const src = detectListSource(t, uku && /^gamelist$/i.test(t.name.trim()));
    if (src) {
      lists.push(src);
      hints[t.name] = 'Games (list)';
    }
  }
  let games: GameSource[] = lists;
  if (uku) {
    // The template's Gamelist holds every game; other list-like tabs repeat them.
    const gl = lists.filter((l) => /^gamelist$/i.test(l.tab.trim()));
    if (gl.length) games = gl;
  }
  if (!games.length) {
    const grids: GridSource[] = [];
    for (const t of tabs) {
      const g = detectGridSource(t);
      if (g) {
        grids.push(g);
        hints[t.name] = 'Games (grid)';
      }
    }
    games = grids;
  } else if (games.length > 1) {
    // A list without a day column after others usually means the last day ("Finals" tab).
    for (const g of games as ListSource[]) {
      if (g.cols.day === undefined && !g.fixedDay) {
        const tab = wb.tabs.find((t) => t.name === g.tab);
        const days = new Set<string>();
        for (const o of games as ListSource[]) {
          if (o === g || o.cols.day === undefined) continue;
          readGameSource(wb, o, 0).forEach((rg) => rg.dayRaw && days.add(dayName(rg.dayRaw)));
        }
        const all = [...days];
        if (all.length && tab) g.fixedDay = all[all.length - 1];
      }
    }
  }
  mapping.games = games;

  const gameNames = new Set<string>();
  games.forEach((g, i) => readGameSource(wb, g, i).forEach((rg) => {
    if (rg.team1) gameNames.add(foldName(rg.team1));
    if (rg.team2) gameNames.add(foldName(rg.team2));
  }));

  // Pool tables (skip duplicates with the same team set).
  const seenSets: string[] = [];
  for (const t of tabs) {
    for (const p of detectPoolTables(t)) {
      const names: string[] = [];
      for (let r = p.headerRow + 1; r <= p.lastRow; r++) names.push(foldName(cell(t, r, p.teamCol)));
      let key = names.filter(Boolean).sort().join('|');
      // Tables with no names yet (power pools before results) are told apart by their slots.
      if (!key) key = `slots:${p.name}`;
      if (seenSets.includes(key)) continue;
      seenSets.push(key);
      mapping.pools.push(p);
      hints[t.name] ??= 'Pool tables';
    }
  }
  // Seeding and final standings.
  const seedSets: string[] = [];
  const gameTabs = new Set(games.map((g) => g.tab));
  for (const t of tabs) {
    if (gameTabs.has(t.name)) continue;
    const exclude = mapping.pools
      .filter((p) => p.tab === t.name)
      .map((p) => ({ firstRow: p.headerRow, lastRow: p.lastRow, firstCol: Math.min(p.teamCol, p.slotCol ?? p.teamCol, p.seedCol ?? p.teamCol), lastCol: Math.max(...Object.values(p.cols)) }));
    const { seeding, standings } = detectSeedingAndStandings(t, gameNames, exclude);
    for (const s of seeding) {
      const names = colValues(t, s.teamCol, s.firstRow, s.lastRow).map(foldName).filter(Boolean);
      const seen = names.filter((n) => seedSets.includes(n)).length;
      if (seen >= names.length * 0.8) continue;
      seedSets.push(...names);
      mapping.seeding.push(s);
      hints[t.name] ??= 'Seeding';
    }
    mapping.standings.push(...standings);
  }
  // Standings: prefer a tab named for them over stray lists elsewhere.
  const named = mapping.standings.filter((s) => /standing|placing/i.test(s.tab));
  if (named.length) mapping.standings = named;
  const used = new Set<string>([...games.map((g) => g.tab), ...mapping.pools.map((p) => p.tab)]);
  mapping.info = detectInfoTabs(wb, used);
  for (const i of mapping.info) hints[i] ??= 'Rules and info';
  return { mapping, hints };
}

/** Canonical day name from day text: weekday if one is named, else the text itself. */
export function dayName(raw: string): string {
  const wd = parseWeekday(raw);
  if (wd) return wd;
  const m = rowDayMarker([raw]);
  return m?.day ?? clean(raw);
}
