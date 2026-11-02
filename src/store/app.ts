import { useSyncExternalStore } from 'react';
import { listIds, loadApp, loadTournament, removeTournament, saveApp, saveTournament, type AppSettings, type TournamentSettings } from './settings';
import { TournamentRuntime, type RuntimeState } from './runtime';
import { idbDel } from './db';
import { decodeBundle } from '../mapping/share';

/** App-wide store: settings, saved tournaments and the running tournament(s). */
class AppStore {
  app: AppSettings = loadApp();
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
    this.update(id, { mapping: b.mapping, format: b.format });
    this.runtimes.get(id)?.reprocess();
    return true;
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
