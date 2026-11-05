import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { resumesAt, tournamentStatus } from '../src/store/launch';
import { hasOwnReading, parseFeaturedRows, takesFeatured, type FeaturedEntry } from '../src/store/featured';
import { processWorkbook, summarize } from '../src/store/pipeline';
import { encodeBundle } from '../src/mapping/share';
import { detectMapping } from '../src/mapping/detect';
import { store } from '../src/store/app';
import { homeItems, homeView, whenLabel, type HomeFilter } from '../src/ui/homeList';
import { loadTournament, saveTournament, type TournamentSettings, type TournamentSummary } from '../src/store/settings';
import { loadFixture } from './helpers/fixtures';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
} as Storage;

const H = 3600000;
const ID = 'a'.repeat(30);
/** Saturday 7 November 2026, 12:30 UTC. */
const NOW = Date.UTC(2026, 10, 7, 12, 30);

const sum = (extra: Partial<TournamentSummary> = {}): TournamentSummary => ({
  title: 'Cup',
  firstStart: NOW - 3 * H,
  lastEnd: NOW + 4 * H,
  finishBy: Date.UTC(2026, 10, 8),
  sessions: [{ start: NOW - 3 * H, end: NOW + 4 * H }],
  days: [{ name: 'Sat', date: '2026-11-07', dateSource: 'sheet' }],
  divisions: 1,
  teams: 8,
  problems: 0,
  datesGuessed: false,
  counted: 20,
  unresolved: 5,
  ...extra,
});

describe('tournament status', () => {
  it('is live during the games and upcoming before them', () => {
    expect(tournamentStatus(sum(), NOW)).toBe('live');
    expect(tournamentStatus(sum(), NOW - 3.5 * H)).toBe('live');
    expect(tournamentStatus(sum(), NOW - 5 * H)).toBe('upcoming');
  });
  it('completes the moment every score is in, even before the last slot ends', () => {
    expect(tournamentStatus(sum({ unresolved: 0 }), NOW)).toBe('completed');
  });
  it('waits for unplayed if-required games to pass', () => {
    const s = sum({ unresolved: 0, ifRequiredUntil: NOW + H });
    expect(tournamentStatus(s, NOW)).toBe('live');
    expect(tournamentStatus(s, NOW + H)).toBe('completed');
  });
  it('awaits results until the last day ends, then completes', () => {
    expect(tournamentStatus(sum(), NOW + 5 * H)).toBe('awaiting');
    expect(tournamentStatus(sum(), Date.UTC(2026, 10, 7, 23, 59))).toBe('awaiting');
    expect(tournamentStatus(sum(), Date.UTC(2026, 10, 8))).toBe('completed');
  });
  it('trusts full standings on the last day but not before it', () => {
    const two = { firstStart: NOW - 3 * H, sessions: [{ start: NOW - 3 * H, end: NOW + 4 * H }, { start: NOW + 20 * H, end: NOW + 28 * H }], lastEnd: NOW + 28 * H, finishBy: Date.UTC(2026, 10, 9), standingsDone: true };
    expect(tournamentStatus(sum(two), NOW)).toBe('live');
    expect(tournamentStatus(sum(two), NOW + 21 * H)).toBe('completed');
  });
  it('shows the overnight gap of a two-day tournament', () => {
    const s = sum({ sessions: [{ start: NOW - 3 * H, end: NOW + 4 * H }, { start: NOW + 20 * H, end: NOW + 28 * H }], lastEnd: NOW + 28 * H, finishBy: Date.UTC(2026, 10, 9) });
    expect(tournamentStatus(s, NOW + 8 * H)).toBe('between');
    expect(resumesAt(s, NOW + 8 * H)).toBe(NOW + 20 * H);
    expect(tournamentStatus(s, NOW + 19.5 * H)).toBe('live');
  });
  it('still reads summaries saved before these fields existed', () => {
    const old = sum({ counted: undefined, unresolved: undefined, finishBy: undefined, sessions: undefined });
    expect(tournamentStatus(old, NOW)).toBe('live');
    expect(tournamentStatus(old, NOW + 5 * H)).toBe('awaiting');
    expect(tournamentStatus(old, NOW + 24 * H)).toBe('completed');
  });
  it('lets results beat guessed dates, which otherwise stay unconfirmed for a week', () => {
    const past = { firstStart: NOW - 50 * H, lastEnd: NOW - 40 * H, datesGuessed: true };
    expect(tournamentStatus(sum({ ...past, unresolved: 0 }), NOW)).toBe('completed');
    expect(tournamentStatus(sum(past), NOW)).toBe('guessed');
    expect(tournamentStatus(sum({ ...past, lastEnd: NOW - 200 * H, firstStart: NOW - 210 * H }), NOW)).toBe('completed');
  });
  it('has nothing to say without games', () => {
    expect(tournamentStatus(undefined, NOW)).toBe('unknown');
    expect(tournamentStatus(sum({ firstStart: undefined, lastEnd: undefined }), NOW)).toBe('unknown');
  });
  it('fills the summary from a real sheet', () => {
    const s = summarize(processWorkbook('x', loadFixture('grid-dated')), undefined);
    expect(s.counted).toBe(107);
    expect(s.unresolved).toBe(1);
    expect(s.standingsDone).toBe(true);
    expect(s.teamNames).toContain("Pablo's Pizzeria");
    expect(s.finishBy).toBeGreaterThan(s.lastEnd!);
    expect(tournamentStatus(s, s.lastEnd! + H)).toBe('completed');
  });
});

describe('featured sheet rows', () => {
  const head = ['id', 'title', 'first', 'last', 'show', 'divisions', 'teams', 'm', 'updated'];
  it('reads rows by header, whatever the column order', () => {
    expect(parseFeaturedRows([['title', 'id', 'first'], ['Cup', ID, '2026-11-07']])).toEqual([{ id: ID, title: 'Cup', first: '2026-11-07', last: '2026-11-07', divisions: [], teams: [], m: undefined }]);
  });
  it('accepts a pasted link and splits names', () => {
    const [e] = parseFeaturedRows([head, [`https://docs.google.com/spreadsheets/d/${ID}/edit`, 'Cup', '2026-11-07', '2026-11-08', 'TRUE', 'Open|Women', 'Leeds 1 | York 1', 'zabc', '']])!;
    expect(e).toMatchObject({ id: ID, last: '2026-11-08', divisions: ['Open', 'Women'], teams: ['Leeds 1', 'York 1'], m: 'zabc' });
  });
  it('skips hidden and unusable rows, and bad dates alone', () => {
    const list = parseFeaturedRows([head, [ID, 'Hidden', '', '', 'FALSE'], ['nonsense', 'Bad id'], ['b'.repeat(30), ''], ['c'.repeat(30), 'No dates', '7 Nov']])!;
    expect(list.map((e) => e.title)).toEqual(['No dates']);
    expect(list[0].first).toBeUndefined();
  });
  it('refuses anything that isn’t the featured sheet, so a bad fetch keeps the last list', () => {
    expect(parseFeaturedRows([['Team', 'Score']])).toBeUndefined();
    expect(parseFeaturedRows([])).toBeUndefined();
    expect(parseFeaturedRows([head])).toEqual([]);
  });
});

describe('taking featured readings', () => {
  const base: TournamentSettings = { id: ID, followed: [], addedAt: 1 };
  const entry = (m?: string): FeaturedEntry => ({ id: ID, title: 'Cup', divisions: [], teams: [], m });
  const mapping = detectMapping(loadFixture('list-codes')).mapping;
  beforeEach(() => {
    mem.clear();
    store.featured = [];
  });

  it('takes it on Auto and when a newer one arrives', () => {
    expect(takesFeatured(base, entry('z1'))).toBe(true);
    expect(takesFeatured({ ...base, featuredM: 'z1' }, entry('z2'))).toBe(true);
    expect(takesFeatured({ ...base, featuredM: 'z1' }, entry('z1'))).toBe(false);
    expect(takesFeatured(base, entry())).toBe(false);
  });
  it('goes back to Auto when the published reading is taken off', () => {
    expect(takesFeatured({ ...base, featuredM: 'z1' }, entry())).toBe(true);
  });
  it('never replaces a reading made here, sent by link, or saved before the list existed', () => {
    expect(takesFeatured({ ...base, ownReading: true }, entry('z1'))).toBe(false);
    expect(takesFeatured({ ...base, ownReading: true, featuredM: 'z1' }, entry('z2'))).toBe(false);
    expect(hasOwnReading({ ...base, mapping })).toBe(true);
    expect(takesFeatured({ ...base, mapping }, entry('z1'))).toBe(false);
  });

  it('a new tournament picks up the published reading, and later edits stay put', async () => {
    const m = await encodeBundle({ mapping });
    store.featured = [entry(m)];
    store.add(ID);
    await new Promise((r) => setTimeout(r, 20));
    expect(loadTournament(ID)?.mapping).toEqual(mapping);
    expect(loadTournament(ID)?.featuredM).toBe(m);

    store.runtime(ID).setMapping({ ...mapping, mode: 'manual' });
    expect(loadTournament(ID)?.ownReading).toBe(true);
    await store.takeFeatured(entry(await encodeBundle({ mapping: { ...mapping, mode: 'ai' } })));
    expect(loadTournament(ID)?.mapping?.mode).toBe('manual');
  });
  it('Use the featured reading overrides your own, keeps it in the history, and updates arrive again', async () => {
    const m = await encodeBundle({ mapping });
    saveTournament({ ...base, mapping: { ...mapping, mode: 'manual' }, ownReading: true });
    await store.takeFeatured(entry(m), true);
    const s = loadTournament(ID)!;
    expect(s.mapping?.mode).toBe(mapping.mode);
    expect(s.ownReading).toBe(false);
    expect(s.history?.[0].mapping?.mode).toBe('manual');
  });
  it('going back to automatic stays automatic', async () => {
    const m = await encodeBundle({ mapping });
    saveTournament({ ...base, featuredM: 'old' });
    store.runtime(ID).setMapping(undefined);
    await store.takeFeatured(entry(m));
    expect(loadTournament(ID)?.mapping).toBeUndefined();
  });
  it('a broken reading leaves everything alone', async () => {
    saveTournament(base);
    await store.takeFeatured(entry('zbroken'));
    expect(loadTournament(ID)?.featuredM).toBeUndefined();
  });
  it('publishing makes this device’s reading the featured one', () => {
    saveTournament({ ...base, mapping, ownReading: true });
    store.published(entry('z1'));
    expect(loadTournament(ID)).toMatchObject({ ownReading: false, featuredM: 'z1' });
    expect(store.featuredFor(ID)?.m).toBe('z1');
    store.unpublished(ID);
    expect(store.featuredFor(ID)).toBeUndefined();
  });
});

describe('home list', () => {
  const saved = (id: string, s?: Partial<TournamentSummary>, extra: Partial<TournamentSettings> = {}): TournamentSettings => ({ id, followed: [], addedAt: 1, summary: s ? sum(s) : undefined, ...extra });
  const feat = (id: string, title: string, first?: string, last = first, teams: string[] = []): FeaturedEntry => ({ id, title, first, last, divisions: ['Open'], teams });
  const done = (title: string, ago: number) => ({ title, firstStart: NOW - ago * H - 8 * H, lastEnd: NOW - ago * H, unresolved: 0 });
  const view = (s: TournamentSettings[], f: FeaturedEntry[], query = '', filter: HomeFilter = 'all', mine = false) => homeView(homeItems(s, f, NOW), { query, filter, mine }, NOW);
  const titles = (v: ReturnType<typeof view>) => v.sections.flatMap((s) => s.groups.flatMap((g) => g.matches.map((m) => m.item.title)));

  it('shows a tournament that’s saved and featured once, with its real status', () => {
    const items = homeItems([saved('a', { title: 'Mine' })], [feat('a', 'Mine', '2026-11-07')], NOW);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: 'live' });
    expect(items[0].featured).toBeTruthy();
  });
  it('prefers the published title to the sheet’s own', () => {
    expect(homeItems([saved('a', { title: 'Untitled tournament' })], [feat('a', 'Harbour Open', '2026-11-07')], NOW)[0].title).toBe('Harbour Open');
  });
  it('only claims dates for featured tournaments nobody has opened', () => {
    const items = homeItems([], [feat('a', 'A', '2026-11-07', '2026-11-08'), feat('b', 'B', '2026-11-14'), feat('c', 'C', '2026-10-31'), feat('d', 'D')], NOW);
    expect(items.map((i) => i.status)).toEqual(['today', 'upcoming', 'ended', 'unknown']);
  });
  it('keeps the section order and sorts On now by status, mine first', () => {
    const v = view(
      [saved('l', { title: 'Live' }), saved('w', { title: 'Waiting', firstStart: NOW - 9 * H, lastEnd: NOW - 2 * H }), saved('c', done('Done', 30))],
      [feat('t', 'Today', '2026-11-07'), feat('u', 'Later', '2026-11-14')],
    );
    expect(v.sections.map((s) => s.key)).toEqual(['now', 'upcoming', 'completed']);
    expect(titles(v)).toEqual(['Live', 'Today', 'Waiting', 'Later', 'Done']);
    expect(v.counts).toEqual({ all: 5, now: 3, upcoming: 1, completed: 1 });
  });
  it('chips narrow the list, guessed dates sit under Upcoming, and My list combines', () => {
    const s = [saved('l', { title: 'Live' }), saved('g', { title: 'Guess', firstStart: NOW + 50 * H, lastEnd: NOW + 60 * H, datesGuessed: true })];
    const f = [feat('u', 'Later', '2026-11-14')];
    expect(titles(view(s, f, '', 'now'))).toEqual(['Live']);
    expect(titles(view(s, f, '', 'upcoming'))).toEqual(['Later', 'Guess']);
    expect(titles(view(s, f, '', 'upcoming', true))).toEqual(['Guess']);
    expect(view(s, f, '', 'all', true).counts.upcoming).toBe(1);
  });
  it('All shows the latest three completed and links to the rest, newest first', () => {
    const s = [1, 2, 3, 4, 5].map((n) => saved(`c${n}`, done(`Done ${n}`, n * 30)));
    const v = view(s, []);
    expect(titles(v)).toEqual(['Done 1', 'Done 2', 'Done 3']);
    expect(v.moreCompleted).toBe(5);
    expect(v.sections[0].count).toBe(5);
    expect(titles(view(s, [], '', 'completed'))).toHaveLength(5);
    expect(view(s, [], '', 'completed').moreCompleted).toBeUndefined();
  });
  it('drops old featured tournaments from All but keeps them findable', () => {
    const f = [feat('o', 'Old Open', '2026-10-01'), feat('n', 'New Open', '2026-11-05')];
    expect(titles(view([], f))).toEqual(['New Open']);
    expect(view([], f).counts).toMatchObject({ all: 1, completed: 2 });
    expect(titles(view([], f, '', 'completed'))).toEqual(['New Open', 'Old Open']);
    expect(titles(view([], f, 'old'))).toEqual(['Old Open']);
  });
  it('finds titles, teams, divisions and months, with titles first', () => {
    const f = [feat('a', 'Harbour Open', '2026-11-14', undefined, ['Sheffield 1', 'Sheffield 3', 'Leeds 2']), feat('b', 'Sheffield Hat', '2026-11-15'), feat('c', 'Winter Cup', '2026-12-05')];
    const v = view([], f, 'shef');
    expect(titles(v)).toEqual(['Sheffield Hat', 'Harbour Open']);
    expect(v.sections[0].groups[0].matches[1].teams).toEqual(['Sheffield 1', 'Sheffield 3']);
    expect(titles(view([], f, 'dec'))).toEqual(['Winter Cup']);
    expect(titles(view([], f, 'lboro'))).toEqual([]);
    expect(view([], f, 'shef').counts).toMatchObject({ all: 2, upcoming: 2, completed: 0 });
  });
  it('searches saved teams from the summary, followed teams first', () => {
    const s = saved('a', { title: 'Cup', teamNames: ['Leeds 1', 'Leeds 2'] }, { followed: [{ key: '::Leeds 2' }] });
    expect(view([s], [], 'leeds').sections[0].groups[0].matches[0].teams).toEqual(['Leeds 2', 'Leeds 1']);
  });
  it('names a team in two divisions once', () => {
    const s = saved('a', { title: 'Cup', teamNames: ['Leeds 1', 'Leeds 1'] });
    expect(view([s], [], 'leeds').sections[0].groups[0].matches[0].teams).toEqual(['Leeds 1']);
  });
  it('doesn’t let a short search match scattered letters in team names', () => {
    expect(titles(view([], [feat('a', 'Open', '2026-11-14', undefined, ['Hartlepool Athletic'])], 'hat'))).toEqual([]);
  });
  it('heads upcoming tournaments by when they start', () => {
    const sat = '2026-11-07';
    expect(whenLabel('2026-11-08', sat)).toBe('Tomorrow');
    expect(whenLabel('2026-11-07', '2026-11-05')).toBe('This weekend');
    expect(whenLabel('2026-11-06', '2026-11-03')).toBe('This week');
    expect(whenLabel('2026-11-14', sat)).toBe('Next weekend');
    expect(whenLabel('2026-11-11', sat)).toBe('Next week');
    expect(whenLabel('2026-12-05', sat)).toBe('December');
    expect(whenLabel('2027-01-09', sat)).toBe('January 2027');
  });
});

describe('the featured sheet script', () => {
  /** A stand-in for the bits of Apps Script it uses. */
  function run(key: string | null) {
    const grid: unknown[][] = [];
    const range = (r: number, c: number, nr = 1, nc = 1) => {
      const api = {
        setValues: (v: unknown[][]) => (v.forEach((row, i) => row.forEach((x, j) => (((grid[r - 1 + i] ??= [])[c - 1 + j] = x)))), api),
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => grid[r - 1 + i]?.[c - 1 + j] ?? '')),
        setValue: (v: unknown) => (((grid[r - 1] ??= [])[c - 1] = v), api),
        setNumberFormat: () => api,
        insertCheckboxes: () => api,
        check: () => (((grid[r - 1] ??= [])[c - 1] = true), api),
      };
      return api;
    };
    const sheet = { getLastRow: () => grid.length, getRange: range, deleteRow: (r: number) => void grid.splice(r - 1, 1) };
    const env = {
      PropertiesService: { getScriptProperties: () => ({ getProperty: () => key }) },
      LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
      SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheets: () => [sheet] }) },
      ContentService: { createTextOutput: (s: string) => ({ setMimeType: () => s }), MimeType: { JSON: 'json' } },
    };
    const src = readFileSync('tools/featured-sheet.gs', 'utf8');
    const doPost = new Function(...Object.keys(env), `${src}; return doPost;`)(...Object.values(env)) as (e: unknown) => string;
    const post = (body: unknown) => JSON.parse(doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } })) as { ok: boolean; error?: string };
    return { grid, post };
  }
  const entry = { id: ID, title: 'Cup', first: '2026-11-07', last: '2026-11-08', divisions: 'Open', teams: 'A|B', m: 'zabc' };

  it('turns away a wrong key, a missing key and bad input', () => {
    expect(run('secret').post({ key: 'nope', action: 'ping' }).ok).toBe(false);
    expect(run(null).post({ key: undefined, action: 'ping' }).ok).toBe(false);
    expect(run('secret').post('not json').ok).toBe(false);
    expect(run('secret').post({ key: 'secret', action: 'publish', entry: { ...entry, id: 'x' } }).ok).toBe(false);
    expect(run('secret').post({ key: 'secret', action: 'publish', entry: { ...entry, m: 'z'.repeat(50000) } }).ok).toBe(false);
    expect(run('secret').post({ key: 'secret', action: 'ping' }).ok).toBe(true);
  });
  it('writes a row the app can read, then updates it in place and keeps a cleared tick', () => {
    const { grid, post } = run('secret');
    expect(post({ key: 'secret', action: 'publish', entry }).ok).toBe(true);
    expect(grid[0]).toContain('id');
    const rows = () => grid.map((r) => Array.from(r, (c) => String(c ?? '')));
    expect(parseFeaturedRows(rows())).toMatchObject([{ id: ID, title: 'Cup', first: '2026-11-07', teams: ['A', 'B'], m: 'zabc' }]);

    grid[1][4] = false;
    post({ key: 'secret', action: 'publish', entry: { ...entry, m: 'znew' } });
    expect(grid).toHaveLength(2);
    expect(grid[1][7]).toBe('znew');
    expect(grid[1][4]).toBe(false);
  });
  it('removes a row, and doesn’t mind if it’s already gone', () => {
    const { grid, post } = run('secret');
    post({ key: 'secret', action: 'publish', entry });
    post({ key: 'secret', action: 'publish', entry: { ...entry, id: 'b'.repeat(30) } });
    expect(post({ key: 'secret', action: 'remove', id: ID }).ok).toBe(true);
    expect(post({ key: 'secret', action: 'remove', id: ID }).ok).toBe(true);
    expect(grid).toHaveLength(2);
    expect(grid[1][0]).toBe('b'.repeat(30));
  });
});
