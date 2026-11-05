import type { TCtx } from './ctx';
import type { Mapping } from '../mapping/types';
import type { Format } from '../model/types';
import { store } from '../store/app';
import { encodeBundle, isCustomMapping } from '../mapping/share';
import type { FeaturedEntry } from '../store/featured';

/** Change the tournament's mapping (corrections, rules…) and re-read. Mode changes only when a reader changed it. */
export function editMapping(c: TCtx, fn: (m: Mapping) => Mapping, mode?: Mapping['mode']) {
  const cur: Mapping = JSON.parse(JSON.stringify(c.p.mapping));
  const next = fn(cur);
  if (mode) next.mode = mode;
  store.runtime(c.id).setMapping(next);
  store.emit();
}

export function editFormat(c: TCtx, fn: (f: Format) => Format | undefined) {
  const cur: Format = JSON.parse(JSON.stringify(c.p.format));
  store.runtime(c.id).setFormat(fn(cur));
  store.emit();
}

/** The reading in shareable form, unless everything is automatic. */
async function readingCode(c: TCtx): Promise<string | undefined> {
  const saved = store.get(c.id);
  const custom = saved?.mapping && isCustomMapping(saved.mapping);
  const userFormat = saved?.format && Object.values(saved.format.divisions).some((d) => Object.values(d.sources).some((e) => e.origin === 'user' || e.origin === 'ai'));
  if (!custom && !userFormat) return undefined;
  return encodeBundle({ mapping: c.p.mapping, format: userFormat ? saved!.format : undefined });
}

/** A share link: carries the mapping (and format) unless everything is automatic. */
export async function shareLink(c: TCtx): Promise<string> {
  const base = `${location.origin}${location.pathname}?sheet=${encodeURIComponent(c.id)}`;
  const m = await readingCode(c);
  return m ? `${base}&m=${m}` : base;
}

/** This tournament as a row of the featured sheet. */
export async function featuredEntry(c: TCtx): Promise<FeaturedEntry> {
  const days = c.t.days.map((d) => d.date).sort();
  return { id: c.id, title: c.t.title, first: days[0], last: days.at(-1), divisions: c.t.divisions.map((d) => d.name), teams: c.t.teams.map((t) => t.name), m: await readingCode(c) };
}

export async function copyOrShare(url: string, title: string, toast: (t: string) => void) {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch {
      /* fall back to copy */
    }
  }
  await navigator.clipboard?.writeText(url).catch(() => undefined);
  toast('Link copied.');
}
