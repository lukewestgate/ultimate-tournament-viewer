import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { encodeBundle, decodeBundle } from '../src/mapping/share';
import { detectMapping } from '../src/mapping/detect';
import { launchTarget, homeGroup, isOnToday } from '../src/store/launch';
import { applyHotTabs, backoffDelay, hotTabs, nextRefreshKind, FULL_EVERY } from '../src/store/refresh';
import { changedGames, processWorkbook } from '../src/store/pipeline';
import { idbGet, idbSet, idbDel } from '../src/store/db';
import { loadTournament, saveTournament, listIds, removeTournament, teamKey, parseTeamKey } from '../src/store/settings';
import type { TournamentSummary } from '../src/store/settings';
import { loadFixture } from './helpers/fixtures';
import type { Workbook } from '../src/sheets/workbook';

// Minimal localStorage for Node.
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

describe('share links', () => {
  it('round-trips a mapping bundle, compressed', async () => {
    const { mapping } = detectMapping(loadFixture('list-codes'));
    const enc = await encodeBundle({ mapping, format: { divisions: {} } });
    expect(enc[0]).toBe('z');
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeBundle(enc)).toEqual({ mapping, format: { divisions: {} } });
    expect(await decodeBundle('zgarbage')).toBeUndefined();
  });
});

describe('launch routing', () => {
  const H = 3600000;
  const now = Date.UTC(2026, 9, 31, 12);
  const sum = (start: number, end: number, extra: Partial<TournamentSummary> = {}): TournamentSummary => ({
    title: 'x',
    firstStart: start,
    lastEnd: end,
    days: [],
    divisions: 0,
    teams: 10,
    problems: 0,
    datesGuessed: false,
    ...extra,
  });
  const today = sum(now - 3 * H, now + 5 * H);
  const later = sum(now + 72 * H, now + 80 * H);
  it('nothing saved -> empty; none today -> home', () => {
    expect(launchTarget([], now)).toEqual({ kind: 'empty' });
    expect(launchTarget([{ id: 'a', summary: later }], now)).toEqual({ kind: 'home' });
  });
  it('one on today opens directly; two open the most recent', () => {
    expect(launchTarget([{ id: 'a', summary: today }, { id: 'b', summary: later }], now)).toEqual({ kind: 'tournament', id: 'a', onToday: 1 });
    expect(launchTarget([{ id: 'a', summary: today, lastOpened: 1 }, { id: 'b', summary: today, lastOpened: 5 }], now)).toEqual({ kind: 'tournament', id: 'b', onToday: 2 });
  });
  it('a link wins', () => {
    expect(launchTarget([{ id: 'a', summary: today }], now, 'z')).toMatchObject({ kind: 'tournament', id: 'z' });
  });
  it('on today starts about an hour before the first game', () => {
    expect(isOnToday(sum(now + 0.5 * H, now + 4 * H), now)).toBe(true);
    expect(isOnToday(sum(now + 2 * H, now + 4 * H), now)).toBe(false);
  });
  it('home groups', () => {
    expect(homeGroup({ id: 'a', summary: later }, now)).toBe('comingUp');
    expect(homeGroup({ id: 'a', summary: sum(now - 100 * H, now - 90 * H) }, now)).toBe('recent');
    expect(homeGroup({ id: 'a', summary: { ...later, datesGuessed: true } }, now)).toBe('datesUnconfirmed');
  });
});

describe('refresh strategy', () => {
  it('backs off 1 -> 2 -> 4 -> 8 minutes, capped', () => {
    expect([1, 2, 3, 4, 9].map((n) => backoffDelay(n) / 60000)).toEqual([1, 2, 4, 8, 8]);
  });
  it('full workbook every 10 minutes, hot tabs otherwise, full when a hot tab has no gid', () => {
    expect(nextRefreshKind(undefined, 0, [])).toBe('full');
    expect(nextRefreshKind(0, 60000, [{}])).toBe('hot');
    expect(nextRefreshKind(0, FULL_EVERY, [{}])).toBe('full');
    expect(nextRefreshKind(0, 60000, undefined)).toBe('full');
  });
  it('hot tabs come from the mapping and need gids', () => {
    const wb = loadFixture('list-round-robin');
    const { mapping } = detectMapping(wb);
    expect(hotTabs(wb, mapping)).toBeUndefined();
    const withGids: Workbook = { ...wb, tabs: wb.tabs.map((t, i) => ({ ...t, gid: String(i) })) };
    expect(hotTabs(withGids, mapping)?.map((h) => h.name)).toEqual(['Gamelist', 'Finals', 'Pool Tables']);
  });
  it('detects content changes per tab and highlights changed games', () => {
    const wb = loadFixture('list-round-robin');
    const p0 = processWorkbook('x', wb);
    const gl = wb.tabs.find((t) => t.name === 'Gamelist')!;
    const same = applyHotTabs(wb, [{ name: 'Gamelist', rows: gl.rows }]);
    expect(same.changed).toBe(false);
    const rows = gl.rows.map((r) => [...r]);
    rows[4][5] = '9'; // first game: 8 -> 9
    const diff = applyHotTabs(wb, [{ name: 'Gamelist', rows }]);
    expect(diff.changed).toBe(true);
    const p1 = processWorkbook('x', diff.workbook);
    expect([...changedGames(p0.tournament, p1.tournament)]).toEqual([p0.tournament.games[0].id]);
  });
  it('an invalid saved mapping triggers re-detection', () => {
    const wb = loadFixture('list-round-robin');
    const { mapping } = detectMapping(wb);
    const broken = { ...mapping, games: [{ ...mapping.games[0], tab: 'Gone' }] };
    const p = processWorkbook('x', wb, { mapping: broken });
    expect(p.redetected).toBe(true);
    expect(p.tournament.games).toHaveLength(105);
  });
});

describe('storage', () => {
  beforeEach(() => mem.clear());
  it('IndexedDB keeps workbooks', async () => {
    await idbSet('wb:x', { a: 1 });
    expect(await idbGet('wb:x')).toEqual({ a: 1 });
    await idbDel('wb:x');
    expect(await idbGet('wb:x')).toBeUndefined();
  });
  it('per-tournament settings and the saved list', () => {
    saveTournament({ id: 'a', followed: [{ key: teamKey('Leeds 1', 'Women') }], addedAt: 1 });
    expect(listIds()).toEqual(['a']);
    expect(loadTournament('a')!.followed[0].key).toBe('Women::Leeds 1');
    expect(parseTeamKey('Women::Leeds 1')).toEqual({ division: 'Women', name: 'Leeds 1' });
    expect(parseTeamKey('::Leeds 1')).toEqual({ division: undefined, name: 'Leeds 1' });
    removeTournament('a');
    expect(listIds()).toEqual([]);
  });
});
