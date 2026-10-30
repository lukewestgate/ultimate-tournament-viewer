import Papa from 'papaparse';
import type {
  CarriedGame,
  DayRules,
  Game,
  HeaderInfo,
  PoolInfo,
  SotgRow,
  Stage,
  Tournament,
} from '../engine/types';
import { zonedToEpoch } from '../engine/time';
import type { TabKey } from '../config';

type Grid = string[][];

export function csvToGrid(text: string): Grid {
  const res = Papa.parse<string[]>(text, { skipEmptyLines: false });
  return res.data.map((row) => row.map((c) => (c ?? '').trim()));
}

const cell = (g: Grid, r: number, c: number) => g[r]?.[c] ?? '';
const isBlankRow = (row: string[] | undefined) => !row || row.every((c) => c === '');
const num = (s: string): number | undefined => {
  if (!/^-?\d+$/.test(s.trim())) return undefined;
  return Number(s);
};
const clean = (s: string) => (s === '#N/A' || s === 'X' ? '' : s);
const toMins = (s: string): number | undefined => {
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};

// ---------------------------------------------------------------- Header

const SECTION_ORDER_HINT = /pools? of|qualification|game rules/i;

export function parseHeader(g: Grid): HeaderInfo {
  const colA = g.map((r) => r[0] ?? '');
  const info: HeaderInfo = {
    isDraft: colA.slice(0, 3).some((s) => s.toUpperCase() === 'DRAFT'),
    announcements: [],
    format: [],
    qualification: { div1: 0, div2: 0 },
    rules: [],
    sections: [],
  };
  info.name = colA.find((s, i) => i < 4 && s && s.toUpperCase() !== 'DRAFT' && !/https?:/.test(s));
  for (const row of g) {
    for (const c of row) {
      const m = /(https?:\/\/\S+)/.exec(c);
      if (m && /spirit|sotg|forms/i.test(c + m[1])) info.sotgFormUrl ??= m[1];
    }
  }

  // Announcements: lines after "Announcements" until the format description starts.
  const annIdx = colA.findIndex((s) => /^announcements?$/i.test(s));
  let i = annIdx >= 0 ? annIdx + 1 : 0;
  if (annIdx >= 0) {
    for (; i < g.length && i < annIdx + 12; i++) {
      if (SECTION_ORDER_HINT.test(colA[i])) break;
      if (colA[i]) info.announcements.push(colA[i]);
    }
  }
  // Format description: from here to "Qualification".
  for (; i < g.length; i++) {
    if (/^qualification$/i.test(colA[i])) break;
    if (colA[i]) info.format.push(colA[i]);
  }

  // Key/value bits.
  let currentDay: string | undefined;
  let rules: DayRules | undefined;
  g.forEach((row, r) => {
    const a = row[0] ?? '';
    const b = row[1] ?? '';
    const dm = /game rules\s*\((sat|sun|fri|mon)/i.exec(a);
    if (dm) {
      currentDay = { sat: 'Saturday', sun: 'Sunday', fri: 'Friday', mon: 'Monday' }[dm[1].toLowerCase()];
      rules = { day: currentDay!, gameMins: 0, gapMins: 0 };
      info.rules.push(rules);
      return;
    }
    if (/^div\s*1$/i.test(a)) info.qualification.div1 = num(b) ?? 0;
    if (/^div\s*2$/i.test(a)) info.qualification.div2 = num(b) ?? 0;
    if (rules) {
      if (/^game length/i.test(a)) rules.gameMins = toMins(b) ?? rules.gameMins;
      else if (/^gap/i.test(a)) rules.gapMins = toMins(b) ?? rules.gapMins;
      else if (/^points cap/i.test(a)) rules.cap = num(b);
      else if (isBlankRow(row) && isBlankRow(g[r + 1])) rules = undefined;
    }
  });

  // Free-text sections for the Info page (everything after the format block).
  const start = colA.findIndex((s) => /^qualification$/i.test(s));
  let sec: { title: string; lines: string[] } | undefined;
  for (let r = Math.max(start, 0); r < g.length; r++) {
    const a = colA[r];
    if (!a) continue;
    const b = g[r][1] ?? '';
    const prevBlank = !colA[r - 1];
    const nextHas = !!colA[r + 1];
    const looksHeading = !b && prevBlank && nextHas && a.length < 45 && !/[.,:]$/.test(a);
    if (looksHeading || !sec) {
      sec = { title: looksHeading ? a : '', lines: [] };
      info.sections.push(sec);
      if (looksHeading) continue;
    }
    sec.lines.push(b ? `${a}: ${b}` : a);
  }
  return info;
}

// ---------------------------------------------------------------- Seeding

export function parseSeeding(g: Grid) {
  const seeds: { seed: number; team: string }[] = [];
  const slots: { slot: string; seed: number; team?: string }[] = [];
  for (const row of g) {
    const s = num(row[1] ?? '');
    if (s !== undefined && row[2]) seeds.push({ seed: s, team: row[2] });
    // Slot table: a cell like "A1" followed by a seed number.
    for (let c = 3; c < row.length - 1; c++) {
      if (/^[A-Z]\d$/.test(row[c]) && num(row[c + 1]) !== undefined) {
        slots.push({ slot: row[c], seed: num(row[c + 1])!, team: clean(row[c + 2] ?? '') || undefined });
        break;
      }
    }
  }
  return { seeds, slots };
}

// ---------------------------------------------------------------- Schedule (dates)

export function parseScheduleDates(g: Grid): Record<string, string> {
  const out: Record<string, string> = {};
  let day: string | undefined;
  for (const row of g) {
    const label = row.find((c) => /^(Friday|Saturday|Sunday|Monday)$/.test(c));
    if (label) day = label;
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(row[0] ?? '');
    if (day && m && !out[day]) out[day] = `${m[3]}-${m[2]}-${m[1]}`;
  }
  return out;
}

// ---------------------------------------------------------------- Pool Results

export function parsePoolResults(g: Grid): PoolInfo[] {
  const pools: PoolInfo[] = [];
  for (let r = 0; r < g.length; r++) {
    const row = g[r];
    if (!(/^[A-Z]$/.test(row[1] ?? '') && row[2] === 'Team')) continue;
    const letter = row[1];
    const hdr = row;
    const col = (name: string, from = 0) => hdr.indexOf(name, from);
    const cPool = col('Pool');
    const cSeed = col('Seed', cPool);
    const cTeam = col('Team', cPool);
    const cW = col('W', cPool);
    const cL = col('L', cPool);
    const cD = col('D', cPool);
    const cPts = col('Pts', cPool);
    const cRank = col('Rank', cPool);
    const pool: PoolInfo = { letter, stage: 1, slots: [], finishToSeed: {}, carried: [], sheetRows: [] };
    for (let k = r + 1; k < g.length; k++) {
      const x = g[k];
      if (isBlankRow(x) || (/^[A-Z]$/.test(x[1] ?? '') && x[2] === 'Team')) break;
      // Left table: game rows.
      const code = x[1] ?? '';
      const gm = /^([A-Z]\d)v([A-Z]\d)$/.exec(code);
      if (gm && /carried/i.test(x[7] ?? '')) pool.carried.push({ pool: letter, lo: gm[1], hi: gm[2] } as CarriedGame);
      // Middle table: standings.
      if (cPool >= 0 && /^[A-Z]\d$/.test(x[cPool] ?? '')) {
        const slot = x[cPool];
        const seed = num(x[cSeed] ?? '');
        if (seed !== undefined) pool.slots.push({ slot, seed });
        pool.sheetRows.push({
          slot,
          team: clean(x[cTeam] ?? '') || undefined,
          w: num(x[cW] ?? ''),
          l: num(x[cL] ?? ''),
          d: num(x[cD] ?? ''),
          pts: num(x[cPts] ?? ''),
          rank: num(x[cRank] ?? ''),
        });
      }
      // Right table: "1A" -> seed.
      for (let c = Math.max(cRank, 0) + 1; c < x.length - 1; c++) {
        const fm = /^(\d+)([A-Z])$/.exec(x[c]);
        const seed = num(x[c + 1] ?? '');
        if (fm && fm[2] === letter && seed !== undefined) {
          pool.finishToSeed[Number(fm[1])] = seed;
          break;
        }
      }
    }
    pools.push(pool);
  }
  return pools;
}

// ---------------------------------------------------------------- Gamelist

export function parseGamelist(
  g: Grid,
  dayDates: Record<string, string>,
  rules: DayRules[],
  tz: string,
  warnings: string[],
): Game[] {
  const h = g.findIndex((r) => r[0] === 'Game');
  if (h < 0) {
    warnings.push('Gamelist: header row not found');
    return [];
  }
  const hdr = g[h];
  const cDay = hdr.indexOf('Day');
  const cTime = hdr.indexOf('Time');
  const cPitch = hdr.indexOf('Pitch');
  const cT1 = hdr.indexOf('Team');
  const cT2 = hdr.indexOf('Team', cT1 + 1);
  const cLeft = hdr.findIndex((c) => /^left team$/i.test(c));
  const cRight = hdr.findIndex((c) => /^right team$/i.test(c));
  // Scores sit between the two team columns, either side of the "v".
  const cS1 = cT1 + 1;
  const cS2 = cT2 - 1;

  const games: Game[] = [];
  const seen = new Set<string>();
  for (let r = h + 1; r < g.length; r++) {
    const x = g[r];
    const id = x[0];
    if (!id) continue;
    const day = x[cDay];
    const time = x[cTime];
    const date = dayDates[day];
    if (!date || !/^\d{1,2}:\d{2}$/.test(time)) {
      warnings.push(`Gamelist row ${r + 1}: missing day/time for ${id}`);
      continue;
    }
    const rule = rules.find((ru) => ru.day === day);
    const gameMins = rule?.gameMins || 24;
    const gapMins = rule?.gapMins || 6;
    const lo = cLeft >= 0 ? x[cLeft] : '';
    const hi = cRight >= 0 ? x[cRight] : '';
    const pm = /^([A-Z])\d$/.exec(lo);
    const placement = /^\d+$/.test(lo) && /^\d+$/.test(hi);
    const stage: Stage = placement ? 'placement' : 'pool';
    let uid = id;
    for (let n = 2; seen.has(uid); n++) uid = `${id}#${n}`;
    seen.add(uid);
    const start = zonedToEpoch(date, time.padStart(5, '0'), tz);
    games.push({
      id: uid,
      code: id.replace(/^\[|\]$/g, ''),
      ordinal: games.length,
      day,
      time: time.padStart(5, '0'),
      start,
      end: start + gameMins * 60_000,
      slotEnd: start + (gameMins + gapMins) * 60_000,
      pitch: num(x[cPitch]) ?? 0,
      stage,
      pool: pm ? pm[1] : undefined,
      lo,
      hi,
      sheetLo: clean(x[cT1]) || undefined,
      sheetHi: clean(x[cT2]) || undefined,
      scoreLo: num(x[cS1] ?? ''),
      scoreHi: num(x[cS2] ?? ''),
      isGameToGo: /^\[.*\]$/.test(id),
    });
  }
  return games;
}

// ---------------------------------------------------------------- Final standings / SOTG

export function parseStandings(g: Grid) {
  const h = g.findIndex((r) => r[0] === 'Rank');
  if (h < 0) return [];
  const cTeam = g[h].indexOf('Team');
  const out: { rank: number; team?: string }[] = [];
  for (let r = h + 1; r < g.length; r++) {
    const rank = num(g[r][0] ?? '');
    if (rank === undefined) continue;
    out.push({ rank, team: clean(cell(g, r, cTeam)) || undefined });
  }
  return out;
}

export function parseSotg(g: Grid): SotgRow[] {
  const h = g.findIndex((r) => /^your team$/i.test(r[0] ?? ''));
  if (h < 0) return [];
  const out: SotgRow[] = [];
  for (let r = h + 1; r < g.length; r++) {
    const team = g[r][0];
    if (!team) continue;
    out.push({ team, submitted: num(g[r][1]) ?? 0, received: num(g[r][2]) ?? 0, played: num(g[r][3]) ?? 0 });
  }
  return out;
}

// ---------------------------------------------------------------- Assemble

export function buildTournament(
  raw: Partial<Record<TabKey, string>>,
  opts: { tz: string; fallbackDates: Record<string, string> },
): Tournament {
  const warnings: string[] = [];
  const grid = (k: TabKey) => {
    const t = raw[k];
    if (!t) return [] as Grid;
    try {
      return csvToGrid(t);
    } catch (e) {
      warnings.push(`${k}: ${(e as Error).message}`);
      return [] as Grid;
    }
  };

  const header = parseHeader(grid('header'));
  if (!header.rules.length) {
    header.rules = [
      { day: 'Saturday', gameMins: 24, gapMins: 6 },
      { day: 'Sunday', gameMins: 28, gapMins: 7 },
    ];
    warnings.push('Header: game rules not found, using defaults');
  }
  const { seeds, slots } = parseSeeding(grid('seeding'));
  const dayDates = { ...opts.fallbackDates, ...parseScheduleDates(grid('schedule')) };
  const pools = parsePoolResults(grid('poolResults'));
  const games = parseGamelist(grid('gamelist'), dayDates, header.rules, opts.tz, warnings);

  // Fill pool slots/teams from the Seeding tab, and classify stage.
  const seedTeam = new Map(seeds.map((s) => [s.seed, s.team]));
  for (const p of pools) {
    for (const s of p.slots) {
      const fromSeeding = slots.find((x) => x.slot === s.slot);
      if (fromSeeding?.team) s.team = fromSeeding.team;
    }
    if (!p.slots.length) {
      p.slots = slots.filter((x) => x.slot[0] === p.letter).map((x) => ({ ...x }));
    }
    p.stage = p.slots.every((s) => s.team) ? 1 : 2;
    // Fallback for finish -> seed: k-th best seed in the pool.
    if (!Object.keys(p.finishToSeed).length) {
      const sorted = p.slots.map((s) => s.seed).sort((a, b) => a - b);
      sorted.forEach((seed, k) => (p.finishToSeed[k + 1] = seed));
    }
  }
  // Pools present in the gamelist but missing from Pool Results.
  const known = new Set(pools.map((p) => p.letter));
  for (const gm of games) {
    if (gm.pool && !known.has(gm.pool)) {
      known.add(gm.pool);
      const ps = slots.filter((x) => x.slot[0] === gm.pool).map((x) => ({ ...x, team: x.team ?? seedTeam.get(x.seed) }));
      const sorted = ps.map((s) => s.seed).sort((a, b) => a - b);
      pools.push({
        letter: gm.pool,
        stage: ps.every((s) => s.team) ? 1 : 2,
        slots: ps,
        finishToSeed: Object.fromEntries(sorted.map((s, k) => [k + 1, s])),
        carried: [],
        sheetRows: [],
      });
      warnings.push(`Pool ${gm.pool} missing from Pool Results; derived from Seeding`);
    }
  }
  pools.sort((a, b) => a.letter.localeCompare(b.letter));
  for (const gm of games) {
    if (gm.stage === 'pool' && gm.pool) {
      const p = pools.find((x) => x.letter === gm.pool);
      if (p?.stage === 2) gm.stage = 'powerPool';
    }
  }

  // Scores might be entered on Pool Results instead of the Gamelist.
  const pr = grid('poolResults');
  for (const row of pr) {
    const gm = games.find((x) => x.id === row[1]);
    if (!gm) continue;
    if (gm.scoreLo === undefined) gm.scoreLo = num(row[3] ?? '');
    if (gm.scoreHi === undefined) gm.scoreHi = num(row[5] ?? '');
  }

  return {
    header,
    seeds,
    pools,
    games,
    finalStandings: parseStandings(grid('standings')),
    sotg: parseSotg(grid('sotg')),
    dayDates,
    warnings,
  };
}
