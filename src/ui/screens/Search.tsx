import type { TCtx } from '../ctx';
import type { useOverlay } from '../overlay';

/** Search palette (filled in with the search screen). */
export function openSearch(overlay: ReturnType<typeof useOverlay>, _c: TCtx) {
  overlay.openSheet(<p className="muted">Search is coming.</p>, { title: 'Search' });
}
