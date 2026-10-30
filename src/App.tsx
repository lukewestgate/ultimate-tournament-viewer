import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Icons } from './components/icons';
import { Freshness } from './components/ui';
import { initials, clubColor } from './engine/clubs';
import { nextOpenGame } from './engine/paths';
import { useApp } from './state/app';
import { href, useRoute } from './state/router';
import { BracketsView } from './views/Brackets';
import { DebugView } from './views/Debug';
import { GameSheet } from './views/GameSheet';
import { InfoView } from './views/Info';
import { NowView } from './views/Now';
import { PoolsView } from './views/Pools';
import { ScheduleView } from './views/Schedule';
import { SearchOverlay } from './views/Search';
import { TeamsView, TeamView } from './views/Teams';
import { formatClock } from './engine/time';

const NAV = [
  { key: 'now', label: 'Now', icon: Icons.now },
  { key: 'schedule', label: 'Schedule', icon: Icons.schedule },
  { key: 'teams', label: 'Teams', icon: Icons.teams },
  { key: 'pools', label: 'Pools', icon: Icons.pools },
  { key: 'brackets', label: 'Brackets', icon: Icons.brackets },
];

export function App() {
  const route = useRoute();
  const app = useApp();
  const { t, cfg, setSearchOpen, myTeam } = app;
  const section = route.path[0] === 'team' ? 'teams' : route.path[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input,textarea');
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSearchOpen]);

  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollTo, which React would treat as a cleanup.
    window.scrollTo(0, 0);
  }, [route.path.join('/')]);

  const name = t.header.name || cfg.name;
  useEffect(() => {
    document.title = `${name} · Tournament Viewer`;
  }, [name]);

  let view;
  switch (route.path[0]) {
    case 'schedule':
      view = <ScheduleView />;
      break;
    case 'teams':
      view = <TeamsView />;
      break;
    case 'team':
      view = <TeamView team={route.path[1]} />;
      break;
    case 'pools':
      view = <PoolsView />;
      break;
    case 'brackets':
      view = <BracketsView />;
      break;
    case 'info':
      view = <InfoView />;
      break;
    case 'debug':
      view = <DebugView />;
      break;
    default:
      view = <NowView />;
  }

  const next = myTeam ? nextOpenGame(app.real, myTeam) : undefined;

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand" style={{ width: 36, height: 36, borderRadius: 10, background: '#0E1A3A', alignItems: 'center', justifyContent: 'center' }}>
          {Icons.logo}
        </span>
        <a className="ib mobile-only" href={href('info')} aria-label="Info and rules">
          {Icons.menu}
        </a>
        <div className="title">
          <b className="ellipsis">{name}</b>
          <Freshness />
        </div>
        <nav className="topnav" aria-label="Main">
          {[...NAV, { key: 'info', label: 'Info', icon: null }].map((n) => (
            <a key={n.key} href={href(n.key)} className={section === n.key ? 'on' : ''}>
              {n.label}
            </a>
          ))}
        </nav>
        <span className="spacer" />
        <button className="searchbox" onClick={() => setSearchOpen(true)}>
          {Icons.searchSm}
          <span className="grow" style={{ textAlign: 'left' }}>
            Search
          </span>
          <span className="kbd">Ctrl K</span>
        </button>
        <button className="ib mobile-only" aria-label="Search" onClick={() => setSearchOpen(true)}>
          {Icons.search}
        </button>
        {myTeam ? (
          <>
            <a className="ib narrow-only" href={href('team', myTeam)} aria-label={`My team: ${myTeam}`}>
              <span className="avatar" style={{ borderColor: clubColor(myTeam) }}>
                {initials(myTeam)}
              </span>
            </a>
            <a className="chip desktop-only wide-only" href={href('team', myTeam)} style={{ height: 44, borderRadius: 12, borderColor: 'var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, fontSize: 14 }}>
              <span className="dot" style={{ background: clubColor(myTeam) }} />
              {myTeam}
              {next && ` · next ${next.game.stage === 'placement' ? next.game.day.slice(0, 3) + ' ' : ''}${next.game.time} P${next.game.pitch}`}
            </a>
          </>
        ) : (
          <a className="ib mobile-only" href={href('teams')} aria-label="Pick your team">
            <span className="avatar" style={{ borderStyle: 'dashed' }}>
              {Icons.starOutline}
            </span>
          </a>
        )}
      </header>

      <Banners />

      {view}

      <nav className="bottomnav" aria-label="Main">
        {NAV.map((n) => (
          <a key={n.key} className={`tab ${section === n.key ? 'on' : ''}`} href={href(n.key)} aria-current={section === n.key ? 'page' : undefined}>
            {n.icon}
            {n.label}
          </a>
        ))}
      </nav>

      <GameSheet />
      <SearchOverlay />
      <UpdateToast />
      <InstallHint />
    </div>
  );
}

function Banners() {
  const { t, feed, whatIf, setWhatIf, resetScenario, shareUrl, scenario, demo, clockOverridden, now, cfg, refresh } = useApp();
  const [dismissed, setDismissed] = useState<string[]>(() => JSON.parse(sessionStorage.getItem('utv:dismissed') ?? '[]'));
  const [copied, setCopied] = useState(false);
  const dismiss = (a: string) => {
    const next = [...dismissed, a];
    setDismissed(next);
    sessionStorage.setItem('utv:dismissed', JSON.stringify(next));
  };
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  const picks = Object.keys(scenario).length;
  return (
    <div className="banners">
      {(demo || clockOverridden) && (
        <div className="banner demo">
          <span className="grow">
            {demo ? 'Demo mode — scores are simulated, not real.' : 'Clock overridden for testing.'} Showing {formatClock(now, cfg.timeZone)}.
          </span>
          <a className="btn sm" href={location.pathname + location.hash.split('?')[0]}>
            Exit
          </a>
        </div>
      )}
      {t.header.isDraft && (
        <div className="banner draft">
          {Icons.warn}Draft schedule — may change
        </div>
      )}
      {t.header.announcements
        .filter((a) => !dismissed.includes(a))
        .map((a) => (
          <div key={a} className="banner ann" role="status">
            <div className="grow col" style={{ gap: 2 }}>
              <span className="lbl" style={{ color: 'inherit', opacity: 0.85 }}>
                From the TD
              </span>
              <span>{a}</span>
            </div>
            <button aria-label="Dismiss announcement" onClick={() => dismiss(a)}>
              {Icons.close}
            </button>
          </div>
        ))}
      {offline && feed.lastOk && (
        <div className="banner offline">
          {Icons.offline}Offline — showing data from {formatClock(feed.lastOk, cfg.timeZone)}
        </div>
      )}
      {!offline && feed.error && (
        <div className="banner error">
          <span className="grow">{feed.lastOk ? 'Couldn’t reach the schedule — showing last data' : 'Couldn’t reach the schedule'}</span>
          <button className="btn sm" onClick={refresh}>
            Retry
          </button>
        </div>
      )}
      {whatIf && (
        <div className="banner whatif">
          <span className="grow">{picks ? `Hypothetical scenario · ${picks} pick${picks > 1 ? 's' : ''}` : 'What-if mode · tap a team to pick a winner'}</span>
          {picks > 0 && (
            <button
              onClick={async () => {
                const url = shareUrl();
                try {
                  if (navigator.share) await navigator.share({ url, title: 'What if…' });
                  else {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }
                } catch {
                  /* cancelled */
                }
              }}
            >
              {copied ? 'Copied' : 'Share'}
            </button>
          )}
          {picks > 0 && <button onClick={resetScenario}>Reset</button>}
          <button className="solid" onClick={() => setWhatIf(false)}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="toast" role="status">
      New version available
      <button onClick={() => updateServiceWorker(true)}>Reload</button>
      <button className="ghost" aria-label="Dismiss" onClick={() => setNeedRefresh(false)}>
        {Icons.close}
      </button>
    </div>
  );
}

function InstallHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
    if (ios && !standalone && !localStorage.getItem('utv:ios-hint')) setShow(true);
  }, []);
  if (!show) return null;
  return (
    <div className="toast" role="status" style={{ whiteSpace: 'normal', maxWidth: 'calc(100vw - 32px)', borderRadius: 16 }}>
      <span>
        Install: tap <b>Share</b> → <b>Add to Home Screen</b>
      </span>
      <button
        onClick={() => {
          localStorage.setItem('utv:ios-hint', '1');
          setShow(false);
        }}
      >
        OK
      </button>
    </div>
  );
}
