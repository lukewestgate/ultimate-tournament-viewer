import { describe, expect, it } from 'vitest';
import { assignGridRole, assignListRole, assignPoolRole, setFixed, setGridSeparator, setSeeding, rolesOnTab } from '../src/mapping/manual';
import { detectMapping } from '../src/mapping/detect';
import { emptyMapping } from '../src/mapping/types';
import { extract } from '../src/extract/extract';
import { loadFixture } from './helpers/fixtures';

const NOW = Date.UTC(2026, 9, 20);
const summary = (t: ReturnType<typeof extract>) => t.games.map((g) => `${g.id}|${g.teams.join('v')}|${g.scores.join('-')}|${g.division ?? ''}`);

describe('manual mapping by role assignment', () => {
  it('reproduces the Auto result for a list layout (list-round-robin)', () => {
    const wb = loadFixture('list-round-robin');
    const auto = detectMapping(wb).mapping;
    let m = { ...emptyMapping('manual'), info: auto.info };
    // Gamelist: header row 4 (index 3)
    const roles: [number, Parameters<typeof assignListRole>[4]][] = [
      [0, 'day'],
      [1, 'time'],
      [2, 'pitch'],
      [3, 'division'],
      [4, 'team1'],
      [5, 'score1'],
      [7, 'score2'],
      [8, 'team2'],
    ];
    for (const [c, r] of roles) m = assignListRole(m, 'Gamelist', 3, c, r);
    // Finals: header row 3 (index 2), no day column -> fixed day
    for (const [c, r] of [
      [0, 'time'],
      [1, 'pitch'],
      [2, 'division'],
      [3, 'team1'],
      [4, 'score1'],
      [6, 'score2'],
      [7, 'team2'],
    ] as const)
      m = assignListRole(m, 'Finals', 2, c, r);
    m = setFixed(m, 1, { fixedDay: 'Sunday' });
    // Pool tables and seeding
    for (const [c, r] of [
      [1, 'team'],
      [2, 'p'],
      [3, 'w'],
      [4, 'd'],
      [5, 'l'],
      [6, 'pf'],
      [7, 'pa'],
      [8, 'diff'],
      [9, 'pts'],
    ] as const) {
      m = assignPoolRole(m, wb, 'Pool Tables', 3, c, r, 'Open Pool');
      m = assignPoolRole(m, wb, 'Pool Tables', 20, c, r, 'Womens Pool');
    }
    m = setSeeding(m, 'Info', { r: 5, c: 1 }, 16, 3, 'Open');
    m = setSeeding(m, 'Info', { r: 5, c: 5 }, 10, 7, 'Womens');

    const a = extract(wb, auto, { id: 'x', sheetUrl: '', now: NOW });
    const b = extract(wb, m, { id: 'x', sheetUrl: '', now: NOW });
    expect(b.games).toHaveLength(105);
    expect(summary(b)).toEqual(summary(a));
    expect(b.pools.map((p) => p.name)).toEqual(a.pools.map((p) => p.name));
    expect(b.divisions.map((d) => d.name)).toEqual(a.divisions.map((d) => d.name));
  });

  it('a column holds one role; reassigning moves it', () => {
    let m = assignListRole(emptyMapping('manual'), 'Gamelist', 3, 1, 'time');
    m = assignListRole(m, 'Gamelist', 3, 1, 'pitch');
    const src = m.games[0];
    expect(src.kind === 'list' && src.cols.time).toBe(-1);
    expect(src.kind === 'list' && src.cols.pitch).toBe(1);
  });

  it('grid layout: tap a separator, then label the block cells (grid-dated)', () => {
    const wb = loadFixture('grid-dated');
    let m = setGridSeparator(emptyMapping('manual'), wb, 'Schedule', 2, 4);
    m = assignGridRole(m, 'Schedule', 0, 'time');
    const g = m.games[0];
    expect(g.kind).toBe('grid');
    if (g.kind !== 'grid') return;
    expect(g.blocks.map((b) => b.sep)).toEqual([4, 12, 20]);
    expect(g.offsets.time).toBe(-4);
    expect(extract(wb, m, { id: 'x', sheetUrl: '', now: NOW }).games).toHaveLength(107);
    expect(rolesOnTab(m, 'Schedule').cols.get(4)).toBe('sep');
  });
});
