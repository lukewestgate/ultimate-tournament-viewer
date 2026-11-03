import { describe, expect, it } from 'vitest';
import { detectMapping } from '../src/mapping/detect';
import { extract } from '../src/extract/extract';
import type { Mapping } from '../src/mapping/types';
import { cellsForGame, describeCorrections, describeSources, diffReadings, gameFlags, headerMismatches, oddities, poolFlags, teamFlags } from '../src/mapping/review';
import { loadFixture } from './helpers/fixtures';

const read = (name: Parameters<typeof loadFixture>[0]) => {
  const wb = loadFixture(name);
  const mapping = detectMapping(wb).mapping;
  return { wb, mapping, t: extract(wb, mapping, { id: name, sheetUrl: '' }) };
};

describe('checking a reading', () => {
  it('flags a team playing two games at once', () => {
    const { t } = read('grid-dated');
    const clash = [...gameFlags(t)].filter(([, xs]) => xs.includes('Durham plays two games at once'));
    expect(clash.map(([id]) => t.games.find((g) => g.id === id)!.ref).sort()).toEqual(['Schedule!M35', 'Schedule!U35']);
  });

  it('checks the sheet’s pool table against the games read', () => {
    const { t } = read('list-round-robin');
    const women = [...poolFlags(t)].find(([k]) => /Womens/.test(k))!;
    expect(women[1][0]).toMatch(/The sheet says Sandwedge Women played 10, the games read show 5/);
  });

  it('flags unseeded, look-alike teams', () => {
    const { t, mapping } = read('outdoor-2');
    expect(teamFlags(t, mapping).get('Women::Gateways')).toContain('May be the same team as “Gateways U20”');
  });

  it('spots a column read as something its header disagrees with', () => {
    const { wb, mapping } = read('outdoor-2');
    const src = mapping.games[0];
    if (src.kind !== 'list') throw new Error('expected a list');
    const swapped: Mapping = { ...mapping, games: [{ ...src, cols: { ...src.cols, team1: src.cols.pitch!, pitch: src.cols.team1 } }] };
    expect(headerMismatches(swapped, wb).join(' ')).toMatch(/column E is read as Team 1, but its header says “Pitch”/i);
    expect(headerMismatches(mapping, wb)).toEqual([]);
  });

  it('describes each source with the rows and columns it reads, and the cells behind a game', () => {
    const { wb, mapping, t } = read('outdoor-2');
    const [games] = describeSources(mapping, wb, t);
    expect(games.title).toBe('Games · a list on “Gamelist”');
    expect(games.count).toBe('40 games');
    expect(games.cols.map((c) => c.label)).toContain('Team 1');
    const cells = cellsForGame(mapping, wb, 'Gamelist!2');
    expect(cells.find((c) => c.label === 'Team 1')).toEqual({ addr: 'F2', label: 'Team 1', text: 'Reading Genesis U20' });
  });

  it('lists what changed between two readings', () => {
    const { wb, mapping, t } = read('outdoor-2');
    const team = t.teams.find((x) => x.division === 'Open' && !t.teams.some((y) => y.division === 'Women' && y.name === x.name))!.name;
    const m2: Mapping = { ...mapping, corrections: { ...mapping.corrections, ignoreRows: ['Gamelist!2'], dates: { Saturday: '2027-01-02' }, teamDivisions: { [`Open::${team}`]: 'Women' } } };
    const t2 = extract(wb, m2, { id: 'x', sheetUrl: '' });
    const d = diffReadings({ mapping, t }, { mapping: m2, t: t2 }, wb);
    expect(d.mapping.added).toContain('Gamelist!2 is ignored (not a game)');
    expect(d.mapping.added).toContain('Saturday is on 2027-01-02');
    expect(d.games.filter((g) => !g.now).map((g) => g.was!.ref)).toEqual(['Gamelist!2']);
    expect(d.teams.moved).toContainEqual({ name: team, from: 'Open', to: 'Women' });
    expect(d.days).toContainEqual({ name: 'Saturday', what: 'date 2026-09-19 → 2027-01-02' });
    expect(describeCorrections(m2)).toContain(`“${team}” (read into Open) is moved to Women`);
    expect(diffReadings({ mapping, t }, { mapping, t }, wb).total).toBe(0);
  });

  it('a clean sheet has nothing serious to check', () => {
    const { t, mapping, wb } = read('uku-template');
    expect(oddities(t, mapping, wb).filter((o) => o.level === 'problem')).toEqual([]);
  });
});
