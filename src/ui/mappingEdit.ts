import type { TCtx } from './ctx';
import type { Mapping } from '../mapping/types';
import type { Format } from '../model/types';
import { store } from '../store/app';
import { encodeBundle } from '../mapping/share';

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

/** A share link: carries the mapping (and format) unless everything is automatic. */
export async function shareLink(c: TCtx): Promise<string> {
  const base = `${location.origin}${location.pathname}?sheet=${encodeURIComponent(c.id)}`;
  const saved = store.get(c.id);
  const custom = saved?.mapping && (saved.mapping.mode !== 'auto' || Object.values(saved.mapping.corrections).some((v) => v && typeof v === 'object' && Object.keys(v).length) || saved.mapping.rules);
  const userFormat = saved?.format && Object.values(saved.format.divisions).some((d) => Object.values(d.sources).some((e) => e.origin === 'user' || e.origin === 'ai'));
  if (!custom && !userFormat) return base;
  return `${base}&m=${await encodeBundle({ mapping: c.p.mapping, format: userFormat ? saved!.format : undefined })}`;
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
