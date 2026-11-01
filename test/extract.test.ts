import { describe, expect, it } from 'vitest';
import { detectMapping, ukuSignals } from '../src/mapping/detect';
import { extract } from '../src/extract/extract';
import { mergeSuggestions, problemsOnly, qualityCheck } from '../src/extract/quality';
import { validateMapping } from '../src/mapping/validate';
import { slotsFromCode, parseSlotLabel } from '../src/format/labels';
import { zonedEpoch, wallClock } from '../src/engine/time';
import { FIXTURES, loadFixture, type FixtureName } from './helpers/fixtures';
import type { Tournament } from '../src/model/types';

const NOW = Date.UTC(2026, 9, 20);
const cache = new Map<string, Tournament>();
function load(name: FixtureName) {
  const wb = loadFixture(name);
  const { mapping } = detectMapping(wb);
  let t = cache.get(name);
  if (!t) {
    t = extract(wb, mapping, { id: name, sheetUrl: 'https://example.test', now: NOW });
    cache.set(name, t);
  }
  return { wb, mapping, t };
}

const scheduled = (t: Tournament) => t.games.filter((g) => !g.unscheduled);

describe('golden fixtures', () => {
  it.each(FIXTURES)('%s: auto mapping has no quality problems and is valid', (name) => {
    const { wb, mapping, t } = load(name);
    expect(validateMapping(wb, mapping)).toEqual([]);
    expect(problemsOnly(qualityCheck(t, mapping, wb))).toEqual([]);
  });

  it('game counts', () => {
    const counts = Object.fromEntries(FIXTURES.map((f) => [f, load(f).t.games.length]));
    expect(counts).toEqual({
      'uku-template': 69,
      'grid-exp-beg': 136,
      'grid-dated': 107,
      'list-round-robin': 105,
      'list-codes': 166,
      'outdoor-1': 220,
      'outdoor-2': 40,
      'outdoor-3': 75,
    });
  });

  it('extracts within the time budget', () => {
    const wb = loadFixture('outdoor-1');
    const { mapping } = detectMapping(wb);
    const t0 = performance.now();
    extract(wb, mapping, { id: 'x', sheetUrl: '', now: NOW });
    expect(performance.now() - t0).toBeLessThan(250); // spec target 50 ms in a browser; generous for CI
  });
});

describe('uku-template', () => {
  const { mapping, t } = load('uku-template');
  it('is detected as the UKU template by several signals', () => {
    expect(mapping.template).toBe('uku');
    expect(ukuSignals(loadFixture('uku-template'))).toBeGreaterThanOrEqual(4);
  });
  it('reads days, dates, draft, title and no divisions', () => {
    expect(t.days).toEqual([
      { name: 'Saturday', date: '2026-10-31', dateSource: 'sheet' },
      { name: 'Sunday', date: '2026-11-01', dateSource: 'sheet' },
    ]);
    expect(t.isDraft).toBe(true);
    expect(t.title).toMatch(/^Yorkshire & East Mids University Mixed Indoor Regionals/);
    expect(t.divisions).toEqual([]);
    expect(t.teams).toHaveLength(16);
  });
  it('reads pools, power pools and stages', () => {
    expect(t.pools.map((p) => `${p.name}:${p.stage}`).sort()).toEqual(
      ['A:pool', 'B:pool', 'C:pool', 'D:pool', 'E:powerPool', 'F:powerPool', 'G:powerPool', 'H:powerPool'].sort(),
    );
    expect(t.pools.find((p) => p.name === 'A')!.slots.map((s) => s.team)).toEqual(['Loughborough 1', 'Sheffield 2', 'Loughborough 5', 'Leeds 3']);
    expect(t.pools.find((p) => p.name === 'E')!.carried).toEqual([
      { slotA: 'E1', slotB: 'E4' },
      { slotA: 'E2', slotB: 'E3' },
    ]);
    expect(t.games.filter((g) => g.stage === 'placement')).toHaveLength(29);
  });
  it('first and last games, game to go', () => {
    const first = t.games[0];
    expect(first).toMatchObject({ day: 'Saturday', time: '09:30', code: 'A1vA3', teams: ['Loughborough 1', 'Loughborough 5'], pitch: { label: '1' } });
    const last = t.games[t.games.length - 1];
    expect(last).toMatchObject({ day: 'Sunday', time: '15:55', code: '[4v5]', slots: ['4', '5'], isGameToGo: true });
  });
  it('timing from the Schedule tab, with the DST change', () => {
    expect(t.timing.map((x) => [x.day, x.gameMins, x.slotMins])).toEqual([
      ['Saturday', 24, 30],
      ['Sunday', 28, 35],
    ]);
    // BST ended on 25 Oct 2026, so this weekend is GMT.
    expect(new Date(t.games[0].start).toISOString()).toBe('2026-10-31T09:30:00.000Z');
  });
  it('rules: UKU preset (3/1/0)', () => {
    expect(t.rules.points).toEqual({ win: 3, draw: 1, loss: 0 });
    expect(t.rules.tiebreaks[0]).toBe('h2hWins');
  });
  it('spirit link and spirit table', () => {
    expect(t.links.spirit).toMatch(/forms/);
    expect(t.spirit).toHaveLength(16);
  });
});

describe('grid-exp-beg', () => {
  const { t } = load('grid-exp-beg');
  it('divisions from seeding labels', () => {
    expect(t.divisions.map((d) => d.name)).toEqual(['Experienced', 'Beginner']);
  });
  it('grid with shared start column, slot codes and seed numbers', () => {
    expect(t.games[0]).toMatchObject({ time: '09:00', slots: ['G3', 'G4'], teams: ['Newcastle Pies Begs', 'Sheff Grapefruits'], scores: [6, 4] });
    const sunday = t.games.filter((g) => g.day === 'Sunday');
    expect(sunday).toHaveLength(64);
  });
  it('a team literally called Bye is a team (it has results)', () => {
    expect(t.teams.some((x) => x.name === 'Bye')).toBe(true);
  });
  it('nickname pool table: nicknames are not teams', () => {
    expect(t.teams.some((x) => x.name === 'PopTarts' || x.name === 'Steal')).toBe(false);
    const j = t.pools.find((p) => p.name === 'J')!;
    expect(j.division).toBe('Beginner');
    expect(t.games.filter((g) => g.pool === 'J')).toHaveLength(6);
  });
  it('suggests typo merges within a division', () => {
    const s = mergeSuggestions(t);
    expect(s).toContainEqual({ division: 'Beginner', keep: 'Jesters Begs', merge: 'Jester Begs' });
    expect(s).toContainEqual({ division: 'Experienced', keep: 'Warwick Bears', merge: 'Warwick' });
  });
  it('guesses dates and flags them', () => {
    expect(t.days.every((d) => d.dateSource === 'guessed')).toBe(true);
    expect(t.days[0].date).toBe('2026-10-17');
  });
});

describe('grid-dated', () => {
  const { t } = load('grid-dated');
  it('dated header rows and lettered pitches', () => {
    expect(t.days).toEqual([
      { name: 'Saturday', date: '2026-10-24', dateSource: 'sheet' },
      { name: 'Sunday', date: '2026-10-25', dateSource: 'sheet' },
    ]);
    expect([...new Set(t.games.map((g) => g.pitch.label))]).toEqual(['1a', '1b', '2']);
  });
  it('ignores the typo game that links divisions', () => {
    expect(t.divisions.map((d) => d.name)).toEqual(['Experienced', 'Beginners']);
    expect(t.teams.filter((x) => x.division === 'Beginners')).toHaveLength(14);
  });
  it('crosses the DST change between Saturday and Sunday', () => {
    expect(new Date(t.games[0].start).toISOString()).toBe('2026-10-24T08:00:00.000Z'); // 09:00 BST
    const sun = t.games.find((g) => g.day === 'Sunday')!;
    expect(new Date(sun.start).toISOString()).toBe('2026-10-25T08:45:00.000Z'); // 08:45 GMT
  });
  it('reads w/l result marks', () => {
    const g = t.games.find((x) => x.time === '17:15' && x.day === 'Sunday')!;
    expect(g.marks).toEqual(['W', 'L']);
  });
  it('explicit finish -> seed table', () => {
    expect(t.pools.find((p) => p.name === 'A')!.finishToSeed).toEqual({ 1: 1, 2: 6, 3: 12, 4: 14 });
  });
  it('suggests "Lancaster" -> "Lancaster Fish"', () => {
    expect(mergeSuggestions(t)).toContainEqual({ division: 'Experienced', keep: 'Lancaster Fish', merge: 'Lancaster' });
  });
});

describe('list-round-robin', () => {
  const { mapping, t } = load('list-round-robin');
  it('flat list plus a Finals tab without days (last day)', () => {
    expect(mapping.games.map((g) => g.tab)).toEqual(['Gamelist', 'Finals']);
    const finals = t.games.filter((g) => g.ref.startsWith('Finals'));
    expect(finals).toHaveLength(9);
    expect(finals.every((g) => g.day === 'Sunday' && g.stage === 'placement')).toBe(true);
  });
  it('O/W letters become Open / Womens; 09:00 AM times', () => {
    expect(t.divisions.map((d) => d.name)).toEqual(['Open', 'Womens']);
    expect(t.games[0].time).toBe('09:00');
  });
  it('duplicate pool tables are skipped', () => {
    expect(t.pools.map((p) => p.name)).toEqual(['Open Pool', 'Womens Pool']);
    expect(t.games.filter((g) => g.pool === 'Open Pool')).toHaveLength(66);
  });
  it('rules from text: points then difference', () => {
    expect(t.rules.source).toBe('sheet');
    expect(t.rules.tiebreaks.slice(0, 2)).toEqual(['diff', 'scored']);
  });
});

describe('list-codes', () => {
  const { t } = load('list-codes');
  it('codes give slots, including division prefixes', () => {
    expect(t.games[0]).toMatchObject({ code: 'A1vA6', slots: ['A1', 'A6'] });
    const w = t.games.find((g) => g.code === 'W3v6')!;
    expect(w.slots).toEqual(['W3', '6']);
    expect(w.division).toBe('Women');
    expect(w.stage).toBe('placement');
  });
  it('pools A-E with full round robins', () => {
    expect(t.pools.map((p) => [p.name, p.division, t.games.filter((g) => g.pool === p.name).length])).toEqual([
      ['A', 'Open', 21],
      ['B', 'Open', 21],
      ['C', 'Open', 21],
      ['D', 'Open', 21],
      ['E', 'Women', 28],
    ]);
  });
  it('hyperlinked spirit and stream links', () => {
    expect(t.links.spirit).toMatch(/forms/);
    expect(t.links.stream).toMatch(/youtube/);
  });
  it('rules: "Points (3 for W, 1 for D)" with head to head list', () => {
    expect(t.rules.points).toEqual({ win: 3, draw: 1, loss: 0 });
  });
});

describe('outdoor-1', () => {
  const { t } = load('outdoor-1');
  it('competitions within codes, named from seeding', () => {
    expect(t.divisions.map((d) => [d.name, d.code, t.teams.filter((x) => x.division === d.name).length])).toEqual([
      ['Women', 'W', 20],
      ['Men D1', 'M', 16],
      ['Men D2', 'M', 11],
      ['Men D3', 'M', 7],
      ['Uni Fans', 'X', 20],
    ]);
    expect(t.divisions.find((d) => d.name === 'Men D2')!.group).toBe('Men');
  });
  it('the same name in two divisions is two teams', () => {
    expect(t.teams.filter((x) => x.name === 'Leeds 1 (N1)').map((x) => x.division).sort()).toEqual(['Men D1', 'Women']);
  });
  it('Greek pool ids and 2-team pools', () => {
    const names = t.pools.map((p) => p.name);
    for (const n of ['Γ', 'Δ', 'Ω', 'Σ', 'Π', 'α', 'β', 'T']) expect(names).toContain(n);
    expect(t.pools.find((p) => p.name === 'T')!.slots).toHaveLength(2);
  });
  it('BYE is not a team; region tags kept, club without them', () => {
    expect(t.teams.some((x) => /^bye$/i.test(x.name))).toBe(false);
    const leeds = t.teams.find((x) => x.name === 'Leeds 1 (N1)')!;
    expect(leeds.tag).toBe('N1');
    expect(leeds.club).toBe('Leeds');
  });
  it('final standings per section, tie break log, per-division spirit forms', () => {
    expect(new Set(t.finalStandings!.map((s) => s.section))).toEqual(
      new Set(["Women's Championship", "Women's Trophy", "Men's Championship", "Men's Trophy", "Men's Plate", 'Uni Fans']),
    );
    expect(t.pools.find((p) => p.name === 'D')!.tdOrder).toContainEqual({ rank: 1, team: 'Sheffield 1 (N3)' });
    expect(t.links.items.filter((i) => /spirit/i.test(i.label)).length).toBeGreaterThanOrEqual(5);
  });
  it('long games with caps', () => {
    expect(t.timing[0]).toMatchObject({ gameMins: 60, capMins: 20 });
  });
});

describe('outdoor-2', () => {
  const { t } = load('outdoor-2');
  it('single day; unused Sunday rows are unscheduled', () => {
    expect(t.days.map((d) => [d.name, d.date])).toEqual([['Saturday', '2026-09-19']]);
    expect(t.games.filter((g) => g.unscheduled)).toHaveLength(2);
    expect(scheduled(t)).toHaveLength(38);
  });
  it('Open and Women, with #N/A as no division', () => {
    expect(t.divisions.map((d) => d.name)).toEqual(['Open', 'Women']);
    expect(t.pools.find((p) => p.name === 'K')!.division).toBe('Women');
  });
  it('suggests "Gateways" / "Gateways U20"', () => {
    expect(mergeSuggestions(t)).toContainEqual({ division: 'Women', keep: 'Gateways U20', merge: 'Gateways' });
  });
  it('pitch map link', () => {
    expect(t.links.pitchMap).toMatch(/drive\.google/);
  });
});

describe('outdoor-3', () => {
  const { mapping, t } = load('outdoor-3');
  it('template detected despite the overwritten Game header', () => {
    expect(mapping.template).toBe('uku');
    expect(t.games[0].code).toBe('D1vD3');
  });
  it('X/W/O divisions and 90-minute slots', () => {
    expect(t.divisions.map((d) => d.code)).toEqual(['X', 'O', 'W']);
    expect(t.timing[0].slotMins).toBe(90);
  });
});

describe('labels and codes', () => {
  it('parses slot labels', () => {
    expect(parseSlotLabel('Winner 8v9')).toEqual({ kind: 'game', take: 'winner', ref: '8v9' });
    expect(parseSlotLabel('W QF1')).toEqual({ kind: 'game', take: 'winner', ref: 'QF1' });
    expect(parseSlotLabel('Loser G12')).toEqual({ kind: 'game', take: 'loser', ref: '12' });
    expect(parseSlotLabel('L SF2')).toEqual({ kind: 'game', take: 'loser', ref: 'SF2' });
    expect(parseSlotLabel('1st Pool A')).toEqual({ kind: 'poolFinish', pool: 'A', place: 1 });
    expect(parseSlotLabel('2A')).toEqual({ kind: 'poolFinish', pool: 'A', place: 2 });
    expect(parseSlotLabel('A1')).toEqual({ kind: 'poolSlot', slot: 'A1' });
    expect(parseSlotLabel('Seed 5')).toEqual({ kind: 'seed', seed: 5 });
    expect(parseSlotLabel('#5')).toEqual({ kind: 'seed', seed: 5 });
    expect(parseSlotLabel('Best 3rd')).toEqual({ kind: 'ranked', place: 3, rank: 1 });
    expect(parseSlotLabel('2nd best runner-up')).toEqual({ kind: 'ranked', place: 2, rank: 2 });
    expect(parseSlotLabel('Lancaster')).toBeUndefined();
    expect(parseSlotLabel('Warwick')).toBeUndefined();
    expect(parseSlotLabel('Y9', true)).toBeUndefined();
  });
  it('slots from codes', () => {
    expect(slotsFromCode('A1vA3')).toEqual({ slots: ['A1', 'A3'], gameToGo: false });
    expect(slotsFromCode('[4v5]')).toEqual({ slots: ['4', '5'], gameToGo: true });
    expect(slotsFromCode('α1vα2')?.slots).toEqual(['α1', 'α2']);
    expect(slotsFromCode('Lloyd Park v Gateways')).toBeUndefined();
  });
  it('wall clock round trip across DST', () => {
    const e = zonedEpoch('2026-10-25', 90, 'Europe/London'); // 01:30 on the change day
    expect(wallClock(e, 'Europe/London').mins).toBe(90);
    expect(wallClock(zonedEpoch('2026-03-29', 600, 'Europe/London'), 'Europe/London')).toEqual({ date: '2026-03-29', mins: 600 });
  });
});
