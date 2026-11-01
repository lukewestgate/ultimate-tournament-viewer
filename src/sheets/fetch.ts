import Papa from 'papaparse';
import { parseTabListing, tabCsvUrl, tabListUrl, workbookUrl, type SheetSource, type TabListing } from './links';
import { workbookFromXlsx, type Workbook, type XlsxLike } from './workbook';

export type FetchErrorKind = 'private' | 'notFound' | 'offline' | 'network' | 'parse';

export class SheetFetchError extends Error {
  constructor(
    public kind: FetchErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'SheetFetchError';
  }
}

export const FETCH_ERROR_TEXT: Record<FetchErrorKind, string> = {
  private: "This sheet isn't shared publicly.",
  notFound: "We couldn't find that sheet.",
  offline: "You're offline.",
  network: "Couldn't reach Google Sheets.",
  parse: "The sheet couldn't be read.",
};

let xlsxModule: Promise<XlsxLike> | undefined;

/** Lazily load SheetJS (its own chunk; not in the main bundle). */
export function loadXlsx(): Promise<XlsxLike> {
  xlsxModule ??= import('xlsx').then((m) => m as unknown as XlsxLike);
  return xlsxModule;
}

type Fetcher = typeof fetch;

async function get(url: string, fetcher: Fetcher): Promise<Response> {
  let res: Response;
  try {
    res = await fetcher(url, { cache: 'no-store', credentials: 'omit', redirect: 'follow' });
  } catch (e) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    throw new SheetFetchError(offline ? 'offline' : 'network', String((e as Error)?.message ?? e));
  }
  if (res.status === 404) throw new SheetFetchError('notFound', 'Not found', 404);
  if (res.status === 401 || res.status === 403) throw new SheetFetchError('private', 'Not shared', res.status);
  if (!res.ok) throw new SheetFetchError('network', `HTTP ${res.status}`, res.status);
  if (/accounts\.google\.com|ServiceLogin/.test(res.url)) throw new SheetFetchError('private', 'Sign-in required');
  return res;
}

function looksLikeSignIn(text: string): boolean {
  return /accounts\.google\.com|ServiceLogin|<title>[^<]*Sign[- ]in/i.test(text);
}

/** Fetch and parse the whole workbook (xlsx export). */
export async function fetchWorkbook(src: SheetSource, fetcher: Fetcher = fetch): Promise<{ workbook: Workbook; bytes: number }> {
  const res = await get(workbookUrl(src), fetcher);
  const type = res.headers.get('content-type') ?? '';
  const buf = await res.arrayBuffer();
  if (/text\/html/i.test(type)) {
    const text = new TextDecoder().decode(buf.slice(0, 4000));
    throw new SheetFetchError(looksLikeSignIn(text) ? 'private' : 'notFound', 'Got an HTML page instead of a workbook');
  }
  const X = await loadXlsx();
  try {
    return { workbook: workbookFromXlsx(X, buf), bytes: buf.byteLength };
  } catch (e) {
    throw new SheetFetchError('parse', String((e as Error)?.message ?? e));
  }
}

/** Fetch the visible tab list (names, gids) and title. */
export async function fetchTabListing(src: SheetSource, fetcher: Fetcher = fetch): Promise<TabListing> {
  const res = await get(tabListUrl(src), fetcher);
  const text = await res.text();
  if (looksLikeSignIn(text) && !/items\.push/.test(text)) throw new SheetFetchError('private', 'Sign-in required');
  return parseTabListing(text);
}

/** Fetch one tab as CSV and return displayed-text rows. */
export async function fetchTabCsv(src: SheetSource, gid: string, fetcher: Fetcher = fetch): Promise<string[][]> {
  const res = await get(tabCsvUrl(src, gid), fetcher);
  const text = await res.text();
  if (/^\s*<!doctype html|^\s*<html/i.test(text)) {
    throw new SheetFetchError(looksLikeSignIn(text) ? 'private' : 'notFound', 'Got an HTML page instead of CSV');
  }
  return parseCsv(text);
}

export function parseCsv(text: string): string[][] {
  const out = Papa.parse<string[]>(text, { skipEmptyLines: false });
  return out.data.map((r) => r.map((c) => c ?? ''));
}

/** Attach gids from a tab listing to workbook tabs (matching names ignoring punctuation and case). */
export function attachGids(wb: Workbook, listing: TabListing): Workbook {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const map = new Map(listing.tabs.map((t) => [norm(t.name), t]));
  return {
    title: listing.title ?? wb.title,
    tabs: wb.tabs.map((t) => {
      const hit = map.get(norm(t.name));
      return hit ? { ...t, gid: hit.gid, name: hit.name.length >= t.name.length ? hit.name : t.name } : t;
    }),
  };
}
