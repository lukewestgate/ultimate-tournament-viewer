import { csvUrl, type TabKey, type TournamentConfig } from '../config';

export interface FeedState {
  raw: Partial<Record<TabKey, string>>;
  fetchedAt: Partial<Record<TabKey, number>>;
  /** Last time the Gamelist refreshed successfully. */
  lastOk?: number;
  error?: string;
  loading: boolean;
  /** Bumped whenever any tab's content changes. */
  version: number;
}

const POLL_MS = 60_000;
const MAX_BACKOFF = 8 * 60_000;

export class Feed {
  state: FeedState;
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private failures = 0;
  private inflight?: Promise<void>;
  private readonly key: string;

  constructor(private cfg: TournamentConfig) {
    this.key = `utv:${cfg.slug}:feed`;
    let saved: Partial<FeedState> = {};
    try {
      saved = JSON.parse(localStorage.getItem(this.key) ?? '{}');
    } catch {
      /* ignore */
    }
    this.state = { raw: saved.raw ?? {}, fetchedAt: saved.fetchedAt ?? {}, lastOk: saved.lastOk, loading: false, version: 1 };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;

  private set(patch: Partial<FeedState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  refresh(force = false): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = this.doRefresh(force).finally(() => (this.inflight = undefined));
    return this.inflight;
  }

  private async doRefresh(force: boolean) {
    const now = Date.now();
    const due = (Object.entries(this.cfg.tabs) as [TabKey, { gid: string; every: number }][]).filter(
      ([k, tab]) => force || !this.state.raw[k] || now - (this.state.fetchedAt[k] ?? 0) >= tab.every,
    );
    this.set({ loading: true });
    const results = await Promise.allSettled(
      due.map(async ([k, tab]) => {
        const res = await fetch(`${csvUrl(this.cfg, tab.gid)}&_=${now}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`${k}: HTTP ${res.status}`);
        const text = await res.text();
        if (/^\s*<!doctype html/i.test(text)) throw new Error(`${k}: not CSV`);
        return [k, text] as const;
      }),
    );
    const raw = { ...this.state.raw };
    const fetchedAt = { ...this.state.fetchedAt };
    let changed = false;
    let error: string | undefined;
    results.forEach((r, i) => {
      const k = due[i][0];
      if (r.status === 'fulfilled') {
        if (raw[k] !== r.value[1]) changed = true;
        raw[k] = r.value[1];
        fetchedAt[k] = now;
      } else {
        error = String((r.reason as Error)?.message ?? r.reason);
      }
    });
    const gamelistOk = fetchedAt.gamelist === now;
    const lastOk = gamelistOk ? now : this.state.lastOk;
    this.failures = gamelistOk ? 0 : this.failures + 1;
    this.set({
      raw,
      fetchedAt,
      lastOk,
      error: gamelistOk ? undefined : (error ?? 'Could not reach the schedule'),
      loading: false,
      version: changed ? this.state.version + 1 : this.state.version,
    });
    try {
      localStorage.setItem(this.key, JSON.stringify({ raw, fetchedAt, lastOk }));
    } catch {
      /* storage full or unavailable */
    }
  }

  start() {
    let gen = 0;
    let stopped = false;
    const loop = async () => {
      if (stopped) return;
      const mine = ++gen;
      clearTimeout(this.timer);
      if (document.visibilityState === 'visible') await this.refresh();
      if (stopped || mine !== gen) return; // stopped, or a newer loop took over
      const delay = Math.min(MAX_BACKOFF, POLL_MS * 2 ** this.failures);
      this.timer = setTimeout(loop, delay);
    };
    const wake = () => {
      if (document.visibilityState === 'visible') loop();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    loop();
    return () => {
      stopped = true;
      clearTimeout(this.timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('focus', wake);
    };
  }
}
