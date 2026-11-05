import { fetchTabCsv } from '../sheets/fetch';
import { parseSheetLink, sourceKey } from '../sheets/links';
import type { TournamentSettings } from './settings';

/**
 * The public Google Sheet behind the featured list: its link or id, shared as "Anyone with the link", Viewer.
 * Empty until the sheet exists (README, Featured tournaments), which turns the list off.
 */
export const FEATURED_SHEET = 'https://docs.google.com/spreadsheets/d/1ul6g4aZJyLVTMo5cqKDDxEGjEOhSsmPElkBfSavOqOY/edit?gid=0#gid=0';

/** A sheet cell holds 50,000 characters. */
const MAX_READING = 49000;
const CACHE_KEY = 'tv:featured';
const NAMES = '|';

/** One row of the featured sheet. */
export interface FeaturedEntry {
  id: string;
  title: string;
  /** yyyy-mm-dd; absent until the dates are known. */
  first?: string;
  last?: string;
  divisions: string[];
  teams: string[];
  /** The published reading, as in a share link; absent = read automatically. */
  m?: string;
}

const isDay = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
const names = (s: string | undefined) => (s ? s.split(NAMES).map((x) => x.trim()).filter(Boolean) : []);

/** Read the sheet's rows by header, skipping any that can't be used. Undefined when it isn't the featured sheet. */
export function parseFeaturedRows(rows: string[][]): FeaturedEntry[] | undefined {
  const head = rows[0]?.map((c) => c.trim().toLowerCase());
  if (!head?.includes('id') || !head.includes('title')) return undefined;
  const out = new Map<string, FeaturedEntry>();
  for (const row of rows.slice(1)) {
    const cell = (name: string) => row[head.indexOf(name)]?.trim() || undefined;
    const src = parseSheetLink(cell('id') ?? '');
    const title = cell('title');
    if (!src || !title || /^(false|no|0)$/i.test(cell('show') ?? '')) continue;
    const id = sourceKey(src);
    const first = isDay(cell('first'));
    out.set(id, { id, title, first, last: isDay(cell('last')) ?? first, divisions: names(cell('divisions')), teams: names(cell('teams')), m: cell('m') });
  }
  return [...out.values()];
}

export async function fetchFeatured(): Promise<FeaturedEntry[] | undefined> {
  const src = parseSheetLink(FEATURED_SHEET);
  return src ? parseFeaturedRows(await fetchTabCsv(src, src.gid ?? '0')) : undefined;
}

export function loadFeatured(): FeaturedEntry[] {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]') as FeaturedEntry[];
  } catch {
    return [];
  }
}

export function saveFeatured(list: FeaturedEntry[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    /* storage full or unavailable */
  }
}

/** The person made this reading or was sent it. Readings saved before the featured list count too. */
export function hasOwnReading(s: TournamentSettings): boolean {
  return Boolean(s.ownReading || (s.featuredM === undefined && (s.mapping || s.format)));
}

/** Whether a saved tournament should move to this entry's reading. */
export function takesFeatured(s: TournamentSettings, e: FeaturedEntry): boolean {
  return !hasOwnReading(s) && (e.m ?? '') !== (s.featuredM ?? '');
}

export interface AdminAccess {
  url: string;
  key: string;
}

export type AdminRequest = { action: 'ping' } | { action: 'remove'; id: string } | { action: 'publish'; entry: FeaturedEntry };

/** Call the sheet's Apps Script. Plain text keeps it a simple request, which Apps Script can answer across origins. */
export async function adminCall(admin: AdminAccess, req: AdminRequest): Promise<void> {
  if (req.action === 'publish' && (req.entry.m?.length ?? 0) > MAX_READING) throw new Error('This reading is too long for one cell of the sheet.');
  const body = req.action === 'publish' ? { ...req, entry: { ...req.entry, divisions: req.entry.divisions.join(NAMES), teams: req.entry.teams.join(NAMES) } } : req;
  const res = await fetch(admin.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, key: admin.key }),
    signal: AbortSignal.timeout(30000),
  });
  const out = (await res.json().catch(() => undefined)) as { ok?: boolean; error?: string } | undefined;
  if (!out?.ok) throw new Error(out?.error ?? 'The script didn’t answer properly.');
}
