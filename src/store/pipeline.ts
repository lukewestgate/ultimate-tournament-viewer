import type { Workbook } from '../sheets/workbook';
import { sheetViewUrl, sourceFromKey } from '../sheets/links';
import type { Format, Tournament } from '../model/types';
import type { Mapping } from '../mapping/types';
import { detectMapping } from '../mapping/detect';
import { validateMapping } from '../mapping/validate';
import { extract } from '../extract/extract';
import { qualityCheck, type Problem } from '../extract/quality';
import { inferFormat } from '../format/infer';
import { endOfDay } from '../engine/time';
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

export function summarize(p: Processed, lastFetched?: number, error?: string, primary?: string): TournamentSummary {
  const t = p.tournament;
  const sched = t.games.filter((g) => !g.unscheduled);
  const open = sched.filter((g) => !g.isBye && !hasResult(g));
  const ifRequired = open.filter((g) => g.conditional);
  const lastEnd = sched.length ? Math.max(...sched.map((g) => g.end)) : undefined;
  const standings = t.finalStandings ?? [];
  return {
    counted: sched.filter((g) => !g.isBye).length,
    unresolved: open.length - ifRequired.length,
    ifRequiredUntil: ifRequired.length ? Math.max(...ifRequired.map((g) => g.end)) : undefined,
    standingsDone: standings.length > 0 && standings.every((s) => s.team) && t.divisions.every((d) => standings.some((s) => s.division === d.name)),
    sessions: sessionsOf(sched),
    finishBy: lastEnd === undefined ? undefined : endOfDay(lastEnd, t.timeZone),
    teamNames: t.teams.map((x) => x.name),
    divisionNames: t.divisions.map((d) => d.name),
    primary: primary ? primaryInfo(t, primary) : undefined,
    pools: t.pools.length,
    games: sched.length,
    title: t.title,
    firstStart: sched.length ? Math.min(...sched.map((g) => g.start)) : undefined,
    lastEnd,
    days: t.days,
    divisions: t.divisions.length,
    teams: t.teams.length,
    problems: p.problems.filter((x) => x.severity === 'problem').length,
    datesGuessed: t.days.some((d) => d.dateSource === 'guessed'),
    lastFetched,
    error,
  };
}

/** A score, a result mark or a forfeit, whether or not the teams have been worked out yet. */
function hasResult(g: Tournament['games'][number]): boolean {
  return (g.scores[0] !== undefined && g.scores[1] !== undefined) || Boolean(g.marks?.some(Boolean)) || Boolean(g.forfeit?.some(Boolean));
}

function sessionsOf(games: Tournament['games']): { start: number; end: number }[] {
  const by = new Map<string, { start: number; end: number }>();
  for (const g of games) {
    const s = by.get(g.day);
    by.set(g.day, { start: Math.min(g.start, s?.start ?? g.start), end: Math.max(g.end, s?.end ?? g.end) });
  }
  return [...by.values()].sort((a, b) => a.start - b.start);
}

/** The primary team's next game, or its final place, for the home card. */
function primaryInfo(t: Tournament, key: string): TournamentSummary['primary'] {
  const i = key.indexOf('::');
  const division = key.slice(0, i) || undefined;
  const name = key.slice(i + 2);
  const mine = t.games.filter((g) => !g.unscheduled && !g.isBye && (division === undefined || g.division === division) && g.teams.includes(name));
  const next = mine.find((g) => g.scores[0] === undefined && !g.marks && g.end > Date.now());
  const place = t.finalStandings?.find((s) => s.team === name && (division === undefined || s.division === division))?.place;
  if (next) {
    const opp = next.teams[0] === name ? next.teams[1] : next.teams[0];
    return { team: name, next: { start: next.start, pitch: next.pitch.label, opponent: opp } };
  }
  return { team: name, place };
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
