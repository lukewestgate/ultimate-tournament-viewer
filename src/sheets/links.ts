/** Where a sheet lives: a normal share link (id) or a publish-to-web link (pubId). */
export type SheetSource =
  | { kind: 'share'; id: string; gid?: string }
  | { kind: 'publish'; pubId: string; gid?: string };

const ID_RE = /^[A-Za-z0-9_-]{25,}$/;

/** Parse a pasted link or bare id. Returns undefined when it isn't recognisable. */
export function parseSheetLink(input: string): SheetSource | undefined {
  const s = input.trim();
  if (!s) return undefined;
  const gid = /[#&?]gid=(\d+)/.exec(s)?.[1];
  const pub = /\/spreadsheets\/d\/e\/([A-Za-z0-9_-]+)/.exec(s);
  if (pub) return { kind: 'publish', pubId: pub[1], gid };
  const share = /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(s);
  if (share) return { kind: 'share', id: share[1], gid };
  if (ID_RE.test(s)) return { kind: 'share', id: s };
  // Prefixed form used in our own URLs: "e:<pubId>"
  if (/^e:[A-Za-z0-9_-]{20,}$/.test(s)) return { kind: 'publish', pubId: s.slice(2) };
  return undefined;
}

/** Stable tournament id for a source. Publish ids are prefixed so they never clash. */
export function sourceKey(src: SheetSource): string {
  return src.kind === 'share' ? src.id : `e:${src.pubId}`;
}

export function sourceFromKey(key: string): SheetSource {
  return key.startsWith('e:') ? { kind: 'publish', pubId: key.slice(2) } : { kind: 'share', id: key };
}

const BASE = 'https://docs.google.com/spreadsheets/d/';

function bust(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}_cb=${Date.now().toString(36)}`;
}

export function workbookUrl(src: SheetSource, cacheBust = true): string {
  const u = src.kind === 'share' ? `${BASE}${src.id}/export?format=xlsx` : `${BASE}e/${src.pubId}/pub?output=xlsx`;
  return cacheBust ? bust(u) : u;
}

export function tabCsvUrl(src: SheetSource, gid: string, cacheBust = true): string {
  const u =
    src.kind === 'share'
      ? `${BASE}${src.id}/export?format=csv&gid=${gid}`
      : `${BASE}e/${src.pubId}/pub?gid=${gid}&single=true&output=csv`;
  return cacheBust ? bust(u) : u;
}

export function tabListUrl(src: SheetSource, cacheBust = true): string {
  const u = src.kind === 'share' ? `${BASE}${src.id}/htmlview` : `${BASE}e/${src.pubId}/pubhtml`;
  return cacheBust ? bust(u) : u;
}

/** Link to open the original sheet in Google Sheets. */
export function sheetViewUrl(src: SheetSource, gid?: string): string {
  if (src.kind === 'share') return `${BASE}${src.id}/edit${gid ? `#gid=${gid}` : ''}`;
  return `${BASE}e/${src.pubId}/pubhtml${gid ? `?gid=${gid}` : ''}`;
}

export interface TabListing {
  title?: string;
  tabs: { name: string; gid: string }[];
}

/** Parse the htmlview / pubhtml page for tab names, gids and the document title. */
export function parseTabListing(html: string): TabListing {
  const tabs: { name: string; gid: string }[] = [];
  const re = /items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)",\s*pageUrl:\s*"(?:[^"\\]|\\.)*",\s*gid:\s*"(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) tabs.push({ name: unescapeJs(m[1]), gid: m[2] });
  if (!tabs.length) {
    // pubhtml variant: <li id="sheet-button-123"><a ...>Name</a>
    const re2 = /id="sheet-button-(\d+)"[^>]*>\s*<a[^>]*>([^<]*)<\/a>/g;
    while ((m = re2.exec(html))) tabs.push({ name: decodeHtml(m[2]), gid: m[1] });
  }
  let title = /<title>([^<]*)<\/title>/i.exec(html)?.[1];
  if (title) {
    title = decodeHtml(title).replace(/\s*-\s*Google (Drive|Sheets|Docs)\s*$/i, '').trim();
  }
  return { title: title || undefined, tabs };
}

function unescapeJs(s: string): string {
  return s.replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\(.)/g, '$1');
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

/** Tab names lose characters like "/" and "'" in the xlsx export. Compare ignoring punctuation and case. */
export function tabKey(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}
