import type { Rules, Tiebreak } from '../model/types';

/** UKU Tournament Rules §6 (updated 22 March 2024). */
export function ukuPreset(): Rules {
  return {
    points: { win: 3, draw: 1, loss: 0 },
    tiebreaks: ['h2hWins', 'forfeits', 'h2hDiff', 'commonDiff', 'h2hScoredPerGame', 'commonScoredPerGame', 'discThrow'],
    drawsAllowed: { pool: true, placement: false },
    source: 'preset',
    preset: 'uku',
  };
}

/** "Points > Head to Head (incl. PD) > Points Difference > Points Scored > Seeding". */
export function pointsDiffPreset(): Rules {
  return {
    points: { win: 3, draw: 1, loss: 0 },
    tiebreaks: ['h2hPoints', 'diff', 'scored', 'seed'],
    drawsAllowed: { pool: true, placement: false },
    source: 'preset',
    preset: 'pointsDiff',
  };
}

export const TIEBREAK_LABEL: Record<Tiebreak, string> = {
  h2hWins: 'Head-to-head wins',
  h2hPoints: 'Head-to-head points',
  forfeits: 'Fewest forfeits',
  h2hDiff: 'Head-to-head difference',
  commonDiff: 'Difference vs common opponents',
  h2hScoredPerGame: 'Head-to-head scored per game',
  commonScoredPerGame: 'Scored per game vs common opponents',
  diff: 'Points difference',
  scored: 'Points scored',
  conceded: 'Fewest conceded',
  seed: 'Better seed',
  discThrow: 'Disc throw',
  spirit: 'Spirit score',
  coinToss: 'Coin toss',
};

export const UNCOMPUTABLE: Tiebreak[] = ['discThrow', 'spirit', 'coinToss'];
export const ALL_TIEBREAKS = Object.keys(TIEBREAK_LABEL) as Tiebreak[];
