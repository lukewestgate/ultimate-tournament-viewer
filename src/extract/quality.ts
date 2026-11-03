import type { Tournament } from '../model/types';
import type { Mapping } from '../mapping/types';
import type { Workbook } from '../sheets/workbook';
import { validateMapping } from '../mapping/validate';
import { likelySame } from './names';

export interface Problem {
  /** 'problem' means the sheet may be read wrongly; 'suggestion' is something to confirm. */
  severity: 'problem' | 'suggestion';
  text: string;
}

export interface MergeSuggestion {
  division?: string;
  /** Name to keep. */
  keep: string;
  /** Name to fold into `keep`. */
  merge: string;
}

/** Likely duplicate team names within a division (never across divisions). */
export function mergeSuggestions(t: Tournament, rejected: string[] = []): MergeSuggestion[] {
  const out: MergeSuggestion[] = [];
  const count = new Map<string, number>();
  for (const g of t.games) for (const n of g.teams) if (n) count.set(`${g.division ?? ''}::${n}`, (count.get(`${g.division ?? ''}::${n}`) ?? 0) + 1);
  const byDiv = new Map<string, typeof t.teams>();
  for (const team of t.teams) {
    const k = team.division ?? '';
    byDiv.set(k, [...(byDiv.get(k) ?? []), team]);
  }
  for (const [div, teams] of byDiv) {
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const a = teams[i];
        const b = teams[j];
        if (!likelySame(a.name, b.name)) continue;
        if (a.seed !== undefined && b.seed !== undefined) continue; // two registered teams
        const key = [a.name, b.name].sort().join('|');
        if (rejected.includes(key)) continue;
        const ca = (count.get(`${div}::${a.name}`) ?? 0) + (a.seed !== undefined ? 100 : 0);
        const cb = (count.get(`${div}::${b.name}`) ?? 0) + (b.seed !== undefined ? 100 : 0);
        const [keep, merge] = ca >= cb ? [a.name, b.name] : [b.name, a.name];
        out.push({ division: div || undefined, keep, merge });
      }
    }
  }
  return out;
}

/** Plain-language list of reading problems (spec §6.3). */
export function qualityCheck(t: Tournament, mapping: Mapping, wb?: Workbook): Problem[] {
  const out: Problem[] = [];
  const p = (text: string) => out.push({ severity: 'problem', text });
  if (wb) for (const e of validateMapping(wb, mapping)) p(e);
  const games = t.games.filter((g) => !g.isBye);
  if (!games.length) {
    p('No games found.');
    return out;
  }
  const filled = games.filter((g) => (g.teams[0] && g.teams[1]) || (g.slots[0] && g.slots[1])).length;
  if (filled < games.length / 2) p(`Only ${filled} of ${games.length} games have both teams.`);
  if (t.teams.length < 4) p(`Only ${t.teams.length} teams found.`);
  const odd = t.teams.filter((x) => x.name.length > 40 || /^\d+$/.test(x.name));
  if (odd.length) p(`Some team names look wrong: ${odd.slice(0, 3).map((x) => `“${x.name}”`).join(', ')}.`);
  const playing = new Set<string>();
  for (const g of games) for (const n of g.teams) if (n) playing.add(n);
  const seeded = t.seeding.map((s) => s.team);
  const notPlaying = seeded.filter((s) => !playing.has(s));
  const anyResults = games.some((g) => g.teams[0] || g.teams[1]);
  if (anyResults && seeded.length >= 4 && notPlaying.length > seeded.length * 0.25) p(`${notPlaying.length} seeded teams never play.`);
  if (t.divisions.length) {
    const noDiv = games.filter((g) => !g.division);
    if (noDiv.length) p(`${noDiv.length} game${noDiv.length === 1 ? " isn't" : "s aren't"} in any division (${noDiv.slice(0, 3).map((g) => g.ref).join(', ')}${noDiv.length > 3 ? ', …' : ''}).`);
    // A seeded team showing up unseeded in another division that has its own seeding has been grouped wrongly.
    const seededIn = new Map<string, Set<string>>();
    for (const s of t.seeding) seededIn.set(s.team, (seededIn.get(s.team) ?? new Set()).add(s.division ?? ''));
    const seededDivs = new Set(t.seeding.map((s) => s.division ?? ''));
    const strays = t.teams.filter((x) => seededIn.has(x.name) && !seededIn.get(x.name)!.has(x.division ?? '') && seededDivs.has(x.division ?? ''));
    if (strays.length) {
      const where = (x: (typeof strays)[number]) => `“${x.name}” is in ${x.division ?? 'no division'} but seeded in ${[...seededIn.get(x.name)!].map((d) => d || 'no division').join(' and ')}`;
      p(`${strays.length} team${strays.length === 1 ? '' : 's'} in a division ${strays.length === 1 ? "it isn't" : "they aren't"} seeded in: ${strays.slice(0, 3).map(where).join('; ')}${strays.length > 3 ? '; …' : ''}.`);
    }
  }
  const big = games.filter((g) => (g.scores[0] ?? 0) > 60 || (g.scores[1] ?? 0) > 60);
  if (big.length) p(`${big.length} scores look like something else (over 60).`);
  for (const m of mergeSuggestions(t, mapping.corrections.rejectedMerges)) {
    out.push({ severity: 'suggestion', text: `“${m.merge}” may be the same team as “${m.keep}”.` });
  }
  return out;
}

export const problemsOnly = (ps: Problem[]) => ps.filter((x) => x.severity === 'problem');
