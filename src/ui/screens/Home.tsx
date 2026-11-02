import { useState } from 'react';
import { store, useStore } from '../../store/app';
import { homeGroup, isOnToday, type HomeGroup } from '../../store/launch';
import type { TournamentSettings } from '../../store/settings';
import { FIXTURE_NAMES } from '../../store/fixtures';
import { sourceFromKey, sheetViewUrl } from '../../sheets/links';
import { dateRange, plural, until } from '../fmt';
import { useOverlay } from '../overlay';
import { href, navigate, tHref } from '../router';
import { IMore, IPlus, ISettings } from '../icons';
import { AddForm } from './Add';
import { withoutTag } from '../../extract/names';

const GROUPS: { key: HomeGroup; title: string }[] = [
  { key: 'onToday', title: 'On today' },
  { key: 'comingUp', title: 'Coming up' },
  { key: 'datesUnconfirmed', title: 'Dates not confirmed' },
  { key: 'recent', title: 'Recent and finished' },
];

/** Tournaments home (spec §9.2). */
export function Home() {
  useStore();
  const saved = store.saved();
  const now = Date.now();
  if (!saved.length) return <HomeEmpty />;
  const grouped = new Map<HomeGroup, TournamentSettings[]>();
  for (const s of saved) {
    const g = homeGroup({ id: s.id, summary: s.summary, lastOpened: s.lastOpened }, now);
    grouped.set(g, [...(grouped.get(g) ?? []), s]);
  }
  grouped.get('comingUp')?.sort((a, b) => (a.summary?.firstStart ?? 0) - (b.summary?.firstStart ?? 0));
  grouped.get('recent')?.sort((a, b) => (b.lastOpened ?? 0) - (a.lastOpened ?? 0));
  return (
    <div className="page home">
      <div className="home-head">
        <h1>Tournaments</h1>
        <span style={{ flex: 1 }} />
        <a className="ib" href={href({ name: 'appSettings' })} aria-label="App settings">
          <ISettings />
        </a>
      </div>
      <a className="btn primary add-btn" href={href({ name: 'add' })}>
        <IPlus size={18} /> Add tournament
      </a>
      {GROUPS.map(({ key, title }) => {
        const list = grouped.get(key);
        if (!list?.length) return null;
        return (
          <section key={key} className="section">
            <div className="section-head">
              <h2>{title}</h2>
            </div>
            <div className="cards">
              {list.map((s) => (
                <TournamentCard key={s.id} s={s} big={key === 'onToday'} />
              ))}
            </div>
          </section>
        );
      })}
      <DevFixtures />
      <p className="muted small">Unofficial. Reads public Google Sheets; data stays on this device.</p>
    </div>
  );
}

function TournamentCard({ s, big }: { s: TournamentSettings; big?: boolean }) {
  const overlay = useOverlay();
  const now = Date.now();
  const sum = s.summary;
  const live = isOnToday(sum, now);
  let status: React.ReactNode;
  if (sum?.error) status = <span className="tag warn">Can’t load</span>;
  else if (live) status = (
    <span className="tag live">
      <i className="li" />
      {sum?.firstStart && now < sum.firstStart ? 'Today' : 'Live'}
    </span>
  );
  else if (sum?.datesGuessed) status = <span className="tag warn">Dates not confirmed</span>;
  else if (sum?.lastEnd && sum.lastEnd < now) status = <span className="tag quiet">Finished</span>;
  else status = <span className="tag quiet">{dateRange(sum?.days.map((d) => d.date) ?? [])}</span>;
  const menu = () =>
    overlay.openSheet(
      <div className="stack">
        <a className="btn" href={tHref(s.id)} onClick={() => overlay.closeSheet()}>
          Open
        </a>
        <button
          className="btn"
          onClick={async () => {
            const link = `${location.origin}${location.pathname}?sheet=${encodeURIComponent(s.id)}`;
            if (navigator.share) await navigator.share({ title: sum?.title, url: link }).catch(() => undefined);
            else {
              await navigator.clipboard?.writeText(link).catch(() => undefined);
              overlay.toast('Link copied.');
            }
            overlay.closeSheet();
          }}
        >
          Share link
        </button>
        <a className="btn" href={tHref(s.id, 'settings')} onClick={() => overlay.closeSheet()}>
          Tournament settings
        </a>
        <a className="btn" href={sheetViewUrl(sourceFromKey(s.id))} target="_blank" rel="noreferrer">
          Open the original sheet
        </a>
        <button
          className="btn danger"
          onClick={() => {
            overlay.closeSheet();
            const removed = store.remove(s.id);
            overlay.toast('Removed from your list.', removed ? { label: 'Undo', run: () => store.restore(removed) } : undefined);
          }}
        >
          Remove from my list
        </button>
      </div>,
      { title: sum?.title ?? 'Tournament' },
    );
  const p = sum?.primary;
  return (
    <article className={`card tcard${big ? ' big' : ''}`}>
      <a className="tcard-main" href={tHref(s.id)}>
        <div className="tcard-top">
          {status}
          {sum && sum.problems > 0 && <span className="tag warn">Reading problems</span>}
        </div>
        <b className="tcard-title">{sum?.title ?? 'Loading…'}</b>
        <span className="muted small">
          {dateRange(sum?.days.map((d) => d.date) ?? [])}
          {sum?.divisions ? ` · ${plural(sum.divisions, 'division')}` : ''}
          {sum?.teams ? ` · ${plural(sum.teams, 'team')}` : ''}
        </span>
        {p?.next && (
          <span className="tcard-next">
            <b>{withoutTag(p.team)}</b> next: {new Date(p.next.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}
            {p.next.pitch ? ` · P${p.next.pitch}` : ''}
            {p.next.opponent ? ` · vs ${withoutTag(p.next.opponent)}` : ''} <span className="muted">({until(p.next.start, now)})</span>
          </span>
        )}
        {p && !p.next && p.place && (
          <span className="tcard-next">
            <b>{withoutTag(p.team)}</b> finished {p.place}
          </span>
        )}
      </a>
      <button className="ib" aria-label={`More for ${sum?.title ?? 'tournament'}`} onClick={menu}>
        <IMore />
      </button>
    </article>
  );
}

function HomeEmpty() {
  return (
    <div className="page home-empty">
      <div className="home-head">
        <h1>Follow a tournament</h1>
        <span style={{ flex: 1 }} />
        <a className="ib" href={href({ name: 'appSettings' })} aria-label="App settings">
          <ISettings />
        </a>
      </div>
      <p className="lead">
        Paste the link to the tournament’s Google Sheet. You’ll see what’s on now and next, your team’s games, pool tables and brackets, all on this device.
      </p>
      <AddForm />
      <DevFixtures />
    </div>
  );
}

/** Development only: load a test workbook as if it were a sheet. */
function DevFixtures() {
  const [open, setOpen] = useState(false);
  if (!FIXTURE_NAMES.length) return null;
  return (
    <details className="card pad dev" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Test workbooks (development)</summary>
      <div className="row-btns" style={{ marginTop: 10 }}>
        {FIXTURE_NAMES.map((n) => (
          <button
            key={n}
            className="btn small"
            onClick={() => {
              store.add(`fixture:${n}`);
              navigate(tHref(`fixture:${n}`));
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </details>
  );
}
