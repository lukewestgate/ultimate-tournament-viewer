import { useSyncExternalStore } from 'react';
import { listIds, loadApp, loadTournament, removeTournament, saveApp, saveTournament, type AppSettings, type TournamentSettings } from './settings';
import { TournamentRuntime, type RuntimeState } from './runtime';
import { idbDel } from './db';
import { decodeBundle } from '../mapping/share';
import { fetchFeatured, FEATURED_SHEET, loadFeatured, saveFeatured, takesFeatured, type FeaturedEntry } from './featured';

/** How often the featured list is checked while the app is open. */
const FEATURED_EVERY = 5 * 60000;

/** App-wide store: settings, saved tournaments and the running tournament(s). */
class AppStore {
  app: AppSettings = loadApp();
  featured: FeaturedEntry[] = loadFeatured();
  /** Told when a tournament in use takes a new featured reading. */
  onReadingUpdated?: (title: string) => void;
  private lastFeatured = 0;
  private version = 0;
  private listeners = new Set<() => void>();
  private runtimes = new Map<string, TournamentRuntime>();

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getVersion = () => this.version;
  emit = () => {
    this.version++;
    for (const l of this.listeners) l();
  };

  setApp(patch: Partial<AppSettings>) {
    this.app = { ...this.app, ...patch };
    saveApp(this.app);
    this.emit();
  }

  saved(): TournamentSettings[] {
    return listIds()
      .map((id) => loadTournament(id))
      .filter((x): x is TournamentSettings => Boolean(x));
  }

  get(id: string): TournamentSettings | undefined {
    return loadTournament(id);
  }

  update(id: string, patch: Partial<TournamentSettings>) {
    const cur = loadTournament(id) ?? { id, followed: [], addedAt: Date.now() };
    saveTournament({ ...cur, ...patch });
    this.emit();
  }

  add(id: string): TournamentSettings {
    const cur = loadTournament(id);
    if (cur) return cur;
    const s: TournamentSettings = { id, followed: [], addedAt: Date.now(), lastOpened: Date.now() };
    saveTournament(s);
    this.emit();
    const entry = this.featuredFor(id);
    if (entry) void this.takeFeatured(entry);
    return s;
  }

  remove(id: string): TournamentSettings | undefined {
    const s = loadTournament(id);
    removeTournament(id);
    this.runtimes.get(id)?.stop();
    this.runtimes.delete(id);
    void idbDel(`wb:${id}`).catch(() => undefined);
    this.emit();
    return s;
  }

  restore(s: TournamentSettings) {
    saveTournament(s);
    this.emit();
  }

  runtime(id: string): TournamentRuntime {
    let r = this.runtimes.get(id);
    if (!r) {
      r = new TournamentRuntime(id);
      this.runtimes.set(id, r);
      r.subscribe(() => this.emit());
    }
    return r;
  }

  /** Import a shared link's mapping bundle for a tournament. */
  async importShared(id: string, m: string): Promise<boolean> {
    const b = await decodeBundle(m);
    if (!b) return false;
    this.add(id);
    this.update(id, { mapping: b.mapping, format: b.format, ownReading: true });
    this.runtimes.get(id)?.reprocess();
    return true;
  }

  featuredFor(id: string): FeaturedEntry | undefined {
    return this.featured.find((e) => e.id === id);
  }

  /** Keep the featured list fresh while the app is open. Returns how to stop. */
  watchFeatured(): () => void {
    if (!FEATURED_SHEET) return () => undefined;
    const check = () => {
      if (document.visibilityState === 'visible') void this.syncFeatured();
    };
    check();
    const timer = setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
    };
  }

  /** Fetch the list and pass on any new readings. A failed fetch just keeps the last list. */
  async syncFeatured(): Promise<void> {
    if (Date.now() - this.lastFeatured < FEATURED_EVERY) return;
    this.lastFeatured = Date.now();
    const list = await fetchFeatured().catch(() => undefined);
    if (!list) return;
    this.setFeatured(list);
    await Promise.all(list.map((e) => this.takeFeatured(e)));
  }

  setFeatured(list: FeaturedEntry[]) {
    if (JSON.stringify(list) === JSON.stringify(this.featured)) return;
    this.featured = list;
    saveFeatured(list);
    this.emit();
  }

  /** Move a saved tournament to an entry's reading if it takes updates, or anyway with `force`. */
  async takeFeatured(e: FeaturedEntry, force = false): Promise<void> {
    const b = e.m ? await decodeBundle(e.m) : undefined;
    if (e.m && !b) return;
    // Checked after the await: a shared link may have just saved its own reading.
    const s = loadTournament(e.id);
    if (!s || (!force && !takesFeatured(s, e))) return;
    const r = this.runtime(e.id);
    const inUse = Boolean(r.state.processed);
    r.setFeatured(b?.mapping, b?.format, e.m ?? '', s.mapping ? 'Before the featured reading' : undefined);
    this.emit();
    if (inUse && !force) this.onReadingUpdated?.(s.summary?.title ?? e.title);
  }

  /** This device just published: its reading is now the featured one. Holds off re-reading the sheet, which can lag. */
  published(e: FeaturedEntry) {
    this.lastFeatured = Date.now();
    this.setFeatured([...this.featured.filter((x) => x.id !== e.id), e]);
    this.update(e.id, { ownReading: false, featuredM: e.m ?? '' });
  }

  unpublished(id: string) {
    this.lastFeatured = Date.now();
    this.setFeatured(this.featured.filter((x) => x.id !== id));
  }
}

export const store = new AppStore();

/** Re-render when anything in the store changes. */
export function useStore(): AppStore {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store;
}

export function useRuntime(id: string | undefined): RuntimeState | undefined {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return id ? store.runtime(id).state : undefined;
}
