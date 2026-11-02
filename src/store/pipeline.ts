import type { Workbook } from '../sheets/workbook';
import { sheetViewUrl, sourceFromKey } from '../sheets/links';
import type { Format, Tournament } from '../model/types';
import type { Mapping } from '../mapping/types';
import { detectMapping } from '../mapping/detect';
import { validateMapping } from '../mapping/validate';
import { extract } from '../extract/extract';
import { qualityCheck, type Problem } from '../extract/quality';
import { inferFormat } from '../format/infer';
import type { TournamentSummary } from './settings';

export interface Processed {
  tournament: Tournament;
  mapping: Mapping;
  format: Format;
  problems: Problem[];
  hints: Record<string, string>;
  /** The saved mapping didn't fit the workbook any more, so Auto ran again. */
  redetected: boolean;
}

/** Workbook + saved mapping/format -> tournament model, format and problems. */
export function processWorkbook(id: string, wb: Workbook, saved?: { mapping?: Mapping; format?: Format }, now = Date.now()): Processed {
  let mapping = saved?.mapping;
  let redetected = false;
  const detected = detectMapping(wb);
  if (mapping && validateMapping(wb, mapping).length) {
    // The TD restructured the sheet: keep corrections, detect the rest again.
    mapping = { ...detected.mapping, corrections: mapping.corrections, rules: mapping.rules };
    redetected = true;
  }
  mapping ??= detected.mapping;
  const tournament = extract(wb, mapping, { id, sheetUrl: sheetViewUrl(sourceFromKey(id)), now });
  const format = inferFormat(tournament, saved?.format, { template: mapping.template });
  tournament.format = format;
  if (redetected) tournament.warnings.push('The sheet changed shape, so it was read again automatically.');
  const problems = qualityCheck(tournament, mapping, wb);
  return { tournament, mapping, format, problems, hints: detected.hints, redetected };
}

export function summarize(p: Processed, lastFetched?: number, error?: string): TournamentSummary {
  const t = p.tournament;
  const sched = t.games.filter((g) => !g.unscheduled);
  return {
    title: t.title,
    firstStart: sched.length ? Math.min(...sched.map((g) => g.start)) : undefined,
    lastEnd: sched.length ? Math.max(...sched.map((g) => g.end)) : undefined,
    days: t.days,
    divisions: t.divisions.length,
    teams: t.teams.length,
    problems: p.problems.filter((x) => x.severity === 'problem').length,
    datesGuessed: t.days.some((d) => d.dateSource === 'guessed'),
    lastFetched,
    error,
  };
}

/** Games whose score or teams changed between two versions (for the update highlight). */
export function changedGames(prev: Tournament | undefined, next: Tournament): Set<string> {
  const out = new Set<string>();
  if (!prev) return out;
  const old = new Map(prev.games.map((g) => [g.id, g]));
  for (const g of next.games) {
    const o = old.get(g.id);
    if (!o) continue;
    if (o.scores[0] !== g.scores[0] || o.scores[1] !== g.scores[1] || o.teams[0] !== g.teams[0] || o.teams[1] !== g.teams[1]) out.add(g.id);
  }
  return out;
}
