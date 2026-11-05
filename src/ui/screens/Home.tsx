import { useEffect, useRef, useState } from 'react';
import { store, useStore } from '../../store/app';
import { FEATURED_SHEET } from '../../store/featured';
import { HOME_ZONE, resumesAt } from '../../store/launch';
import type { TournamentSettings } from '../../store/settings';
import { FIXTURE_NAMES } from '../../store/fixtures';
import { parseSheetLink, sourceFromKey, sheetViewUrl, sourceKey } from '../../sheets/links';
import { dateRange, fallbackTitle, plural, until } from '../fmt';
import { homeItems, homeView, type HomeFilter, type HomeItem, type Match } from '../homeList';
import { useOverlay } from '../overlay';
import { href, navigate, tHref } from '../router';
import { IChevronRight, IClose, IExternal, IMore, IPlus, ISearch, ISettings, IShare } from '../icons';
import { Logo } from '../Shell';
import { PitchBadge } from '../parts';
import { AddForm } from './Add';
import { Hl } from './Search';
import { withoutTag } from '../../extract/names';

/** With fewer tournaments than this there's nothing useful to narrow down. */
const TOOLS_FROM = 4;

const FILTERS: { key: HomeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'now', label: 'On now' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
];

/** Kept while the app is open, so going into a tournament and back doesn't lose them. */
let remembered = { query: '', filter: 'all' as HomeFilter, mine: false };

/** Tournaments home (SpecHome): saved and featured tournaments, with search and status filters. */
export function Home() {
  useStore();
  const [opts, setOpts] = useState(remembered);
  const set = (patch: Partial<typeof remembered>) => {
    remembered = { ...remembered, ...patch };
    setOpts(remembered);
  };
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input,textarea,select');
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const now = Date.now();
  const items = homeItems(store.saved(), store.featured, now);
  if (!items.length) return <HomeEmpty />;
  const tools = items.length >= TOOLS_FROM;
  const canNarrow = items.some((i) => i.saved) && items.some((i) => !i.saved);
  const shown = tools ? { ...opts, mine: opts.mine && canNarrow } : { query: '', filter: 'all' as HomeFilter, mine: false };
  const view = homeView(items, shown, now);
  const link = parseSheetLink(shown.query);
  const linkId = link && sourceKey(link);
  const linked = items.find((i) => i.id === linkId);
  const total = view.sections.reduce((n, s) => n + s.count, 0);
  return (
    <div className="page home">
      <div className="home-head">
        <Logo size={40} />
        <h1>Tournaments</h1>
        <span style={{ flex: 1 }} />
        <a className="btn primary add-btn desk-only" href={href({ name: 'add' })}>
          <IPlus size={18} /> Add tournament
        </a>
        <a className="ib home-add phone-only" href={href({ name: 'add' })} aria-label="Add tournament">
          <IPlus />
        </a>
        <a className="ib" href={href({ name: 'appSettings' })} aria-label="App settings">
          <ISettings />
        </a>
      </div>
      {tools && (
        <div className="home-tools">
          <div className="sr-field" role="search">
            <ISearch size={20} />
            <input
              ref={input}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Search tournaments or teams"
              aria-label="Search tournaments or teams"
              value={opts.query}
              onChange={(e) => set({ query: e.target.value })}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return;
                if (opts.query) set({ query: '' });
                else e.currentTarget.blur();
              }}
            />
            {opts.query && (
              <button className="ib" aria-label="Clear search" onClick={() => (set({ query: '' }), input.current?.focus())}>
                <IClose size={18} />
              </button>
            )}
          </div>
          {!link && (
            <div className="chips home-chips">
              <div className="chips" role="radiogroup" aria-label="Filter by status" style={{ flex: 'none', overflow: 'visible' }}>
                {FILTERS.map(({ key, label }) => (
                  <button
                    key={key}
                    role="radio"
                    aria-checked={shown.filter === key}
                    aria-label={`${label}, ${plural(view.counts[key], 'tournament')}`}
                    className={`chip${shown.filter === key ? ' on' : ''}`}
                    disabled={view.counts[key] === 0 && shown.filter !== key}
                    onClick={() => set({ filter: key })}
                  >
                    {label} <span className="d">{view.counts[key]}</span>
                  </button>
                ))}
              </div>
              {canNarrow && (
                <>
                  <span className="sep" />
                  <button className={`chip${shown.mine ? ' on' : ''}`} aria-pressed={shown.mine} onClick={() => set({ mine: !opts.mine })}>
                    My list
                  </button>
                </>
              )}
            </div>
          )}
          <span className="sr-only" role="status">
            {plural(total, 'tournament')}
          </span>
        </div>
      )}
      {link ? (
        linked ? (
          <div className="cards">
            <TournamentCard item={linked} query="" teams={[]} />
          </div>
        ) : (
          <section className="card pad stack">
            <b>This looks like a tournament sheet</b>
            <span className="muted small">It isn’t in the list yet.</span>
            <button
              className="btn primary"
              onClick={() => {
                set({ query: '' });
                store.add(linkId!);
                navigate(`${href({ name: 'add' })}?id=${encodeURIComponent(linkId!)}`);
              }}
            >
              Add this sheet
            </button>
          </section>
        )
      ) : (
        <>
          {view.sections.map((s) => (
            <section key={s.key} className="section">
              <div className="section-head">
                <h2>{s.title}</h2>
                <span className="sub">{s.count}</span>
              </div>
              {s.groups.map((g, i) => (
                <Group key={g.label ?? i} label={g.label} matches={g.matches} query={shown.query} />
              ))}
              {s.key === 'completed' && view.moreCompleted !== undefined && (
                <button className="link home-more" onClick={() => set({ filter: 'completed' })}>
                  Show all {view.moreCompleted} completed
                </button>
              )}
            </section>
          ))}
          {!view.sections.length && <NoResults query={shown.query} filter={shown.filter} onFilter={(filter) => set({ filter })} />}
        </>
      )}
      <DevFixtures />
      <p className="muted small">Unofficial. Reads public Google Sheets; data stays on this device.</p>
    </div>
  );
}

function Group({ label, matches, query }: { label?: string; matches: Match[]; query: string }) {
  return (
    <>
      {label && <span className="lbl">{label}</span>}
      <div className="cards">
        {matches.map((m) => (
          <TournamentCard key={m.item.id} item={m.item} query={query} teams={m.teams} />
        ))}
      </div>
    </>
  );
}

function NoResults({ query, filter, onFilter }: { query: string; filter: HomeFilter; onFilter: (f: HomeFilter) => void }) {
  const q = query.trim();
  const word = { all: '', now: 'current ', upcoming: 'upcoming ', completed: 'completed ' }[filter];
  if (q)
    return (
      <div className="empty">
        <b>
          No {word}tournaments match “{q}”.
        </b>
        {filter === 'all' ? (
          <span>Have the sheet’s link? Paste it here.</span>
        ) : (
          <button className="btn small" onClick={() => onFilter('all')}>
            Search everything
          </button>
        )}
      </div>
    );
  return (
    <div className="empty">
      <b>{filter === 'now' ? 'Nothing on right now.' : filter === 'upcoming' ? 'Nothing coming up yet.' : 'Nothing here yet.'}</b>
      {filter === 'now' && (
        <button className="btn small" onClick={() => onFilter('upcoming')}>
          See what’s coming up
        </button>
      )}
    </div>
  );
}

function StatusTag({ item, now }: { item: HomeItem; now: number }) {
  const sum = item.saved?.summary;
  switch (item.status) {
    case 'live':
      return (
        <span className="tag live">
          <i className="li" />
          {sum?.firstStart && now < sum.firstStart ? 'Today' : 'Live'}
        </span>
      );
    case 'today':
      return <span className="tag quiet">Today</span>;
    case 'between':
      return <span className="tag soon">Resumes {sum && resumeText(resumesAt(sum, now))}</span>;
    case 'awaiting':
      return <span className="tag warn">Awaiting results</span>;
    case 'guessed':
      return <span className="tag warn">Dates not confirmed</span>;
    case 'completed':
      return <span className="tag final">Completed</span>;
    case 'ended':
      return <span className="tag quiet">Ended</span>;
    case 'upcoming':
      return <span className="tag quiet">{dateRange(item.dates)}</span>;
    case 'unknown':
      return <span className="tag outline">Not opened yet</span>;
  }
}

function resumeText(at: number | undefined): string {
  if (at === undefined) return '';
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { ...o, timeZone: HOME_ZONE }).format(new Date(at));
  return `${part({ weekday: 'short' })} ${part({ hour: '2-digit', minute: '2-digit' })}`;
}

/** "Sheffield 1, Sheffield 3 and 1 more" */
function TeamHits({ teams, query }: { teams: string[]; query: string }) {
  const shown = teams.slice(0, 2);
  return (
    <span className="small tcard-hits">
      {shown.map((t, i) => (
        <span key={t}>
          {i ? ', ' : ''}
          <Hl text={withoutTag(t)} q={query} />
        </span>
      ))}
      {teams.length > shown.length ? ` and ${teams.length - shown.length} more` : ''}
    </span>
  );
}

function TournamentCard({ item, query, teams }: { item: HomeItem; query: string; teams: string[] }) {
  const overlay = useOverlay();
  const now = Date.now();
  const s = item.saved;
  const sum = s?.summary;
  const title = item.title ?? fallbackTitle(item.id);
  const details = [
    item.dates.length ? dateRange(item.dates) : item.featured ? 'Dates to be confirmed' : 'Tap to load it',
    item.divisions ? plural(item.divisions, 'division') : '',
    item.teams ? plural(item.teams, 'team') : '',
    item.missing ? `${plural(item.missing, 'result')} missing` : '',
  ].filter(Boolean);
  const p = sum?.primary;
  return (
    <article className={`card tcard${item.status === 'live' && s ? ' big' : ''}`}>
      <a className="tcard-main" href={tHref(item.id)} onClick={() => store.add(item.id)}>
        <div className="tcard-top">
          <StatusTag item={item} now={now} />
          {item.featured && <span className="tag outline">Featured</span>}
          {sum?.error && <span className="tag warn">Can’t load</span>}
          {sum && sum.problems > 0 && <span className="tag warn">Reading problems</span>}
        </div>
        <b className="tcard-title">
          <Hl text={title} q={query} />
        </b>
        <span className="muted small">{details.join(' · ')}</span>
        {teams.length > 0 && <TeamHits teams={teams} query={query} />}
        {p?.next && (
          <span className="tcard-next">
            <b>{withoutTag(p.team)}</b>
            <span className="d tcard-time">{new Date(p.next.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: HOME_ZONE })}</span>
            {p.next.pitch && <PitchBadge label={p.next.pitch} size="sm" />}
            {p.next.opponent ? <span>vs {withoutTag(p.next.opponent)}</span> : null}
            <span style={{ flex: 1 }} />
            <span className="tag soon sm">{until(p.next.start, now)}</span>
          </span>
        )}
        {p && !p.next && p.place && (
          <span className="tcard-next">
            <b>{withoutTag(p.team)}</b> finished {p.place}
          </span>
        )}
      </a>
      {s && (
        <button className="ib" aria-label={`More for ${title}`} onClick={() => overlay.openSheet(<CardMenu s={s} title={title} />, { title })}>
          <IMore />
        </button>
      )}
    </article>
  );
}

function CardMenu({ s, title }: { s: TournamentSettings; title: string }) {
  const overlay = useOverlay();
  return (
    <div className="card set-list menu-list">
      <a className="set-row nav" href={tHref(s.id)} onClick={() => overlay.closeSheet()}>
        <span>Open</span>
        <IChevronRight size={18} />
      </a>
      <button
        className="set-row nav"
        onClick={async () => {
          const link = `${location.origin}${location.pathname}?sheet=${encodeURIComponent(s.id)}`;
          if (navigator.share) await navigator.share({ title, url: link }).catch(() => undefined);
          else {
            await navigator.clipboard?.writeText(link).catch(() => undefined);
            overlay.toast('Link copied.');
          }
          overlay.closeSheet();
        }}
      >
        <span>Share link</span>
        <IShare size={18} />
      </button>
      <a className="set-row nav" href={tHref(s.id, 'settings')} onClick={() => overlay.closeSheet()}>
        <span>How this sheet is read</span>
        <IChevronRight size={18} />
      </a>
      {!s.id.startsWith('fixture:') && (
        <a className="set-row nav" href={sheetViewUrl(sourceFromKey(s.id))} target="_blank" rel="noreferrer">
          <span>Open the original sheet</span>
          <IExternal size={16} />
        </a>
      )}
      <button
        className="set-row nav danger-text"
        onClick={() => {
          overlay.closeSheet();
          const removed = store.remove(s.id);
          overlay.toast('Removed from your list.', removed ? { label: 'Undo', run: () => store.restore(removed) } : undefined);
        }}
      >
        <span>Remove from my tournaments</span>
      </button>
    </div>
  );
}

function HomeEmpty() {
  return (
    <div className="page home-empty">
      <div className="home-head">
        <Logo size={40} />
        <span style={{ flex: 1 }} />
        <a className="ib" href={href({ name: 'appSettings' })} aria-label="App settings">
          <ISettings />
        </a>
      </div>
      <h1 className="hero-title">Follow a tournament</h1>
      <p className="lead">
        Paste the link to the tournament’s Google Sheet. You’ll see what’s on now and next, your team’s games, pool tables and brackets, all on this device.
      </p>
      <section className="card set-pad">
        <AddForm />
      </section>
      {FEATURED_SHEET && !navigator.onLine && <p className="muted small">Featured tournaments will appear when you’re back online.</p>}
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
