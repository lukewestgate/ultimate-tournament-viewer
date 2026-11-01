import { describe, expect, it } from 'vitest';
import { rankTeams, poolStanding, type Result } from '../src/engine/standings';
import { pointsDiffPreset, ukuPreset } from '../src/engine/rulesPresets';
import { pointsFromText, rulesFromText, tiebreaksFromLines } from '../src/extract/rulesText';
import type { Game, Pool, Rules } from '../src/model/types';

const R = (a: string, sa: number, sb: number, b: string, extra: Partial<Result> = {}): Result => ({
  a,
  b,
  sa,
  sb,
  outcome: sa > sb ? 'A' : sb > sa ? 'B' : 'D',
  ...extra,
});
const order = (rk: ReturnType<typeof rankTeams>) => rk.rows.map((r) => r.team);
const uku = ukuPreset();

describe('points', () => {
  it('3 / 1 / 0, never 2 per win', () => {
    const rk = rankTeams(['A', 'B', 'C'], [R('A', 10, 5, 'B'), R('A', 7, 7, 'C'), R('B', 9, 3, 'C')], uku);
    expect(rk.rows.map((r) => [r.team, r.pts])).toEqual([
      ['A', 4],
      ['B', 3],
      ['C', 1],
    ]);
  });
  it('custom points from rules', () => {
    const rules: Rules = { ...uku, points: { win: 2, draw: 1, loss: 0 } };
    expect(rankTeams(['A', 'B'], [R('A', 2, 1, 'B')], rules).rows[0].pts).toBe(2);
  });
});

describe('UKU tie-breaks, criterion by criterion', () => {
  it('h2h wins between two tied teams', () => {
    // A and B both 6 pts; B beat A.
    const rs = [R('A', 10, 5, 'C'), R('A', 10, 5, 'D'), R('B', 11, 10, 'A'), R('B', 3, 10, 'C'), R('B', 10, 2, 'D'), R('C', 5, 5, 'D')];
    const rk = rankTeams(['A', 'B', 'C', 'D'], rs, uku);
    expect(order(rk).slice(0, 2)).toEqual(['B', 'A']);
    expect(rk.explanations[0]).toMatchObject({ above: 'B', below: 'A', rule: 'h2hWins' });
    expect(rk.explanations[0].text).toBe('B above A: level on 6 pts; head-to-head wins 1 vs 0');
  });

  it('forfeits only count when the sheet marks them', () => {
    // A, B, C beat each other in a cycle and all lost to E; B's loss was a marked forfeit.
    const rs = [R('A', 5, 4, 'B'), R('B', 5, 4, 'C'), R('C', 5, 4, 'A'), R('A', 3, 9, 'E'), R('C', 3, 9, 'E'), R('B', 0, 10, 'E', { forfeit: 'A' })];
    const rk = rankTeams(['A', 'B', 'C', 'E'], rs, uku);
    expect(order(rk)).toEqual(['E', 'C', 'A', 'B']);
    expect(rk.explanations.find((e) => e.below === 'B')!.rule).toBe('forfeits');
    // Without the marker, nobody has a forfeit and the group goes on to difference.
    const rk2 = rankTeams(['A', 'B', 'C', 'E'], rs.map((r) => ({ ...r, forfeit: undefined })), uku);
    expect(rk2.explanations.some((e) => e.rule === 'forfeits')).toBe(false);
  });

  it('three-way tie broken by head-to-head difference, then restarts on the remaining pair', () => {
    // A, B, C all 1-1 among themselves: A +2, B and C both -1 on difference; B beat C.
    const rs = [R('A', 10, 6, 'B'), R('B', 8, 5, 'C'), R('C', 8, 6, 'A'), R('A', 9, 1, 'D'), R('B', 9, 1, 'D'), R('C', 9, 1, 'D')];
    const rk = rankTeams(['A', 'B', 'C', 'D'], rs, uku);
    expect(order(rk)).toEqual(['A', 'B', 'C', 'D']);
    const rules = rk.explanations.map((e) => `${e.above}>${e.below}:${e.rule}`);
    expect(rules).toContain('A>B:h2hDiff');
    expect(rules).toContain('B>C:h2hWins'); // restarted from the first criterion for B and C
  });

  it('difference vs common opponents', () => {
    // A and B drew; both beat C (A by more) and both lost to D, so C and D are common opponents.
    const rs = [R('A', 5, 5, 'B'), R('A', 10, 2, 'C'), R('B', 6, 5, 'C'), R('C', 9, 0, 'D'), R('D', 1, 0, 'A'), R('D', 1, 0, 'B')];
    const rk = rankTeams(['A', 'B', 'C', 'D'], rs, uku);
    const e = rk.explanations.find((x) => x.above === 'A' && x.below === 'B')!;
    expect(e.rule).toBe('commonDiff');
    expect(e.text).toBe('A above B: level on 4 pts; difference vs common opponents +7 vs 0');
  });

  it('scored per game head to head', () => {
    const rules: Rules = { ...uku, tiebreaks: ['h2hDiff', 'h2hScoredPerGame'] };
    const rk = rankTeams(['A', 'B'], [R('A', 9, 9, 'B')], rules);
    expect(rk.tied).toHaveLength(1); // equal scored per game too -> still tied
    const rk2 = rankTeams(['A', 'B', 'C'], [R('A', 8, 8, 'B'), R('A', 9, 2, 'C'), R('B', 9, 2, 'C')], { ...uku, tiebreaks: ['commonScoredPerGame'] });
    expect(rk2.tied[0]?.teams.sort()).toEqual(['A', 'B']);
  });

  it('missing scores in a result-only entry give "depends on scores"', () => {
    const rs: Result[] = [{ a: 'A', b: 'B', outcome: 'A' }, { a: 'B', b: 'C', outcome: 'A' }, { a: 'C', b: 'A', outcome: 'A' }];
    const rk = rankTeams(['A', 'B', 'C'], rs, uku);
    expect(rk.tied).toEqual([{ teams: expect.arrayContaining(['A', 'B', 'C']), reason: 'depends on scores' }]);
    expect(rk.rows.every((r) => r.tiedWith.length === 2)).toBe(true);
  });

  it('uncomputable criteria leave the group tied with a reason', () => {
    const rk = rankTeams(['A', 'B'], [R('A', 5, 5, 'B')], uku);
    expect(rk.tied[0].reason).toMatch(/disc throw/);
  });
});

describe('points and difference preset', () => {
  it('h2h points, then whole-pool difference, then scored, then seed', () => {
    const p = pointsDiffPreset();
    const rk = rankTeams(['A', 'B', 'C'], [R('A', 5, 5, 'B'), R('A', 10, 2, 'C'), R('B', 6, 5, 'C')], p);
    expect(order(rk)).toEqual(['A', 'B', 'C']);
    expect(rk.explanations[0].rule).toBe('diff');
    const seeded = rankTeams(['A', 'B'], [R('A', 5, 5, 'B')], p, { A: 2, B: 1 });
    expect(order(seeded)).toEqual(['B', 'A']);
  });
});

describe('pool standings', () => {
  const mk = (id: string, a: string, sa: number | undefined, sb: number | undefined, b: string): Game => ({
    id,
    ref: id,
    day: 'Saturday',
    time: '10:00',
    start: Number(id.replace(/\D/g, '')) * 1000,
    end: 0,
    slotEnd: 0,
    pitch: { label: '1', order: 1 },
    stage: 'pool',
    pool: 'A',
    slots: [undefined, undefined],
    teams: [a, b],
    scores: [sa, sb],
    isGameToGo: false,
  });
  const pool: Pool = {
    name: 'A',
    stage: 'pool',
    slots: [{ slot: 'A1', team: 'X' }, { slot: 'A2', team: 'Y' }, { slot: 'A3', team: 'Z' }],
    sheetTable: [
      { team: 'X', rank: 2 },
      { team: 'Y', rank: 1 },
      { team: 'Z', rank: 3 },
    ],
  };
  const games = [mk('g1', 'X', 10, 2, 'Y'), mk('g2', 'X', 10, 2, 'Z'), mk('g3', 'Y', 10, 2, 'Z')];

  it('uses the sheet order for a complete pool and logs a disagreement', () => {
    const st = poolStanding(pool, games, uku);
    expect(st.complete).toBe(true);
    expect(st.source).toBe('sheet');
    expect(st.rows.map((r) => r.team)).toEqual(['Y', 'X', 'Z']);
    expect(st.disagreement).toMatch(/sheet order Y, X, Z; computed X, Y, Z/);
  });
  it("TD's tie-break decision wins", () => {
    const st = poolStanding({ ...pool, tdOrder: [{ rank: 1, team: 'Z' }] }, games, uku);
    expect(st.source).toBe('td');
    expect(st.rows[0].team).toBe('Z');
  });
  it('computes the order while the pool is in progress', () => {
    const st = poolStanding(pool, [games[0], { ...games[1], scores: [undefined, undefined] }, games[2]], uku);
    expect(st.complete).toBe(false);
    expect(st.source).toBe('computed');
    expect(st.rows[0].team).toBe('X');
  });
});

describe('rules from sheet text', () => {
  it('reads points', () => {
    expect(pointsFromText('3 for a win, 1 for a draw')).toMatchObject({ win: 3, draw: 1 });
    expect(pointsFromText('Three points for a win and one for a draw')).toMatchObject({ win: 3, draw: 1 });
    expect(pointsFromText('Points (3 for W, 1 for D)')).toMatchObject({ win: 3, draw: 1 });
  });
  it('reads tie-break lists inline and vertical', () => {
    expect(tiebreaksFromLines(['Pool Tiebreakers: Points > Head to Head (incl. PD) > Points Difference > Points Scored > Seeding'])).toEqual([
      'h2hPoints',
      'diff',
      'scored',
      'seed',
    ]);
    expect(tiebreaksFromLines(['Pool Tiebreakers', 'Points (3 for W, 1 for D)', 'Head to Head (incl. PD)', 'Points Difference', 'Points Scored', 'Seeding'])).toEqual([
      'h2hPoints',
      'diff',
      'scored',
      'seed',
    ]);
  });
  it('UKU section 6 reference gives the UKU preset', () => {
    expect(rulesFromText(['Pool tie-breaker rules: section 6 of UKU Tournament Rules'])?.preset).toBe('uku');
  });
});
