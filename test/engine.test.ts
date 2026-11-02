import { describe, expect, it } from 'vitest';
import { detectMapping } from '../src/mapping/detect';
import { extract } from '../src/extract/extract';
import { inferFormat } from '../src/format/infer';
import { buildView, pathsAhead, possibleGames, teamGames } from '../src/engine/view';
import { decodeScenario, encodeScenario, effectiveResults, pruneScenario, type Scenario } from '../src/engine/scenario';
import { possibleFinishes, outlook } from '../src/engine/finishes';
import { whatDoWeNeed } from '../src/engine/whatneed';
import { gameStatus } from '../src/engine/status';
import { ukuPreset } from '../src/engine/rulesPresets';
import type { Result } from '../src/engine/standings';
import type { Game, Tournament } from '../src/model/types';
import { loadFixture, type FixtureName } from './helpers/fixtures';

function load(name: FixtureName) {
  const wb = loadFixture(name);
  const { mapping } = detectMapping(wb);
  const t = extract(wb, mapping, { id: name, sheetUrl: '', now: Date.UTC(2026, 9, 20) });
  return { t, format: inferFormat(t, undefined, { template: mapping.template }) };
}
const byCode = (t: Tournament, c: string) => t.games.find((g) => g.code === c)!;
const R = (a: string, sa: number, sb: number, b: string): Result => ({ a, b, sa, sb, outcome: sa > sb ? 'A' : sb > sa ? 'B' : 'D' });
const uku = ukuPreset();

describe('status', () => {
  const g = { start: 1000, end: 2000, slotEnd: 2500, isBye: false } as Game;
  it('upcoming / live / finishing / awaiting / final', () => {
    expect(gameStatus(g, 500, false, 3000, false, true)).toBe('upcoming');
    expect(gameStatus(g, 1500, false, 3000, false, true)).toBe('live');
    expect(gameStatus(g, 2100, false, 3000, false, true)).toBe('finishing');
    expect(gameStatus(g, 3100, false, 3000, false, true)).toBe('awaiting');
    expect(gameStatus(g, 1500, true, 3000, false, true)).toBe('final'); // finished early (first to 15)
  });
  it('conditional games: if required, then not played', () => {
    const c = { ...g, conditional: true } as Game;
    expect(gameStatus(c, 500, false, undefined, false, false)).toBe('ifRequired');
    expect(gameStatus(c, 9999, false, undefined, true, false)).toBe('notPlayed');
  });
});

describe('what-if scenarios', () => {
  const { t, format } = load('grid-dated');
  const poolA = t.games.filter((g) => g.pool === 'A');

  it('URL round trip', () => {
    const s: Scenario = { [poolA[0].id]: { outcome: 'B' }, [poolA[1].id]: { outcome: 'A', sa: 11, sb: 9, override: true } };
    expect(decodeScenario(encodeScenario(s))).toEqual(s);
  });

  it('real results stay fixed unless overridden; hypothetical results are dropped when real ones exist', () => {
    const g = poolA[0];
    const { results, dropped } = effectiveResults(t, { scenario: { [g.id]: { outcome: 'B' } } });
    expect(dropped).toEqual([g.id]);
    expect(results.get(g.id)?.hypothetical).toBeUndefined();
    expect(pruneScenario({ [g.id]: { outcome: 'B' } }, dropped)).toEqual({});
    const o = effectiveResults(t, { scenario: { [g.id]: { outcome: 'B', override: true } } });
    expect(o.results.get(g.id)).toMatchObject({ outcome: 'B', hypothetical: true });
  });

  it('overriding a real result changes the pool table', () => {
    const v0 = buildView(t, format, { now: Date.UTC(2026, 11, 1) });
    const first = v0.standings.get('A')!.rows[0].team;
    // Make the leader lose every game.
    const scenario: Scenario = {};
    for (const g of poolA) {
      const i = g.teams.indexOf(first);
      if (i >= 0) scenario[g.id] = { outcome: i === 0 ? 'B' : 'A', sa: i === 0 ? 1 : 15, sb: i === 0 ? 15 : 1, override: true };
    }
    const v1 = buildView(t, format, { now: Date.UTC(2026, 11, 1), scenario });
    expect(v1.standings.get('A')!.rows[3].team).toBe(first);
    expect(v1.byId.get(Object.keys(scenario)[0])!.hypothetical).toBe(true);
  });

  it('quick results flow into brackets on the UKU template', () => {
    const { t: u, format: uf } = load('uku-template');
    const before = buildView(u, uf, { now: Date.UTC(2026, 9, 31, 7) });
    const g = byCode(u, 'A1vA3');
    expect(before.byId.get(g.id)!.result).toBeUndefined();
    const s: Scenario = {};
    for (const x of u.games.filter((y) => y.pool === 'A')) s[x.id] = { outcome: 'A', sa: 10, sb: 5 };
    const after = buildView(u, uf, { now: Date.UTC(2026, 9, 31, 7), scenario: s });
    expect(after.standings.get('A')!.complete).toBe(true);
    expect(after.byId.get(byCode(u, 'E1vE3').id)!.sides[0]).toMatchObject({ team: 'Loughborough 1', hypothetical: true });
  });

  it('exact scores change the tie-break order', () => {
    const teams = ['A', 'B', 'C'];
    // Cycle; C's margin decides head-to-head difference.
    const base = [R('A', 10, 8, 'B'), R('B', 10, 8, 'C')];
    const close = possibleFinishes(teams, [...base, R('C', 10, 9, 'A')], [], uku);
    const big = possibleFinishes(teams, [...base, R('C', 10, 5, 'A')], [], uku);
    expect([...close.places.get('A')!]).toEqual([1]);
    expect([...big.places.get('C')!]).toEqual([1]);
  });
});

describe('possible finishes', () => {
  it('enumerates remaining outcomes; clinched and eliminated', () => {
    const teams = ['A', 'B', 'C', 'D'];
    const played = [R('A', 10, 0, 'B'), R('A', 10, 0, 'C'), R('B', 10, 0, 'C'), R('D', 10, 0, 'C')];
    const open = [
      { id: '1', a: 'A', b: 'D' },
      { id: '2', a: 'B', b: 'D' },
    ];
    const f = possibleFinishes(teams, played, open, uku);
    expect(f.approximate).toBe(false);
    expect(outlook(f, 'C', 4)).toMatchObject({ best: 4, worst: 4, eliminatedFrom: 3 });
    expect(outlook(f, 'A', 4).best).toBe(1);
    expect(f.places.get('A')!.has(4)).toBe(false);
  });
  it('approximates when there are too many open games', () => {
    const teams = 'ABCDEFG'.split('');
    const open = [];
    for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) open.push({ id: `${i}${j}`, a: teams[i], b: teams[j] });
    expect(possibleFinishes(teams, [], open, uku).approximate).toBe(true);
  });
});

describe('what do we need?', () => {
  const teams = ['Leeds 1', 'Sheffield 2', 'York 1', 'Leeds 3'];
  const ctx = (played: Result[], open: { id: string; a: string; b: string }[], team = 'Leeds 1', target = 2) => ({ team, target, teams, played, open, rules: uku, seeds: {} });

  it('already through / can not', () => {
    const played = [R('Leeds 1', 10, 0, 'York 1'), R('Leeds 1', 10, 0, 'Leeds 3'), R('Leeds 1', 10, 0, 'Sheffield 2'), R('Sheffield 2', 10, 0, 'York 1'), R('Sheffield 2', 10, 0, 'Leeds 3')];
    expect(whatDoWeNeed(ctx(played, [{ id: 'x', a: 'York 1', b: 'Leeds 3' }])).verdict).toBe('through');
    expect(whatDoWeNeed(ctx(played, [{ id: 'x', a: 'York 1', b: 'Leeds 3' }], 'Leeds 3', 1)).verdict).toBe('out');
  });

  it('a win is enough; a draw is enough if another result goes your way', () => {
    // Leeds 1 and Sheffield 2 both 3 pts, York 1 3 pts; Leeds 1 v York 1 and Sheffield 2 v Leeds 3 left.
    const played = [R('Leeds 1', 10, 5, 'Leeds 3'), R('Sheffield 2', 10, 5, 'Leeds 1'), R('York 1', 10, 5, 'Sheffield 2'), R('York 1', 10, 5, 'Leeds 3')];
    const open = [
      { id: 'a', a: 'Leeds 1', b: 'York 1' },
      { id: 'b', a: 'Sheffield 2', b: 'Leeds 3' },
    ];
    const r = whatDoWeNeed(ctx(played, open));
    expect(r.verdict).toBe('depends');
    // A win leaves a three-way tie on head-to-head, so it isn't enough on its own; a draw is if Sheffield 2 lose.
    expect(r.conditions).toContain('Draw vs York 1 is enough if Sheffield 2 lose to Leeds 3.');
    // Simplest sufficient own result first.
    const played2 = [R('Leeds 1', 10, 5, 'Leeds 3'), R('York 1', 10, 5, 'Sheffield 2'), R('York 1', 10, 5, 'Leeds 3')];
    expect(whatDoWeNeed(ctx(played2, open)).conditions[0]).toBe('Draw vs York 1 — then top 2 whatever else happens.');
  });

  it('margin conditions when a win leaves a score-based tie', () => {
    // Leeds 1 lost to Sheffield 2 by 3; if Leeds 1 beat York 1 the three are level and margins matter.
    const played = [R('Sheffield 2', 10, 7, 'Leeds 1'), R('York 1', 10, 9, 'Sheffield 2'), R('Leeds 1', 10, 0, 'Leeds 3'), R('Sheffield 2', 10, 0, 'Leeds 3'), R('York 1', 10, 0, 'Leeds 3')];
    const r = whatDoWeNeed(ctx(played, [{ id: 'a', a: 'Leeds 1', b: 'York 1' }]));
    expect(r.conditions.some((c) => /^Win by \d+ or more vs York 1/.test(c))).toBe(true);
  });

  it('says so when the search is too large', () => {
    const open = Array.from({ length: 9 }, (_, i) => ({ id: String(i), a: 'York 1', b: 'Leeds 3' }));
    expect(whatDoWeNeed(ctx([], open)).verdict).toBe('tooLarge');
  });
});

describe('replay', () => {
  const { t, format } = load('grid-dated');
  const at = Date.UTC(2026, 9, 24, 10, 0); // Saturday 11:00 BST

  it('scores hidden after T; live and upcoming at T', () => {
    const v = buildView(t, format, { now: Date.UTC(2026, 11, 1), at });
    const early = v.games.find((x) => x.g.end <= at)!;
    const live = v.games.find((x) => x.g.start <= at && x.g.end > at)!;
    const later = v.games.find((x) => x.g.start > at)!;
    expect(early.status).toBe('final');
    expect(live.status).toBe('live');
    expect(live.result).toBeUndefined();
    expect(later.status).toBe('upcoming');
    expect(later.result).toBeUndefined();
  });

  it('resolved names that depend on unknown results are hidden', () => {
    const { t: lc, format: lf } = load('list-codes');
    const sat = Date.UTC(2026, 9, 17, 12); // Saturday, pools in progress
    const v = buildView(lc, lf, { now: Date.UTC(2026, 11, 1), at: sat });
    const g = v.byId.get(byCode(lc, 'W1v4').id)!;
    expect(g.sides[0].team).toBeUndefined();
    expect(g.sides[0].label).toBe('1E');
    expect(g.sides[0].possible.length).toBeGreaterThan(1);
    const live = buildView(lc, lf, { now: Date.UTC(2026, 11, 1) });
    expect(live.byId.get(byCode(lc, 'W1v4').id)!.sides[0].team).toBe(byCode(lc, 'W1v4').teams[0]);
  });

  it('combined with what-if', () => {
    const g = t.games.find((x) => x.start > at && x.pool)!;
    const v = buildView(t, format, { now: Date.UTC(2026, 11, 1), at, scenario: { [g.id]: { outcome: 'A', sa: 9, sb: 3 } } });
    expect(v.byId.get(g.id)!.result).toMatchObject({ outcome: 'A', hypothetical: true });
    expect(v.dropped).toEqual([]); // the real result isn't known yet at T
  });

  it('simulated future results are marked', () => {
    const v = buildView(t, format, { now: Date.UTC(2026, 11, 1), at, simulate: true });
    const later = v.games.find((x) => x.g.start > at && !x.g.isBye)!;
    expect(later.simulated).toBe(true);
    expect(later.status).toBe('final');
  });
});

describe('team paths and possible games', () => {
  const { t, format } = load('uku-template');
  it('paths ahead from the next placement game, with final-place outcomes', () => {
    const s: Scenario = {};
    // Play every pool and power-pool game: home side wins.
    const v0 = buildView(t, format, { now: Date.UTC(2026, 9, 31, 7) });
    for (const x of v0.games.filter((y) => y.g.stage !== 'placement')) s[x.g.id] = { outcome: 'A', sa: 10, sb: 5 };
    let v = buildView(t, format, { now: Date.UTC(2026, 9, 31, 7), scenario: s });
    for (const x of v.games.filter((y) => y.g.stage !== 'placement')) s[x.g.id] = { outcome: 'A', sa: 10, sb: 5 };
    v = buildView(t, format, { now: Date.UTC(2026, 9, 31, 7), scenario: s });
    const g = v.byId.get(byCode(t, '1v8').id)!;
    const team = g.sides[0].team!;
    expect(team).toBeDefined();
    const p = pathsAhead(v, team, undefined)!;
    expect(p.game.g.code).toBe('1v8');
    expect((p.win as { game: { g: Game } }).game.g.code).toBe('1v4');
    expect((p.lose as { game: { g: Game } }).game.g.code).toBe('5v8');
    expect(teamGames(v, team).length).toBeGreaterThan(5);
  });
  it('possible later games before results', () => {
    const v = buildView(t, format, { now: Date.UTC(2026, 9, 31, 7) });
    expect(possibleGames(v, 'Loughborough 1').some((x) => x.g.code === 'E1vE3')).toBe(true);
  });
  it('where pool places lead', () => {
    const v = buildView(t, format, { now: Date.UTC(2026, 9, 31, 7) });
    expect([...(v.leads.get('A#1') ?? [])]).toContain('Pool E');
    expect([...(v.leads.get('F#4') ?? [])]).toContain('8v9');
  });
});

import { fuzzyScore } from '../src/ui/screens/Search';
describe('search', () => {
  it('fuzzy team names', () => {
    expect(fuzzyScore('lboro 2', 'Loughborough 2')).toBeGreaterThan(0);
    expect(fuzzyScore('lboro 2', 'Loughborough 3')).toBe(0);
    expect(fuzzyScore('shef', 'Sheffield 1')).toBeGreaterThan(fuzzyScore('shef', 'Leeds 1'));
    expect(fuzzyScore('york', 'York 1 (N4)')).toBe(80);
  });
});
