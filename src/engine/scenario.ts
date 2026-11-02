import type { Game, Tournament } from '../model/types';
import type { EffResult } from './resolve';
import { resultOf } from './standings';

/** One hypothetical result. Scores are optional ("result only"). */
export interface Hypo {
  outcome: 'A' | 'B' | 'D';
  sa?: number;
  sb?: number;
  /** Replace a real result. */
  override?: boolean;
}

export type Scenario = Record<string, Hypo>;

/** Compact, URL-safe encoding: id*A, id*A*10*8, id*!B (override). */
export function encodeScenario(s: Scenario): string {
  return Object.entries(s)
    .map(([id, h]) => [encodeURIComponent(id), `${h.override ? '!' : ''}${h.outcome}`, ...(h.sa !== undefined && h.sb !== undefined ? [h.sa, h.sb] : [])].join('*'))
    .join(',');
}

export function decodeScenario(text: string | null | undefined): Scenario {
  const out: Scenario = {};
  if (!text) return out;
  for (const part of text.split(',')) {
    const [id, o, sa, sb] = part.split('*');
    if (!id || !o) continue;
    const override = o.startsWith('!');
    const outcome = o.replace('!', '') as Hypo['outcome'];
    if (!['A', 'B', 'D'].includes(outcome)) continue;
    const h: Hypo = { outcome };
    if (override) h.override = true;
    if (sa !== undefined && sb !== undefined && /^\d+$/.test(sa) && /^\d+$/.test(sb)) {
      h.sa = Number(sa);
      h.sb = Number(sb);
    }
    out[decodeURIComponent(id)] = h;
  }
  return out;
}

export interface EffectiveOptions {
  /** Replay time: real scores are hidden for games whose scheduled end is after it. */
  at?: number;
  scenario?: Scenario;
  simulated?: Map<string, EffResult>;
}

/** Real result as of a replay time. */
export function realResult(g: Game, at?: number): EffResult | undefined {
  if (at !== undefined && g.end > at) return undefined;
  const r = resultOf(g);
  if (!r) return undefined;
  return { sa: r.sa, sb: r.sb, outcome: r.outcome, forfeit: g.forfeit };
}

/**
 * Effective results: real (as of replay time), then simulated, then hypothetical.
 * Hypothetical results on games that now have a real result are dropped (unless they override it).
 */
export function effectiveResults(t: Tournament, opts: EffectiveOptions = {}): { results: Map<string, EffResult>; dropped: string[] } {
  const results = new Map<string, EffResult>();
  const dropped: string[] = [];
  for (const g of t.games) {
    const r = realResult(g, opts.at);
    if (r) results.set(g.id, r);
    else if (opts.simulated?.has(g.id)) results.set(g.id, opts.simulated.get(g.id)!);
  }
  for (const [id, h] of Object.entries(opts.scenario ?? {})) {
    const real = results.get(id);
    if (real && !real.simulated && !h.override) {
      dropped.push(id);
      continue;
    }
    results.set(id, { outcome: h.outcome, sa: h.sa, sb: h.sb, hypothetical: true });
  }
  return { results, dropped };
}

/** Remove hypothetical results that real results have replaced. */
export function pruneScenario(s: Scenario, dropped: string[]): Scenario {
  if (!dropped.length) return s;
  const out = { ...s };
  for (const id of dropped) delete out[id];
  return out;
}
