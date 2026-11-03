import { useEffect, useState, type ReactNode } from 'react';
import { useMaybeT, useT } from './ctx';
import { ago, initials, plural } from './fmt';
import { IBrackets, IChevronDown, IChevronLeft, IInfo, INow, IOffline, IPools, IRefresh, ISchedule, ISearch, ITeams, IWarn, IWhatIf, IClose, IStar } from './icons';
import { href, navigate, setParams, tHref, type TournamentTab } from './router';
import { useOverlay } from './overlay';
import { store } from '../store/app';
import { isOnToday } from '../store/launch';
import { parseTeamKey, teamKey } from '../store/settings';
import { problemsOnly } from '../extract/quality';
import { FETCH_ERROR_TEXT } from '../sheets/fetch';
import { Switcher } from './Switcher';
import { encodeScenario } from '../engine/scenario';
import { ReplayBar, ReplayDock } from './screens/Replay';
import { divKey } from '../model/types';
import { DivisionPicker } from './DivisionPicker';
import { useOpenAi } from './AiCta';

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

/** App mark: a pitch with a disc. */
/** The search panel is loaded on first use to keep it out of the main bundle. */
function openSearch(overlay: ReturnType<typeof useOverlay>, c: ReturnType<typeof useT>) {
  void import('./screens/Search').then((m) => m.openSearch(overlay, c));
}

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" className="logo">
      <rect width="512" height="512" rx="112" fill="#0E1A3A" />
      <rect x="72" y="150" width="368" height="212" rx="10" fill="none" stroke="#FFFFFF" strokeOpacity=".5" strokeWidth="18" />
      <ellipse cx="282" cy="232" rx="88" ry="38" fill="#FF6A3D" />
    </svg>
  );
}

/** Freshness: "Updated 2m ago" (green dot), greyed after 10 min, offline. */
export function Freshness() {
  const c = useT();
  const online = useOnline();
  const stale = !c.rt.lastSuccess || c.now - c.rt.lastSuccess > 10 * 60000;
  if (!online)
    return (
      <span className="fresh off">
        <IOffline size={12} />
        Offline{c.rt.lastSuccess ? ` · ${new Date(c.rt.lastSuccess).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}
      </span>
    );
  return (
    <span className={`fresh${stale ? ' stale' : ''}`}>
      <span className="fresh-dot" />
      {c.rt.fetching && !c.rt.lastSuccess ? 'Loading…' : ago(c.rt.lastSuccess, c.now)}
    </span>
  );
}

export function Header() {
  const c = useT();
  const overlay = useOverlay();
  const onToday = store.saved().filter((s) => isOnToday(s.summary, c.now)).length;
  const primary = c.primary ? parseTeamKey(c.primary) : undefined;
  const tabs = useTabs();
  return (
    <header className="hdr">
      <div className="hdr-row">
        <a className="hdr-logo desk-only" href="#/" aria-label="All tournaments">
          <Logo />
        </a>
        <button className="hdr-title" onClick={() => overlay.openSheet(<Switcher />, { title: 'Tournaments', dropdown: true })} aria-label={`${c.t.title}. Switch tournament`}>
          <span className="hdr-name">
            <b>{c.t.title}</b>
            <IChevronDown size={14} strokeWidth={2.6} />
          </span>
          <span className="hdr-sub">
            <Freshness />
            {onToday >= 2 && (
              <span className="ontoday">
                <i className="li" />
                {onToday} on today
              </span>
            )}
          </span>
        </button>
        <nav className="top-tabs desk-only" aria-label="Main">
          {tabs.map((t) => (
            <a key={t.tab} href={tHref(c.id, t.tab)} className={`nav${t.active ? ' on' : ''}`} aria-current={t.active ? 'page' : undefined}>
              {t.label}
            </a>
          ))}
        </nav>
        <span className="desk-only" style={{ flex: 1 }} />
        <button className="search-box desk-only" onClick={() => openSearch(overlay, c)}>
          <ISearch size={18} />
          <span>Search teams, games, pitches</span>
          <kbd className="d">Ctrl K</kbd>
        </button>
        <a className="ib phone-only" href={tHref(c.id, 'info')} aria-label="Info: rules, links, pitch map, settings">
          <IInfo />
        </a>
        <button className="ib phone-only" aria-label="Search" onClick={() => openSearch(overlay, c)}>
          <ISearch />
        </button>
        {primary ? (
          <a className="ib avatar-btn" href={tHref(c.id, 'team', c.primary)} aria-label={`Primary team: ${primary.name}`}>
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
      {label}
      {name && followedDivs.has(name) && <span aria-label="followed team"> ★</span>}
    </button>
  );
  return (
    <div className="divbar" role="toolbar" aria-label="Division">
      <div className="chips">
        {chip(undefined, 'All')}
        {c.t.divisions.map((d) => chip(d.name, d.name))}
      </div>
      <button className="chip more" onClick={() => overlay.openSheet(<DivisionPicker />, { title: 'Show' })} aria-label="All competitions">
        <IChevronDown size={14} strokeWidth={2.6} />
      </button>
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
  return out.map((t) => ({
    ...t,
    active: tab === t.tab || (tab === 'team' && t.tab === 'teams') || (tab === 'whatif' && t.tab === 'pools') || (tab === 'standings' && t.tab === 'brackets'),
  }));
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
  const openAi = useOpenAi();
  const online = useOnline();
  const dismissed = new Set(c.settings.dismissed ?? []);
  const dismiss = (k: string) => store.update(c.id, { dismissed: [...dismissed, k] });
  const problems = problemsOnly(c.p.problems);
  const changes = Object.keys(c.scenario).length;
  const sticky: ReactNode[] = [];
  const out: ReactNode[] = [];
  if (c.replayAt !== undefined) sticky.push(<ReplayBar key="replay" />);
  if (c.whatIf)
    sticky.push(
      <div key="whatif" className="bn whatif">
        <IWhatIf size={18} />
        <span className="bn-text">
          What-if · {plural(changes, 'change')}
        </span>
        <button
          className="bn-ghost"
          onClick={async () => {
            await navigator.clipboard?.writeText(location.href).catch(() => undefined);
            overlay.toast('Link with this scenario copied.');
          }}
        >
          Share
        </button>
        <button className="bn-ghost" onClick={() => c.setScenario({})}>
          Reset
        </button>
        <button className="bn-solid" onClick={() => setParams({ if: null })}>
          Exit
        </button>
      </div>,
    );
  if (c.t.isDraft && !dismissed.has('draft'))
    out.push(
      <div key="draft" className="bn draft">
        <IWarn size={18} />
        <span className="bn-text">Draft: the TD may still change this schedule.</span>
        <button className="ib bn-x" aria-label="Dismiss" onClick={() => dismiss('draft')}>
          <IClose size={16} />
        </button>
      </div>,
    );
  c.t.announcements.forEach((a, i) => {
    const k = `ann:${a}`;
    if (dismissed.has(k)) return;
    out.push(
      <div key={k + i} className="bn ann">
        <div className="bn-text bn-stack">
          <span className="lbl">From the TD</span>
          <span>{a}</span>
        </div>
        <button className="ib bn-x" aria-label="Dismiss announcement" onClick={() => dismiss(k)}>
          <IClose size={18} />
        </button>
      </div>,
    );
  });
  if (problems.length && !dismissed.has(`problems:${problems.length}`))
    out.push(
      <div key="problems" className="bn problems">
        <IWarn size={18} />
        <span className="bn-text">Some of this schedule may be read wrongly</span>
        {store.app.aiKey && (
          <button className="bn-solid ai" onClick={openAi}>
            Fix with AI
          </button>
        )}
        <button className="bn-solid" onClick={() => navigate(tHref(c.id, 'settings'))}>
          Check
        </button>
        <button className="ib bn-x" aria-label="Dismiss" onClick={() => dismiss(`problems:${problems.length}`)}>
          <IClose size={16} />
        </button>
      </div>,
    );
  if (c.rt.error && c.rt.processed)
    out.push(
      <div key="err" className="bn grey">
        <IRefresh size={18} />
        <span className="bn-text">
          Couldn’t refresh ({FETCH_ERROR_TEXT[c.rt.error.kind].replace(/\.$/, '').toLowerCase()}) · showing{' '}
          {c.rt.lastSuccess ? new Date(c.rt.lastSuccess).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'saved data'}
        </span>
        <button className="bn-solid" onClick={() => void store.runtime(c.id).refresh(true)}>
          Retry
        </button>
      </div>,
    );
  if (!online)
    out.push(
      <div key="off" className="bn grey">
        <IOffline size={18} />
        <span className="bn-text">Offline · showing data from {c.rt.lastSuccess ? new Date(c.rt.lastSuccess).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'earlier'}</span>
      </div>,
    );
  return (
    <>
      {sticky.length > 0 && <div className="banners sticky">{sticky}</div>}
      {out.length > 0 && <div className="banners">{out}</div>}
    </>
  );
}

export function TournamentShell({ children }: { children: ReactNode }) {
  const c = useT();
  const overlay = useOverlay();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSearch(overlay, c);
      } else if (e.key === '/' && !(e.target as HTMLElement)?.closest('input,textarea,select')) {
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
      {c.replayAt !== undefined ? <ReplayDock /> : <TabBar />}
    </div>
  );
}

/** Sub-page layout (settings, diagnostics, editors): back button, title and subtitle, optional action. */
export function SubPage({ title, sub, back, action, children, wide }: { title: string; sub?: string; back?: string; action?: ReactNode; children: ReactNode; wide?: boolean }) {
  const c = useMaybeT();
  return (
    <div className="app-shell sub-shell">
      <header className="sub-hdr">
        <div className="sub-hdr-row">
          <a
            className="ib"
            href={back ?? (c ? tHref(c.id, 'info') : href({ name: 'home' }))}
            aria-label="Back"
            onClick={(e) => {
              if (!back && history.length > 1) {
                e.preventDefault();
                history.back();
              }
            }}
          >
            <IChevronLeft />
          </a>
          <div className="sub-title">
            <h1>{title}</h1>
            {sub && <span>{sub}</span>}
          </div>
          {action}
        </div>
      </header>
      <main className={`sub-main${wide ? ' wide' : ''}`}>{children}</main>
    </div>
  );
}

/** Page title inside a tab ("Schedule", "Pools · Women D1"), with an optional control on the right. */
export function PageHead({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="page-head-text">
        <h1>{title}</h1>
        {sub && <span className="page-sub">{sub}</span>}
      </div>
      {right}
    </div>
  );
}

export const scenarioLink = (id: string, s: Record<string, unknown>) => `${location.origin}${location.pathname}?sheet=${encodeURIComponent(id)}&if=${encodeScenario(s as never)}${location.hash}`;
export { teamKey };
