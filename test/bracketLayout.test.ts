import { describe, expect, it } from 'vitest';
import { detectMapping } from '../src/mapping/detect';
import { extract } from '../src/extract/extract';
import { inferFormat } from '../src/format/infer';
import { buildBoards } from '../src/engine/bracket';
import { boardSections, columnNames, elbow, layoutColumns } from '../src/ui/bracketLayout';
import type { Tournament } from '../src/model/types';
import { loadFixture, type FixtureName } from './helpers/fixtures';

function load(name: FixtureName) {
  const wb = loadFixture(name);
  const { mapping } = detectMapping(wb);
  const t = extract(wb, mapping, { id: name, sheetUrl: '', now: Date.UTC(2026, 9, 20) });
  return { t, format: inferFormat(t, undefined, { template: mapping.template }) };
}
const codes = (t: Tournament, ids: string[]) => ids.map((id) => t.games.find((g) => g.id === id)!.code);

describe('bracket board sections', () => {
  const { t, format } = load('outdoor-1');
  const board = buildBoards(t, format).find((b) => b.division === 'Women' && b.title === '1st–8th')!;
  const s = boardSections(board, format.divisions['Women']);
  it('puts quarter-finals, semis and medal games in the tree', () => {
    expect(s.upper.length).toBe(3);
    expect(codes(t, s.upper[0])).toEqual(expect.arrayContaining(['1v8', '4v5', '2v7', '3v6']));
    expect(s.upper[2].length).toBe(2);
    expect(columnNames(s.upper).map((c) => c.long)).toEqual(['Quarter-finals', 'Semi-finals', 'Medal games']);
  });
  it('puts the quarter-final losers games in the lower section', () => {
    expect(s.lower.flat().length).toBeGreaterThanOrEqual(4);
    expect(s.lower.flat().some((id) => s.upper.flat().includes(id))).toBe(false);
  });
  it('centres each game between the games whose winners feed it', () => {
    const { pos } = layoutColumns(s.upper, s.inputs, () => 100, 40);
    const final = s.upper[2].find((id) => (s.inputs.get(id) ?? []).every((x) => x.take === 'winner'))!;
    const [a, b] = s.inputs.get(final)!.map((x) => pos.get(x.game)!);
    expect(pos.get(final)!.y).toBeCloseTo((a.y + b.y) / 2);
  });
});

describe('connector paths', () => {
  it('draws a straight line when level and an elbow otherwise', () => {
    expect(elbow(0, 10, 40, 10)).toBe('M0,10 H40');
    expect(elbow(0, 0, 40, 100)).toContain('V');
  });
});

describe('bracket order', () => {
  it('keeps games that feed the same semi together', () => {
    const { t, format } = load('outdoor-1');
    const board = buildBoards(t, format).find((b) => b.division === 'Women' && b.title === '1st–8th')!;
    const s = boardSections(board, format.divisions['Women']);
    const [sf1] = s.upper[1];
    const feeders = s.inputs.get(sf1)!.filter((x) => x.take === 'winner').map((x) => s.upper[0].indexOf(x.game)).sort();
    expect(feeders).toEqual([0, 1]);
  });
});
