import type { Rules } from '../model/types';
import { rankTeams, type Result } from './standings';
import type { OpenGame } from './finishes';

export type NeedVerdict = 'through' | 'out' | 'depends' | 'tooLarge';

export interface NeedResult {
  verdict: NeedVerdict;
  /** Plain-language sufficient conditions, simplest first (at most a few). */
  conditions: string[];
}

type O = Result['outcome'];

interface Ctx {
  team: string;
  target: number;
  teams: string[];
  played: Result[];
  open: OpenGame[];
  rules: Rules;
  seeds: Record<string, number>;
}

/** 'in' when the team is certainly within the target, 'out' when certainly not, 'tie' when it depends on scores. */
function judge(ctx: Ctx, extra: Result[]): 'in' | 'out' | 'tie' {
  const rk = rankTeams(ctx.teams, [...ctx.played, ...extra], ctx.rules, ctx.seeds);
  const row = rk.rows.find((r) => r.team === ctx.team)!;
  const worst = row.rank + row.tiedWith.length;
  if (worst <= ctx.target) return 'in';
  if (row.rank > ctx.target) return 'out';
  return 'tie';
}

const word = (o: O, mine: 'A' | 'B') => (o === 'D' ? 'Draw' : o === mine ? 'Win' : 'Lose');

/**
 * "What do we need?" (spec §8.4): simplest sufficient conditions over the team's remaining games and others that matter.
 * Margin conditions search score margins over a bounded range. If the search is too large, say so rather than guess.
 */
export function whatDoWeNeed(ctx: Ctx, maxOpen = 8): NeedResult {
  const { open, rules } = ctx;
  if (open.length > maxOpen) return { verdict: 'tooLarge', conditions: ['Too many games left to work this out exactly.'] };
  const outs: O[] = rules.drawsAllowed.pool ? ['A', 'D', 'B'] : ['A', 'B'];
  const all: O[][] = [];
  const n = outs.length ** open.length;
  for (let i = 0; i < n; i++) {
    let k = i;
    all.push(open.map(() => {
      const o = outs[k % outs.length];
      k = Math.floor(k / outs.length);
      return o;
    }));
  }
  const res = (combo: O[]) => open.map((g, i) => ({ a: g.a, b: g.b, outcome: combo[i] }) as Result);
  const verdicts = all.map((c) => judge(ctx, res(c)));
  if (verdicts.every((v) => v === 'in')) return { verdict: 'through', conditions: [`Finishes top ${ctx.target} whatever happens.`] };
  if (verdicts.every((v) => v === 'out')) return { verdict: 'out', conditions: [`Can't finish top ${ctx.target}.`] };

  const mineIdx = open.map((g, i) => (g.a === ctx.team || g.b === ctx.team ? i : -1)).filter((i) => i >= 0);
  const otherIdx = open.map((_, i) => i).filter((i) => !mineIdx.includes(i));
  const opp = (i: number) => (open[i].a === ctx.team ? open[i].b : open[i].a);
  const side = (i: number): 'A' | 'B' => (open[i].a === ctx.team ? 'A' : 'B');
  const conditions: string[] = [];
  const strength = (o: O, s: 'A' | 'B') => (o === s ? 2 : o === 'D' ? 1 : 0);

  // Own results that are enough on their own (weakest first).
  const myCombos = new Map<string, O[]>();
  for (const c of all) myCombos.set(mineIdx.map((i) => c[i]).join(''), mineIdx.map((i) => c[i]));
  const sortedMine = [...myCombos.values()].sort(
    (x, y) => x.reduce((s, o, j) => s + strength(o, side(mineIdx[j])), 0) - y.reduce((s, o, j) => s + strength(o, side(mineIdx[j])), 0),
  );
  const matches = (c: O[], mine: O[]) => mineIdx.every((idx, j) => c[idx] === mine[j]);
  const describeMine = (mine: O[]) => mine.map((o, j) => `${word(o, side(mineIdx[j]))} vs ${opp(mineIdx[j])}`).join(' and ');
  let enoughAlone: O[] | undefined;
  for (const mine of sortedMine) {
    const vs = all.filter((c) => matches(c, mine)).map((c) => judge(ctx, res(c)));
    if (vs.every((v) => v === 'in')) {
      enoughAlone = mine;
      conditions.push(`${describeMine(mine)} — then top ${ctx.target} whatever else happens.`);
      break;
    }
  }
  // Weaker own results that are enough if one other game goes a certain way.
  for (const mine of sortedMine) {
    if (enoughAlone && mine.join('') === enoughAlone.join('')) break;
    for (const oi of otherIdx) {
      for (const o of outs) {
        const vs = all.filter((c) => matches(c, mine) && c[oi] === o).map((c) => judge(ctx, res(c)));
        if (vs.length && vs.every((v) => v === 'in')) {
          const g = open[oi];
          const other = o === 'D' ? `${g.a} and ${g.b} draw` : `${o === 'A' ? g.b : g.a} lose to ${o === 'A' ? g.a : g.b}`;
          conditions.push(`${describeMine(mine)} is enough if ${other}.`);
          break;
        }
      }
      if (conditions.length >= 3) break;
    }
    if (conditions.length >= 3) break;
  }
  // Margins: a single own game that leaves a score-based tie.
  if (mineIdx.length === 1 && conditions.length < 3) {
    const i = mineIdx[0];
    const s = side(i);
    const winCombos = all.filter((c) => c[i] === s);
    if (winCombos.some((c) => judge(ctx, res(c)) === 'tie')) {
      const others = otherIdx;
      for (let m = 1; m <= 15; m++) {
        const ok = winCombos.every((c) =>
          [1, 15].every((om) => {
            const extra = open.map((g, j): Result => {
              const o = c[j];
              const margin = j === i ? m : om;
              const [sa, sb] = o === 'D' ? [10, 10] : o === 'A' ? [10 + margin, 10] : [10, 10 + margin];
              return { a: g.a, b: g.b, outcome: o, sa, sb };
            });
            void others;
            return judge(ctx, extra) === 'in';
          }),
        );
        if (ok) {
          conditions.push(`Win by ${m} or more vs ${opp(i)} to be sure of top ${ctx.target} on the tie-breaks.`);
          break;
        }
      }
    }
  }
  if (!conditions.length) conditions.push(`Top ${ctx.target} is still possible but depends on several results.`);
  return { verdict: 'depends', conditions: conditions.slice(0, 3) };
}

export type { Ctx as NeedContext };
