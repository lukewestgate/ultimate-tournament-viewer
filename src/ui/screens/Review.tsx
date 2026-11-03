import { useMemo, useState, type ReactNode } from 'react';
import { useT } from '../ctx';
import { SubPage } from '../Shell';
import { navigate, tHref } from '../router';
import { useOverlay } from '../overlay';
import { useOpenAi } from '../AiCta';
import { store } from '../../store/app';
import { processWorkbook } from '../../store/pipeline';
import type { SavedReading } from '../../store/settings';
import { problemsOnly, type Problem } from '../../extract/quality';
import { cell, colName, findTab, type Workbook } from '../../sheets/workbook';
import { ROLE_COLOR } from '../../mapping/manual';
import {
  cellsForGame,
  describeCorrections,
  describeSources,
  diffReadings,
  gameFlags,
  gamesPerTeam,
  oddities,
  poolFlags,
  teamFlags,
  teamRef,
  type Area,
  type GameChange,
  type Oddity,
  type Reading,
  type ReadingDiff,
  type SourceCard,
} from '../../mapping/review';
import type { Game } from '../../model/types';
import { dateLabel, plural } from '../fmt';
import { IChevronDown, IChevronRight, ISparkle, IWarn } from '../icons';
import type { ScreenProps } from './index';
import '../styles/review.css';

type Tab = 'check' | 'changes' | Area;
type Focus = { area: Area; refs: Set<string>; text: string };

interface Side extends Reading {
  label: string;
  problems: Problem[];
}

const when = (at: number) => new Date(at).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
const nameOf = (k: string) => k.slice(k.indexOf('::') + 2);
const divOf = (k: string) => k.slice(0, k.indexOf('::')) || undefined;

/**
 * Check the reading: everything the mapping read, laid out to check by eye against the sheet, with oddities flagged and,
 * when comparing two readings (an AI suggestion, an earlier reading), what differs. `arg` is the reading to compare with.
 */
export function Review({ arg }: ScreenProps) {
  const c = useT();
  const wb = c.rt.workbook;
  if (!wb) return <SubPage title="Check the reading">The sheet isn’t loaded yet.</SubPage>;
  return <ReviewPage key={`${c.id}:${arg ?? ''}`} wb={wb} compareKey={arg} />;
}

function ReviewPage({ wb, compareKey }: { wb: Workbook; compareKey?: string }) {
  const c = useT();
  const overlay = useOverlay();
  const openAi = useOpenAi();
  const s = c.settings;

  // The readings that can be compared with the current one.
  const options: { key: string; label: string; saved?: SavedReading; older: boolean }[] = [];
  if (s.proposal) options.push({ key: 'proposal', label: `AI suggestion, not used yet (${when(s.proposal.at)})`, saved: s.proposal, older: false });
  (s.history ?? []).forEach((h, i) => options.push({ key: `h${i}`, label: `${h.label} (${when(h.at)})`, saved: h, older: true }));
  if (c.p.mapping.mode !== 'auto') options.push({ key: 'auto', label: 'Reading it automatically', older: true });
  const picked = options.find((o) => o.key === compareKey);

  const current = useMemo<Side>(() => ({ mapping: c.p.mapping, t: c.p.tournament, problems: c.p.problems, label: 'Now' }), [c.p]);
  const other = useMemo<Side | undefined>(() => {
    if (!picked) return undefined;
    const p = processWorkbook(c.id, wb, picked.key === 'auto' ? undefined : { mapping: picked.saved?.mapping, format: picked.saved?.format });
    return { mapping: p.mapping, t: p.tournament, problems: p.problems, label: picked.key === 'proposal' ? 'AI suggestion' : picked.key === 'auto' ? 'Automatic' : 'Before' };
  }, [picked?.key, picked?.saved?.at, wb, c.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show the newer of the two by default: the AI suggestion, or the current reading over an older one.
  const [flip, setFlip] = useState(false);
  const newer = other && picked && !picked.older ? other : current;
  const older = other ? (newer === current ? other : current) : undefined;
  const shown = flip && older ? older : newer;
  const base = other ? (shown === current ? other : current) : undefined;
  const diff = useMemo(() => (base ? diffReadings(base, shown, wb) : undefined), [base, shown, wb]);

  const odd = useMemo(() => oddities(shown.t, shown.mapping, wb), [shown, wb]);
  const problems = problemsOnly(shown.problems);
  const [tab, setTab] = useState<Tab>(() => (other ? 'changes' : problems.length || odd.length ? 'check' : 'sheet'));
  const [focus, setFocus] = useState<Focus | undefined>();
  const go = (t: Tab, f?: Focus) => {
    setTab(t);
    setFocus(f);
    window.scrollTo({ top: 0 });
  };

  const compareWith = (key: string) => navigate(tHref(c.id, 'review', key || undefined), true);
  const use = (saved: SavedReading | undefined, remember: string, toast: string) => {
    store.runtime(c.id).setMapping(saved?.mapping, saved?.format, remember);
    if (picked?.key === 'proposal') store.update(c.id, { proposal: undefined });
    overlay.toast(toast);
    navigate(tHref(c.id, 'review', 'h0'), true);
  };

  const tabs: { t: Tab; label: string; n?: number; warn?: boolean }[] = [
    { t: 'check', label: 'Worth checking', n: problems.length + odd.length, warn: problems.length > 0 },
    ...(diff ? [{ t: 'changes' as Tab, label: 'Changes', n: diff.total }] : []),
    { t: 'sheet', label: 'Where it’s read from' },
    { t: 'games', label: 'Games', n: shown.t.games.length },
    { t: 'teams', label: 'Teams', n: shown.t.teams.length },
    { t: 'pools', label: 'Pools', n: shown.t.pools.length },
    { t: 'days', label: 'Days', n: shown.t.days.length },
  ];

  return (
    <SubPage title="Check the reading" sub={c.t.title} wide>
      <section className="card rv-compare">
        <label className="rv-compare-row">
          <span>Compare with</span>
          <select className="chip" value={picked?.key ?? ''} onChange={(e) => compareWith(e.target.value)} aria-label="Compare with">
            <option value="">Nothing, just check this reading</option>
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {!options.length && <span className="small muted">When AI or you change how the sheet is read, the reading before is kept here to compare with.</span>}
        {other && older && (
          <div className="seg rv-which" role="radiogroup" aria-label="Which reading to show">
            {[newer, older].map((x) => (
              <button key={x.label} role="radio" aria-checked={shown === x} className={shown === x ? 'on' : ''} onClick={() => setFlip(x === older)}>
                Show: {x.label}
              </button>
            ))}
          </div>
        )}
        {picked?.key === 'proposal' && (
          <div className="two-btns">
            <button className="btn" onClick={() => (store.update(c.id, { proposal: undefined }), overlay.toast('AI suggestion discarded.'), compareWith(''))}>
              Discard suggestion
            </button>
            <button className="btn primary" onClick={() => use(s.proposal, 'Before AI changes', 'Using the AI’s reading.')}>
              Use the AI suggestion
            </button>
          </div>
        )}
        {picked && picked.older && (
          <button className="btn" onClick={() => use(picked.saved, 'Before going back', `Back to “${picked.label.replace(/ \(.*\)$/, '')}”.`)}>
            Go back to this earlier reading
          </button>
        )}
      </section>

      <Summary shown={shown} base={base} />

      <nav className="rv-tabs" aria-label="Parts of the reading">
        {tabs.map((x) => (
          <button key={x.t} className={`chip${tab === x.t ? ' on' : ''}${x.warn ? ' warn' : ''}`} onClick={() => go(x.t)} aria-pressed={tab === x.t}>
            {x.label}
            {x.n !== undefined && <span className="rv-n">{x.n}</span>}
          </button>
        ))}
      </nav>

      {focus && focus.area === tab && (
        <div className="rv-focus">
          <span>
            Only showing: <b>{focus.text}</b>
          </span>
          <button className="link" onClick={() => setFocus(undefined)}>
            Show all
          </button>
        </div>
      )}

      {tab === 'check' && <CheckTab problems={problems} odd={odd} onPick={(o) => go(o.area, o.refs.length ? { area: o.area, refs: new Set(o.refs), text: o.text } : undefined)} />}
      {tab === 'changes' && diff && base && <ChangesTab diff={diff} shown={shown} base={base} go={go} />}
      {tab === 'sheet' && <SheetTab r={shown} wb={wb} />}
      {tab === 'games' && <GamesTab r={shown} wb={wb} diff={diff} focus={focus?.area === 'games' ? focus.refs : undefined} />}
      {tab === 'teams' && <TeamsTab r={shown} diff={diff} focus={focus?.area === 'teams' ? focus.refs : undefined} />}
      {tab === 'pools' && <PoolsTab r={shown} diff={diff} focus={focus?.area === 'pools' ? focus.refs : undefined} />}
      {tab === 'days' && <DaysTab r={shown} diff={diff} />}

      <span className="lbl-head">Something wrong?</span>
      <section className="card set-list">
        <a className="set-row nav" href={tHref(c.id, 'settings')}>
          <span className="set-label">
            <b>Quick corrections</b>
            <small>Dates, game length, team names, divisions</small>
          </span>
          <IChevronRight size={18} />
        </a>
        <a className="set-row nav" href={tHref(c.id, 'manual')}>
          <span className="set-label">
            <b>Show where things are</b>
            <small>Tap the sheet to set the rows and columns</small>
          </span>
          <IChevronRight size={18} />
        </a>
        <button className="set-row nav violet-text" onClick={openAi}>
          <span className="set-label">
            <b>
              <ISparkle size={14} /> Let AI fix it
            </b>
            <small>You can compare its reading here before using it</small>
          </span>
          <IChevronRight size={18} />
        </button>
      </section>
    </SubPage>
  );
}

// ---------------------------------------------------------------- summary

function Summary({ shown, base }: { shown: Side; base?: Side }) {
  const stat = (r: Side) => {
    const g = r.t.games.filter((x) => !x.isBye && !x.unscheduled);
    return {
      Games: g.length,
      'With both teams': g.filter((x) => (x.teams[0] && x.teams[1]) || (x.slots[0] && x.slots[1])).length,
      Teams: r.t.teams.length,
      Divisions: r.t.divisions.length,
      'Pool tables': r.t.pools.length,
      Days: r.t.days.length,
      Problems: problemsOnly(r.problems).length,
    };
  };
  const a = stat(shown);
  const b = base && stat(base);
  if (!b)
    return (
      <section className="card rv-summary">
        {Object.entries(a).map(([k, v]) => (
          <span key={k} className={k === 'Problems' && v ? 'bad' : ''}>
            <b className="d">{v}</b> {k.toLowerCase()}
          </span>
        ))}
      </section>
    );
  return (
    <section className="card rv-cmp">
      <table className="cmp">
        <thead>
          <tr>
            <th />
            <th>{base!.label}</th>
            <th>{shown.label}</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(a).map(([k, v]) => {
            const was = b[k as keyof typeof b];
            // Only problems are better one way; fewer games can be right (a junk row dropped).
            return (
              <tr key={k} className={k !== 'Problems' || v === was ? '' : v < was ? 'up' : 'down'}>
                <th scope="row">{k}</th>
                <td>{was}</td>
                <td>{v}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ---------------------------------------------------------------- worth checking

function CheckTab({ problems, odd, onPick }: { problems: Problem[]; odd: Oddity[]; onPick: (o: Oddity) => void }) {
  if (!problems.length && !odd.length)
    return (
      <section className="card set-pad">
        <b>Nothing looks odd.</b>
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          No clashes, missing teams or mismatched tables were found. Still worth a glance at “Where it’s read from” to see each column matches its header.
        </p>
      </section>
    );
  const AREA: Record<Area, string> = { sheet: 'Sheet', games: 'Games', teams: 'Teams', pools: 'Pools', days: 'Days' };
  return (
    <section className="card rv-odd">
      {problems.map((p) => (
        <div key={p.text} className="rv-odd-row problem">
          <IWarn size={16} />
          <span>{p.text}</span>
        </div>
      ))}
      {odd.map((o) => (
        <button key={o.text} className={`rv-odd-row ${o.level}`} onClick={() => onPick(o)}>
          {o.level === 'problem' ? <IWarn size={16} /> : <span className="rv-dot" aria-hidden="true" />}
          <span>{o.text}</span>
          <span className="tag sm quiet">{AREA[o.area]}</span>
          <IChevronRight size={16} />
        </button>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- changes

function ChangesTab({ diff, shown, base, go }: { diff: ReadingDiff; shown: Side; base: Side; go: (t: Tab, f?: Focus) => void }) {
  if (!diff.total)
    return (
      <section className="card set-pad">
        <b>The two readings are the same.</b>
      </section>
    );
  const added = diff.games.filter((g) => !g.was);
  const removed = diff.games.filter((g) => !g.now);
  const changed = diff.games.filter((g) => g.was && g.now);
  const gameText = (g: Game) => `${g.day.slice(0, 3)} ${g.time} · ${g.teams[0] ?? g.slots[0] ?? '?'} v ${g.teams[1] ?? g.slots[1] ?? '?'}`;
  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        What <b>{shown.label}</b> reads differently from <b>{base.label}</b>.
      </p>
      {(diff.mapping.added.length > 0 || diff.mapping.removed.length > 0) && (
        <Block title="How the sheet is read">
          {diff.mapping.removed.map((x) => (
            <div key={`-${x}`} className="rv-line del">
              <span aria-label="removed">−</span> {x}
            </div>
          ))}
          {diff.mapping.added.map((x) => (
            <div key={`+${x}`} className="rv-line add">
              <span aria-label="added">+</span> {x}
            </div>
          ))}
        </Block>
      )}
      {diff.games.length > 0 && (
        <Block
          title={`Games: ${[added.length && `${added.length} more`, removed.length && `${removed.length} fewer`, changed.length && `${changed.length} read differently`].filter(Boolean).join(', ')}`}
          action={
            <button className="link" onClick={() => go('games')}>
              See them in Games
            </button>
          }
        >
          {[...removed.slice(0, 6), ...added.slice(0, 6), ...changed.slice(0, 10)].map((g) => (
            <div key={`${g.was?.ref ?? ''}>${g.now?.ref ?? ''}`} className={`rv-line ${!g.was ? 'add' : !g.now ? 'del' : 'chg'}`}>
              <span>{!g.was ? '+' : !g.now ? '−' : '~'}</span>
              <span>
                <b>{(g.now ?? g.was)!.ref}</b> {gameText((g.now ?? g.was)!)}
                {g.what.length > 0 && <small> · {g.what.join('; ')}</small>}
              </span>
            </div>
          ))}
          {diff.games.length > 22 && <span className="small muted">and {diff.games.length - 22} more</span>}
        </Block>
      )}
      {(diff.teams.added.length > 0 || diff.teams.removed.length > 0 || diff.teams.moved.length > 0) && (
        <Block title="Teams">
          {diff.teams.moved.map((m) => (
            <div key={`m${m.name}`} className="rv-line chg">
              <span>~</span> {m.name}: {m.from ?? 'no division'} → {m.to ?? 'no division'}
            </div>
          ))}
          {diff.teams.removed.map((k) => (
            <div key={`-${k}`} className="rv-line del">
              <span>−</span> {nameOf(k)}
              {divOf(k) ? ` (${divOf(k)})` : ''}
            </div>
          ))}
          {diff.teams.added.map((k) => (
            <div key={`+${k}`} className="rv-line add">
              <span>+</span> {nameOf(k)}
              {divOf(k) ? ` (${divOf(k)})` : ''}
            </div>
          ))}
        </Block>
      )}
      {diff.pools.length > 0 && (
        <Block title="Pools">
          {diff.pools.map((p) => (
            <div key={p.key} className="rv-line chg">
              <span>~</span> Pool {nameOf(p.key)}
              {divOf(p.key) ? ` (${divOf(p.key)})` : ''}: {p.what}
            </div>
          ))}
        </Block>
      )}
      {diff.days.length > 0 && (
        <Block title="Days">
          {diff.days.map((d) => (
            <div key={d.name + d.what} className="rv-line chg">
              <span>~</span> {d.name}: {d.what}
            </div>
          ))}
        </Block>
      )}
    </div>
  );
}

function Block({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card rv-block">
      <div className="rv-block-head">
        <b>{title}</b>
        <span style={{ flex: 1 }} />
        {action}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- where it's read from

function SheetTab({ r, wb }: { r: Side; wb: Workbook }) {
  const cards = describeSources(r.mapping, wb, r.t);
  const corr = describeCorrections(r.mapping);
  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        Each part of the sheet that’s read, with the columns it uses. Check each column’s label against the sheet’s own header and first rows.
      </p>
      {!cards.length && (
        <section className="card set-pad">
          <b>Nothing is read from the sheet yet.</b>
        </section>
      )}
      {cards.map((x, i) => (
        <SourceView key={`${x.title}${i}`} card={x} wb={wb} />
      ))}
      <Block title={r.mapping.info.length ? `Rules and format text from ${r.mapping.info.map((x) => `“${x}”`).join(', ')}` : 'No tab is read for rules and format text'}>
        <span className="small muted">
          Points: win {r.t.rules.points.win}, draw {r.t.rules.points.draw}, loss {r.t.rules.points.loss} · {r.t.rules.source === 'ai' ? 'read by AI' : r.t.rules.source === 'user' ? 'set by you' : r.t.rules.source === 'sheet' ? 'read from the sheet' : 'a preset'}
        </span>
      </Block>
      <Block title={corr.length ? `Corrections (${corr.length})` : 'No corrections'}>
        {corr.length ? (
          <ul className="rv-list">
            {corr.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ) : (
          <span className="small muted">Everything above is read as it is in the sheet.</span>
        )}
      </Block>
    </div>
  );
}

/** One part of the mapping: its facts, and the sheet cells it reads, coloured by column. */
function SourceView({ card, wb }: { card: SourceCard; wb: Workbook }) {
  const [all, setAll] = useState(false);
  const tab = findTab(wb, card.tab);
  const [first, last] = card.rows;
  const total = Math.max(0, last - first + 1);
  const rows: (number | 'gap')[] = [];
  if (card.header !== undefined) rows.push(card.header);
  if (all || total <= 8) for (let i = first; i <= last; i++) rows.push(i);
  else rows.push(first, first + 1, first + 2, 'gap', last - 1, last);
  return (
    <section className="card rv-src">
      <div className="rv-block-head">
        <b>{card.title}</b>
        <span style={{ flex: 1 }} />
        {card.count && <span className="tag sm quiet">{card.count}</span>}
      </div>
      {card.lines.map((l) => (
        <span key={l} className="small">
          {l}
        </span>
      ))}
      {tab && card.cols.length > 0 && (
        <div className="sheet-preview rv-snippet">
          <table>
            <thead>
              <tr>
                <th />
                {card.cols.map((x) => (
                  <th key={`${x.col}${x.role}`} style={{ boxShadow: `inset 0 3px 0 ${ROLE_COLOR[x.role] ?? 'var(--ink3)'}` }}>
                    {colName(x.col)}
                    <span className="role-tag">{x.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) =>
                r === 'gap' ? (
                  <tr key={`gap${i}`} className="rv-gap">
                    <th />
                    <td colSpan={card.cols.length}>
                      <button className="link" onClick={() => setAll(true)}>
                        … {plural(total - 5, 'more row')} · show all
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={r} className={r === card.header ? 'hdr-row-m' : ''}>
                    <th className="rv-rownum">{r + 1}</th>
                    {card.cols.map((x) => (
                      <td key={`${x.col}${x.role}`} style={{ background: `color-mix(in srgb, ${ROLE_COLOR[x.role] ?? '#5F6774'} ${r === card.header ? 8 : 14}%, transparent)` }}>
                        {cell(tab, r, x.col).slice(0, 30)}
                      </td>
                    ))}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- games

type GameFilter = 'all' | 'odd' | 'changed';

function GamesTab({ r, wb, diff, focus }: { r: Side; wb: Workbook; diff?: ReadingDiff; focus?: Set<string> }) {
  const flags = useMemo(() => gameFlags(r.t), [r.t]);
  const changes = useMemo(() => {
    const m = new Map<string, GameChange>();
    for (const g of diff?.games ?? []) if (g.now) m.set(g.now.id, g);
    return m;
  }, [diff]);
  const gone = (diff?.games ?? []).filter((g) => !g.now);
  const [filter, setFilter] = useState<GameFilter>(focus ? 'all' : 'all');
  const [division, setDivision] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(300);
  const needle = q.trim().toLowerCase();
  const games = r.t.games.filter((g) => {
    if (focus && !focus.has(g.id)) return false;
    if (filter === 'odd' && !flags.has(g.id)) return false;
    if (filter === 'changed' && !changes.has(g.id)) return false;
    if (division && (g.division ?? '') !== division) return false;
    if (needle && ![g.teams[0], g.teams[1], g.slots[0], g.slots[1], g.code, g.ref, g.pitch.label].some((x) => x?.toLowerCase().includes(needle))) return false;
    return true;
  });
  const days = [...r.t.days.map((d) => d.name), ...new Set(games.map((g) => g.day).filter((d) => !r.t.days.some((x) => x.name === d)))];
  const scheduled = games.filter((g) => !g.unscheduled);
  const offSchedule = games.filter((g) => g.unscheduled);
  let shown = 0;
  const rows = (gs: Game[]) =>
    gs.map((g) => {
      if (shown++ >= limit) return null;
      return <GameLine key={g.id} g={g} r={r} wb={wb} flags={flags.get(g.id)} change={changes.get(g.id)} />;
    });
  return (
    <div className="stack">
      <div className="rv-filters">
        {!focus && (
          <>
            <button className={`chip${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>
              All
            </button>
            <button className={`chip${filter === 'odd' ? ' on' : ''}`} onClick={() => setFilter('odd')}>
              Worth checking <span className="rv-n">{flags.size}</span>
            </button>
            {diff && (
              <button className={`chip${filter === 'changed' ? ' on' : ''}`} onClick={() => setFilter('changed')}>
                Changed <span className="rv-n">{diff.games.length}</span>
              </button>
            )}
          </>
        )}
        {r.t.divisions.length > 1 && (
          <select className="chip" value={division} onChange={(e) => setDivision(e.target.value)} aria-label="Division">
            <option value="">All divisions</option>
            {r.t.divisions.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        <input className="field rv-search" placeholder="Team, code, pitch or row" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search games" />
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Tap a game to see the sheet cells it was read from.
      </p>
      {days.map((d) => {
        const gs = scheduled.filter((g) => g.day === d);
        if (!gs.length) return null;
        const day = r.t.days.find((x) => x.name === d);
        return (
          <section key={d} className="card rv-games">
            <div className="rv-block-head">
              <b>{d}</b>
              {day && <span className="small muted">{dateLabel(day.date)}</span>}
              <span style={{ flex: 1 }} />
              <span className="tag sm quiet">{plural(gs.length, 'game')}</span>
            </div>
            {rows(gs)}
          </section>
        );
      })}
      {offSchedule.length > 0 && (
        <section className="card rv-games">
          <div className="rv-block-head">
            <b>Not on the schedule</b>
            <span className="small muted">no pitch or day</span>
          </div>
          {rows(offSchedule)}
        </section>
      )}
      {(filter === 'changed' || (!focus && filter === 'all')) && gone.length > 0 && (
        <section className="card rv-games">
          <div className="rv-block-head">
            <b>No longer read</b>
            <span className="small muted">in the other reading only</span>
          </div>
          {gone.map((g) => (
            <div key={g.was!.ref} className="rv-game gone">
              <span className="rv-time">{g.was!.time}</span>
              <span className="rv-teams">
                {g.was!.teams[0] ?? g.was!.slots[0] ?? '?'} v {g.was!.teams[1] ?? g.was!.slots[1] ?? '?'}
              </span>
              <span className="rv-ref">{g.was!.ref}</span>
            </div>
          ))}
        </section>
      )}
      {!games.length && (
        <section className="card set-pad">
          <span className="muted">No games match.</span>
        </section>
      )}
      {shown > limit && (
        <button className="btn" onClick={() => setLimit(limit + 300)}>
          Show more ({shown - limit} left)
        </button>
      )}
    </div>
  );
}

function GameLine({ g, r, wb, flags, change }: { g: Game; r: Side; wb: Workbook; flags?: string[]; change?: GameChange }) {
  const [open, setOpen] = useState(false);
  const scored = g.scores[0] !== undefined || g.scores[1] !== undefined;
  const sideText = (i: 0 | 1) => g.teams[i] ?? g.labels?.[i] ?? g.slots[i];
  const cells = open ? cellsForGame(r.mapping, wb, g.ref) : [];
  return (
    <div className={`rv-game${flags ? ' odd' : ''}${change ? (change.was ? ' chg' : ' new') : ''}${open ? ' open' : ''}`}>
      <button className="rv-game-main" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="rv-time">{g.time}</span>
        <span className="rv-pitch">{g.pitch.label || '–'}</span>
        <span className="rv-teams">
          {g.code && <span className="rv-code">{g.code}</span>}
          <span className={g.teams[0] ? '' : 'muted'}>{sideText(0) ?? '—'}</span>
          <span className="muted"> v </span>
          <span className={g.teams[1] ? '' : 'muted'}>{sideText(1) ?? '—'}</span>
          {r.t.divisions.length > 1 && <span className="rv-div">{g.division ?? 'no division'}</span>}
        </span>
        <span className="rv-score">{scored ? `${g.scores[0] ?? '–'}–${g.scores[1] ?? '–'}` : ''}</span>
        <span className="rv-ref">{g.ref.slice(g.ref.lastIndexOf('!') + 1)}</span>
        <IChevronDown size={14} className="rv-caret" />
      </button>
      {(flags || change) && (
        <div className="rv-game-notes">
          {flags?.map((x) => (
            <span key={x} className="tag sm warn">
              {x}
            </span>
          ))}
          {change && !change.was && <span className="tag sm win">Only in this reading</span>}
          {change?.what.map((x) => (
            <span key={x} className="tag sm if-soft">
              {x}
            </span>
          ))}
        </div>
      )}
      {open && (
        <div className="rv-cells">
          <span className="small muted">
            Sheet row <b>{g.ref}</b>
          </span>
          {cells.length ? (
            <dl>
              {cells.map((x) => (
                <div key={x.addr}>
                  <dt>
                    {x.label} <span className="muted">{x.addr}</span>
                  </dt>
                  <dd>{x.text || <span className="muted">empty</span>}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <span className="small muted">The cells for this game couldn’t be found.</span>
          )}
          <span className="small muted">
            Read as: {g.day}, {g.time}
            {g.pitch.label ? `, pitch ${g.pitch.label}` : ''}
            {g.division ? `, ${g.division}` : ''}, {g.stage === 'pool' ? `pool ${g.pool ?? ''}` : g.stage === 'powerPool' ? `power pool ${g.pool ?? ''}` : 'placement'}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- teams

function TeamsTab({ r, diff, focus }: { r: Side; diff?: ReadingDiff; focus?: Set<string> }) {
  const flags = useMemo(() => teamFlags(r.t, r.mapping), [r]);
  const counts = useMemo(() => gamesPerTeam(r.t), [r.t]);
  const [open, setOpen] = useState<string | undefined>();
  const added = new Set(diff?.teams.added ?? []);
  const moved = new Map((diff?.teams.moved ?? []).map((m) => [teamRef(m.to, m.name), m.from]));
  const divs: (string | undefined)[] = r.t.divisions.length ? r.t.divisions.map((d) => d.name) : [undefined];
  if (r.t.divisions.length && r.t.teams.some((x) => !x.division)) divs.push(undefined);
  const seedOf = new Map(r.t.seeding.map((s) => [teamRef(s.division, s.team), s.seed]));
  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        Check each division has the right teams, spelt once. Tap a team to see its games.
      </p>
      {divs.map((d) => {
        const ts = r.t.teams.filter((x) => x.division === d && (!focus || focus.has(teamRef(d, x.name))));
        const removed = (diff?.teams.removed ?? []).filter((k) => divOf(k) === d);
        if (!ts.length && !removed.length) return null;
        ts.sort((a, b) => (seedOf.get(teamRef(d, a.name)) ?? 999) - (seedOf.get(teamRef(d, b.name)) ?? 999) || a.name.localeCompare(b.name));
        return (
          <section key={d ?? ''} className="card rv-block">
            <div className="rv-block-head">
              <b>{d ?? (r.t.divisions.length ? 'In no division' : 'Teams')}</b>
              <span style={{ flex: 1 }} />
              <span className="tag sm quiet">{plural(ts.length, 'team')}</span>
            </div>
            {ts.map((x) => {
              const k = teamRef(d, x.name);
              const fl = flags.get(k);
              const games = open === k ? r.t.games.filter((g) => !g.isBye && g.division === d && g.teams.includes(x.name)) : [];
              return (
                <div key={k} className={`rv-team${fl ? ' odd' : ''}${added.has(k) ? ' new' : moved.has(k) ? ' chg' : ''}`}>
                  <button className="rv-team-main" onClick={() => setOpen(open === k ? undefined : k)} aria-expanded={open === k}>
                    <span className="rv-seed">{seedOf.get(k) ?? ''}</span>
                    <span className="rv-name">{x.name}</span>
                    {x.aliases.length > 0 && <span className="small muted">also “{x.aliases.join('”, “')}”</span>}
                    <span style={{ flex: 1 }} />
                    <span className="small muted">{plural(counts.get(k) ?? 0, 'game')}</span>
                  </button>
                  {(fl || added.has(k) || moved.has(k)) && (
                    <div className="rv-game-notes">
                      {fl?.map((y) => (
                        <span key={y} className="tag sm warn">
                          {y}
                        </span>
                      ))}
                      {added.has(k) && <span className="tag sm win">Only in this reading</span>}
                      {moved.has(k) && <span className="tag sm if-soft">Moved from {moved.get(k) ?? 'no division'}</span>}
                    </div>
                  )}
                  {open === k && (
                    <ul className="rv-list small">
                      {games.map((g) => (
                        <li key={g.id}>
                          {g.day.slice(0, 3)} {g.time} · v {(g.teams[0] === x.name ? g.teams[1] ?? g.slots[1] : g.teams[0] ?? g.slots[0]) ?? '?'}
                          {g.scores[0] !== undefined ? ` · ${g.teams[0] === x.name ? `${g.scores[0]}–${g.scores[1]}` : `${g.scores[1]}–${g.scores[0]}`}` : ''} <span className="muted">· {g.ref}</span>
                        </li>
                      ))}
                      {!games.length && <li className="muted">No games read for this team.</li>}
                    </ul>
                  )}
                </div>
              );
            })}
            {!focus &&
              removed.map((k) => (
                <div key={k} className="rv-team gone">
                  <div className="rv-team-main">
                    <span className="rv-seed" />
                    <span className="rv-name">{nameOf(k)}</span>
                    <span style={{ flex: 1 }} />
                    <span className="small muted">only in the other reading</span>
                  </div>
                </div>
              ))}
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- pools

function PoolsTab({ r, diff, focus }: { r: Side; diff?: ReadingDiff; focus?: Set<string> }) {
  const flags = useMemo(() => poolFlags(r.t), [r.t]);
  const changed = new Map((diff?.pools ?? []).map((p) => [p.key, p.what]));
  const pools = r.t.pools.filter((p) => !focus || focus.has(`${p.division ?? ''}::${p.name}`));
  if (!pools.length)
    return (
      <section className="card set-pad">
        <b>No pool tables are read.</b>
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          If the sheet has pool tables, show where they are, and standings will be checked against them.
        </p>
      </section>
    );
  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        Each pool’s teams and the sheet’s own table, with the number of games read for each team to compare.
      </p>
      {pools.map((p) => {
        const k = `${p.division ?? ''}::${p.name}`;
        const fl = flags.get(k);
        const games = r.t.games.filter((g) => !g.isBye && g.pool === p.name && g.division === p.division);
        const played = (team?: string) => games.filter((g) => team && g.teams.includes(team) && g.scores[0] !== undefined && g.scores[1] !== undefined).length;
        return (
          <section key={k} className={`card rv-block${fl ? ' odd' : ''}`}>
            <div className="rv-block-head">
              <b>Pool {p.name}</b>
              {p.division && <span className="small muted">{p.division}</span>}
              {p.stage === 'powerPool' && <span className="tag sm quiet">power pool</span>}
              <span style={{ flex: 1 }} />
              <span className="tag sm quiet">{plural(games.length, 'game')}</span>
            </div>
            {(fl || changed.has(k)) && (
              <div className="rv-game-notes">
                {fl?.map((x) => (
                  <span key={x} className="tag sm warn">
                    {x}
                  </span>
                ))}
                {changed.has(k) && <span className="tag sm if-soft">{changed.get(k)}</span>}
              </div>
            )}
            <table className="rv-table">
              <thead>
                <tr>
                  <th>Slot</th>
                  <th>Team</th>
                  <th title="Games with a score read">Read</th>
                  {p.sheetTable && (
                    <>
                      <th>W</th>
                      <th>D</th>
                      <th>L</th>
                      <th>Pts</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {p.slots.map((sl, i) => {
                  const row = p.sheetTable?.find((x) => x.team === sl.team) ?? p.sheetTable?.[i];
                  const said = row ? (row.p ?? (row.w !== undefined && row.l !== undefined ? row.w + row.l + (row.d ?? 0) : undefined)) : undefined;
                  const n = played(sl.team);
                  return (
                    <tr key={sl.slot + i}>
                      <td className="muted">{sl.slot}</td>
                      <td>{sl.team ?? <span className="muted">not known yet</span>}</td>
                      <td className={said !== undefined && games.some((g) => g.scores[0] !== undefined) && said !== n ? 'bad' : ''}>{n}</td>
                      {p.sheetTable && (
                        <>
                          <td>{row?.w ?? ''}</td>
                          <td>{row?.d ?? ''}</td>
                          <td>{row?.l ?? ''}</td>
                          <td>{row?.pts ?? ''}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- days

function DaysTab({ r, diff }: { r: Side; diff?: ReadingDiff }) {
  const SOURCE = { sheet: 'from the sheet', user: 'set by you', guessed: 'guessed' } as const;
  return (
    <div className="stack">
      {r.t.days.map((d) => {
        const gs = r.t.games.filter((g) => g.day === d.name && !g.unscheduled && !g.isBye);
        const times = gs.map((g) => g.time).sort();
        const tm = r.t.timing.find((x) => x.day === d.name);
        const ch = (diff?.days ?? []).filter((x) => x.name === d.name);
        return (
          <section key={d.name} className={`card rv-block${d.dateSource === 'guessed' ? ' odd' : ''}`}>
            <div className="rv-block-head">
              <b>{d.name}</b>
              <span style={{ flex: 1 }} />
              <span className={`tag sm ${d.dateSource === 'guessed' ? 'warn' : 'quiet'}`}>
                {dateLabel(d.date)} · {SOURCE[d.dateSource]}
              </span>
            </div>
            <dl className="rv-kv">
              <dt>Games</dt>
              <dd>{gs.length}</dd>
              <dt>First and last start</dt>
              <dd>{times.length ? `${times[0]} – ${times[times.length - 1]}` : '–'}</dd>
              {tm && (
                <>
                  <dt>Game length</dt>
                  <dd>
                    {tm.gameMins} min, every {tm.slotMins} min
                    {tm.capMins ? `, cap after ${tm.capMins} min` : ''}
                  </dd>
                  <dt>Running late</dt>
                  <dd>{tm.delayMins ? `${tm.delayMins} min` : 'No'}</dd>
                </>
              )}
            </dl>
            {ch.length > 0 && (
              <div className="rv-game-notes">
                {ch.map((x) => (
                  <span key={x.what} className="tag sm if-soft">
                    {x.what}
                  </span>
                ))}
              </div>
            )}
          </section>
        );
      })}
      <span className="small muted">Times are in {r.t.timeZone}.</span>
    </div>
  );
}

