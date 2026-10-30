import { useSyncExternalStore } from 'react';

export interface Route {
  path: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const h = location.hash.replace(/^#\/?/, '');
  const [p, q] = h.split('?');
  return { path: p ? p.split('/').map(decodeURIComponent) : ['now'], query: new URLSearchParams(q ?? '') };
}

let current = parse();
const listeners = new Set<() => void>();
window.addEventListener('hashchange', () => {
  current = parse();
  listeners.forEach((l) => l());
});

export function useRoute(): Route {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
  );
}

export const href = (...path: string[]) => '#/' + path.map(encodeURIComponent).join('/');

export function navigate(...path: string[]) {
  location.hash = href(...path);
}
