import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { TOURNAMENTS, type TournamentConfig } from '../config';
import { Feed, type FeedState } from '../data/feed';
import { buildTournament } from '../data/parse';
import { simulate } from '../data/demo';
import { BracketModel } from '../engine/bracket';
import { resolve, type RGame, type Resolved, type Scenario } from '../engine/resolve';
import { gameStatus, type Status } from '../engine/status';
import { zonedToEpoch } from '../engine/time';
import type { Outcome, Tournament } from '../engine/types';

export type ThemePref = 'system' | 'light' | 'dark';

interface AppCtx {
  cfg: TournamentConfig;
  feed: FeedState;
  t: Tournament;
  /** Resolution including what-if picks (when what-if mode is on). */
  r: Resolved;
  /** Resolution from real results only. */
  real: Resolved;
  bracket: BracketModel;
  now: number;
  status: (rg: RGame) => Status;
  refresh: () => void;
  myTeam?: string;
  setMyTeam: (t?: string) => void;
  whatIf: boolean;
  setWhatIf: (on: boolean) => void;
  scenario: Scenario;
  pick: (gameId: string, o?: Outcome) => void;
  resetScenario: () => void;
  shareUrl: () => string;
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
  gameSheet?: string;
  openGame: (id?: string) => void;
  searchOpen: boolean;
  setSearchOpen: (o: boolean) => void;
  flash: Set<string>;
  demo: boolean;
  clockOverridden: boolean;
}

const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => useContext(Ctx)!;

const params = new URLSearchParams(location.search);
const cfg = TOURNAMENTS.find((t) => t.slug === params.get('t')) ?? TOURNAMENTS[0];
const feed = new Feed(cfg);
const demo = params.has('demo');

/** ?now=2026-10-31T10:12 fakes the clock (London wall time); it keeps ticking from there. */
const nowParam = params.get('now');
const loadedAt = Date.now();
const fakeBase = nowParam ? zonedToEpoch(nowParam.slice(0, 10), nowParam.slice(11, 16) || '00:00', cfg.timeZone) : undefined;
const clock = () => (fakeBase !== undefined ? fakeBase + (Date.now() - loadedAt) : Date.now());

const LS = (k: string) => `utv:${cfg.slug}:${k}`;
const load = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(LS(k));
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const save = (k: string, v: unknown) => {
  try {
    localStorage.setItem(LS(k), JSON.stringify(v));
  } catch {
    /* ignore */
  }
};

function scenarioFromHash(): Scenario {
  const q = location.hash.split('?')[1];
  const s = new URLSearchParams(q ?? '').get('if');
  if (!s) return {};
  return Object.fromEntries(
    s.split(',').map((p) => {
      const i = p.lastIndexOf(':');
      return [decodeURIComponent(p.slice(0, i)), p.slice(i + 1) as Outcome];
    }),
  );
}

export function AppProvider({ children }: { children: ReactNode }) {
  const fs = useSyncExternalStore(feed.subscribe, feed.getState);
  useEffect(() => {
    const stop = feed.start();
    return () => stop();
  }, []);

  const [now, setNow] = useState(clock);
  useEffect(() => {
    const id = setInterval(() => setNow(clock()), 15_000);
    return () => clearInterval(id);
  }, []);

  const baseT = useMemo(
    () => buildTournament(fs.raw, { tz: cfg.timeZone, fallbackDates: cfg.dates }),
    [fs.version, fs.raw.gamelist],
  );
  // Demo mode re-simulates as the (fake) clock moves, a minute at a time.
  const minute = Math.floor(now / 60_000);
  const t = useMemo(() => (demo ? simulate(baseT, minute * 60_000) : baseT), [baseT, demo ? minute : 0]);

  const initialScenario = useMemo(scenarioFromHash, []);
  const [scenario, setScenario] = useState<Scenario>(initialScenario);
  const [whatIf, setWhatIfState] = useState(Object.keys(initialScenario).length > 0);
  const real = useMemo(() => resolve(t), [t]);
  const r = useMemo(() => (whatIf && Object.keys(scenario).length ? resolve(t, scenario) : real), [t, real, whatIf, scenario]);
  const bracket = useMemo(() => new BracketModel(t), [t]);

  const [myTeam, setMyTeamState] = useState<string | undefined>(() => load('myTeam', undefined));
  const setMyTeam = useCallback((x?: string) => {
    setMyTeamState(x);
    save('myTeam', x ?? null);
  }, []);

  const [theme, setThemeState] = useState<ThemePref>(() => load('theme', 'system'));
  const setTheme = useCallback((x: ThemePref) => {
    setThemeState(x);
    save('theme', x);
  }, []);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('t-dark', dark);
      document.documentElement.classList.toggle('t-light', !dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0D1015' : '#FFFFFF');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  const [gameSheet, setGameSheet] = useState<string>();
  const [searchOpen, setSearchOpen] = useState(false);

  // Flash scores that change after the first load.
  const prevScores = useRef<Map<string, string> | undefined>(undefined);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  useEffect(() => {
    const cur = new Map(t.games.map((g) => [g.id, `${g.scoreLo ?? ''}-${g.scoreHi ?? ''}`]));
    const prev = prevScores.current;
    prevScores.current = cur;
    if (!prev) return;
    const changed = [...cur].filter(([id, s]) => prev.has(id) && prev.get(id) !== s).map(([id]) => id);
    if (!changed.length) return;
    setFlash(new Set(changed));
    const id = setTimeout(() => setFlash(new Set()), 1600);
    return () => clearTimeout(id);
  }, [t]);

  const pick = useCallback((gameId: string, o?: Outcome) => {
    setScenario((s) => {
      const next = { ...s };
      if (o) next[gameId] = o;
      else delete next[gameId];
      return next;
    });
  }, []);
  const resetScenario = useCallback(() => setScenario({}), []);
  const setWhatIf = useCallback((on: boolean) => {
    setWhatIfState(on);
    if (!on) setScenario({});
  }, []);
  const shareUrl = useCallback(() => {
    const base = location.href.split('#')[0];
    const path = location.hash.split('?')[0] || '#/brackets';
    const q = Object.entries(scenario)
      .map(([k, v]) => `${encodeURIComponent(k)}:${v}`)
      .join(',');
    return `${base}${path}${q ? `?if=${q}` : ''}`;
  }, [scenario]);

  // Drop picks that real results have overtaken.
  useEffect(() => {
    const stale = Object.keys(scenario).filter((id) => real.byId.get(id)?.real);
    if (stale.length) setScenario((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !stale.includes(k))));
  }, [real, scenario]);

  const games = useMemo(() => t.games, [t]);
  const status = useCallback((rg: RGame) => gameStatus(rg, now, games), [now, games]);

  const value: AppCtx = {
    cfg,
    feed: fs,
    t,
    r,
    real,
    bracket,
    now,
    status,
    refresh: () => void feed.refresh(true),
    myTeam: myTeam && t.seeds.some((s) => s.team === myTeam) ? myTeam : t.seeds.length ? undefined : myTeam,
    setMyTeam,
    whatIf,
    setWhatIf,
    scenario,
    pick,
    resetScenario,
    shareUrl,
    theme,
    setTheme,
    gameSheet,
    openGame: setGameSheet,
    searchOpen,
    setSearchOpen,
    flash,
    demo,
    clockOverridden: fakeBase !== undefined,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
