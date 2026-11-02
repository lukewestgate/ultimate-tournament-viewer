import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { store, useStore } from '../store/app';
import { launchTarget } from '../store/launch';
import { parseSheetLink, sourceKey } from '../sheets/links';
import { FETCH_ERROR_TEXT } from '../sheets/fetch';
import type { RuntimeState } from '../store/runtime';
import { getParam, href, navigate, setParams, tHref, useRoute, type Route } from './router';
import { OverlayProvider, useOverlay } from './overlay';
import { TournamentProvider, useT } from './ctx';
import { TournamentShell } from './Shell';
import { screens } from './screens';
import { PwaPrompts } from './Pwa';

function useTheme() {
  const s = useStore();
  const theme = s.app.theme;
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.body.classList.toggle('t-dark', dark);
      document.body.classList.toggle('t-light', !dark);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

/** Arriving from a shared link: save the tournament (and its mapping), say so, then tidy the URL. */
function useSharedLink(): boolean {
  const overlay = useOverlay();
  const [done, setDone] = useState(() => !getParam('sheet'));
  useEffect(() => {
    const sheet = getParam('sheet');
    if (!sheet) return;
    const src = parseSheetLink(sheet) ?? (sheet.startsWith('fixture:') ? undefined : undefined);
    const id = src ? sourceKey(src) : sheet.startsWith('fixture:') ? sheet : undefined;
    const m = getParam('m');
    void (async () => {
      if (id) {
        const isNew = !store.get(id);
        store.add(id);
        const withMapping = m ? await store.importShared(id, m) : false;
        if (isNew || withMapping) overlay.toast(withMapping ? 'Tournament saved, with the shared reading of the sheet.' : 'Tournament saved to your list.');
        setParams({ sheet: null, m: null });
        if (!/^#\/t\//.test(location.hash)) navigate(tHref(id), true);
      } else setParams({ sheet: null, m: null });
      setDone(true);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return done;
}

function Launch() {
  // Empty hash: pick the screen per spec §9.2.
  useEffect(() => {
    if (location.hash && location.hash !== '#' && location.hash !== '#/') return;
    const entries = store.saved().map((s) => ({ id: s.id, summary: s.summary, lastOpened: s.lastOpened }));
    const target = launchTarget(entries, Date.now());
    if (target.kind === 'tournament') navigate(tHref(target.id), true);
  }, []);
  return null;
}

export function App() {
  return (
    <OverlayProvider>
      <Root />
    </OverlayProvider>
  );
}

function Root() {
  useTheme();
  const ready = useSharedLink();
  const route = useRoute();
  if (!ready) return <Loading text="Opening shared link…" />;
  return (
    <>
      <Launch />
      <PwaPrompts />
      <RouteView route={route} />
    </>
  );
}

function RouteView({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <screens.Home />;
    case 'add':
      return <screens.Add />;
    case 'appSettings':
      return (
        <Suspense fallback={<Loading text="Loading…" />}>
          <screens.AppSettings />
        </Suspense>
      );
    case 'tournament':
      return (
        <TournamentProvider key={route.id} id={route.id} fallback={(rt) => <TournamentLoading rt={rt} />}>
          <TournamentScreen route={route} />
        </TournamentProvider>
      );
  }
}

/** Screens drawn as sub-pages with a back header instead of the tab shell. */
const SUB_PAGES: string[] = ['settings', 'diagnostics', 'manual', 'format'];

function TournamentScreen({ route }: { route: Extract<Route, { name: 'tournament' }> }) {
  const c = useT();
  useEffect(() => {
    document.title = `${c.t.title} · Tournament Viewer`;
  }, [c.t.title]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.tab, route.arg]);
  const S = screens.tournament[route.tab] ?? screens.tournament.now;
  if (SUB_PAGES.includes(route.tab))
    return (
      <Suspense fallback={<Loading text="Loading…" />}>
        <S arg={route.arg} />
      </Suspense>
    );
  return (
    <TournamentShell>
      <Suspense fallback={<div className="spinner" style={{ margin: '40px auto' }} />}>
        <S arg={route.arg} />
      </Suspense>
    </TournamentShell>
  );
}

export function Loading({ text }: { text: string }) {
  return (
    <div className="center-page" aria-busy="true">
      <div className="spinner" aria-hidden="true" />
      <p className="muted">{text}</p>
    </div>
  );
}

function TournamentLoading({ rt }: { rt: RuntimeState }) {
  if (rt.phase === 'error' && rt.error) {
    return (
      <div className="center-page">
        <div className="card pad" style={{ maxWidth: 440 }}>
          <h2>{FETCH_ERROR_TEXT[rt.error.kind]}</h2>
          <ErrorNextStep id={rt.id} kind={rt.error.kind} />
        </div>
      </div>
    );
  }
  const steps: [RuntimeState['step'], string][] = [
    ['opening', 'Opening sheet'],
    ['reading', 'Reading tabs'],
    ['finding', 'Finding games'],
  ];
  const at = steps.findIndex(([s]) => s === rt.step);
  return (
    <div className="center-page" aria-busy="true">
      <div className="spinner" aria-hidden="true" />
      <ol className="steps">
        {steps.map(([s, label], i) => (
          <li key={s} className={i < at ? 'done' : i === at ? 'on' : ''}>
            {label}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ErrorNextStep({ id, kind }: { id: string; kind: string }): ReactNode {
  const retry = (
    <button className="btn primary" onClick={() => void store.runtime(id).refresh(true)}>
      Try again
    </button>
  );
  if (kind === 'private')
    return (
      <div className="stack">
        <ol className="help-steps">
          <li>Open the sheet and press <b>Share</b>.</li>
          <li>Under General access choose <b>Anyone with the link</b>.</li>
          <li>Leave the role as <b>Viewer</b> and press Done.</li>
        </ol>
        <div className="row-btns">
          {retry}
          <button className="btn" onClick={() => void navigator.clipboard?.writeText(`Hi! Could you set the tournament sheet to "Anyone with the link can view"? Then it can be followed in a tournament viewer app. Thanks!`)}>
            Copy a message for the TD
          </button>
        </div>
      </div>
    );
  if (kind === 'notFound')
    return (
      <div className="stack">
        <p className="muted">Check the link is the whole address of the sheet.</p>
        <a className="btn primary" href={href({ name: 'add' })}>
          Check the link
        </a>
      </div>
    );
  if (kind === 'offline') return <div className="stack"><p className="muted">Connect to the internet, then try again.</p>{retry}</div>;
  return <div className="stack">{retry}</div>;
}
