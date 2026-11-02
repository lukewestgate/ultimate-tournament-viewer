import { attachGids, fetchTabCsv, fetchTabListing, fetchWorkbook, loadXlsx, SheetFetchError, type FetchErrorKind } from '../sheets/fetch';
import { sourceFromKey } from '../sheets/links';
import { workbookFromXlsx, type Workbook } from '../sheets/workbook';
import type { Format } from '../model/types';
import type { Mapping } from '../mapping/types';
import { idbGet, idbSet } from './db';
import { changedGames, processWorkbook, summarize, type Processed } from './pipeline';
import { applyHotTabs, backoffDelay, FULL_EVERY, HOT_EVERY, hotTabs, nextRefreshKind, workbookHash } from './refresh';
import { loadTournament, saveTournament, type TournamentSettings } from './settings';
import { fixtureUrl } from './fixtures';

export interface RuntimeState {
  id: string;
  phase: 'idle' | 'loading' | 'ready' | 'error';
  /** Step shown while adding: opening sheet → reading tabs → finding games. */
  step?: 'opening' | 'reading' | 'finding';
  processed?: Processed;
  workbook?: Workbook;
  fromCache: boolean;
  lastSuccess?: number;
  lastAttempt?: number;
  error?: { kind: FetchErrorKind; message: string };
  failures: number;
  fetching: boolean;
  /** Game ids that just changed, with when. */
  changed: Map<string, number>;
  fetchLog: { at: number; kind: string; ok: boolean; bytes?: number; error?: string }[];
}

type Listener = (s: RuntimeState) => void;

/** One tournament's data: cache first, then refresh on a schedule (spec §4.3). */
export class TournamentRuntime {
  state: RuntimeState;
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastFull: number | undefined;
  private stopped = false;
  private onVisible = () => {
    if (document.visibilityState === 'visible') void this.refresh();
    else this.clearTimer();
  };
  private onWake = () => void this.refresh();

  constructor(public id: string) {
    this.state = { id, phase: 'idle', fromCache: false, failures: 0, fetching: false, changed: new Map(), fetchLog: [] };
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private set(patch: Partial<RuntimeState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  private settings(): TournamentSettings {
    return loadTournament(this.id) ?? { id: this.id, followed: [], addedAt: Date.now() };
  }

  /** Start: render from cache immediately, then refresh, then poll while visible. */
  async start(): Promise<void> {
    this.stopped = false;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisible);
      window.addEventListener('focus', this.onWake);
      window.addEventListener('online', this.onWake);
    }
    if (this.state.phase === 'idle') {
      this.set({ phase: 'loading', step: 'opening' });
      const cached = await idbGet<{ wb: Workbook; at: number }>(`wb:${this.id}`).catch(() => undefined);
      if (cached?.wb) this.apply(cached.wb, true, cached.at);
    }
    await this.refresh();
  }

  stop() {
    this.stopped = true;
    this.clearTimer();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisible);
      window.removeEventListener('focus', this.onWake);
      window.removeEventListener('online', this.onWake);
    }
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule() {
    this.clearTimer();
    if (this.stopped || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
    const delay = this.state.failures ? backoffDelay(this.state.failures) : HOT_EVERY;
    this.timer = setTimeout(() => void this.refresh(), delay);
  }

  /** Re-run processing with the current workbook (after a mapping/format/settings change). */
  reprocess() {
    if (this.state.workbook) this.apply(this.state.workbook, this.state.fromCache, this.state.lastSuccess, true);
  }

  private apply(wb: Workbook, fromCache: boolean, at?: number, force = false) {
    const prev = this.state.processed;
    if (!force && prev && this.state.workbook && workbookHash(this.state.workbook) === workbookHash(wb)) {
      this.set({ fromCache, lastSuccess: at ?? this.state.lastSuccess, workbook: wb });
      return;
    }
    const s = this.settings();
    const processed = processWorkbook(this.id, wb, { mapping: s.mapping, format: s.format });
    const changed = new Map(this.state.changed);
    if (!fromCache && !force) for (const id of changedGames(prev?.tournament, processed.tournament)) changed.set(id, Date.now());
    this.set({ phase: 'ready', step: undefined, processed, workbook: wb, fromCache, lastSuccess: at ?? this.state.lastSuccess, changed });
    saveTournament({ ...s, summary: summarize(processed, at ?? s.summary?.lastFetched) });
  }

  private log(kind: string, ok: boolean, extra: { bytes?: number; error?: string } = {}) {
    this.set({ fetchLog: [{ at: Date.now(), kind, ok, ...extra }, ...this.state.fetchLog].slice(0, 30) });
  }

  /** Fetch now: the whole workbook every 10 minutes, otherwise just the hot tabs as CSV. */
  async refresh(forceFull = false): Promise<void> {
    if (this.state.fetching) return;
    this.clearTimer();
    this.set({ fetching: true, lastAttempt: Date.now() });
    try {
      const fix = fixtureUrl(this.id);
      if (fix) {
        const buf = await (await fetch(fix)).arrayBuffer();
        const X = await loadXlsx();
        const wb = workbookFromXlsx(X, buf);
        wb.title ??= this.id.replace('fixture:', '');
        this.lastFull = Date.now();
        this.log('fixture', true, { bytes: buf.byteLength });
        this.apply(wb, false, Date.now());
        await idbSet(`wb:${this.id}`, { wb, at: Date.now() }).catch(() => undefined);
      } else {
        const src = sourceFromKey(this.id);
        const hot = this.state.workbook && this.state.processed ? hotTabs(this.state.workbook, this.state.processed.mapping) : undefined;
        const kind = forceFull ? 'full' : nextRefreshKind(this.lastFull, Date.now(), hot);
        if (kind === 'full' || !this.state.workbook || !hot) {
          if (!this.state.workbook) this.set({ step: 'opening' });
          const [{ workbook, bytes }, listing] = await Promise.all([
            fetchWorkbook(src),
            fetchTabListing(src).catch(() => undefined),
          ]);
          this.set({ step: 'reading' });
          const wb = listing ? attachGids(workbook, listing) : workbook;
          this.lastFull = Date.now();
          this.log('workbook', true, { bytes });
          this.set({ step: 'finding' });
          this.apply(wb, false, Date.now());
          await idbSet(`wb:${this.id}`, { wb, at: Date.now() }).catch(() => undefined);
        } else {
          const fetched = await Promise.all(hot.map(async (h) => ({ name: h.name, rows: await fetchTabCsv(src, h.gid) })));
          this.log(`hot tabs (${hot.length})`, true);
          const { workbook, changed } = applyHotTabs(this.state.workbook, fetched);
          if (changed) {
            this.apply(workbook, false, Date.now());
            await idbSet(`wb:${this.id}`, { wb: workbook, at: Date.now() }).catch(() => undefined);
          } else this.set({ lastSuccess: Date.now(), fromCache: false });
        }
      }
      this.set({ failures: 0, error: undefined, fetching: false });
    } catch (e) {
      const err = e instanceof SheetFetchError ? { kind: e.kind, message: e.message } : { kind: 'network' as const, message: String((e as Error)?.message ?? e) };
      this.log('fetch', false, { error: err.message });
      this.set({ fetching: false, failures: this.state.failures + 1, error: err, phase: this.state.processed ? 'ready' : 'error', step: undefined });
      const s = this.settings();
      if (!this.state.processed) saveTournament({ ...s, summary: { ...(s.summary ?? { title: s.id, days: [], divisions: 0, teams: 0, problems: 0, datesGuessed: false }), error: err.kind } });
    }
    this.schedule();
  }

  /** Save a new mapping (manual edit, AI, shared link) and re-read. */
  setMapping(mapping: Mapping | undefined, format?: Format) {
    const s = this.settings();
    saveTournament({ ...s, mapping, format: format ?? (mapping ? s.format : undefined) });
    this.reprocess();
  }

  setFormat(format: Format | undefined) {
    saveTournament({ ...this.settings(), format });
    this.reprocess();
  }
}

export { FULL_EVERY };
