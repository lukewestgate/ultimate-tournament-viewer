import type { Rules, Tiebreak } from '../model/types';
import { pointsDiffPreset, ukuPreset } from '../engine/rulesPresets';
import { parseDuration } from '../sheets/cells';

const WORDS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5 };
const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : WORDS[s.toLowerCase()]);

/** Points for a win / draw from rules text ("3 for a win, 1 for a draw", "Three points for a win", "Points (3 for W, 1 for D)"). */
export function pointsFromText(text: string): { win: number; draw?: number; loss?: number } | undefined {
  const t = text.toLowerCase();
  const win = /\b(\d|one|two|three|four|five)\s*(?:points?|pts?)?\s*(?:for\s+(?:a\s+)?)(?:win|w)\b/.exec(t);
  if (!win) return undefined;
  const draw = /\b(\d|zero|one|two|three)\s*(?:points?|pts?)?\s*(?:for\s+(?:a\s+)?)(?:draw|d|tie)\b/.exec(t);
  const loss = /\b(\d|zero|one)\s*(?:points?|pts?)?\s*(?:for\s+(?:a\s+)?)(?:loss|l|defeat)\b/.exec(t);
  return { win: num(win[1]), draw: draw ? num(draw[1]) : undefined, loss: loss ? num(loss[1]) : undefined };
}

const CRITERIA: [RegExp, Tiebreak][] = [
  [/head[\s-]*to[\s-]*head.*(pd|diff)|h2h.*(pd|diff)/i, 'h2hPoints'],
  [/head[\s-]*to[\s-]*head|h2h/i, 'h2hPoints'],
  [/(total\s+)?(goal|point|points)\s*diff|\bgd\b|\bpd\b/i, 'diff'],
  [/(goals?|points?)\s*(scored|for)|\bgf\b|\bpf\b/i, 'scored'],
  [/(goals?|points?)\s*(conceded|against)/i, 'conceded'],
  [/seed/i, 'seed'],
  [/spirit/i, 'spirit'],
  [/coin/i, 'coinToss'],
  [/disc\s*(throw|flip|toss)|flip/i, 'discThrow'],
];

/** Ordered tie-break list from text like "Points > Head to Head (incl. PD) > Points Difference > Points Scored > Seeding". */
export function tiebreaksFromLines(lines: string[]): Tiebreak[] | undefined {
  // Inline list with separators.
  for (const line of lines) {
    if (!/[>→]|,\s*then|\bthen\b/i.test(line)) continue;
    const parts = line.split(/\s*(?:>|→|,\s*then|\bthen\b)\s*/i).filter(Boolean);
    const tbs = mapParts(parts);
    if (tbs.length >= 2) return tbs;
  }
  // Vertical list under a "Tiebreakers" heading.
  const i = lines.findIndex((l) => /tie[\s-]*break/i.test(l) && l.length < 40);
  if (i >= 0) {
    const parts: string[] = [];
    for (let k = i + 1; k < Math.min(lines.length, i + 10); k++) {
      if (!lines[k] || lines[k].length > 60) break;
      parts.push(lines[k]);
    }
    const tbs = mapParts(parts);
    if (tbs.length >= 2) return tbs;
  }
  return undefined;
}

function mapParts(parts: string[]): Tiebreak[] {
  const out: Tiebreak[] = [];
  for (const p of parts) {
    if (/^points?\b(?!.*(diff|scored|for|against))/i.test(p.trim()) && !/head/i.test(p)) continue; // "Points" itself is the ranking
    const hit = CRITERIA.find(([re]) => re.test(p));
    if (hit && !out.includes(hit[1])) out.push(hit[1]);
  }
  return out;
}

/** Rules from the sheet's info text; undefined when nothing specific is found. */
export function rulesFromText(lines: string[]): Rules | undefined {
  const text = lines.join('\n');
  const pts = pointsFromText(text);
  const tbs = tiebreaksFromLines(lines);
  const uku = /section\s*6\s*of\s*(the\s*)?uku|uku (tournament )?rules.*(6|tie)/i.test(text);
  if (!pts && !tbs && !uku) return undefined;
  const base = tbs ? pointsDiffPreset() : ukuPreset();
  const rules: Rules = { ...base, source: 'sheet', preset: tbs ? 'custom' : uku ? 'uku' : 'custom' };
  if (pts) rules.points = { win: pts.win, draw: pts.draw ?? base.points.draw, loss: pts.loss ?? 0 };
  if (tbs) rules.tiebreaks = tbs;
  if (/draws?\s+(are|is)\s+not\s+allowed|no\s+draws/i.test(text) && !/draws?\s+(are|is)\s+allowed in pool/i.test(text)) rules.drawsAllowed = { pool: false, placement: false };
  if (/draws\s+(are\s+)?allowed\s+in\s+all/i.test(text)) rules.drawsAllowed = { pool: true, placement: true };
  return rules;
}

/** Game length from text: "Game length is 21 mins", "25 mins games", "Games will be 20 minutes long", "SAT: 23 mins games". */
export function gameLengthsFromText(lines: string[]): { all?: number; byDay: Record<string, number> } {
  const byDay: Record<string, number> = {};
  let all: number | undefined;
  let section: string | undefined;
  for (const raw of lines) {
    const line = raw.trim();
    const sec = /game rules\s*\((sat|sun|mon|fri)[a-z]*\)/i.exec(line);
    if (sec) section = sec[1].toLowerCase();
    const m =
      /game\s*length[s]?\s*(?:is|:|·)?\s*(\d{1,2}:\d{2}|\d+\s*(?:mins?|minutes))/i.exec(line) ??
      /(\d+)\s*(?:mins?|minutes)\s*games?/i.exec(line) ??
      /games?\s+(?:will\s+be|are|last)\s+(\d+)\s*(?:mins?|minutes)/i.exec(line);
    if (!m) continue;
    const mins = parseDuration(m[1]) ?? Number(m[1]);
    if (!mins || mins > 180) continue;
    const day = /^(sat|sun|mon|fri)[a-z]*\s*:/i.exec(line)?.[1]?.toLowerCase() ?? section;
    if (day) byDay[day] ??= mins;
    else all ??= mins;
  }
  return { all, byDay };
}
