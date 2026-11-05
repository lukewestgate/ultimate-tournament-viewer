import type { Format } from '../model/types';
import type { Mapping } from '../mapping/types';

/** Small settings live in localStorage; workbooks live in IndexedDB. */

export type Theme = 'system' | 'light' | 'dark';

export interface AppSettings {
  theme: Theme;
  aiKey?: string;
  aiModel?: string;
  iosHintShown?: boolean;
  recentSearches?: string[];
  /** Featured admin: the sheet's Apps Script web app and its key. Stay on this device. */
  adminUrl?: string;
  adminKey?: string;
}

export interface FollowedTeam {
  /** `${division}::${name}` */
  key: string;
}

export interface TournamentSettings {
  id: string;
  /** Saved mapping (absent = Auto). */
  mapping?: Mapping;
  format?: Format;
  followed: FollowedTeam[];
  primary?: string;
  division?: string;
  lastOpened?: number;
  addedAt: number;
  dismissed?: string[];
  /** Summary kept for the home screen without loading the workbook. */
  summary?: TournamentSummary;
  /** Earlier readings, newest first, kept when a reading is replaced so the two can be compared or undone. */
  history?: SavedReading[];
  /** An AI suggestion not used yet, kept so it can be compared in detail before deciding. */
  proposal?: SavedReading;
  /** This device changed the reading itself, so featured updates leave it alone. */
  ownReading?: boolean;
  /** The featured reading last taken ("" = the featured entry had none). */
  featuredM?: string;
}

/** A mapping (undefined = read automatically) and its format, as they were at some point. */
export interface SavedReading {
  at: number;
  /** What this reading is ("Before AI changes", "AI suggestion"). */
  label: string;
  mapping?: Mapping;
  format?: Format;
}

export interface TournamentSummary {
  title: string;
  games?: number;
  pools?: number;
  primary?: { team: string; next?: { start: number; pitch: string; opponent?: string }; place?: number };
  firstStart?: number;
  lastEnd?: number;
  days: { name: string; date: string; dateSource: string }[];
  divisions: number;
  teams: number;
  problems: number;
  datesGuessed: boolean;
  error?: string;
  lastFetched?: number;
  /** Scheduled games that aren't byes, and how many of those (leaving out if-required games) have no result. */
  counted?: number;
  unresolved?: number;
  /** When the last if-required game with no result ends. */
  ifRequiredUntil?: number;
  /** Final standings have a team in every place, for every division. */
  standingsDone?: boolean;
  /** First start and last end of each day's games. */
  sessions?: { start: number; end: number }[];
  /** The end of the last game's day, in the tournament's time zone. */
  finishBy?: number;
  teamNames?: string[];
  divisionNames?: string[];
}

const APP_KEY = 'tv:app';
const LIST_KEY = 'tv:list';
const T_PREFIX = 'tv:t:';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable */
  }
}

export const loadApp = (): AppSettings => read<AppSettings>(APP_KEY, { theme: 'system' });
export const saveApp = (s: AppSettings) => write(APP_KEY, s);

export const listIds = (): string[] => read<string[]>(LIST_KEY, []);
export const saveList = (ids: string[]) => write(LIST_KEY, ids);

export function loadTournament(id: string): TournamentSettings | undefined {
  return read<TournamentSettings | undefined>(T_PREFIX + id, undefined);
}

export function saveTournament(s: TournamentSettings) {
  write(T_PREFIX + s.id, s);
  const ids = listIds();
  if (!ids.includes(s.id)) saveList([...ids, s.id]);
}

export function removeTournament(id: string) {
  try {
    localStorage.removeItem(T_PREFIX + id);
  } catch {
    /* ignore */
  }
  saveList(listIds().filter((x) => x !== id));
}

export const teamKey = (name: string, division?: string) => `${division ?? ''}::${name}`;
export const parseTeamKey = (key: string) => {
  const i = key.indexOf('::');
  return { division: key.slice(0, i) || undefined, name: key.slice(i + 2) };
};
