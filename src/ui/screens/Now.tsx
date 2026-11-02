import { useState } from 'react';
import type { GameView } from '../../engine/view';
import { teamGames } from '../../engine/view';
import { parseTeamKey } from '../../store/settings';
import { useT } from '../ctx';
import { dateLabel, ordinal, timeOf, until } from '../fmt';
import { useOverlay } from '../overlay';
import { Empty, GameRow, LiveTag, PitchBadge, Section, Side, TeamName, scoreText, stageText, winnerSide } from '../parts';
import { tHref } from '../router';
import { TeamPicker } from '../TeamPicker';
import { useOpenGame } from './GameDetail';
import { IChevronDown, IStar } from '../icons';
import { withoutTag } from '../../extract/names';
import type { ScreenProps } from './index';

const groupByStart = (vs: GameView[]) => {
  const m = new Map<number, GameView[]>();
  for (const v of vs) m.set(v.g.start, [...(m.get(v.g.start) ?? []), v]);
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
};

/** Now (spec §9.5): followed teams first, then on now, up next and just finished. */
export function Now(_: ScreenProps) {
  const c = useT();
  const clock = c.view.clock;
  const games = c.view.games.filter((v) => !v.g.unscheduled && !v.g.isBye && c.inDiv(v.g.division));
  const live = games.filter((v) => v.status === 'live' || v.status === 'finishing');
  const upcoming = groupByStart(games.filter((v) => v.status === 'upcoming' || (v.status === 'ifRequired' && v.g.start > clock)));
  const next = upcoming[0];
  const done = groupByStart(games.filter((v) => (v.status === 'final' || v.status === 'awaiting') && v.g.start < (live[0]?.g.start ?? clock) && v.g.end <= clock + 60000));
  const last = done[done.length - 1];
  const awaiting = games.filter((v) => v.status === 'awaiting' && (!last || v.g.start !== last[0]));
  const big = games.length > 120 || new Set(games.map((g) => g.g.pitch.label)).size > 8;

  return (
    <>
      <FollowedCards />
      {!c.view.started && <BeforeStart next={next} />}
      {c.view.ended && <AfterEnd />}
      {c.view.started && !c.view.ended && !live.length && next && next[0] - clock > 3 * 3600000 && <BetweenDays next={next} />}
      <div className="now-cols">
        <div className="now-main">
          {live.length > 0 && <OnNow games={live} big={big} />}
          {next && c.view.started && !c.view.ended && (
            <Section title="Up next" sub={timeOf(next[0], c.t.timeZone)} right={<span className="tag quiet">{until(next[0], clock)}</span>}>
              {big ? <Grouped games={next[1]} /> : <List games={next[1]} />}
            </Section>
          )}
          {last && c.view.started && (
            <Section title="Just finished" sub={timeOf(last[0], c.t.timeZone)}>
              {big ? <Grouped games={last[1]} /> : <List games={last[1]} />}
            </Section>
          )}
          {awaiting.length > 0 && (
            <Section title="Awaiting results" sub={String(awaiting.length)}>
              <List games={awaiting} />
            </Section>
          )}
          {!games.length && <Empty title="No games yet" body="The TD hasn’t added games to the sheet." />}
        </div>
        <aside className="now-side">
          <PrimaryPool />
        </aside>
      </div>
    </>
  );
}

function List({ games }: { games: GameView[] }) {
  const open = useOpenGame();
  return (
    <div className="card list">
      {games.map((v) => (
        <GameRow key={v.g.id} v={v} onOpen={() => open(v.g.id)} />
      ))}
    </div>
  );
}

/** At scale: grouped by division, each group collapsible; followed teams' groups open. */
function Grouped({ games }: { games: GameView[] }) {
  const c = useT();
  const groups = new Map<string, GameView[]>();
  for (const v of games) groups.set(v.g.division ?? '', [...(groups.get(v.g.division ?? '') ?? []), v]);
  return (
    <div className="stack" style={{ gap: 8 }}>
      {[...groups.entries()].map(([d, vs]) => {
        const mine = vs.some((v) => c.isFollowed(v.sides[0].team, v.g.division) || c.isFollowed(v.sides[1].team, v.g.division));
        return <Group key={d} title={d || 'Games'} games={vs} mine={mine} />;
      })}
    </div>
  );
}

function Group({ title, games, mine }: { title: string; games: GameView[]; mine: boolean }) {
  const [open, setOpen] = useState(mine || games.length <= 4);
  return (
    <div className="card group">
      <button className="group-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <b>{title}</b>
        {mine && <IStar filled size={14} />}
        <span className="muted">{games.length}</span>
        <span style={{ flex: 1 }} />
        <IChevronDown size={18} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      {open && <List games={games} />}
    </div>
  );
}

function OnNow({ games, big }: { games: GameView[]; big: boolean }) {
  const c = useT();
  const open = useOpenGame();
  const [board, setBoard] = useState(false);
  const start = Math.min(...games.map((v) => v.g.start));
  const end = Math.max(...games.map((v) => v.g.end));
  const left = Math.round((end - c.view.clock) / 60000);
  return (
    <Section
      title="On now"
      sub={`${timeOf(start, c.t.timeZone)}–${timeOf(end, c.t.timeZone)}${big ? ` · ${games.length} games` : ''}`}
      right={left > 0 ? <span className="small muted" style={{ fontWeight: 600 }}>{left} min left</span> : undefined}
    >
      {big && !board ? (
        <>
          <Grouped games={games} />
          <button className="btn" onClick={() => setBoard(true)}>
            Full pitch board · {new Set(games.map((v) => v.g.pitch.label)).size} pitches
          </button>
        </>
      ) : (
        <div className="board">
          {[...games].sort((a, b) => a.g.pitch.order - b.g.pitch.order).map((v) => (
            <LiveCard key={v.g.id} v={v} onOpen={() => open(v.g.id)} />
          ))}
        </div>
      )}
      {big && board && (
        <button className="btn" onClick={() => setBoard(false)}>
          Group by competition
        </button>
      )}
    </Section>
  );
}

function LiveCard({ v, onOpen }: { v: GameView; onOpen: () => void }) {
  const c = useT();
  const w = winnerSide(v);
  const mine = c.isFollowed(v.sides[0].team, v.g.division) || c.isFollowed(v.sides[1].team, v.g.division);
  const pct = Math.min(100, Math.max(0, ((c.view.clock - v.g.start) / (v.g.end - v.g.start)) * 100));
  const cap = v.g.capMins ? v.g.end - v.g.capMins * 60000 : undefined;
  return (
    <article className={`card livecard${mine ? ' mine' : ''}${v.hypothetical ? ' hyp' : ''}`} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="lc-top">
        <PitchBadge label={v.g.pitch.label} />
        <span className="small muted" style={{ fontWeight: 600 }}>
          {stageText(v)}
          {v.g.division && c.t.divisions.length > 1 ? ` · ${v.g.division}` : ''}
        </span>
        <span style={{ flex: 1 }} />
        {v.status === 'live' ? <LiveTag /> : <span className="tag quiet">Finishing</span>}
      </div>
      {([0, 1] as const).map((i) => (
        <div key={i} className="lc-side">
          <Side side={v.sides[i]} division={v.g.division} bold={w === i} />
          <b className="d lc-score">{scoreText(v, i)}</b>
        </div>
      ))}
      <div className="track" aria-label={`${Math.round(pct)}% of game time gone`}>
        <b style={{ width: `${pct}%`, background: v.status === 'finishing' ? 'var(--ink3)' : undefined }} />
      </div>
      {cap && c.view.clock < cap && v.status === 'live' && <span className="small" style={{ color: 'var(--cap)' }}>Cap in {Math.round((cap - c.view.clock) / 60000)} min · {timeOf(cap, c.t.timeZone)}</span>}
    </article>
  );
}

/** A card per followed team, primary first: next game, current game if live, last result. */
function FollowedCards() {
  const c = useT();
  const overlay = useOverlay();
  const keys = [...c.followed].sort((a, b) => (a === c.primary ? -1 : b === c.primary ? 1 : 0));
  if (!keys.length) {
    return (
      <div className="card pad pick-prompt">
        <div>
          <b>Follow your team</b>
          <p className="muted small" style={{ margin: '4px 0 0' }}>See their next game, pitch and opponent first.</p>
        </div>
        <button className="btn primary" onClick={() => overlay.openSheet(<TeamPicker compact />, { title: 'Pick your team(s)' })}>
          Pick a team
        </button>
      </div>
    );
  }
  return (
    <section className="section">
      {keys.map((k) => {
        const { name, division } = parseTeamKey(k);
        if (!c.inDiv(division) && c.division) return null;
        return <TeamCard key={k} name={name} division={division} primary={k === c.primary} />;
      })}
    </section>
  );
}

function TeamCard({ name, division, primary }: { name: string; division?: string; primary: boolean }) {
  const c = useT();
  const open = useOpenGame();
  const mine = teamGames(c.view, name, division).filter((v) => !v.g.isBye);
  const live = mine.find((v) => v.status === 'live' || v.status === 'finishing');
  const next = mine.find((v) => v.status === 'upcoming' || v.status === 'ifRequired');
  const last = [...mine].reverse().find((v) => v.status === 'final');
  const color = c.colorOf(name, division);
  const place = c.t.finalStandings?.find((s) => s.team === name && (!division || s.division === division))?.place;
  const sideOf = (v: GameView) => (v.sides[0].team === name ? 0 : 1);
  if (!primary) {
    const v = live ?? next;
    return (
      <a className="card mini-team" href={tHref(c.id, 'team', `${division ?? ''}::${name}`)}>
        <span className="dot" style={{ background: color }} />
        <div className="mt-text">
          <span className="mt-name">
            <b>{withoutTag(name)}</b>
            {live && <LiveTag />}
          </span>
          <span className="small muted">
            {v
              ? `${v.g.pitch.label ? `P${v.g.pitch.label} ` : ''}vs ${withoutTag(v.sides[1 - sideOf(v)].team ?? v.sides[1 - sideOf(v)].label ?? 'TBC')} · ${stageText(v)}${live ? '' : ` · ${timeOf(v.g.start, c.t.timeZone)}`}`
              : place
                ? `Finished ${ordinal(place)}`
                : 'No more games'}
          </span>
        </div>
        {live && <b className="d" style={{ fontSize: 28 }}>{scoreText(live, sideOf(live))}–{scoreText(live, (1 - sideOf(live)) as 0 | 1)}</b>}
        {!live && next && <span className="tag soon">{until(next.g.start, c.view.clock)}</span>}
      </a>
    );
  }
  const show = live ?? next;
  return (
    <section className="card mine team-card">
      <div className="bar" style={{ background: color }} />
      <div className="tc-body">
        <div className="tc-head">
          <span className="dot" style={{ background: color }} />
          <b>{withoutTag(name)}</b>
          <span className="tag primary">PRIMARY</span>
          <span style={{ flex: 1 }} />
          {show && <span className="lbl">{live ? 'Now' : 'Next'} · {stageText(show)}</span>}
        </div>
        {show ? (
          <div className="tc-next" onClick={() => open(show.g.id)} role="button" tabIndex={0}>
            <div className="tc-when">
              <span className="d tc-time">{timeOf(show.g.start, c.t.timeZone)}</span>
              <span className="tc-pitch">
                <PitchBadge label={show.g.pitch.label} big />
                <span className="small muted">{show.g.pitch.label ? `Pitch ${show.g.pitch.label}` : 'Pitch TBC'}</span>
              </span>
              <span style={{ flex: 1 }} />
              {live ? <LiveTag /> : <span className="tag soon pill">{until(show.g.start, c.view.clock)}</span>}
            </div>
            <div className="tc-opp">
              <span className="muted" style={{ fontWeight: 500 }}>vs</span>
              <Side side={show.sides[1 - sideOf(show)]} division={division} />
              {live && <b className="d" style={{ marginLeft: 'auto', fontSize: 30 }}>{scoreText(live, sideOf(live))}–{scoreText(live, (1 - sideOf(live)) as 0 | 1)}</b>}
            </div>
            {show.g.day !== c.t.days.find((d) => d.date === new Date(c.view.clock).toISOString().slice(0, 10))?.name && !live && (
              <span className="small muted">{dateLabel(c.t.days.find((d) => d.name === show.g.day)?.date ?? '')}</span>
            )}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>{place ? `Finished ${ordinal(place)}.` : 'No more games scheduled.'}</p>
        )}
        {last && (
          <div className="tc-last">
            <span className="lbl">Last</span>
            {(() => {
              const s = sideOf(last);
              const won = winnerSide(last) === s;
              const draw = last.result?.outcome === 'D';
              return (
                <>
                  <span className={`tag ${won ? 'win' : 'quiet'}`}>{draw ? 'D' : won ? 'W' : 'L'}</span>
                  <b className="d" style={{ fontSize: 17 }}>
                    {scoreText(last, s)}–{scoreText(last, (1 - s) as 0 | 1)}
                  </b>
                  <span>vs {withoutTag(last.sides[1 - s].team ?? '')}</span>
                </>
              );
            })()}
            <span style={{ flex: 1 }} />
            <a href={tHref(c.id, 'team', `${division ?? ''}::${name}`)}>Team page</a>
          </div>
        )}
      </div>
    </section>
  );
}

function BeforeStart({ next }: { next?: [number, GameView[]] }) {
  const c = useT();
  if (!next) return null;
  const day = c.t.days[0];
  return (
    <Section title="First games" sub={`${day ? dateLabel(day.date) : ''} · ${timeOf(next[0], c.t.timeZone)}`} right={<span className="tag soon">{until(next[0], c.view.clock)}</span>}>
      <List games={next[1]} />
    </Section>
  );
}

function BetweenDays({ next }: { next: [number, GameView[]] }) {
  const c = useT();
  const day = c.t.days.find((d) => d.name === next[1][0].g.day);
  const complete = [...c.view.standings.values()].filter((s) => s.complete && c.inDiv(s.pool.division));
  return (
    <div className="card pad stack">
      <b>
        {day?.name ?? 'Next day'} starts at {timeOf(next[0], c.t.timeZone)}
      </b>
      {complete.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <span className="lbl">Pool winners so far</span>
          {complete.slice(0, 12).map((s) => (
            <span key={s.pool.name} className="small">
              Pool {s.pool.name}: <b>{s.rows[0]?.team}</b>
              {s.rows[1] ? `, then ${s.rows[1].team}` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AfterEnd() {
  const c = useT();
  const fromSheet = c.t.finalStandings?.filter((s) => c.inDiv(s.division) && s.team);
  const fromEngine = [...c.view.places.entries()].filter(([d]) => c.inDiv(d || undefined));
  return (
    <Section title="Final standings" right={<a href={tHref(c.id, 'standings')}>All</a>}>
      <div className="card list">
        {fromSheet?.length
          ? fromSheet.slice(0, 8).map((s) => (
              <div key={`${s.section}-${s.place}`} className="row">
                <b className="d" style={{ width: 28 }}>{s.place}</b>
                {s.team && <TeamName name={s.team} division={s.division} />}
              </div>
            ))
          : fromEngine.flatMap(([d, list]) => list.slice(0, 8).map((p) => (
              <div key={`${d}-${p.place}`} className="row">
                <b className="d" style={{ width: 28 }}>{p.place}</b>
                {p.team ? <TeamName name={p.team} division={d || undefined} /> : <span className="muted">{p.label}</span>}
              </div>
            )))}
      </div>
    </Section>
  );
}


/** Desktop sidebar: the primary team's pool, compact. */
function PrimaryPool() {
  const c = useT();
  if (!c.primary) return null;
  const { name, division } = parseTeamKey(c.primary);
  const st = [...c.view.standings.values()].find((s) => s.pool.division === division && s.rows.some((r) => r.team === name) && !s.complete) ?? [...c.view.standings.values()].reverse().find((s) => s.pool.division === division && s.rows.some((r) => r.team === name));
  if (!st) return null;
  return (
    <section className="card side-pool">
      <div className="section-head" style={{ padding: '12px 14px 4px' }}>
        <h3>Pool {st.pool.name}</h3>
        <span className="muted small">{st.complete ? 'Complete' : `${st.total - st.played} games left`}</span>
      </div>
      <table className="pt">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>P</th>
            <th>±</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {st.rows.map((r) => (
            <tr key={r.team} className={r.team === name ? 'mine' : ''}>
              <td>{r.rank}</td>
              <td><TeamName name={r.team} division={division} /></td>
              <td>{r.p}</td>
              <td>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
              <td>{r.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <a className="link-row" href={tHref(c.id, 'pools', st.pool.name)}>Pool details</a>
    </section>
  );
}
