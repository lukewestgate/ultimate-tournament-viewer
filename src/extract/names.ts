import { clean } from '../sheets/cells';

/** Fold a name for comparison: case, spacing and punctuation don't matter. */
export function foldName(s: string | undefined): string {
  return clean(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Tidy a display name: trim, collapse spaces, drop stray backticks. */
export function tidyName(s: string): string {
  return clean(s).replace(/`/g, '').replace(/\s+\)/g, ')').replace(/\(\s+/g, '(').replace(/\s{2,}/g, ' ');
}

const TAG_RE = /\s*\(([A-Za-z]{1,4}\d{0,2})\)\s*$/;

/** Region / qualification tag in brackets at the end: "Leeds 1 (N1)" -> "N1". */
export function regionTag(name: string): string | undefined {
  return TAG_RE.exec(name)?.[1];
}

export function withoutTag(name: string): string {
  return name.replace(TAG_RE, '').trim();
}

/** Club name for colours and grouping: the name without tag and trailing team number / suffix. */
export function clubOf(name: string): string {
  let s = withoutTag(name);
  s = s.replace(/\s+(\d+|[IVX]+|A|B|C)$/i, '');
  s = s.replace(/\s+(begs|beginners|women|womens|women's|open|mixed|masters|u\d+|o|w|x)$/i, '');
  s = s.replace(/\s+(\d+)$/, '');
  return s.trim() || name.trim();
}

export function isByeName(s: string | undefined): boolean {
  return /^bye$/i.test(clean(s));
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Is `b` likely the same team as `a`? Used only for suggestions, never automatic merges. */
export function likelySame(a: string, b: string): boolean {
  const fa = foldName(withoutTag(a));
  const fb = foldName(withoutTag(b));
  if (!fa || !fb || fa === fb) return fa === fb && fa !== '' && foldName(a) !== foldName(b);
  const suffix = /(begs|beginners|women|womens|open|mixed|u20|u17|u24|\d)$/;
  const strip = (s: string) => s.replace(suffix, '');
  if (strip(fa) === fb || strip(fb) === fa) return true;
  if (fa.length >= 5 && fb.length >= 5) {
    // Team designations: "Leeds 1" vs "Leeds 2", "Guildford A" vs "Guildford B" aren't the same team.
    const na = (fa.match(/\d+/g) ?? []).join(',');
    const nb = (fb.match(/\d+/g) ?? []).join(',');
    if (na && nb && na !== nb) return false;
    const ta = clean(withoutTag(a)).toLowerCase().split(/\s+/);
    const tb = clean(withoutTag(b)).toLowerCase().split(/\s+/);
    if (ta.length === tb.length) {
      const diff = ta.map((x, i) => [x, tb[i]]).filter(([x, y]) => x !== y);
      if (diff.length === 1 && diff[0][0].length <= 2 && diff[0][1].length <= 2) return false;
    }
    const d = levenshtein(fa, fb);
    if (d <= 1 || (d <= 2 && Math.min(fa.length, fb.length) >= 8)) return true;
    if (fa.startsWith(fb) && fb.length >= 5 && fa.length - fb.length <= 6) return true;
    if (fb.startsWith(fa) && fa.length >= 5 && fb.length - fa.length <= 6) return true;
  }
  return false;
}

/** Spelling variants of the same name (typos), not nicknames or prefixes. */
export function closeSpelling(a: string, b: string): boolean {
  const fa = foldName(a);
  const fb = foldName(b);
  if (fa === fb) return true;
  if (Math.min(fa.length, fb.length) < 6) return false;
  return levenshtein(fa, fb) <= (Math.min(fa.length, fb.length) >= 10 ? 2 : 1);
}
