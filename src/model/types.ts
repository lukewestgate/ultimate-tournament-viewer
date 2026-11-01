/** Canonical model (spec §5) plus rules (§8.3) and format (§6.7). */

export type Stage = 'pool' | 'powerPool' | 'placement';

export interface Division {
  /** Display name, also the key games/teams use. */
  name: string;
  /** Raw code from the sheet ("W", "M"), if any. */
  code?: string;
  /** Higher-level group for the switcher, e.g. "Men" for "Men D1". */
  group?: string;
}

export interface Team {
  name: string;
  club: string;
  division?: string;
  aliases: string[];
  /** Region/qualification tag kept from the name, e.g. "N2". */
  tag?: string;
  seed?: number;
}

export interface Game {
  id: string;
  ref: string;
  division?: string;
  day: string;
  time: string;
  start: number;
  end: number;
  slotEnd: number;
  pitch: { label: string; order: number };
  stage: Stage;
  pool?: string;
  code?: string;
  slots: [string | undefined, string | undefined];
  teams: [string | undefined, string | undefined];
  scores: [number | undefined, number | undefined];
  /** Result marks without numbers ("w"/"l" in score cells). */
  marks?: [('W' | 'L' | 'D') | undefined, ('W' | 'L' | 'D') | undefined];
  forfeit?: [boolean, boolean];
  isGameToGo: boolean;
  /** "if required" game (game to go, or labelled so). */
  conditional?: boolean;
  /** Text shown in unresolved team cells ("Winner 8v9"). */
  labels?: [string | undefined, string | undefined];
  /** Played against BYE: no pitch or status. */
  isBye?: boolean;
  /** Placeholder row (no pitch / unused day). Kept out of Now and the day list. */
  unscheduled?: boolean;
  /** Bracket flag from the sheet (UKU "is this a bracket game?"). */
  bracketHint?: boolean;
  /** Cap time in minutes, where known. */
  capMins?: number;
}

export interface PoolSlot {
  slot: string;
  seed?: number;
  team?: string;
}

export interface SheetTableRow {
  team: string;
  p?: number;
  w?: number;
  d?: number;
  l?: number;
  pf?: number;
  pa?: number;
  diff?: number;
  pts?: number;
  rank?: number;
  /** "→ Continue to top 8" etc. */
  note?: string;
  /** Explicit "New Seed" for this finishing row. */
  newSeed?: number;
}

export interface Pool {
  name: string;
  division?: string;
  stage: 'pool' | 'powerPool';
  slots: PoolSlot[];
  finishToSeed?: Record<number, number>;
  carried?: { slotA: string; slotB: string }[];
  sheetTable?: SheetTableRow[];
  /** TD's recorded tie-break decision: team order. */
  tdOrder?: { rank: number; team: string }[];
}

export interface DayInfo {
  name: string;
  date: string;
  dateSource: 'sheet' | 'user' | 'guessed';
}

export interface Timing {
  day: string;
  division?: string;
  gameMins: number;
  slotMins: number;
  delayMins: number;
  capMins?: number;
}

export interface LinkItem {
  label: string;
  url: string;
  division?: string;
}

export interface Links {
  sheet: string;
  spirit?: string;
  stream?: string;
  pitchMap?: string;
  /** Per-division spirit forms etc. */
  items: LinkItem[];
}

export interface InfoSection {
  title: string;
  lines: string[];
  tab?: string;
}

export interface Tournament {
  id: string;
  title: string;
  format: Format;
  days: DayInfo[];
  timeZone: string;
  divisions: Division[];
  teams: Team[];
  games: Game[];
  pools: Pool[];
  seeding: { division?: string; seed: number; team: string }[];
  rules: Rules;
  timing: Timing[];
  info: InfoSection[];
  links: Links;
  isDraft: boolean;
  announcements: string[];
  finalStandings?: { division?: string; place: number; team?: string; section?: string }[];
  warnings: string[];
  /** Spirit submissions table (team → counts) where the sheet has one. */
  spirit?: { team: string; submitted?: number; received?: number; played?: number; division?: string }[];
}

// ---- Rules (§8.3) ----

export type Tiebreak =
  | 'h2hWins'
  | 'h2hPoints'
  | 'forfeits'
  | 'h2hDiff'
  | 'commonDiff'
  | 'h2hScoredPerGame'
  | 'commonScoredPerGame'
  | 'diff'
  | 'scored'
  | 'conceded'
  | 'seed'
  | 'discThrow'
  | 'spirit'
  | 'coinToss';

export interface Rules {
  points: { win: number; draw: number; loss: number };
  tiebreaks: Tiebreak[];
  drawsAllowed: { pool: boolean; placement: boolean };
  /** Rank by games won instead of points (UKU when draws aren't allowed). */
  rankBy?: 'points' | 'wins';
  source: 'preset' | 'sheet' | 'ai' | 'user';
  preset?: 'uku' | 'pointsDiff' | 'custom';
}

// ---- Format (§6.7) ----

export type Source =
  | { kind: 'team'; team: string }
  | { kind: 'seed'; seed: number }
  | { kind: 'poolFinish'; pool: string; place: number }
  | { kind: 'rankedFinish'; pools: string[]; place: number; rank: number }
  | { kind: 'gameResult'; game: string; take: 'winner' | 'loser' }
  | { kind: 'unknown'; label: string };

export type SourceOrigin = 'template' | 'table' | 'label' | 'convention' | 'ai' | 'user';
export type SourceStatus = 'unverified' | 'confirmed' | 'doubtful';

export interface SourceEntry {
  source: Source;
  origin: SourceOrigin;
  status: SourceStatus;
}

export interface DivisionFormat {
  /** Keys: "game:<gameId>:1|2" or "pool:<pool>:<slot>". */
  sources: Record<string, SourceEntry>;
  carried?: { pool: string; rule: 'earlierGameBetweenSameTeams' }[];
  places?: Record<number, SourceEntry>;
  qualification?: { label: string; from: number; to: number }[];
}

export interface Format {
  divisions: Record<string, DivisionFormat>;
}

export type EngineLevel = 'full' | 'partial' | 'basic';

export const NO_DIV = '';
export const divKey = (d: string | undefined) => d ?? NO_DIV;
