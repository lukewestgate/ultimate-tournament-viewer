import { describe, expect, it } from 'vitest';
import { detectMapping } from '../src/mapping/detect';
import { extract } from '../src/extract/extract';
import { qualityCheck } from '../src/extract/quality';
import { buildIssues, checkKey, readingCounts } from '../src/mapping/issues';
import { FIXTURES, loadFixture } from './helpers/fixtures';

const read = (name: Parameters<typeof loadFixture>[0]) => {
  const wb = loadFixture(name);
  const mapping = detectMapping(wb).mapping;
  const t = extract(wb, mapping, { id: name, sheetUrl: '' });
  return { wb, mapping, t, problems: qualityCheck(t, mapping, wb) };
};

describe('reading counts', () => {
  it('counts scheduled games only: no byes, no rows without a pitch or day', () => {
    for (const name of FIXTURES) {
      const { t } = read(name);
      expect(readingCounts(t).games).toBe(t.games.filter((g) => !g.isBye && !g.unscheduled).length);
      expect(readingCounts(t).games).toBeLessThanOrEqual(t.games.length);
    }
  });
});

describe('things to check on the Reading page', () => {
  it('puts likely-wrong items first and keeps the rest in order', () => {
    for (const name of FIXTURES) {
      const { wb, mapping, t, problems } = read(name);
      const xs = buildIssues(t, mapping, problems, wb);
      const firstLook = xs.findIndex((x) => !x.bad);
      if (firstLook >= 0) expect(xs.slice(firstLook).every((x) => !x.bad)).toBe(true);
      expect(new Set(xs.map((x) => x.key)).size).toBe(xs.length);
    }
  });

  it('lists a team playing two games at once as likely wrong, with what it refers to', () => {
    const { wb, mapping, t, problems } = read('grid-dated');
    const clash = buildIssues(t, mapping, problems, wb).find((x) => x.kind === 'odd' && /two games at once/.test(x.text));
    expect(clash?.bad).toBe(true);
    expect(clash?.kind === 'odd' && clash.odd.refs.length).toBeGreaterThan(0);
  });

  it('splits a team list into the line and its names', () => {
    const { wb, mapping, t, problems } = read('outdoor-1');
    const few = buildIssues(t, mapping, problems, wb).find((x) => /far fewer games/.test(x.text));
    expect(few?.text).toMatch(/^1 team plays far fewer games than the rest$/);
    expect(few && 'sub' in few && few.sub).toMatch(/Chichester/);
  });

  it('leaves out items marked “It’s right”, until their text changes', () => {
    const { wb, mapping, t, problems } = read('outdoor-1');
    const all = buildIssues(t, mapping, problems, wb);
    expect(all.length).toBeGreaterThan(0);
    const kept = buildIssues(t, mapping, problems, wb, [checkKey(all[0].text)]);
    expect(kept.map((x) => x.key)).toEqual(all.slice(1).map((x) => x.key));
  });

  it('gives guessed dates their own row instead of the generic note', () => {
    const { wb, mapping, t, problems } = read('outdoor-1');
    const guessed = t.days.filter((d) => d.dateSource === 'guessed');
    const xs = buildIssues(t, mapping, problems, wb);
    expect(xs.filter((x) => x.kind === 'date').length).toBe(guessed.length);
    expect(xs.some((x) => x.kind === 'odd' && /is a guess/.test(x.text))).toBe(false);
  });
});
