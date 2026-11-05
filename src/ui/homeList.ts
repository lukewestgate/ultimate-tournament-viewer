import { wallClock } from '../engine/time';
import type { FeaturedEntry } from '../store/featured';
import { HOME_ZONE, tournamentStatus, type TournamentStatus } from '../store/launch';
import { parseTeamKey, type TournamentSettings } from '../store/settings';
import { fuzzyScore } from './screens/Search';

/** Featured tournaments nobody has opened here only have dates, so they get "today" and "ended" instead of "live" and "completed". */
export type HomeStatus = TournamentStatus | 'today' | 'ended';
export type HomeFilter = 'all' | 'now' | 'upcoming' | 'completed';
export type SectionKey = 'now' | 'upcoming' | 'guessed' | 'completed' | 'unknown';

export interface HomeItem {
  id: string;
  title?: string;
  saved?: TournamentSettings;
  featured?: FeaturedEntry;
  status: HomeStatus;
  dates: string[];
  divisions: number;
  teams: number;
  /** Games still without a result, once the tournament has finished. */
  missing: number;
  start: number;
  end: number;
}

export interface Match {
  item: HomeItem;
  score: number;
  /** Teams the search matched, followed teams first. */
  teams: string[];
}

export interface HomeSection {
  key: SectionKey;
  title: string;
  count: number;
  groups: { label?: string; matches: Match[] }[];
}

export interface HomeView {
  sections: HomeSection[];
  counts: Record<HomeFilter, number>;
  /** Everything completed, when All is only showing the latest. */
  moreCompleted?: number;
}

const DAY = 86400000;
const WEEK = 7 * DAY;
/** How many completed tournaments All shows before linking to the rest. */
const COMPLETED_SHOWN = 3;
const SECTIONS: { key: SectionKey; title: string }[] = [
  { key: 'now', title: 'On now' },
  { key: 'upcoming', title: 'Upcoming' },
  { key: 'guessed', title: 'Dates not confirmed' },
  { key: 'completed', title: 'Completed' },
  { key: 'unknown', title: 'Not opened yet' },
];
const SECTION_OF: Record<HomeStatus, SectionKey> = {
  live: 'now',
  today: 'now',
  between: 'now',
  awaiting: 'now',
  upcoming: 'upcoming',
  guessed: 'guessed',
  completed: 'completed',
  ended: 'completed',
  unknown: 'unknown',
};
const IN_FILTER: Record<HomeFilter, SectionKey[]> = {
  all: ['now', 'upcoming', 'guessed', 'completed', 'unknown'],
  now: ['now'],
  upcoming: ['upcoming', 'guessed'],
  completed: ['completed'],
};
const NOW_ORDER: HomeStatus[] = ['live', 'today', 'between', 'awaiting'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const today = (now: number) => wallClock(now, HOME_ZONE).date;

function byDates(e: FeaturedEntry, day: string): HomeStatus {
  if (!e.first) return 'unknown';
  if (day < e.first) return 'upcoming';
  return day > (e.last ?? e.first) ? 'ended' : 'today';
}

/** Saved tournaments and featured ones in one list; a tournament that's both appears once. */
export function homeItems(saved: TournamentSettings[], featured: FeaturedEntry[], now: number): HomeItem[] {
  const ids = [...new Set([...saved.map((s) => s.id), ...featured.map((e) => e.id)])];
  return ids.map((id) => {
    const s = saved.find((x) => x.id === id);
    const e = featured.find((x) => x.id === id);
    const sum = s?.summary?.firstStart ? s.summary : undefined;
    const status = sum ? tournamentStatus(sum, now) : e ? byDates(e, today(now)) : 'unknown';
    const dates = sum ? sum.days.map((d) => d.date) : e?.first ? [e.first, e.last ?? e.first] : [];
    return {
      id,
      title: e?.title ?? s?.summary?.title,
      saved: s,
      featured: e,
      status,
      dates,
      divisions: sum?.divisions ?? e?.divisions.length ?? 0,
      teams: sum?.teams ?? e?.teams.length ?? 0,
      missing: (status === 'awaiting' || status === 'completed') && sum?.unresolved ? sum.unresolved : 0,
      start: sum?.firstStart ?? (e?.first ? Date.parse(e.first) : 0),
      end: sum?.lastEnd ?? (e?.last ? Date.parse(e.last) : 0),
    };
  });
}

function match(item: HomeItem, query: string): Match {
  const q = query.trim();
  if (!q) return { item, score: 1, teams: [] };
  const sum = item.saved?.summary;
  // Short searches match too many team names by scattered letters, so those need the letters together.
  const least = q.length < 4 ? 60 : 1;
  const followed = new Set(item.saved?.followed.map((f) => parseTeamKey(f.key).name));
  // A team can be in two divisions under one name.
  const hits = [...new Set(sum?.teamNames ?? item.featured?.teams ?? [])]
    .map((name) => ({ name, score: fuzzyScore(q, name) }))
    .filter((t) => t.score >= least)
    .sort((a, b) => Number(followed.has(b.name)) - Number(followed.has(a.name)) || b.score - a.score);
  const division = Math.max(0, ...(sum?.divisionNames ?? item.featured?.divisions ?? []).map((d) => fuzzyScore(q, d)));
  const months = item.dates.map((d) => MONTHS[Number(d.slice(5, 7)) - 1]);
  const month = q.length >= 3 && months.some((m) => m.startsWith(q.toLowerCase())) ? 50 : 0;
  const title = item.title ? fuzzyScore(q, item.title) : 0;
  // Title matches rank above team and division matches.
  const other = Math.max(division, month, ...hits.map((t) => t.score));
  return { item, score: Math.max(title, other - 10), teams: hits.map((t) => t.name) };
}

/** A heading for when an upcoming tournament starts, on weeks running Monday to Sunday. */
export function whenLabel(date: string, day: string): string {
  const d = Date.parse(date);
  const t = Date.parse(day);
  if (d === t) return 'Today';
  if (d - t === DAY) return 'Tomorrow';
  const monday = t - ((new Date(t).getUTCDay() + 6) % 7) * DAY;
  const weekend = [0, 6].includes(new Date(d).getUTCDay());
  if (d < monday + WEEK) return weekend ? 'This weekend' : 'This week';
  if (d < monday + 2 * WEEK) return weekend ? 'Next weekend' : 'Next week';
  const name = MONTHS[new Date(d).getUTCMonth()];
  const year = new Date(d).getUTCFullYear();
  return `${name[0].toUpperCase()}${name.slice(1)}${year === new Date(t).getUTCFullYear() ? '' : ` ${year}`}`;
}

function order(a: Match, b: Match, key: SectionKey): number {
  const mine = Number(Boolean(b.item.saved)) - Number(Boolean(a.item.saved));
  if (key === 'now') return NOW_ORDER.indexOf(a.item.status) - NOW_ORDER.indexOf(b.item.status) || mine || a.item.start - b.item.start;
  if (key === 'completed') return b.item.end - a.item.end;
  return a.item.start - b.item.start || mine;
}

/** The search, chips and My list applied to the list (SpecHome, Filter behaviour). */
export function homeView(items: HomeItem[], opts: { query: string; filter: HomeFilter; mine: boolean }, now: number): HomeView {
  const searching = Boolean(opts.query.trim());
  const matched = items
    .filter((i) => !opts.mine || i.saved)
    .map((i) => match(i, opts.query))
    .filter((m) => m.score > 0);
  // Featured tournaments nobody kept leave All a week after they finish, but can still be found.
  const stale = (m: Match) => !searching && !m.item.saved && SECTION_OF[m.item.status] === 'completed' && m.item.end < now - WEEK;
  const count = (f: HomeFilter) => matched.filter((m) => IN_FILTER[f].includes(SECTION_OF[m.item.status]) && (f !== 'all' || !stale(m))).length;
  const counts = { all: count('all'), now: count('now'), upcoming: count('upcoming'), completed: count('completed') };

  let moreCompleted: number | undefined;
  const sections: HomeSection[] = [];
  for (const { key, title } of SECTIONS) {
    if (!IN_FILTER[opts.filter].includes(key)) continue;
    let list = matched.filter((m) => SECTION_OF[m.item.status] === key && (opts.filter !== 'all' || !stale(m)));
    if (!list.length) continue;
    list.sort((a, b) => (searching ? b.score - a.score : 0) || order(a, b, key));
    const total = list.length;
    if (key === 'completed' && opts.filter === 'all' && !searching && total > COMPLETED_SHOWN) {
      moreCompleted = total;
      list = list.slice(0, COMPLETED_SHOWN);
    }
    sections.push({ key, title, count: total, groups: key === 'upcoming' && !searching ? byWhen(list, today(now)) : [{ matches: list }] });
  }
  return { sections, counts, moreCompleted };
}

function byWhen(list: Match[], day: string): HomeSection['groups'] {
  const groups: HomeSection['groups'] = [];
  for (const m of list) {
    const label = m.item.dates[0] ? whenLabel(m.item.dates[0], day) : undefined;
    const last = groups.at(-1);
    if (last && last.label === label) last.matches.push(m);
    else groups.push({ label, matches: [m] });
  }
  return groups;
}
