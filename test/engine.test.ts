import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildTournament } from '../src/data/parse';
import { simulate } from '../src/data/demo';
import { BracketModel } from '../src/engine/bracket';
import { resolve, sideTeam } from '../src/engine/resolve';
import { placementPaths, poolOutlook } from '../src/engine/paths';
import { TOURNAMENTS } from '../src/config';

const read = (n: string) => readFileSync(new URL(`./fixtures/${n}.csv`, import.meta.url), 'utf8');
const raw = {
  header: read('header'),
  seeding: read('seeding'),
  schedule: read('schedule'),
  poolResults: read('poolresults'),
  gamelist: read('gamelist'),
  standings: read('standings'),
  sotg: read('sotg'),
};
const cfg = TOURNAMENTS[0];
const t = buildTournament(raw, { tz: cfg.timeZone, fallbackDates: cfg.dates });
const g = (id: string) => t.games.find((x) => x.id === id)!;

describe('parsing', () => {
  it('reads the header', () => {
    expect(t.header.isDraft).toBe(true);
    expect(t.header.name).toMatch(/Mixed Indoor Regionals/);
    expect(t.header.qualification).toEqual({ div1: 4, div2: 3 });
    expect(t.header.rules.find((r) => r.day === 'Sunday')).toMatchObject({ gameMins: 28, gapMins: 7, cap: 13 });
    expect(t.header.sotgFormUrl).toBe('https://forms.gle/mhoYAs5VhFyzKs2d7');
    expect(t.header.announcements).toEqual([]);
  });

  it('reads games', () => {
    expect(t.games).toHaveLength(69);
    expect(g('A1vA3')).toMatchObject({ day: 'Saturday', time: '09:30', pitch: 1, sheetLo: 'Loughborough 1', stage: 'pool' });
    expect(g('E1vE3').stage).toBe('powerPool');
    expect(g('[4v5]')).toMatchObject({ stage: 'placement', isGameToGo: true, lo: '4', hi: '5' });
    expect(new Date(g('A1vA3').start).toISOString()).toBe('2026-10-31T09:30:00.000Z');
    expect(g('A1vA3').end - g('A1vA3').start).toBe(24 * 60_000);
  });

  it('reads pools', () => {
    expect(t.pools.map((p) => p.letter).join('')).toBe('ABCDEFGH');
    const a = t.pools.find((p) => p.letter === 'A')!;
    expect(a.stage).toBe(1);
    expect(a.finishToSeed).toEqual({ 1: 1, 2: 7, 3: 11, 4: 13 });
    const e = t.pools.find((p) => p.letter === 'E')!;
    expect(e.stage).toBe(2);
    expect(e.carried).toEqual([
      { pool: 'E', lo: 'E1', hi: 'E4' },
      { pool: 'E', lo: 'E2', hi: 'E3' },
    ]);
  });
});

describe('bracket structure', () => {
  const b = new BracketModel(t);
  it('derives sources (spec §3 examples)', () => {
    expect(b.source(g('1v4'), 1)).toMatchObject({ game: g('1v8'), take: 'W' });
    expect(b.source(g('1v4'), 4)).toMatchObject({ game: g('4v5'), take: 'W' });
    expect(b.source(g('5v8'), 5)).toMatchObject({ game: g('4v5'), take: 'L' });
    expect(b.source(g('9v16'), 16)).toEqual({ seed: 16 });
    expect(b.source(g('[4v5]'), 4)).toMatchObject({ game: g('3v4'), take: 'L' });
    expect(b.source(g('[4v5]'), 5)).toMatchObject({ game: g('5v6'), take: 'W' });
  });
  it('names games', () => {
    expect(b.name(g('8v9'))).toBe('Crossover');
    expect(b.name(g('1v8'))).toBe('Quarter-final');
    expect(b.name(g('1v4'))).toBe('Semi-final');
    expect(b.name(g('5v8'))).toBe('5th–8th semi');
    expect(b.name(g('1v2'))).toBe('Final');
    expect(b.name(g('3v4'))).toBe('3rd place');
    expect(b.name(g('[4v5]'))).toBe('Game to go');
    expect(b.name(g('9v16'))).toBe('9th–16th QF');
  });
  it('lays out boards', () => {
    const l = b.layout(0, { colW: 224, gap: 56, unit: 140, treeGap: 40 });
    expect(l.cols.map((c) => c.title)).toEqual(['Crossovers', 'Quarter-finals', 'Semi-finals', 'Medal games', 'Game to go']);
    expect(l.nodes).toHaveLength(17);
  });
});

describe('resolution', () => {
  it('knows pool teams up front and nothing later', () => {
    const r = resolve(t);
    expect(sideTeam(r.byId.get('A1vA3')!.lo)).toBe('Loughborough 1');
    expect(r.byId.get('E1vE3')!.lo.teams).toHaveLength(4);
    expect(r.byId.get('1v8')!.hi.label).toBe('Winner 8v9');
  });

  it('chalk results put everyone in seed order', () => {
    const done = simulate(t, Date.UTC(2026, 10, 2), 'chalk');
    const r = resolve(done);
    expect(r.mismatches).toEqual([]);
    for (let p = 1; p <= 16; p++) expect(sideTeam(r.places.get(p)!)).toBe(t.seeds.find((s) => s.seed === p)!.team);
    expect(sideTeam(r.byId.get('E1vE3')!.lo)).toBe('Loughborough 1');
    expect(r.pools.get('E')!.carried.every((c) => c.outcome)).toBe(true);
  });

  it('random results resolve every Sunday game', () => {
    const done = simulate(t, Date.UTC(2026, 10, 2));
    const r = resolve(done);
    for (const rg of r.games) {
      expect(rg.lo.teams, rg.game.id).toHaveLength(1);
      expect(rg.hi.teams, rg.game.id).toHaveLength(1);
    }
    const placed = [...Array(16)].map((_, i) => sideTeam(r.places.get(i + 1)!));
    expect(new Set(placed).size).toBe(16);
  });

  it('what-if picks propagate', () => {
    const sat = simulate(t, Date.UTC(2026, 9, 31, 23));
    const r0 = resolve(sat);
    const qf = r0.byId.get('1v8')!;
    expect(qf.lo.teams).toHaveLength(1);
    expect(qf.hi.teams).toHaveLength(2);
    const r1 = resolve(sat, { '8v9': 'lo' });
    expect(r1.byId.get('1v8')!.hi.teams).toHaveLength(1);
    expect(r1.byId.get('1v8')!.hi.hyp).toBe(true);
  });
});

describe('paths', () => {
  it('builds a Sunday tree', () => {
    const sat = simulate(t, Date.UTC(2026, 9, 31, 23));
    const team = sideTeam(resolve(sat).byId.get('1v8')!.lo)!;
    const tree = placementPaths(sat, {}, team);
    expect(tree?.kind).toBe('game');
    if (tree?.kind !== 'game') return;
    expect(tree.name).toBe('Quarter-final');
    expect(tree.win?.kind === 'game' && tree.win.name).toBe('Semi-final');
    expect(tree.lose?.kind === 'game' && tree.lose.name).toBe('5th–8th semi');
  });

  it('summarises pool outlook', () => {
    const o = poolOutlook(t, {}, 'Loughborough 1')!;
    expect(o.pool).toBe('A');
    expect(o.remaining).toHaveLength(3);
    expect(o.now).toEqual([1, 2, 3, 4]);
    expect(o.winAll).toEqual([1]);
    expect(o.loseAll).toEqual([4]);
    expect(o.dest(1)).toBe('Power pool E');
    expect(o.dest(4)).toBe('Power pool G');
  });
});
