import type { EngineLevel, Format, Rules } from '../model/types';

/** Column roles in a list source. Column indices are 0-based, absolute. */
export interface ListCols {
  time: number;
  team1: number;
  team2: number;
  day?: number;
  pitch?: number;
  division?: number;
  code?: number;
  score1?: number;
  score2?: number;
  slot1?: number;
  slot2?: number;
  /** Optional "is this a bracket game?" column. */
  bracket?: number;
}

export interface ListSource {
  kind: 'list';
  tab: string;
  headerRow: number;
  lastRow?: number;
  cols: ListCols;
  fixedDay?: string;
  fixedDivision?: string;
}

/** Offsets relative to a block's separator column. */
export interface GridOffsets {
  team1: number;
  team2: number;
  score1?: number;
  score2?: number;
  slot1?: number;
  slot2?: number;
  time?: number;
}

export interface GridBlock {
  sep: number;
  pitch: string;
}

export interface GridSource {
  kind: 'grid';
  tab: string;
  firstRow: number;
  lastRow?: number;
  blocks: GridBlock[];
  offsets: GridOffsets;
  /** Shared time column, used when there's no per-block time offset. */
  timeCol?: number;
  fixedDay?: string;
  fixedDivision?: string;
}

export type GameSource = ListSource | GridSource;

export interface PoolCols {
  p?: number;
  w: number;
  d?: number;
  l: number;
  pf?: number;
  pa?: number;
  diff?: number;
  pts?: number;
  rank?: number;
  /** "→ Continue to top 8" style notes. */
  note?: number;
  /** Explicit "New Seed" column. */
  newSeed?: number;
}

export interface PoolTableMap {
  tab: string;
  headerRow: number;
  lastRow: number;
  teamCol: number;
  slotCol?: number;
  seedCol?: number;
  cols: PoolCols;
  name: string;
}

export interface SeedingMap {
  tab: string;
  firstRow: number;
  lastRow: number;
  seedCol: number;
  teamCol: number;
  label?: string;
}

export interface StandingsMap {
  tab: string;
  firstRow: number;
  lastRow: number;
  placeCol: number;
  teamCol: number;
  label?: string;
}

export interface Corrections {
  /** day name -> yyyy-mm-dd */
  dates: Record<string, string>;
  /** day name -> minutes */
  gameLength: Record<string, number>;
  /** "day" or "day|division" -> minutes late */
  delays: Record<string, number>;
  /** other spelling -> canonical name ("div::name" keys scope to a division) */
  aliases: Record<string, string>;
  /** raw value or generated name -> display name */
  divisionNames: Record<string, string>;
  /** team -> division it belongs in ("div::name" keys pick the copy read into that division) */
  teamDivisions?: Record<string, string>;
  /** game ref ("Gamelist!20") -> division */
  gameDivisions?: Record<string, string>;
  /** game refs ("Gamelist!20") that aren't real games */
  ignoreRows?: string[];
  /** suggested merges the user rejected ("a|b") */
  rejectedMerges?: string[];
  title?: string;
  timeZone?: string;
  notes?: string[];
}

export interface Mapping {
  version: 1;
  mode: 'auto' | 'ai' | 'manual';
  games: GameSource[];
  pools: PoolTableMap[];
  seeding: SeedingMap[];
  standings: StandingsMap[];
  info: string[];
  corrections: Corrections;
  rules?: Rules;
  engineLevel?: Record<string, EngineLevel>;
  template?: 'uku';
  notes?: string[];
}

/** Everything that travels together: what the user can share or the AI can propose. */
export interface MappingBundle {
  mapping: Mapping;
  format?: Format;
}

export function emptyCorrections(): Corrections {
  return { dates: {}, gameLength: {}, delays: {}, aliases: {}, divisionNames: {} };
}

export function emptyMapping(mode: Mapping['mode'] = 'auto'): Mapping {
  return { version: 1, mode, games: [], pools: [], seeding: [], standings: [], info: [], corrections: emptyCorrections() };
}
