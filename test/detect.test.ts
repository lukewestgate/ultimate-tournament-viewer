import { describe, expect, it } from 'vitest';
import { detectMapping } from '../src/mapping/detect';
import { readGameSource } from '../src/extract/read';
import { validateMapping } from '../src/mapping/validate';
import { likelySame, foldName, clubOf } from '../src/extract/names';
import { loadFixture } from './helpers/fixtures';

describe('auto detection', () => {
  it('UKU Gamelist: columns by header, scores inside the team columns, slot and bracket columns', () => {
    const { mapping } = detectMapping(loadFixture('uku-template'));
    expect(mapping.template).toBe('uku');
    expect(mapping.games).toEqual([
      {
        kind: 'list',
        tab: 'Gamelist',
        headerRow: 0,
        cols: { time: 3, team1: 5, team2: 9, day: 2, pitch: 4, division: 10, code: 0, slot1: 11, slot2: 12, bracket: 13, score1: 6, score2: 8 },
      },
    ]);
  });

  it('grid with separators, offsets, a shared time column and pitch labels', () => {
    const { mapping } = detectMapping(loadFixture('grid-exp-beg'));
    const g = mapping.games[0];
    expect(g.kind).toBe('grid');
    if (g.kind !== 'grid') return;
    expect(g.offsets).toEqual({ team1: -2, team2: 2, score1: -1, score2: 1, slot1: -3, slot2: 3 });
    expect(g.timeCol).toBe(1);
    expect(g.blocks.map((b) => b.pitch)).toEqual(['PITCH 1', 'PITCH 2', 'PITCH 3']);
  });

  it('grid with a time offset that works for every block', () => {
    const { mapping } = detectMapping(loadFixture('grid-dated'));
    const g = mapping.games[0];
    expect(g.kind === 'grid' && g.offsets.time).toBe(-4);
  });

  it('prefers lists over grids', () => {
    const { mapping } = detectMapping(loadFixture('list-round-robin'));
    expect(mapping.games.every((g) => g.kind === 'list')).toBe(true);
  });

  it('pool tables, seeding (past a short code) and standings', () => {
    const { mapping } = detectMapping(loadFixture('list-round-robin'));
    expect(mapping.pools.map((p) => p.name)).toEqual(['Open Pool', 'Womens Pool']);
    expect(mapping.seeding.map((s) => [s.label, s.seedCol, s.teamCol])).toEqual([
      ['Open', 1, 3],
      ['Womens', 5, 7],
    ]);
    expect(mapping.standings.map((s) => s.tab)).toEqual(['Final Standings']);
  });

  it('seeding blocks split by labels (Men D1 / Men D2)', () => {
    const { mapping } = detectMapping(loadFixture('outdoor-1'));
    expect(mapping.seeding.map((s) => s.label)).toEqual(['Women', 'Men D1', 'Men D2', 'Men D3', 'Uni Fans']);
  });

  it('every fixture yields a valid mapping that reads games', () => {
    for (const f of ['uku-template', 'grid-exp-beg', 'grid-dated', 'list-round-robin', 'list-codes', 'outdoor-1', 'outdoor-2', 'outdoor-3'] as const) {
      const wb = loadFixture(f);
      const { mapping } = detectMapping(wb);
      expect(validateMapping(wb, mapping)).toEqual([]);
      expect(mapping.games.flatMap((g, i) => readGameSource(wb, g, i)).length).toBeGreaterThan(30);
    }
  });
});

describe('names', () => {
  it('folds case, spacing and punctuation', () => {
    expect(foldName('Sous sheffs')).toBe(foldName('Sous Sheffs '));
    expect(foldName("St Andrew's 1")).toBe(foldName('St Andrews 1'));
  });
  it('likely duplicates, but not numbered or lettered siblings', () => {
    expect(likelySame('Gateways', 'Gateways U20')).toBe(true);
    expect(likelySame('Lancaster', 'Lancaster Fish')).toBe(true);
    expect(likelySame('Leeds 1', 'Leeds 2')).toBe(false);
    expect(likelySame('RGS Guildford A U20', 'RGS Guildford B U20')).toBe(false);
  });
  it('club without region tag and team number', () => {
    expect(clubOf('Loughborough 1 (M2)')).toBe('Loughborough');
    expect(clubOf('Sheffield Steal Begs')).toBe('Sheffield Steal');
  });
});
