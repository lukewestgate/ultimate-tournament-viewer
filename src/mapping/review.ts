import type { Game, Pool, Tournament } from '../model/types';
import type { GameSource, Mapping } from './types';
import { cell, colName, findTab, type Workbook } from '../sheets/workbook';
import { mergeSuggestions } from '../extract/quality';
import { ROLE_LABEL } from './manual';
import { poolName } from './detect';

/**
 * Checking a reading by eye (spec §9.13): what each part of the mapping reads from where, per-row oddities that
 * suggest something was read wrongly, and what changed between two readings. Pure functions, so the screen
 * stays a view.
 */

export type Area = 'sheet' | 'games' | 'teams' | 'pools' | 'days';

export interface Oddity {
  area: Area;
  /** 'problem': probably read wrongly; 'check': worth a look, may be fine. */
  level: 'problem' | 'check';
  text: string;
  /** What it's about: game ids, team keys ("division::name"), pool keys ("division::name") or day names. */
  refs: string[];
}

export const teamRef = (division: string | undefined, name: string) => `${division ?? ''}::${name}`;
const poolRef = (p: Pool) => `${p.division ?? ''}::${p.name}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const quote = (s: string) => `“${s}”`;
const list = (xs: string[], n = 3) => xs.slice(0, n).join(', ') + (xs.length > n ? `, and ${xs.length - n} more` : '');
const real = (t: Tournament) => t.games.filter((g) => !g.isBye && !g.unscheduled);
const both = (g: Game) => g.scores[0] !== undefined && g.scores[1] !== undefined;
const side = (g: Game, i: 0 | 1) => g.teams[i] ?? g.slots[i] ?? g.labels?.[i];
const minutes = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};

// ---------------------------------------------------------------- games

/** Why each game looks odd, by game id. Empty for games that look fine. */
export function gameFlags(t: Tournament): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const flag = (g: Game, why: string) => {
    const xs = out.get(g.id) ?? [];
    if (!xs.includes(why)) out.set(g.id, [...xs, why]);
  };
  const games = real(t);
  for (const g of games) {
    if (t.divisions.length && !g.division) flag(g, 'No division');
    const [a, b] = [side(g, 0), side(g, 1)];
    if (!a !== !b) flag(g, 'Only one team');
    if (g.teams[0] && g.teams[0] === g.teams[1]) flag(g, 'Plays itself');
    if ((g.scores[0] === undefined) !== (g.scores[1] === undefined)) flag(g, 'One score missing');
    if ((g.scores[0] ?? 0) > 60 || (g.scores[1] ?? 0) > 60) flag(g, 'Score over 60');
    const m = minutes(g.time);
    if (m !== undefined && (m < 7 * 60 || m > 21 * 60)) flag(g, `Odd time (${g.time})`);
  }
  // Clashes: a team in two games at once, two games on one pitch at once, the same game twice.
  const byDay = new Map<string, Game[]>();
  for (const g of games) byDay.set(g.day, [...(byDay.get(g.day) ?? []), g]);
  for (const day of byDay.values()) {
    for (let i = 0; i < day.length; i++) {
      for (let j = i + 1; j < day.length; j++) {
        const [x, y] = [day[i], day[j]];
        if (!(x.start < y.end && y.start < x.end)) continue;
        const shared = x.teams.filter((n) => n && y.teams.includes(n) && (x.division === y.division || !x.division || !y.division));
        const same = shared.length === 2 || (shared.length === 1 && x.teams[0] === x.teams[1]);
        if (same && x.start === y.start) {
          flag(x, 'Same game twice');
          flag(y, 'Same game twice');
        } else if (shared.length) {
          flag(x, `${shared[0]} plays two games at once`);
          flag(y, `${shared[0]} plays two games at once`);
        }
        if (x.pitch.label && x.pitch.label === y.pitch.label && x.start === y.start) {
          flag(x, `Pitch ${x.pitch.label} has two games at once`);
          flag(y, `Pitch ${x.pitch.label} has two games at once`);
        }
      }
    }
  }
  return out;
}

/** Games per team, by team key, counting scheduled games only. */
export function gamesPerTeam(t: Tournament): Map<string, number> {
  const n = new Map<string, number>();
  for (const g of real(t)) for (const name of new Set(g.teams)) if (name) n.set(teamRef(g.division, name), (n.get(teamRef(g.division, name)) ?? 0) + 1);
  return n;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** Per-team oddities, by team key. */
export function teamFlags(t: Tournament, m: Mapping): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const flag = (k: string, why: string) => out.set(k, [...(out.get(k) ?? []), why]);
  const counts = gamesPerTeam(t);
  const divs = t.divisions.length ? t.divisions.map((d) => d.name as string | undefined) : [undefined];
  if (t.divisions.length && t.teams.some((x) => !x.division)) divs.push(undefined);
  const seeded = new Set(t.seeding.map((s) => teamRef(s.division, s.team)));
  const seededDivs = new Set(t.seeding.map((s) => s.division ?? ''));
  for (const d of divs) {
    const ts = t.teams.filter((x) => x.division === d);
    const mid = median(ts.map((x) => counts.get(teamRef(d, x.name)) ?? 0));
    for (const x of ts) {
      const k = teamRef(d, x.name);
      const n = counts.get(k) ?? 0;
      if (!n) flag(k, 'Plays no games');
      else if (mid >= 3 && n <= mid / 2) flag(k, `Plays ${plural(n, 'game')} (most play ${mid})`);
      if (seededDivs.has(d ?? '') && !seeded.has(k)) flag(k, 'Not in the seeding list');
      if (t.divisions.length && !d) flag(k, 'In no division');
    }
  }
  for (const s of mergeSuggestions(t, m.corrections.rejectedMerges)) flag(teamRef(s.division, s.merge), `May be the same team as ${quote(s.keep)}`);
  return out;
}

/** Per-pool oddities, by pool key: the sheet's own table against the games read. */
export function poolFlags(t: Tournament): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const p of t.pools) {
    const xs: string[] = [];
    const games = t.games.filter((g) => !g.isBye && g.pool === p.name && g.division === p.division);
    const teams = new Set(p.slots.map((s) => s.team).filter(Boolean));
    if (!games.length) xs.push('No games read for this pool');
    for (const r of p.sheetTable ?? []) {
      if (teams.size && !teams.has(r.team)) xs.push(`${quote(r.team)} is in the sheet's table but not in the pool`);
      const said = r.p ?? (r.w !== undefined && r.l !== undefined ? r.w + r.l + (r.d ?? 0) : undefined);
      const played = games.filter((g) => g.teams.includes(r.team) && (both(g) || g.marks)).length;
      if (said !== undefined && games.some(both) && said !== played) xs.push(`The sheet says ${r.team} played ${said}, the games read show ${played}`);
    }
    if (xs.length) out.set(poolRef(p), xs);
  }
  return out;
}

/** Everything worth a look, most serious first. Quality-check problems are listed separately by the caller. */
export function oddities(t: Tournament, m: Mapping, wb?: Workbook): Oddity[] {
  const out: Oddity[] = [];
  // Games, one line per kind of flag.
  const byKind = new Map<string, string[]>();
  for (const [id, xs] of gameFlags(t)) for (const x of xs) {
    const kind = x.replace(/^.* plays two games at once$/, 'A team plays two games at once').replace(/^Pitch .* has two games at once$/, 'A pitch has two games at once').replace(/^Odd time.*/, 'Odd time');
    byKind.set(kind, [...(byKind.get(kind) ?? []), id]);
  }
  const GAME_TEXT: Record<string, [Oddity['level'], (n: number) => string]> = {
    'Plays itself': ['problem', (n) => `${plural(n, 'game has', 'games have')} the same team on both sides`],
    'Same game twice': ['problem', (n) => `${plural(n, 'game is', 'games are')} listed twice at the same time`],
    'A team plays two games at once': ['problem', (n) => `${plural(n, 'game has', 'games have')} a team playing two games at once`],
    'A pitch has two games at once': ['check', (n) => `${plural(n, 'game shares', 'games share')} a pitch and a start time with another`],
    'Only one team': ['check', (n) => `${plural(n, 'game has', 'games have')} only one team`],
    'One score missing': ['check', (n) => `${plural(n, 'game has', 'games have')} only one score`],
    'Score over 60': ['problem', (n) => `${plural(n, 'score looks', 'scores look')} like something else (over 60)`],
    'Odd time': ['check', (n) => `${plural(n, 'game starts', 'games start')} before 7:00 or after 21:00`],
    'No division': ['problem', (n) => `${plural(n, 'game isn’t', 'games aren’t')} in any division`],
  };
  for (const [kind, ids] of byKind) {
    const [level, text] = GAME_TEXT[kind] ?? ['check', (n: number) => `${plural(n, 'game')}: ${kind}`];
    out.push({ area: 'games', level, text: text(ids.length), refs: ids });
  }
  const unscheduled = t.games.filter((g) => g.unscheduled && !g.isBye);
  if (unscheduled.length) out.push({ area: 'games', level: 'check', text: `${plural(unscheduled.length, 'row was', 'rows were')} read as games with no pitch or day, and left off the schedule`, refs: unscheduled.map((g) => g.id) });

  // Teams.
  const tf = teamFlags(t, m);
  const teamsWith = (re: RegExp) => [...tf].filter(([, xs]) => xs.some((x) => re.test(x))).map(([k]) => k);
  const name = (k: string) => k.slice(k.indexOf('::') + 2);
  const few = teamsWith(/^Plays \d+ games? \(most/);
  const none = teamsWith(/^Plays no games/);
  const unseeded = teamsWith(/^Not in the seeding list/);
  const same = teamsWith(/^May be the same team/);
  if (none.length) out.push({ area: 'teams', level: 'check', text: `${plural(none.length, 'team plays', 'teams play')} no games: ${list(none.map(name))}`, refs: none });
  if (few.length) out.push({ area: 'teams', level: 'check', text: `${plural(few.length, 'team plays', 'teams play')} far fewer games than the rest: ${list(few.map(name))}`, refs: few });
  if (unseeded.length) out.push({ area: 'teams', level: 'check', text: `${plural(unseeded.length, 'team isn’t', 'teams aren’t')} in the seeding list, so may be misspelt: ${list(unseeded.map(name))}`, refs: unseeded });
  if (same.length) out.push({ area: 'teams', level: 'check', text: `${plural(same.length, 'name looks', 'names look')} like another team’s: ${list(same.map(name))}`, refs: same });

  // Pools.
  for (const [k, xs] of poolFlags(t)) out.push({ area: 'pools', level: 'check', text: `Pool ${name(k)}${k.startsWith('::') ? '' : ` (${k.slice(0, k.indexOf('::'))})`}: ${xs[0]}${xs.length > 1 ? ` (and ${xs.length - 1} more)` : ''}`, refs: [k] });

  // Days.
  for (const d of t.days) if (d.dateSource === 'guessed') out.push({ area: 'days', level: 'check', text: `The date for ${d.name} is a guess (${d.date})`, refs: [d.name] });

  // How the sheet is read.
  if (wb) for (const x of headerMismatches(m, wb)) out.push({ area: 'sheet', level: 'check', text: x, refs: [] });
  // Guessed dates are listed per day above.
  for (const w of t.warnings) if (!/^Dates were guessed/.test(w)) out.push({ area: 'sheet', level: 'check', text: w, refs: [] });

  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'problem' ? -1 : 1));
}

// ---------------------------------------------------------------- where it's read from

/** What a header says a column holds; used to spot a column read as something its header disagrees with. */
const HEADER_HINT: [string, RegExp][] = [
  ['time', /\b(time|start|kick.?off)\b/i],
  ['pitch', /\b(pitch|field|court)\b/i],
  ['day', /\b(day|date)\b/i],
  ['division', /\b(division|div|category|comp(etition)?)\b/i],
  ['team', /\b(team|home|away)\b/i],
  ['score', /\b(score|result|goals)\b/i],
];
const familyOf = (role: string) => (/^team|^slot/.test(role) ? 'team' : /^score/.test(role) ? 'score' : role === 'sharedTime' ? 'time' : role);

/** Columns read as one thing whose header says another ("Column E is read as Team 1, but its header says Pitch"). */
export function headerMismatches(m: Mapping, wb: Workbook): string[] {
  const out: string[] = [];
  for (const src of m.games) {
    if (src.kind !== 'list') continue;
    const tab = findTab(wb, src.tab);
    if (!tab) continue;
    for (const [role, c] of Object.entries(src.cols)) {
      if (c === undefined || c < 0 || role === 'bracket' || role === 'code') continue;
      const h = cell(tab, src.headerRow, c).trim();
      if (!h) continue;
      const says = HEADER_HINT.filter(([, re]) => re.test(h)).map(([f]) => f);
      if (says.length && !says.includes(familyOf(role))) out.push(`On ${quote(src.tab)}, column ${colName(c)} is read as ${ROLE_LABEL[role] ?? role}, but its header says ${quote(h)}`);
    }
  }
  return out;
}

export interface SourceCard {
  kind: 'games' | 'pool' | 'seeding' | 'standings';
  title: string;
  tab: string;
  /** Plain-language facts about this part of the mapping. */
  lines: string[];
  /** The columns read, left to right. */
  cols: { col: number; role: string; label: string }[];
  /** 0-based header row, when there is one. */
  header?: number;
  /** 0-based first and last rows read (inclusive). */
  rows: [number, number];
  /** How many items this part produced (games, teams…), when known. */
  count?: string;
}

const colsOf = (pairs: [string, number | undefined][]) =>
  pairs
    .filter((x): x is [string, number] => x[1] !== undefined && x[1] >= 0)
    .map(([role, col]) => ({ col, role, label: ROLE_LABEL[role] ?? role }))
    .sort((a, b) => a.col - b.col);

const rowSpan = (a: number, b: number) => (a === b ? `row ${a + 1}` : `rows ${a + 1}–${b + 1}`);

/** One card per part of the mapping: what it reads, from which rows and columns. */
export function describeSources(m: Mapping, wb: Workbook, t?: Tournament): SourceCard[] {
  const out: SourceCard[] = [];
  const lastRowOf = (tabName: string) => Math.max(0, (findTab(wb, tabName)?.rows.length ?? 1) - 1);
  m.games.forEach((src: GameSource) => {
    const last = Math.min(src.lastRow ?? lastRowOf(src.tab), lastRowOf(src.tab));
    const read = t?.games.filter((g) => g.ref.slice(0, g.ref.lastIndexOf('!')) === src.tab).length;
    const fixed = [src.fixedDay && `every game is on ${src.fixedDay}`, src.fixedDivision && `every game is in ${src.fixedDivision}`].filter(Boolean).join(', ');
    if (src.kind === 'list') {
      out.push({
        kind: 'games',
        title: `Games · a list on ${quote(src.tab)}`,
        tab: src.tab,
        lines: [`One game per row: header ${rowSpan(src.headerRow, src.headerRow)}, games from ${rowSpan(src.headerRow + 1, last)}${src.lastRow === undefined ? ' (to the end of the tab)' : ''}`, ...(fixed ? [`No day or division column, so ${fixed}`] : [])],
        cols: colsOf(Object.entries(src.cols) as [string, number | undefined][]),
        header: src.headerRow,
        rows: [src.headerRow + 1, last],
        count: read !== undefined ? plural(read, 'game') : undefined,
      });
    } else {
      const first = src.blocks[0];
      out.push({
        kind: 'games',
        title: `Games · a grid on ${quote(src.tab)}`,
        tab: src.tab,
        lines: [
          `Time down the side, one block of columns per pitch, from ${rowSpan(src.firstRow, last)}`,
          `Pitches: ${src.blocks.map((b) => `${b.pitch} (from column ${colName(b.sep)})`).join(', ')}`,
          ...(fixed ? [`No day or division in the grid, so ${fixed}`] : []),
        ],
        cols: first ? colsOf([['sep', first.sep], ...(Object.entries(src.offsets).map(([k, v]) => [k, v === undefined ? undefined : first.sep + v]) as [string, number | undefined][]), ['sharedTime', src.timeCol]]) : [],
        rows: [src.firstRow, last],
        count: read !== undefined ? plural(read, 'game') : undefined,
      });
    }
  });
  for (const p of m.pools) {
    const name = poolName(p.name);
    const pool = t?.pools.find((x) => x.name === name);
    out.push({
      kind: 'pool',
      title: `Pool ${name} table · ${quote(p.tab)}`,
      tab: p.tab,
      lines: [`Header ${rowSpan(p.headerRow, p.headerRow)}, teams in ${rowSpan(p.headerRow + 1, p.lastRow)}`],
      cols: colsOf([['team', p.teamCol], ['slot', p.slotCol], ['seed', p.seedCol], ...(Object.entries(p.cols) as [string, number | undefined][])]),
      header: p.headerRow,
      rows: [p.headerRow + 1, p.lastRow],
      count: pool ? plural(pool.slots.length, 'team') : undefined,
    });
  }
  for (const s of m.seeding) {
    out.push({
      kind: 'seeding',
      title: `Seeding${s.label ? ` · ${s.label}` : ''} · ${quote(s.tab)}`,
      tab: s.tab,
      lines: [`Seeds in ${rowSpan(s.firstRow, s.lastRow)}`],
      cols: colsOf([['seed', s.seedCol], ['team', s.teamCol]]),
      rows: [s.firstRow, s.lastRow],
      count: plural(s.lastRow - s.firstRow + 1, 'row'),
    });
  }
  for (const s of m.standings) {
    out.push({
      kind: 'standings',
      title: `Final standings${s.label ? ` · ${s.label}` : ''} · ${quote(s.tab)}`,
      tab: s.tab,
      lines: [`Places in ${rowSpan(s.firstRow, s.lastRow)}`],
      cols: colsOf([['rank', s.placeCol], ['team', s.teamCol]]),
      rows: [s.firstRow, s.lastRow],
    });
  }
  return out;
}

/** The corrections and rules in plain words, one line each. */
export function describeCorrections(m: Mapping): string[] {
  const c = m.corrections;
  const out: string[] = [];
  for (const [d, v] of Object.entries(c.dates)) out.push(`${d} is on ${v}`);
  for (const [d, v] of Object.entries(c.gameLength)) out.push(`Games on ${d} last ${v} min`);
  for (const [d, v] of Object.entries(c.delays)) if (v) out.push(`${d.replace('|', ' · ')} is running ${v} min late`);
  for (const [a, b] of Object.entries(c.aliases)) out.push(`${quote(a)} is the same team as ${quote(b)}`);
  for (const [a, b] of Object.entries(c.divisionNames)) out.push(`Division ${quote(a)} is shown as ${quote(b)}`);
  for (const [a, b] of Object.entries(c.teamDivisions ?? {})) out.push(`${quote(a.includes('::') ? a.slice(a.indexOf('::') + 2) : a)}${a.includes('::') ? ` (read into ${a.slice(0, a.indexOf('::'))})` : ''} is moved to ${b}`);
  for (const [a, b] of Object.entries(c.gameDivisions ?? {})) out.push(`The game on ${a} is put in ${b}`);
  for (const r of c.ignoreRows ?? []) out.push(`${r} is ignored (not a game)`);
  if (c.title) out.push(`Title shown as ${quote(c.title)}`);
  if (c.timeZone) out.push(`Times are in ${c.timeZone}`);
  if (m.rules) out.push(`Points: win ${m.rules.points.win}, draw ${m.rules.points.draw}, loss ${m.rules.points.loss}${m.rules.tiebreaks.length ? `; tie-breaks: ${m.rules.tiebreaks.join(', ')}` : ''} (${m.rules.source === 'ai' ? 'from AI' : m.rules.source === 'user' ? 'set by you' : m.rules.source})`);
  return out;
}

/** The sheet cells behind one game, each with what it was read as. */
export function cellsForGame(m: Mapping, wb: Workbook, ref: string): { addr: string; label: string; text: string }[] {
  const at = ref.lastIndexOf('!');
  const tabName = ref.slice(0, at);
  const where = ref.slice(at + 1);
  const tab = findTab(wb, tabName);
  if (!tab) return [];
  const out: { addr: string; label: string; text: string }[] = [];
  const add = (role: string, r: number, c: number) => out.push({ addr: `${colName(c)}${r + 1}`, label: ROLE_LABEL[role] ?? role, text: cell(tab, r, c) });
  if (/^\d+$/.test(where)) {
    const r = Number(where) - 1;
    const src = m.games.find((g) => g.kind === 'list' && g.tab === tabName && r > g.headerRow && r <= (g.lastRow ?? Infinity));
    if (src?.kind !== 'list') return [];
    for (const x of colsOf(Object.entries(src.cols) as [string, number | undefined][])) add(x.role, r, x.col);
    return out;
  }
  const mm = /^([A-Z]+)(\d+)$/.exec(where);
  if (!mm) return [];
  const sep = [...mm[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const r = Number(mm[2]) - 1;
  const src = m.games.find((g) => g.kind === 'grid' && g.tab === tabName && g.blocks.some((b) => b.sep === sep));
  if (src?.kind !== 'grid') return [];
  if (src.timeCol !== undefined) add('time', r, src.timeCol);
  for (const x of colsOf(Object.entries(src.offsets).map(([k, v]) => [k, v === undefined ? undefined : sep + v]) as [string, number | undefined][])) add(x.role, r, x.col);
  return out;
}

// ---------------------------------------------------------------- comparing two readings

export interface Reading {
  mapping: Mapping;
  t: Tournament;
}

export interface GameChange {
  was?: Game;
  now?: Game;
  /** What changed, in words ("time 10:00 → 10:30"). Empty for added and removed games. */
  what: string[];
}

export interface ReadingDiff {
  /** Lines describing the mapping that only one reading has. */
  mapping: { removed: string[]; added: string[] };
  games: GameChange[];
  teams: { added: string[]; removed: string[]; moved: { name: string; from?: string; to?: string }[] };
  pools: { key: string; what: string }[];
  days: { name: string; what: string }[];
  /** Number of differences of any kind. */
  total: number;
}

const gameLabel = (g: Game) => `${side(g, 0) ?? '?'} v ${side(g, 1) ?? '?'}`;
const score = (g: Game) => (both(g) ? `${g.scores[0]}–${g.scores[1]}` : 'no score');

/** Every line a mapping can be described by, for a line-by-line comparison. */
function mappingLines(m: Mapping, wb: Workbook): string[] {
  const lines: string[] = [];
  for (const s of describeSources(m, wb)) {
    lines.push(s.title);
    for (const l of s.lines) lines.push(`${s.title}: ${l}`);
    if (s.cols.length) lines.push(`${s.title}: columns ${s.cols.map((c) => `${c.label} = ${colName(c.col)}`).join(', ')}`);
  }
  if (m.info.length) lines.push(`Rules and format text from ${m.info.map(quote).join(', ')}`);
  return [...lines, ...describeCorrections(m)];
}

/** What changed from reading `a` to reading `b`. */
export function diffReadings(a: Reading, b: Reading, wb: Workbook): ReadingDiff {
  const la = mappingLines(a.mapping, wb);
  const lb = mappingLines(b.mapping, wb);
  const mapping = { removed: la.filter((x) => !lb.includes(x)), added: lb.filter((x) => !la.includes(x)) };

  // Games: matched by where they are in the sheet, then by day, time and pitch.
  const games: GameChange[] = [];
  const unmatched = new Map(b.t.games.map((g) => [g.ref, g]));
  const slotKey = (g: Game) => `${g.day}|${g.time}|${g.pitch.label}|${g.division ?? ''}`;
  const pairs: [Game, Game | undefined][] = [];
  for (const g of a.t.games) {
    const n = unmatched.get(g.ref);
    if (n) unmatched.delete(g.ref);
    pairs.push([g, n]);
  }
  const bySlot = new Map<string, Game>();
  for (const g of unmatched.values()) if (!bySlot.has(slotKey(g))) bySlot.set(slotKey(g), g);
  for (const p of pairs) {
    if (p[1]) continue;
    const n = bySlot.get(slotKey(p[0]));
    if (n && unmatched.has(n.ref)) {
      p[1] = n;
      unmatched.delete(n.ref);
      bySlot.delete(slotKey(p[0]));
    }
  }
  for (const [was, now] of pairs) {
    if (!now) {
      games.push({ was, what: [] });
      continue;
    }
    const what: string[] = [];
    const ch = (label: string, x: string | undefined, y: string | undefined) => x !== y && what.push(`${label} ${x || '–'} → ${y || '–'}`);
    ch('teams', gameLabel(was), gameLabel(now));
    ch('day', was.day, now.day);
    ch('time', was.time, now.time);
    ch('pitch', was.pitch.label, now.pitch.label);
    ch('division', was.division, now.division);
    ch('code', was.code, now.code);
    ch('score', score(was), score(now));
    if (!!was.unscheduled !== !!now.unscheduled) what.push(now.unscheduled ? 'now left off the schedule' : 'now on the schedule');
    if (what.length) games.push({ was, now, what });
  }
  for (const now of unmatched.values()) games.push({ now, what: [] });

  // Teams, by division and name; the same name in a new division is a move.
  const keys = (t: Tournament) => new Set(t.teams.map((x) => teamRef(x.division, x.name)));
  const ka = keys(a.t);
  const kb = keys(b.t);
  const removed = [...ka].filter((k) => !kb.has(k));
  const added = [...kb].filter((k) => !ka.has(k));
  const nameOf = (k: string) => k.slice(k.indexOf('::') + 2);
  const divOf = (k: string) => k.slice(0, k.indexOf('::')) || undefined;
  const moved: ReadingDiff['teams']['moved'] = [];
  for (const k of [...removed]) {
    const to = added.find((x) => nameOf(x) === nameOf(k));
    if (!to) continue;
    moved.push({ name: nameOf(k), from: divOf(k), to: divOf(to) });
    removed.splice(removed.indexOf(k), 1);
    added.splice(added.indexOf(to), 1);
  }

  // Pools: which exist, and who's in them.
  const pools: ReadingDiff['pools'] = [];
  const pa = new Map(a.t.pools.map((p) => [poolRef(p), p]));
  const pb = new Map(b.t.pools.map((p) => [poolRef(p), p]));
  const who = (p: Pool) => p.slots.map((s) => s.team ?? s.slot).join(', ');
  for (const [k, p] of pa) {
    const q = pb.get(k);
    if (!q) pools.push({ key: k, what: 'no longer read' });
    else if (who(p) !== who(q)) pools.push({ key: k, what: `teams ${who(p) || '–'} → ${who(q) || '–'}` });
  }
  for (const k of pb.keys()) if (!pa.has(k)) pools.push({ key: k, what: `newly read (${who(pb.get(k)!)})` });

  // Days and their timing.
  const days: ReadingDiff['days'] = [];
  const timing = (t: Tournament, d: string) => t.timing.find((x) => x.day === d);
  for (const d of a.t.days) {
    const e = b.t.days.find((x) => x.name === d.name);
    if (!e) {
      days.push({ name: d.name, what: 'no longer read' });
      continue;
    }
    if (d.date !== e.date) days.push({ name: d.name, what: `date ${d.date} → ${e.date}` });
    const [ta, tb] = [timing(a.t, d.name), timing(b.t, d.name)];
    if (ta && tb && ta.gameMins !== tb.gameMins) days.push({ name: d.name, what: `games ${ta.gameMins} → ${tb.gameMins} min` });
  }
  for (const e of b.t.days) if (!a.t.days.some((d) => d.name === e.name)) days.push({ name: e.name, what: `newly read (${e.date})` });

  const total = mapping.added.length + mapping.removed.length + games.length + added.length + removed.length + moved.length + pools.length + days.length;
  return { mapping, games, teams: { added, removed, moved }, pools, days, total };
}
