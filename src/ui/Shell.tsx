import { useEffect, useState, type ReactNode } from 'react';
import { useT } from './ctx';
import { ago, initials, plural } from './fmt';
import { IBrackets, IChevronDown, IInfo, INow, IOffline, IPools, IRefresh, ISchedule, ISearch, ITeams, IWarn, IWhatIf, IClose, IStar } from './icons';
import { navigate, setParams, tHref, type TournamentTab } from './router';
import { useOverlay } from './overlay';
import { store } from '../store/app';
import { isOnToday } from '../store/launch';
import { parseTeamKey, teamKey } from '../store/settings';
import { problemsOnly } from '../extract/quality';
import { FETCH_ERROR_TEXT } from '../sheets/fetch';
import { Switcher } from './Switcher';
import { openSearch } from './screens/Search';
import { encodeScenario } from '../engine/scenario';
import { ReplayBar } from './screens/Replay';
import { divKey } from '../model/types';

function useOnline() {
  const [on, setOn] = useState(() => navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true);
    const b = () => setOn(false);
    window.addEventListener('online', a);
    window.addEventListener('offline', b);
    return () => {
      window.removeEventListener('online', a);
      window.removeEventListener('offline', b);
    };
  }, []);
  return on;
}

export function Header() {
  const c = useT();
  const overlay = useOverlay();
  const now = c.now;
  const stale = !c.rt.lastSuccess || now - c.rt.lastSuccess > 10 * 60000;
  const onToday = store.saved().filter((s) => isOnToday(s.summary, now)).length;
  const primary = c.primary ? parseTeamKey(c.primary) : undefined;
  const tabs = useTabs();
  return (
    <header className="hdr">
      <div className="hdr-row">
        <button className="hdr-title" onClick={() => overlay.openSheet(<Switcher />, { title: 'Tournaments' })} aria-label={`${c.t.title}. Switch tournament`}>
          <span className="hdr-name">
            <b>{c.t.title}</b>
            <IChevronDown size={14} />
          </span>
          <span className="hdr-sub">
            <span className={`fresh${stale ? ' stale' : ''}`}>
              <span className="dot" style={{ width: 6, height: 6, background: stale ? 'var(--ink3)' : 'var(--win)' }} />
              {c.rt.fetching && !c.rt.lastSuccess ? 'Loading…' : ago(c.rt.lastSuccess, now)}
            </span>
            {onToday >= 2 && (
              <span className="ontoday">
                <i className="li" style={{ width: 6, height: 6 }} />
                {onToday} on today
              </span>
            )}
          </span>
        </button>
        <nav className="top-tabs" aria-label="Main">
          {tabs.map((t) => (
            <a key={t.tab} href={tHref(c.id, t.tab)} className={t.active ? 'on' : ''} aria-current={t.active ? 'page' : undefined}>
              {t.label}
            </a>
          ))}
        </nav>
        <button className="search-box" onClick={() => openSearch(overlay, c)}>
          <ISearch size={18} />
          <span>Search teams, games, pitches</span>
          <kbd>Ctrl K</kbd>
        </button>
        <a className="ib phone-only" href={tHref(c.id, 'info')} aria-label="Info: rules, links, pitch map, settings">
          <IInfo />
        </a>
        <button className="ib phone-only" aria-label="Search" onClick={() => openSearch(overlay, c)}>
          <ISearch />
        </button>
        {primary ? (
          <a className="ib" href={tHref(c.id, 'team', c.primary)} aria-label={`Primary team: ${primary.name}`}>
            <span className="avatar d" style={{ borderColor: c.colorOf(primary.name, primary.division) }}>
              {initials(primary.name)}
            </span>
          </a>
        ) : (
          <a className="ib" href={tHref(c.id, 'teams')} aria-label="Pick your team">
            <IStar />
          </a>
        )}
      </div>
    </header>
  );
}

/** Division / competition switcher: scrolling chips, ★ for followed teams' divisions, plus a grouped picker. */
export function DivisionSwitcher() {
  const c = useT();
  const overlay = useOverlay();
  if (c.t.divisions.length < 2) return null;
  const followedDivs = new Set(c.followed.map((k) => parseTeamKey(k).division));
  const chip = (name: string | undefined, label: string) => (
    <button key={label} className={`chip${c.division === name ? ' on' : ''}`} onClick={() => c.setDivision(name)} aria-pressed={c.division === name}>
      {name && followedDivs.has(name) && <span aria-label="followed">★ </span>}
      {label}
    </button>
  );
  const picker = () => {
    const groups = new Map<string, string[]>();
    for (const d of c.t.divisions) groups.set(d.group ?? d.name, [...(groups.get(d.group ?? d.name) ?? []), d.name]);
    overlay.openSheet(
      <div className="picker">
        <button className={`pick-row${!c.division ? ' on' : ''}`} onClick={() => (c.setDivision(undefined), overlay.closeSheet())}>
          All
        </button>
        {[...groups.entries()].map(([g, ds]) => (
          <div key={g}>
            {ds.length > 1 && <div className="lbl" style={{ padding: '10px 4px 4px' }}>{g}</div>}
            {ds.map((d) => (
              <button key={d} className={`pick-row${c.division === d ? ' on' : ''}`} onClick={() => (c.setDivision(d), overlay.closeSheet())}>
                {followedDivs.has(d) && '★ '}
                {d}
                <span className="muted" style={{ marginLeft: 'auto' }}>
                  {plural(c.t.teams.filter((x) => x.division === d).length, 'team')}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>,
      { title: 'Competition' },
    );
  };
  return (
    <div className="divbar" role="toolbar" aria-label="Division">
      <div className="chips">
        {chip(undefined, 'All')}
        {c.t.divisions.map((d) => chip(d.name, d.name))}
      </div>
      {c.t.divisions.length >= 4 && (
        <button className="chip more" onClick={picker} aria-label="All competitions">
          ▾
        </button>
      )}
    </div>
  );
}

export function useTabs(): { tab: TournamentTab; label: string; icon: ReactNode; active: boolean }[] {
  const c = useT();
  const level = c.view.levels[divKey(c.division)] ?? Object.values(c.view.levels)[0] ?? 'basic';
  const basic = c.division ? level === 'basic' : Object.values(c.view.levels).every((l) => l === 'basic');
  const tab = currentTab();
  const out = [
    { tab: 'now' as const, label: 'Now', icon: <INow /> },
    { tab: 'schedule' as const, label: 'Schedule', icon: <ISchedule /> },
    { tab: 'teams' as const, label: 'Teams', icon: <ITeams /> },
    ...(c.t.pools.length ? [{ tab: 'pools' as const, label: 'Pools', icon: <IPools /> }] : []),
    { tab: 'brackets' as const, label: basic ? 'Finals & placings' : 'Brackets', icon: <IBrackets /> },
    { tab: 'info' as const, label: 'Info', icon: <IInfo /> },
  ];
  return out.map((t) => ({ ...t, active: tab === t.tab || (tab === 'team' && t.tab === 'teams') || (tab === 'whatif' && t.tab === 'pools') }));
}

function currentTab(): TournamentTab {
  const m = /^#\/t\/[^/]+\/([a-z]+)/.exec(location.hash);
  return (m?.[1] as TournamentTab) ?? 'now';
}

export function TabBar() {
  const tabs = useTabs().filter((t) => t.tab !== 'info');
  const c = useT();
  return (
    <nav className="tabbar" aria-label="Main">
      {tabs.map((t) => (
        <a key={t.tab} className={`tab${t.active ? ' on' : ''}`} href={tHref(c.id, t.tab)} aria-current={t.active ? 'page' : undefined}>
          {t.icon}
          <span>{t.label === 'Finals & placings' ? 'Finals' : t.label}</span>
        </a>
      ))}
    </nav>
  );
}

/** Banner stack: replay → what-if → draft → announcement → reading problems → couldn't refresh → offline. */
export function Banners() {
  const c = useT();
  const overlay = useOverlay();
  const online = useOnline();
  const dismissed = new Set(c.settings.dismissed ?? []);
  const dismiss = (k: string) => store.update(c.id, { dismissed: [...dismissed, k] });
  const problems = problemsOnly(c.p.problems);
  const changes = Object.keys(c.scenario).length;
  const out: ReactNode[] = [];
  if (c.replayAt !== undefined) out.push(<ReplayBar key="replay" />);
  if (c.whatIf)
    out.push(
      <div key="whatif" className="bn whatif sticky">
        <IWhatIf size={18} />
        <span style={{ flex: 1 }}>What-if · {plural(changes, 'change')}</span>
        <button
          onClick={async () => {
            await navigator.clipboard?.writeText(location.href).catch(() => undefined);
            overlay.toast('Link with this scenario copied.');
          }}
        >
          Share
        </button>
        <button onClick={() => c.setScenario({})}>Reset</button>
        <button onClick={() => setParams({ if: null })}>Exit</button>
      </div>,
    );
  if (c.t.isDraft && !dismissed.has('draft'))
    out.push(
      <div key="draft" className="bn draft">
        <IWarn size={18} />
        <span style={{ flex: 1 }}>Draft: the TD may still change this schedule.</span>
      </div>,
    );
  c.t.announcements.forEach((a, i) => {
    const k = `ann:${a}`;
    if (dismissed.has(k)) return;
    out.push(
      <div key={k + i} className="bn ann">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <span className="lbl" style={{ color: 'inherit', opacity: 0.85 }}>From the TD</span>
          <span>{a}</span>
        </div>
        <button className="ib" style={{ color: 'inherit' }} aria-label="Dismiss announcement" onClick={() => dismiss(k)}>
          <IClose size={18} />
        </button>
      </div>,
    );
  });
  if (problems.length && !dismissed.has(`problems:${problems.length}`))
    out.push(
      <div key="problems" className="bn problems">
        <IWarn size={18} />
        <span style={{ flex: 1 }}>Some of this schedule may be read wrongly</span>
        <button onClick={() => navigate(tHref(c.id, 'settings'))}>Check</button>
        <button className="ib" aria-label="Dismiss" onClick={() => dismiss(`problems:${problems.length}`)}>
          <IClose size={16} />
        </button>
      </div>,
    );
  if (c.rt.error && c.rt.processed)
    out.push(
      <div key="err" className="bn grey">
        <IRefresh size={18} />
        <span style={{ flex: 1 }}>
          Couldn’t refresh ({FETCH_ERROR_TEXT[c.rt.error.kind].replace(/\.$/, '')}) · showing {c.rt.lastSuccess ? new Date(c.rt.lastSuccess).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'saved data'}
        </span>
        <button onClick={() => void store.runtime(c.id).refresh(true)}>Retry</button>
      </div>,
    );
  if (!online)
    out.push(
      <div key="off" className="bn grey">
        <IOffline size={18} />
        <span>Offline · showing data from {c.rt.lastSuccess ? new Date(c.rt.lastSuccess).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'earlier'}</span>
      </div>,
    );
  if (!out.length) return null;
  return <div className="banners">{out}</div>;
}

export function TournamentShell({ children }: { children: ReactNode }) {
  const c = useT();
  const overlay = useOverlay();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSearch(overlay, c);
      } else if (e.key === '/' && !(e.target as HTMLElement)?.closest('input,textarea')) {
        e.preventDefault();
        openSearch(overlay, c);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [c, overlay]);
  return (
    <div className={`app-shell${c.whatIf ? ' in-whatif' : ''}${c.replayAt !== undefined ? ' in-replay' : ''}`}>
      <Header />
      <Banners />
      <DivisionSwitcher />
      <main className="main" id="main">
        {children}
      </main>
      <TabBar />
    </div>
  );
}

export const scenarioLink = (id: string, s: Record<string, unknown>) => `${location.origin}${location.pathname}?sheet=${encodeURIComponent(id)}&if=${encodeScenario(s as never)}${location.hash}`;
export { teamKey };
