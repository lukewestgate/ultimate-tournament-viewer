export type Stage = 'pool' | 'powerPool' | 'placement';

/** Which side won: lo = left/first-listed slot, hi = right slot. */
export type Outcome = 'lo' | 'hi' | 'draw';

export interface Game {
  id: string; // game code, unique ("A1vA3", "8v9", "[4v5]")
  code: string; // display code without brackets
  ordinal: number;
  day: string;
  time: string; // "HH:MM"
  start: number; // epoch ms
  end: number; // start + game length
  slotEnd: number; // start + game length + gap
  pitch: number;
  stage: Stage;
  pool?: string;
  lo: string; // slot code: "A1" or "8"
  hi: string;
  sheetLo?: string; // team names resolved by the sheet
  sheetHi?: string;
  scoreLo?: number;
  scoreHi?: number;
  isGameToGo: boolean;
}

export interface PoolSlot {
  slot: string; // "A1"
  seed: number;
  team?: string; // only known up front for initial pools
}

export interface CarriedGame {
  pool: string;
  lo: string; // slot codes in the derived pool, e.g. "E1"
  hi: string;
}

export interface PoolInfo {
  letter: string;
  stage: 1 | 2;
  slots: PoolSlot[];
  /** finishing position (1-based) -> seed/position number it hands on */
  finishToSeed: Record<number, number>;
  carried: CarriedGame[];
  /** Sheet's own table, used when it is complete and consistent. */
  sheetRows: { slot: string; team?: string; w?: number; l?: number; d?: number; pts?: number; rank?: number }[];
}

export interface DayRules {
  day: string;
  gameMins: number;
  gapMins: number;
  cap?: number;
}

export interface HeaderInfo {
  isDraft: boolean;
  name?: string;
  sotgFormUrl?: string;
  announcements: string[];
  format: string[];
  qualification: { div1: number; div2: number };
  rules: DayRules[];
  /** Remaining free text as headed sections, for the Info page. */
  sections: { title: string; lines: string[] }[];
}

export interface SotgRow {
  team: string;
  submitted: number;
  received: number;
  played: number;
}

export interface Tournament {
  header: HeaderInfo;
  seeds: { seed: number; team: string }[];
  pools: PoolInfo[];
  games: Game[];
  finalStandings: { rank: number; team?: string }[];
  sotg: SotgRow[];
  dayDates: Record<string, string>;
  warnings: string[];
}
