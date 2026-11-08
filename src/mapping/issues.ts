import type { Tournament, DayInfo } from '../model/types';
import type { Mapping } from './types';
import type { Workbook } from '../sheets/workbook';
import { mergeSuggestions, type MergeSuggestion, type Problem } from '../extract/quality';
import { oddities, type Oddity } from './review';

/** The counts every screen shows for a reading. "Games" are scheduled games: byes and rows with no pitch or day don't count. */
export function readingCounts(t: Tournament) {
  return {
    games: t.games.filter((g) => !g.isBye && !g.unscheduled).length,
    teams: t.teams.length,
    divisions: t.divisions.length,
    pools: t.pools.length,
    days: t.days.length,
  };
}

/** One thing to check on the Reading page, with what's needed to offer its fix. */
export type Issue =
  | { kind: 'problem'; key: string; bad: true; text: string }
  | { kind: 'odd'; key: string; bad: boolean; text: string; sub?: string; odd: Oddity }
  | { kind: 'merge'; key: string; bad: false; text: string; sub?: string; merge: MergeSuggestion }
  | { kind: 'date'; key: string; bad: false; text: string; sub: string; day: DayInfo };

/** The key an issue is remembered under when someone says "It’s right". Text-based, so it returns if the count changes. */
export const checkKey = (text: string) => `check:${text}`;

/**
 * Everything worth checking about a reading, likely-wrong first: quality problems, oddities (grouped by kind, as
 * `oddities` already does), likely duplicate team names and guessed dates. Items confirmed with "It’s right" are left
 * out.
 */
export function buildIssues(t: Tournament, m: Mapping, problems: Problem[], wb: Workbook | undefined, dismissed: string[] = []): Issue[] {
  const gone = new Set(dismissed);
  const out: Issue[] = [];
  for (const p of problems) if (p.severity === 'problem') out.push({ kind: 'problem', key: `p:${p.text}`, bad: true, text: p.text });
  const merges = mergeSuggestions(t, m.corrections.rejectedMerges);
  for (const o of oddities(t, m, wb)) {
    // Guessed dates and look-alike names get their own rows below, with direct fixes.
    if (o.area === 'days' && /is a guess/.test(o.text)) continue;
    if (merges.length && /like another team’s/.test(o.text)) continue;
    const split = o.area === 'teams' ? /^(.*?): (.*)$/.exec(o.text) : null;
    out.push({ kind: 'odd', key: `o:${o.text}`, bad: o.level === 'problem', text: split ? split[1] : o.text, sub: split?.[2], odd: o });
  }
  for (const s of merges) out.push({ kind: 'merge', key: `m:${s.merge}|${s.keep}`, bad: false, text: `“${s.merge}” and “${s.keep}” may be the same team`, sub: s.division, merge: s });
  for (const d of t.days)
    if (d.dateSource === 'guessed') out.push({ kind: 'date', key: `d:${d.name}`, bad: false, text: `${d.name}’s date was guessed: ${d.date}`, sub: 'The sheet gives no date for this day', day: d });
  const kept = out.filter((x) => !gone.has(checkKey(x.text)));
  // Stable: likely-wrong first, otherwise in the order above.
  return kept.map((x, i) => [x, i] as const).sort(([a, i], [b, j]) => (a.bad === b.bad ? i - j : a.bad ? -1 : 1)).map(([x]) => x);
}
