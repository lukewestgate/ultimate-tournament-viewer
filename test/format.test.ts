import { describe, expect, it } from 'vitest';
import { detectMapping } from '../src/mapping/detect';
import { extract } from '../src/extract/extract';
import { engineLevel, gameKey, inferFormat, poolSlotKey } from '../src/format/infer';
import { validateFormat } from '../src/format/validate';
import { resolve, type EffResult } from '../src/engine/resolve';
import { buildBoards } from '../src/engine/bracket';
import { resultOf } from '../src/engine/standings';
import type { Format, Game, Tournament } from '../src/model/types';
import { loadFixture, type FixtureName } from './helpers/fixtures';

function load(name: FixtureName) {
  const wb = loadFixture(name);
  const { mapping } = detectMapping(wb);
  const t = extract(wb, mapping, { id: name, sheetUrl: '', now: Date.UTC(2026, 9, 20) });
  const format = inferFormat(t, undefined, { template: mapping.template });
  return { t, format };
}

function realResults(t: Tournament): Map<string, EffResult> {
  const m = new Map<string, EffResult>();
  for (const g of t.games) {
    const r = resultOf(g);
    if (r) m.set(g.id, { sa: r.sa, sb: r.sb, outcome: r.outcome });
  }
  return m;
}

const byCode = (t: Tournament, code: string) => t.games.find((g) => g.code === code)!;
const src = (f: Format, g: Game, side: 0 | 1) => f.divisions[''].sources[gameKey(g.id, side)]?.source;

describe('format inference on the UKU template', () => {
  const { t, format } = load('uku-template');

  it('bracket graph worked examples', () => {
    const g = (c: string) => byCode(t, c).id;
    expect(src(format, byCode(t, '1v4'), 0)).toEqual({ kind: 'gameResult', game: g('1v8'), take: 'winner' });
    expect(src(format, byCode(t, '1v4'), 1)).toEqual({ kind: 'gameResult', game: g('4v5'), take: 'winner' });
    expect(src(format, byCode(t, '5v8'), 0)).toEqual({ kind: 'gameResult', game: g('4v5'), take: 'loser' });
    expect(src(format, byCode(t, '5v8'), 1)).toEqual({ kind: 'gameResult', game: g('1v8'), take: 'loser' });
    expect(src(format, byCode(t, '[4v5]'), 0)).toEqual({ kind: 'gameResult', game: g('3v4'), take: 'loser' });
    expect(src(format, byCode(t, '[4v5]'), 1)).toEqual({ kind: 'gameResult', game: g('5v6'), take: 'winner' });
    expect(src(format, byCode(t, '8v9'), 0)).toEqual({ kind: 'seed', seed: 8 });
  });

  it('power-pool slots take mapped seeds (R3) and carried results are recorded', () => {
    expect(format.divisions[''].sources[poolSlotKey('E', 'E1')].source).toEqual({ kind: 'seed', seed: 1 });
    expect(format.divisions[''].carried).toContainEqual({ pool: 'E', rule: 'earlierGameBetweenSameTeams' });
  });

  it('the format is complete (Full level) and valid', () => {
    expect(engineLevel(t, format, undefined)).toBe('full');
    expect(validateFormat(t, format)).toEqual([]);
  });

  it('final places come from the last game at each position (R5)', () => {
    const places = format.divisions[''].places!;
    expect(places[1].source).toEqual({ kind: 'gameResult', game: byCode(t, '1v2').id, take: 'winner' });
    expect(places[4].source).toEqual({ kind: 'gameResult', game: byCode(t, '[4v5]').id, take: 'winner' });
  });

  it('labels before results: 8v9 is 4F v 1G, E1 is 1A', () => {
    const r = resolve({ t, format, results: new Map() });
    const s = r.sides.get(byCode(t, '8v9').id)!;
    expect([s[0].label, s[1].label]).toEqual(['4F', '1G']);
    const e1 = r.sides.get(byCode(t, 'E1vE3').id)!;
    expect(e1[0].label).toBe('1A');
    expect(e1[0].possible.sort()).toEqual(['Leeds 3', 'Loughborough 1', 'Loughborough 5', 'Sheffield 2']);
  });

  it('R1-R5 with hand-entered results', () => {
    // Higher seed always wins 10-5.
    const seed = new Map(t.seeding.map((s) => [s.team, s.seed]));
    const results = new Map<string, EffResult>();
    const play = (r: ReturnType<typeof resolve>) => {
      for (const g of t.games) {
        if (results.has(g.id)) continue;
        const [a, b] = r.sides.get(g.id)!;
        if (!a.team || !b.team) continue;
        const aWins = (seed.get(a.team) ?? 99) < (seed.get(b.team) ?? 99);
        results.set(g.id, aWins ? { sa: 10, sb: 5, outcome: 'A' } : { sa: 5, sb: 10, outcome: 'B' });
      }
    };
    let r = resolve({ t, format, results });
    for (let i = 0; i < 12; i++) {
      play(r);
      r = resolve({ t, format, results, ended: true });
    }
    // Pool A: seeds 1,7,11,13 -> 1A is Loughborough 1 (seed 1) -> E1.
    expect(r.sides.get(byCode(t, 'E1vE3').id)![0].team).toBe('Loughborough 1');
    expect(r.standings.get('A')!.rows.map((x) => x.team)).toEqual(['Loughborough 1', 'Sheffield 2', 'Loughborough 5', 'Leeds 3']);
    // With seeds always winning, final places follow seeds.
    const places = r.places.get('')!;
    expect(places.slice(0, 4).map((p) => p.team)).toEqual(['Loughborough 1', 'Leeds 1', 'Sheffield 1', 'Loughborough 2']);
    expect(places).toHaveLength(16);
  });

  it('game to go not played: places fall back to the earlier result', () => {
    const results = new Map<string, EffResult>();
    const r0 = resolve({ t, format, results, ended: true });
    expect(r0.places.get('')).toBeDefined();
  });

  it('one bracket board per block of places', () => {
    const boards = buildBoards(t, format);
    expect(boards.map((b) => b.title)).toEqual(['1st–8th', '9th–16th']);
    expect(boards[0].rounds[0].map((id) => t.games.find((g) => g.id === id)!.code)).toContain('8v9');
  });
});

describe('format inference with a division prefix (list-codes)', () => {
  const { t, format } = load('list-codes');
  it("the Women's bracket fills from code conventions", () => {
    const f = format.divisions['Women'];
    const g = byCode(t, 'W1v4');
    expect(f.sources[gameKey(g.id, 0)].source).toEqual({ kind: 'seed', seed: 1 });
    expect(f.sources[gameKey(g.id, 1)].source).toEqual({ kind: 'gameResult', game: byCode(t, 'W4v5').id, take: 'winner' });
    expect(engineLevel(t, format, 'Women')).toBe('full');
  });
  it('predictions are checked against the names the sheet filled in', () => {
    const r = resolve({ t, format, results: realResults(t) });
    const women = t.games.filter((g) => g.division === 'Women' && g.stage === 'placement');
    const statuses = women.flatMap((g) => [0, 1].map((i) => r.checks.get(gameKey(g.id, i as 0 | 1))));
    expect(statuses.filter((s) => s === 'confirmed').length).toBeGreaterThan(women.length);
    // W3v6 = 3rd v 6th in pool E
    const s = r.sides.get(byCode(t, 'W3v6').id)!;
    expect(s[0].label).toBe('3E');
    expect(s[0].team).toBe('Baaarmy Women');
  });
});

describe('format validation', () => {
  const { t, format } = load('uku-template');
  it('rejects cycles and duplicate fills', () => {
    const bad: Format = JSON.parse(JSON.stringify(format));
    const f = bad.divisions[''];
    const g18 = byCode(t, '1v8');
    const g14 = byCode(t, '1v4');
    // 1v8 takes from a later game: a cycle.
    f.sources[gameKey(g18.id, 0)] = { source: { kind: 'gameResult', game: g14.id, take: 'winner' }, origin: 'user', status: 'unverified' };
    // 5v8 also takes the winner of 4v5 (already used by 1v4).
    f.sources[gameKey(byCode(t, '5v8').id, 0)] = { source: { kind: 'gameResult', game: byCode(t, '4v5').id, take: 'winner' }, origin: 'user', status: 'unverified' };
    const errs = validateFormat(t, bad);
    expect(errs.some((e) => /cycle/.test(e))).toBe(true);
    expect(errs.some((e) => /already used/.test(e))).toBe(true);
  });
  it('a format with no known sources is Basic', () => {
    expect(engineLevel(t, { divisions: {} }, undefined)).toBe('basic');
  });
  it('the sheet wins over a wrong prediction and the source becomes doubtful', () => {
    const { t: lc, format: lf } = load('list-codes');
    const g = byCode(lc, 'W1v2');
    const wrong: Format = JSON.parse(JSON.stringify(lf));
    wrong.divisions['Women'].sources[gameKey(g.id, 0)] = { source: { kind: 'team', team: 'Daisy Duck' }, origin: 'user', status: 'unverified' };
    const r = resolve({ t: lc, format: wrong, results: realResults(lc) });
    const side = r.sides.get(g.id)![0];
    expect(side.team).toBe(g.teams[0]);
    expect(side.doubtful).toBe(true);
    expect(r.checks.get(gameKey(g.id, 0))).toBe('doubtful');
  });
});
