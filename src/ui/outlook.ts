import type { View } from '../engine/view';
import { poolContext } from '../engine/view';
import type { EffResult } from '../engine/resolve';
import { whatDoWeNeed, type NeedResult } from '../engine/whatneed';
import { outlook, type Outlook } from '../engine/finishes';
import { rankTeams, type Result } from '../engine/standings';
import { ordinal } from './fmt';

/** Effective results of a view, by game id. */
export function viewResults(view: View): Map<string, EffResult> {
  const m = new Map<string, EffResult>();
  for (const v of view.games) if (v.result) m.set(v.g.id, v.result);
  return m;
}

export function needFor(view: View, pool: string, team: string, target: number): NeedResult | undefined {
  const ctx = poolContext(view.t, { sides: new Map(view.games.map((v) => [v.g.id, v.sides])), standings: view.standings }, pool, viewResults(view));
  if (!ctx || !ctx.teams.includes(team)) return undefined;
  return whatDoWeNeed({ team, target, teams: ctx.teams, played: ctx.played, open: ctx.open, rules: view.t.rules, seeds: ctx.seeds });
}

export function teamOutlook(view: View, pool: string, team: string): Outlook | undefined {
  const st = view.standings.get(pool);
  if (!st) return undefined;
  if (st.complete) {
    const row = st.rows.find((r) => r.team === team);
    return row ? { best: row.rank, worst: row.rank + row.tiedWith.length } : undefined;
  }
  const f = view.finishes.get(pool);
  if (!f) return undefined;
  return outlook(f, team, st.rows.length);
}

/** "1st → Pool E", "3rd → 5–12 crossover", from the format's graph or the sheet's notes. */
export function leadsFor(view: View, pool: string, place: number): string | undefined {
  const l = view.leads.get(`${pool}#${place}`);
  if (l?.size) return [...l].slice(0, 2).join(', ');
  const st = view.standings.get(pool);
  const note = st?.pool.sheetTable?.[place - 1]?.note;
  if (note) return note.replace(/^[-\s>→]+/, '').replace(/^continue to\s+/i, '');
  return undefined;
}

/** Outlook chip text: "✓ Through to Pool E", "Can't finish top 2", "Can finish 1st–3rd". */
export function outlookText(o: Outlook, size: number): { text: string; kind: 'good' | 'bad' | 'open' | 'tied' } {
  if (o.best === o.worst) return { text: `Finishes ${ordinal(o.best)}`, kind: 'good' };
  if (o.best === 1 && o.worst === size) return { text: 'Any place still possible', kind: 'open' };
  return { text: `Can finish ${ordinal(o.best)}–${ordinal(o.worst)}`, kind: 'open' };
}

/** Provisional places if a pool game ends a certain way (for "what's at stake"). */
export function poolEffect(view: View, pool: string, gameId: string, outcome: 'A' | 'B' | 'D'): Map<string, number> | undefined {
  const st = view.standings.get(pool);
  const v = view.byId.get(gameId);
  if (!st || !v) return undefined;
  const [a, b] = [v.sides[0].team, v.sides[1].team];
  if (!a || !b) return undefined;
  const results: Result[] = [...st.results.filter((r) => r.gameId !== gameId), { a, b, outcome }];
  const rk = rankTeams(st.rows.map((r) => r.team), results, view.t.rules);
  return new Map(rk.rows.map((r) => [r.team, r.rank]));
}

export interface StakeLine {
  tag: string;
  kind: 'good' | 'quiet';
  text: string;
}

/** What's at stake in a game for one team (or both sides when `team` is omitted). */
export function stakeLines(view: View, gameId: string, team?: string): StakeLine[] {
  const v = view.byId.get(gameId);
  if (!v || v.g.isBye) return [];
  const out: StakeLine[] = [];
  const tz = view.t.timeZone;
  const hhmm = (e: number) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(e));
  if (v.g.stage === 'placement') {
    const f = view.format.divisions[v.g.division ?? ''];
    if (!f) return out;
    const places = Object.keys(f.places ?? {}).map(Number);
    const minPlace = places.length ? Math.min(...places) : 1;
    for (const take of ['winner', 'loser'] as const) {
      let text: string | undefined;
      for (const [key, e] of Object.entries(f.sources)) {
        if (e.source.kind !== 'gameResult' || e.source.game !== gameId || e.source.take !== take) continue;
        const [kind, id, side] = key.split(':');
        if (kind !== 'game') continue;
        const t = view.byId.get(id);
        if (!t) continue;
        const other = t.sides[Number(side) === 1 ? 1 : 0];
        const vs = other.team ? withoutTagSafe(other.team) : other.label;
        text = `${t.g.code ? `${t.g.code.replace(/[[\]]/g, '')} · ` : ''}${hhmm(t.g.start)}${t.g.pitch.label ? ` P${t.g.pitch.label}` : ''}${vs ? ` vs ${vs}` : ''}`;
      }
      if (!text) {
        const place = Object.entries(f.places ?? {}).find(([, e]) => e.source.kind === 'gameResult' && e.source.game === gameId && e.source.take === take)?.[0];
        if (place) text = `Finishes ${ordinal(Number(place) - minPlace + 1)}`;
      }
      if (text) out.push({ tag: take === 'winner' ? 'Winner' : 'Loser', kind: take === 'winner' ? 'good' : 'quiet', text });
    }
    return out;
  }
  if (!v.g.pool) return out;
  const [a, b] = [v.sides[0].team, v.sides[1].team];
  if (!a || !b) return out;
  const st = view.standings.get(v.g.pool);
  if (!st) return out;
  const remainingForTeam = (t: string) => view.games.filter((x) => x.g.pool === v.g.pool && !x.result && x.sides.some((s) => s.team === t)).length;
  const lastGame = (t: string) => remainingForTeam(t) <= 1;
  const describe = (t: string, outcome: 'A' | 'B' | 'D') => {
    const places = poolEffect(view, v.g.pool!, gameId, outcome);
    const p = places?.get(t);
    if (!p) return '';
    const lead = lastGame(t) && st.total - st.played <= 1 ? leadsFor(view, v.g.pool!, p) : undefined;
    return `${withoutTagSafe(t)} ${ordinal(p)} in Pool ${v.g.pool}${lead ? ` → ${lead}` : ' for now'}`;
  };
  const me = team ?? a;
  const mySide = me === b ? 'B' : 'A';
  const opp = me === a ? b : a;
  out.push({ tag: team ? 'Win' : `${withoutTagSafe(me)} win`, kind: 'good', text: describe(me, mySide) });
  if (view.t.rules.drawsAllowed.pool) out.push({ tag: 'Draw', kind: 'quiet', text: describe(me, 'D') });
  out.push({ tag: team ? 'Lose' : `${withoutTagSafe(opp)} win`, kind: 'quiet', text: describe(team ? me : opp, mySide === 'A' ? 'B' : 'A') });
  return out.filter((l) => l.text);
}

function withoutTagSafe(s: string) {
  return s.replace(/\s*\([A-Za-z]{1,4}\d{0,2}\)\s*$/, '');
}

/** Where a placement game's winner and loser go next, in short form: "SF1 11:00 P1" or "3rd". */
export function feedsOf(view: View, gameId: string): { winner?: string; loser?: string } {
  const v = view.byId.get(gameId);
  const f = v && view.format.divisions[v.g.division ?? ''];
  if (!v || !f) return {};
  const tz = view.t.timeZone;
  const hhmm = (e: number) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(e));
  const places = Object.keys(f.places ?? {}).map(Number);
  const minPlace = places.length ? Math.min(...places) : 1;
  const out: { winner?: string; loser?: string } = {};
  for (const take of ['winner', 'loser'] as const) {
    for (const [key, e] of Object.entries(f.sources)) {
      if (e.source.kind !== 'gameResult' || e.source.game !== gameId || e.source.take !== take) continue;
      const [kind, id] = key.split(':');
      const t = kind === 'game' ? view.byId.get(id) : undefined;
      if (t) out[take] = [t.g.code?.replace(/[[\]]/g, ''), hhmm(t.g.start), t.g.pitch.label ? `P${t.g.pitch.label}` : ''].filter(Boolean).join(' ');
    }
    if (!out[take]) {
      const place = Object.entries(f.places ?? {}).find(([, e]) => e.source.kind === 'gameResult' && e.source.game === gameId && e.source.take === take)?.[0];
      if (place) out[take] = ordinal(Number(place) - minPlace + 1);
    }
  }
  return out;
}
