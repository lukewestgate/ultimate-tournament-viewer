import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Team, Tournament } from '../model/types';
import { divKey } from '../model/types';
import { buildView, type View } from '../engine/view';
import { decodeScenario, encodeScenario, pruneScenario, type Scenario } from '../engine/scenario';
import { store, useRuntime } from '../store/app';
import type { RuntimeState } from '../store/runtime';
import type { Processed } from '../store/pipeline';
import { parseTeamKey, teamKey, type TournamentSettings } from '../store/settings';
import { setParams, useParam } from './router';
import { clubColors } from './colors';
import { OverlayProvider, useOverlay } from './overlay';
import { zonedEpoch, wallClock } from '../engine/time';

export interface TCtx {
  id: string;
  settings: TournamentSettings;
  rt: RuntimeState;
  p: Processed;
  t: Tournament;
  view: View;
  /** Real clock. */
  now: number;
  division?: string;
  setDivision: (d: string | undefined) => void;
  inDiv: (d: string | undefined) => boolean;
  followed: string[];
  primary?: string;
  isFollowed: (name: string | undefined, division?: string) => boolean;
  toggleFollow: (name: string, division?: string) => void;
  setPrimary: (key: string | undefined) => void;
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
  whatIf: boolean;
  replayAt?: number;
  setReplayAt: (t: number | undefined) => void;
  colorOf: (name: string | undefined, division?: string) => string;
  team: (name: string, division?: string) => Team | undefined;
  simulate: boolean;
  setSimulate: (v: boolean) => void;
}

const Ctx = createContext<TCtx | undefined>(undefined);

/** The tournament context when inside one (App settings can open from anywhere). */
export function useMaybeT(): TCtx | undefined {
  return useContext(Ctx);
}

export function useT(): TCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useT outside a tournament');
  return c;
}

/** Real clock, ticking every 15 s (a Diagnostics "fake clock" offset applies). */
export function useNow(every = 15000): number {
  const [now, setNow] = useState(() => Date.now() + fakeOffset());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + fakeOffset()), every);
    const on = () => setNow(Date.now() + fakeOffset());
    window.addEventListener('fakeclock', on);
    return () => {
      clearInterval(t);
      window.removeEventListener('fakeclock', on);
    };
  }, [every]);
  return now;
}

export function fakeOffset(): number {
  try {
    return Number(sessionStorage.getItem('tv:fakeOffset') ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function setFakeNow(epoch: number | undefined) {
  try {
    if (epoch === undefined) sessionStorage.removeItem('tv:fakeOffset');
    else sessionStorage.setItem('tv:fakeOffset', String(epoch - Date.now()));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('fakeclock'));
}

export function TournamentProvider({ id, children, fallback }: { id: string; children: ReactNode; fallback: (rt: RuntimeState) => ReactNode }) {
  const rt = useRuntime(id)!;
  const now = useNow();
  const overlay = useOverlay();
  const ifParam = useParam('if');
  const atParam = useParam('at');
  const [simulate, setSimulate] = useState(false);

  useEffect(() => {
    const r = store.runtime(id);
    void r.start();
    store.update(id, { lastOpened: Date.now() });
    return () => r.stop();
  }, [id]);

  const settings = store.get(id) ?? { id, followed: [], addedAt: Date.now() };
  const p = rt.processed;
  const scenario = useMemo(() => decodeScenario(ifParam), [ifParam]);
  const replayAt = useMemo(() => {
    if (!atParam || !p) return undefined;
    // ?at=2026-10-31T13:00 is wall-clock time in the tournament's zone.
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(atParam);
    if (!m) return Number(atParam) || undefined;
    return zonedEpoch(m[1], Number(m[2]) * 60 + Number(m[3]), p.tournament.timeZone);
  }, [atParam, p]);

  const view = useMemo(
    () => (p ? buildView(p.tournament, p.format, { now, at: replayAt, scenario, simulate, levelOverride: p.mapping.engineLevel }) : undefined),
    [p, now, replayAt, scenario, simulate],
  );

  // Hypothetical results replaced by real ones: drop them and say so.
  useEffect(() => {
    if (view?.dropped.length) {
      const g = view.t.games.find((x) => x.id === view.dropped[0]);
      setParams({ if: encodeScenario(pruneScenario(scenario, view.dropped)) || '_' });
      overlay.toast(`Real score arrived for ${g?.code ?? 'a game'}. Your what-if result was removed.`);
    }
  }, [view?.dropped.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const colors = useMemo(() => clubColors((p?.tournament.teams ?? []).map((x) => x.club)), [p]);

  if (!p || !view) return <>{fallback(rt)}</>;
  const t = p.tournament;
  const divNames = t.divisions.map((d) => d.name);
  const primaryKey = settings.primary;
  const defaultDiv = primaryKey ? parseTeamKey(primaryKey).division : undefined;
  const division = settings.division !== undefined ? (divNames.includes(settings.division) ? settings.division : undefined) : defaultDiv && divNames.includes(defaultDiv) ? defaultDiv : undefined;
  const followed = settings.followed.map((f) => f.key);

  const value: TCtx = {
    id,
    settings,
    rt,
    p,
    t,
    view,
    now,
    division,
    setDivision: (d) => store.update(id, { division: d ?? '' }),
    inDiv: (d) => !division || d === division,
    followed,
    primary: primaryKey,
    isFollowed: (name, div) => Boolean(name) && followed.includes(teamKey(name!, div)),
    toggleFollow: (name, div) => {
      const k = teamKey(name, div);
      const has = followed.includes(k);
      const next = has ? settings.followed.filter((f) => f.key !== k) : [...settings.followed, { key: k }];
      let primary = settings.primary;
      if (has && primary === k) primary = next[0]?.key;
      if (!has && !primary) primary = k;
      store.update(id, { followed: next, primary });
      store.runtime(id).resummarize();
    },
    setPrimary: (k) => {
      store.update(id, { primary: k });
      store.runtime(id).resummarize();
    },
    scenario,
    setScenario: (s) => setParams({ if: encodeScenario(s) || '_' }),
    whatIf: Object.keys(scenario).length > 0 || ifParam !== null,
    replayAt,
    setReplayAt: (at) => setParams({ at: at === undefined ? null : wallParam(at, t.timeZone) }),
    colorOf: (name, div) => {
      if (!name) return 'transparent';
      const team = t.teams.find((x) => x.name === name && (div === undefined || x.division === div)) ?? t.teams.find((x) => x.name === name);
      return colors.get(team?.club ?? name) ?? 'var(--ink3)';
    },
    team: (name, div) => t.teams.find((x) => x.name === name && (div === undefined || x.division === div)) ?? t.teams.find((x) => x.name === name),
    simulate,
    setSimulate,
  };
  // Sheets and toasts opened inside a tournament render inside its context.
  return (
    <Ctx.Provider value={value}>
      <OverlayProvider>{children}</OverlayProvider>
    </Ctx.Provider>
  );
}

function wallParam(epoch: number, tz: string): string {
  const w = wallClock(epoch, tz);
  return `${w.date}T${String(Math.floor(w.mins / 60)).padStart(2, '0')}:${String(w.mins % 60).padStart(2, '0')}`;
}

export { divKey };
