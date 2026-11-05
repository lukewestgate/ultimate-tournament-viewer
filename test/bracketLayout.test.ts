import { describe, expect, it } from 'vitest';
import { detectMapping } from '../src/mapping/detect';
import { extract } from '../src/extract/extract';
import { inferFormat } from '../src/format/infer';
import { buildBoards } from '../src/engine/bracket';
import { boardSections, columnNames, elbow, layoutColumns, pageHeightAt, roundFrames, roundPositions, swipeTarget } from '../src/ui/bracketLayout';
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

describe('swiping between rounds on a phone', () => {
  const { t, format } = load('outdoor-1');
  const board = buildBoards(t, format).find((b) => b.division === 'Women' && b.title === '1st–8th')!;
  const s = boardSections(board, format.divisions['Women']);
  const frames = roundFrames(s.upper, s.inputs, () => 100, 40, 60);
  const semi = s.upper[1][0];
  const beside = frames[0].pos.get(semi)!.y;
  const stacked = frames[1].pos.get(semi)!.y;
  it('matches each round’s own layout when settled on it', () => {
    s.upper.forEach((col, i) => {
      const at = roundPositions(frames, s.upper, i);
      for (const id of [...col, ...(s.upper[i + 1] ?? [])]) expect(at.get(id)!.y).toBeCloseTo(frames[i].pos.get(id)!.y);
    });
  });
  it('moves a game smoothly from beside the last round to its own stacked place', () => {
    expect(beside).not.toBeCloseTo(stacked);
    expect(roundPositions(frames, s.upper, 0.5).get(semi)!.y).toBeCloseTo((beside + stacked) / 2);
  });
  it('keeps games where they are outside their own step, including past the ends', () => {
    expect(roundPositions(frames, s.upper, -0.4).get(semi)!.y).toBeCloseTo(beside);
    expect(roundPositions(frames, s.upper, 2).get(semi)!.y).toBeCloseTo(stacked);
    expect(roundPositions(frames, s.upper, 9).get(semi)!.y).toBeCloseTo(stacked);
  });
  it('numbers columns across the whole board', () => {
    expect(roundPositions(frames, s.upper, 1).get(s.upper[2][0])!.col).toBe(2);
  });
  it('blends page heights and stops at the ends', () => {
    expect(pageHeightAt([100, 300, 200], 0.5)).toBe(200);
    expect(pageHeightAt([100, 300, 200], 1.5)).toBe(250);
    expect(pageHeightAt([100, 300, 200], 2)).toBe(200);
    expect(pageHeightAt([100, 300, 200], -1)).toBe(100);
    expect(pageHeightAt([100, 300, 200], 7)).toBe(200);
  });
});

describe('where a swipe settles', () => {
  it('moves one page at most, however far the finger went', () => {
    expect(swipeTarget(0, 4, 276, 276, 0)).toBe(1);
    expect(swipeTarget(0, 4, 900, 276, 3)).toBe(1);
    expect(swipeTarget(2, 4, -900, 276, -3)).toBe(1);
  });
  it('needs a real drag or a flick to change page', () => {
    expect(swipeTarget(1, 4, 40, 276, 0)).toBe(1);
    expect(swipeTarget(1, 4, 100, 276, 0)).toBe(2);
    expect(swipeTarget(1, 4, 40, 276, 0.6)).toBe(2);
    expect(swipeTarget(1, 4, -40, 276, -0.6)).toBe(0);
  });
  it('stays put when flicked back against the drag', () => {
    expect(swipeTarget(1, 4, 200, 276, -0.6)).toBe(1);
    expect(swipeTarget(1, 4, -200, 276, 0.6)).toBe(1);
  });
  it('stops at the first and last pages', () => {
    expect(swipeTarget(0, 4, -100, 276, -1)).toBe(0);
    expect(swipeTarget(3, 4, 100, 276, 1)).toBe(3);
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
