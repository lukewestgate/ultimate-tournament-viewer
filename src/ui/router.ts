import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'add'; link?: string }
  | { name: 'appSettings' }
  /** Development only: every shared component with sample props. */
  | { name: 'gallery' }
  | { name: 'tournament'; id: string; tab: TournamentTab; arg?: string };

export type TournamentTab =
  | 'now'
  | 'schedule'
  | 'teams'
  | 'team'
  | 'pools'
  | 'brackets'
  | 'info'
  | 'settings'
  | 'diagnostics'
  | 'manual'
  | 'format'
  | 'whatif'
  | 'standings'
  | 'review';

const TABS: TournamentTab[] = ['now', 'schedule', 'teams', 'team', 'pools', 'brackets', 'info', 'settings', 'diagnostics', 'manual', 'format', 'whatif', 'standings', 'review'];

/** Hash routes: #/t/<id>/now, #/t/<id>/team/<key>, #/add, #/settings. */
export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  const [path] = h.split('?');
  const parts = path.split('/').map((p) => decodeURIComponent(p));
  if (parts[0] === 't' && parts[1]) {
    const tab = (TABS.includes(parts[2] as TournamentTab) ? parts[2] : 'now') as TournamentTab;
    return { name: 'tournament', id: parts[1], tab, arg: parts.slice(3).join('/') || undefined };
  }
  if (parts[0] === 'add') return { name: 'add' };
  if (parts[0] === 'settings') return { name: 'appSettings' };
  if (parts[0] === 'gallery') return { name: 'gallery' };
  return { name: 'home' };
}

export function href(r: Route): string {
  switch (r.name) {
    case 'home':
      return '#/';
    case 'add':
      return '#/add';
    case 'appSettings':
      return '#/settings';
    case 'gallery':
      return '#/gallery';
    case 'tournament':
      return `#/t/${encodeURIComponent(r.id)}/${r.tab}${r.arg ? `/${encodeURIComponent(r.arg)}` : ''}`;
  }
}

export const tHref = (id: string, tab: TournamentTab = 'now', arg?: string) => href({ name: 'tournament', id, tab, arg });

export function navigate(r: Route | string, replace = false) {
  const h = typeof r === 'string' ? r : href(r);
  if (replace) history.replaceState(history.state, '', `${location.pathname}${location.search}${h}`);
  else location.hash = h;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

// ---- Back: each history entry is stamped with its place in the app's history and the page before it,
// so a Back button can step back when the page before is the one it means, and otherwise go there in place.

type NavState = { tvIdx?: number; tvPrev?: string };
const navState = (): NavState => (history.state && typeof history.state === 'object' ? history.state : {});
const pathOf = (h: string) => h.replace(/^#\/?/, '').split('?')[0];
let lastIdx = -1;
let lastHash = '';

function stamp() {
  const s = navState();
  if (typeof s.tvIdx !== 'number') {
    // A new entry (a link, or `location.hash = …`): it comes after the one we were on.
    const next: NavState = lastIdx < 0 ? { tvIdx: 0 } : { tvIdx: lastIdx + 1, tvPrev: lastHash };
    history.replaceState({ ...s, ...next }, '');
  }
  lastIdx = navState().tvIdx!;
  lastHash = location.hash;
}
// Not in tests, which import this module without a browser.
if (typeof window !== 'undefined') {
  stamp();
  window.addEventListener('hashchange', stamp);
  window.addEventListener('popstate', stamp);
}

/**
 * Leave a page for its parent. If the page before in history is the parent (or, with no parent given,
 * any page of the app), step back to it; otherwise replace this entry with the parent (or `fallback`).
 * It never adds an entry, so pressing Back again and again always ends up out, never in a loop.
 */
export function goUp(parent: string | undefined, fallback: string) {
  const s = navState();
  const hasPrev = (s.tvIdx ?? 0) > 0;
  if (hasPrev && (parent === undefined || (s.tvPrev !== undefined && pathOf(s.tvPrev) === pathOf(parent)))) history.back();
  else navigate(parent ?? fallback, true);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseHash(location.hash));
    };
    window.addEventListener('hashchange', on);
    // A shared link navigates as the app starts, which can be before this listener exists.
    on();
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

// ---- query parameters for sharing: sheet, m, if, at

export function getParam(name: string): string | null {
  return new URLSearchParams(location.search).get(name);
}

export function setParams(patch: Record<string, string | null | undefined>) {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === '') p.delete(k);
    else p.set(k, v);
  }
  const qs = p.toString();
  history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
  window.dispatchEvent(new Event('paramschange'));
}

export function useParam(name: string): string | null {
  const [v, setV] = useState(() => getParam(name));
  useEffect(() => {
    const on = () => setV(getParam(name));
    window.addEventListener('paramschange', on);
    window.addEventListener('popstate', on);
    return () => {
      window.removeEventListener('paramschange', on);
      window.removeEventListener('popstate', on);
    };
  }, [name]);
  return v;
}
