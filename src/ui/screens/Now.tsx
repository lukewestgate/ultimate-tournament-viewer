import { useState } from 'react';
import type { GameView } from '../../engine/view';
import { possibleGames, teamGames } from '../../engine/view';
import { parseTeamKey, teamKey } from '../../store/settings';
import { withoutTag, regionTag } from '../../extract/names';
import { useT } from '../ctx';
import { countdown, dateLabel, ordinal, plural, signed, timeOf, until } from '../fmt';
import { useOverlay } from '../overlay';
import { DoneRow, Empty, LineRow, LiveTag, NextRow, PitchBadge, Section, Side, StatusText, TeamName, scoreText, stageText, winnerSide, sideText, isMine } from '../parts';
import { tHref, setParams } from '../router';
import { TeamPicker } from '../TeamPicker';
import { useOpenGame } from './GameDetail';
import { IArrowRight, IChevronDown, IStar, ISearch } from '../icons';
import { leadsFor, stakeLines } from '../outlook';
import type { ScreenProps } from './index';

const byStart = (vs: GameView[]) => {
  const m = new Map<number, GameView[]>();
  for (const v of vs) m.set(v.g.start, [...(m.get(v.g.start) ?? []), v]);
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
};
const sortPitch = (vs: GameView[]) => [...vs].sort((a, b) => a.g.pitch.order - b.g.pitch.order);

/** Now (spec §9.5): followed teams first, then on now, up next and just finished; day states; scale. */
export function Now(_: ScreenProps) {
  const c = useT();
  const clock = c.view.clock;
  const all = c.view.games.filter((v) => !v.g.unscheduled && !v.g.isBye);
  const games = all.filter((v) => c.inDiv(v.g.division));
  const live = games.filter((v) => v.status === 'live' || v.status === 'finishing');
  const upcoming = byStart(games.filter((v) => v.status === 'upcoming' || (v.status === 'ifRequired' && v.g.start > clock)));
  const next = upcoming[0];
  const liveStart = live.length ? Math.min(...live.map((v) => v.g.start)) : clock;
  const done = byStart(games.filter((v) => (v.status === 'final' || v.status === 'awaiting') && v.g.start < liveStart));
  const last = done[done.length - 1];
  const awaiting = games.filter((v) => v.status === 'awaiting' && (!last || v.g.start !== last[0]));
  const pitches = new Set(all.map((v) => v.g.pitch.label)).size;
  const big = pitches > 8 || all.length > 150;
  const betweenDays = c.view.started && !c.view.ended && !live.length && next && next[1][0].g.day !== (last?.[1][0].g.day ?? next[1][0].g.day);

  if (!all.length) return <Empty title="No games yet" body="The TD hasn’t added games to the sheet." />;

  return (
    <div className={`now${big ? ' big' : ''}`}>
      <div className="now-main">
        {!c.view.started && next && <BeforeHero start={next[0]} />}
        {betweenDays && next && <DayCard start={next[0]} games={next[1]} />}
        {c.view.ended && <AfterEnd />}
        <YourTeams big={big} />
        {!c.view.started && next && <FirstGames start={next[0]} />}
        {big && !c.view.ended && <Board live={live} />}
        {!big && live.length > 0 && <OnNow games={live} />}
        {next && c.view.started && !c.view.ended && !betweenDays && (
          <Section title="Up next" sub={`${timeOf(next[0], c.t.timeZone)}${big ? ` · ${plural(next[1].length, 'game')}` : ''}`} right={<span className="tag quiet">{until(next[0], clock)}</span>}>
            {big && !c.division ? <p className="hint-text">Pick a competition above to see its games, or check your teams’ cards.</p> : big ? <Grouped games={next[1]} /> : <NextList games={next[1]} />}
          </Section>
        )}
        {betweenDays && <PoolsSummary />}
        {last && c.view.started && !betweenDays && !c.view.ended && (!big || c.division) && (
          <Section title="Just finished" sub={timeOf(last[0], c.t.timeZone)}>
            {big ? <Grouped games={last[1]} /> : <DoneList games={last[1]} />}
          </Section>
        )}
        {!big && !c.view.ended && awaiting.length > 0 && <Awaiting games={awaiting} />}
      </div>
      <aside className="now-side">
        {big ? (
          <>
            <YourTeams big={big} compact />
            {awaiting.length > 0 && <Awaiting games={awaiting} compact />}
          </>
        ) : (
          <>
            <PrimaryPool />
            <PrimaryStake />
            <LaterToday />
          </>
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- day states

function BeforeHero({ start }: { start: number }) {
  const c = useT();
  const day = c.t.days[0];
  const tomorrow = day && new Date(c.view.clock + 86400000).toLocaleDateString('en-CA', { timeZone: c.t.timeZone }) === day.date;
  const today = day && new Date(c.view.clock).toLocaleDateString('en-CA', { timeZone: c.t.timeZone }) === day.date;
  const firstGames = c.view.games.filter((v) => v.g.start === start && !v.g.isBye);
  const pitches = [...new Set(firstGames.map((v) => v.g.pitch.label).filter(Boolean))];
  return (
    <section className="hero-dark">
        <span className="lbl">{today ? 'Starts today' : tomorrow ? 'Starts tomorrow' : `Starts ${day ? dateLabel(day.date) : ''}`}</span>
        <span className="d hero-time">
          {day?.name.slice(0, 3)} {timeOf(start, c.t.timeZone)}
        </span>
        <span className="hero-meta">
          {pitches.length ? `Pitches ${pitches.slice(0, -1).join(', ')}${pitches.length > 1 ? ' & ' : ''}${pitches[pitches.length - 1]} · ` : ''}
          {plural(c.t.teams.length, 'team')}
          {c.t.pools.length ? ` · ${plural(c.t.pools.length, 'pool')}` : ''}
        </span>
        <span className="d hero-count">{until(start, c.view.clock)}</span>
    </section>
  );
}

function FirstGames({ start }: { start: number }) {
  const c = useT();
  const open = useOpenGame();
  const firstGames = c.view.games.filter((v) => v.g.start === start && !v.g.isBye && c.inDiv(v.g.division));
  return (
    <Section title="First games" sub={`${c.t.days[0]?.name.slice(0, 3) ?? ''} ${timeOf(start, c.t.timeZone)}`}>
      <div className="nlist">
        {sortPitch(firstGames).map((v) => (
          <NextRow key={v.g.id} v={v} onOpen={() => open(v.g.id)} />
        ))}
      </div>
      <a className="link center" href={tHref(c.id, 'schedule')}>
        See {c.t.days[0]?.name}’s schedule
      </a>
    </Section>
  );
}

function DayCard({ start, games }: { start: number; games: GameView[] }) {
  const c = useT();
  const dayIdx = c.t.days.findIndex((d) => d.name === games[0].g.day);
  const dayGames = c.view.games.filter((v) => v.g.day === games[0].g.day && !v.g.isBye);
  const firstPlacement = dayGames.filter((v) => v.g.stage === 'placement').sort((a, b) => a.g.start - b.g.start)[0];
  const firstStage = games[0].g.stage;
  const what =
    firstStage === 'placement'
      ? 'Placement games all day'
      : firstPlacement
        ? `${firstStage === 'powerPool' ? 'Power pools' : 'Pools'} first · finals from ${timeOf(firstPlacement.g.start, c.t.timeZone)}`
        : firstStage === 'powerPool'
          ? 'Power pools'
          : 'Pool games';
  return (
    <section className="card day-card">
      <div className="day-card-text">
        <span className="lbl">Day {dayIdx + 1}</span>
        <span className="d day-time">
          {games[0].g.day.slice(0, 3)} {timeOf(start, c.t.timeZone)}
        </span>
        <span className="muted small">{what}</span>
      </div>
      <span className="tag quiet">{until(start, c.view.clock)}</span>
    </section>
  );
}

/** Between days: the day's pools, top two each and where they go. */
function PoolsSummary() {
  const c = useT();
  const st = [...c.view.standings.values()].filter((s) => c.inDiv(s.pool.division) && s.played > 0);
  if (!st.length) return null;
  return (
    <Section title="Pools so far" right={c.t.pools.length ? <a className="link" href={tHref(c.id, 'pools')}>All tables</a> : undefined}>
      <div className="card list">
        {st.slice(0, 12).map((s) => (
          <a key={s.pool.name} className="psum" href={tHref(c.id, 'pools', s.pool.name)}>
            <b className="d psum-name">{s.pool.name.length <= 3 ? s.pool.name : s.pool.name.slice(0, 1)}</b>
            <span className="psum-rows">
              {s.rows.slice(0, 2).map((r) => (
                <span key={r.team}>
                  <b className="d">{r.rank}</b> {withoutTag(r.team)}
                </span>
              ))}
            </span>
            {leadsFor(c.view, s.pool.name, 1) && <span className="small muted">→ {leadsFor(c.view, s.pool.name, 1)}</span>}
          </a>
        ))}
      </div>
    </Section>
  );
}

function AfterEnd() {
  const c = useT();
  const sheet = (c.t.finalStandings ?? []).filter((s) => c.inDiv(s.division) && s.team);
  const firstSection = sheet[0]?.section;
  const engine = [...c.view.places.entries()].filter(([d]) => c.inDiv(d || undefined))[0];
  const list: { place: number; team?: string; division?: string }[] = sheet.length
    ? sheet.filter((s) => s.section === firstSection).map((s) => ({ place: s.place, team: s.team, division: s.division }))
    : engine
      ? engine[1].map((p) => ({ place: p.place, team: p.team, division: engine[0] || undefined }))
      : [];
  if (!list.length) return null;
  const min = Math.min(...list.map((p) => p.place));
  const rel = list.map((p) => ({ ...p, rel: p.place - min + 1 }));
  const quals = c.view.format.divisions[rel[0].division ?? '']?.qualification;
  const podium = [rel.find((p) => p.rel === 2), rel.find((p) => p.rel === 1), rel.find((p) => p.rel === 3)];
  return (
    <Section title="Final standings" sub={firstSection} right={<a className="link" href={tHref(c.id, 'standings')}>All</a>}>
      <div className="podium" aria-label="Podium">
        {podium.map((p, i) =>
          p?.team ? (
            <div key={p.rel} className={`pod pod-${p.rel}`}>
              <span className="dot" style={{ background: c.colorOf(p.team, p.division) }} />
              <span className="pod-name">
                {withoutTag(p.team)}
                {c.isFollowed(p.team, p.division) ? ' ★' : ''}
              </span>
              <span className="pod-block d">{p.rel}</span>
            </div>
          ) : (
            <div key={i} className="pod" />
          ),
        )}
      </div>
      <div className="card list">
        {rel
          .filter((p) => p.rel > 3)
          .slice(0, 5)
          .map((p) => {
            const q = quals?.find((x) => p.rel >= x.from && p.rel <= x.to);
            return (
              <div key={p.place} className={`row place-row${c.isFollowed(p.team, p.division) ? ' mine-row' : ''}`}>
                <b className="d place">{ordinal(p.rel)}</b>
                {p.team && <TeamName name={p.team} division={p.division} />}
                <span style={{ flex: 1 }} />
                {q && <span className={`qbadge${quals![0] === q ? ' solid' : ''}`}>{quals![0] === q ? 'Q' : 'q'}</span>}
              </div>
            );
          })}
      </div>
      <a className="link center" href={tHref(c.id, 'standings')}>
        All {rel.length} places
      </a>
    </Section>
  );
}

// ---------------------------------------------------------------- followed teams

function YourTeams({ big, compact }: { big: boolean; compact?: boolean }) {
  const c = useT();
  const overlay = useOverlay();
  const keys = [...c.followed].sort((a, b) => (a === c.primary ? -1 : b === c.primary ? 1 : 0));
  const edit = () => overlay.openSheet(<TeamPicker compact />, { title: 'Your teams' });
  // On desktop at scale the teams live in the side column.
  const cls = big ? (compact ? 'desk-only' : 'phone-only') : '';
  if (!keys.length) {
    if (compact) return null;
    return (
      <div className={`card pad pick-prompt ${cls}`}>
        <div>
          <b>Follow your team</b>
          <p className="muted small">See their next game, pitch and opponent first.</p>
        </div>
        <button className="btn primary" onClick={edit}>
          Pick a team
        </button>
      </div>
    );
  }
  return (
    <section className={`section your-teams ${cls}`}>
      {(keys.length > 1 || compact) && (
        <div className="section-head">
          {compact ? <span className="lbl">Your teams</span> : <h2>Your teams</h2>}
          <span style={{ flex: 1 }} />
          <button className="link-btn" onClick={edit}>
            Edit
          </button>
        </div>
      )}
      <div className={`team-cards${compact ? ' stacked' : ''}`}>
        {keys.map((k) => {
          const { name, division } = parseTeamKey(k);
          return <TeamCard key={k} name={name} division={division} primary={k === c.primary && !compact} />;
        })}
      </div>
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
  const place = c.t.finalStandings?.find((s) => s.team === name && (!division || s.division === division))?.place ?? [...c.view.places.values()].flat().find((p) => p.team === name)?.place;
  const tag = regionTag(name);
  const side = (v: GameView): 0 | 1 => (v.sides[0].team === name ? 0 : 1);
  const opp = (v: GameView) => v.sides[1 - side(v)];
  const divTag = division && c.t.divisions.length > 1 && <span className="tag quiet sm">{division}</span>;
  const head = (right: React.ReactNode) => (
    <div className="tc-head">
      <span className="dot" style={{ background: color }} />
      <b className="tc-name">{withoutTag(name)}</b>
      {tag && <span className="region">{tag}</span>}
      {primary && <span className="tag primary">PRIMARY</span>}
      <span style={{ flex: 1 }} />
      {right}
    </div>
  );
  const teamHref = tHref(c.id, 'team', teamKey(name, division));
  const lastLine = last && (
    <div className="tc-last">
      <span className="lbl">Last</span>
      {(() => {
        const s = side(last);
        const w = winnerSide(last);
        const draw = last.result?.outcome === 'D';
        return (
          <>
            <span className={`tag sm ${w === s ? 'win' : 'quiet'}`}>{draw ? 'D' : w === s ? 'W' : 'L'}</span>
            {last.result?.sa !== undefined && (
              <b className="d tc-last-score">
                {scoreText(last, s)}–{scoreText(last, (1 - s) as 0 | 1)}
              </b>
            )}
            <span className="tc-last-vs">vs {sideText(opp(last))}</span>
          </>
        );
      })()}
      <span style={{ flex: 1 }} />
      <a className="link" href={teamHref}>
        Team page
      </a>
    </div>
  );

  // Live: "P1 vs Durham 1 · 9–7" with game-time bar and cap marker.
  if (live) {
    const s = side(live);
    const pct = Math.min(100, Math.max(0, ((c.view.clock - live.g.start) / (live.g.end - live.g.start)) * 100));
    const capAt = live.g.capMins ? live.g.end - live.g.capMins * 60000 : undefined;
    const capPct = capAt ? ((capAt - live.g.start) / (live.g.end - live.g.start)) * 100 : undefined;
    const mins = Math.round((c.view.clock - live.g.start) / 60000);
    const total = Math.round((live.g.end - live.g.start) / 60000);
    return (
      <article className={`card team-card${primary ? ' mine primary' : ''} is-live`} onClick={() => open(live.g.id)} role="button" tabIndex={0}>
        <div className="tc-body">
          {head(
            <>
              {divTag}
              <LiveTag />
            </>,
          )}
          <div className="tc-liverow">
            <PitchBadge label={live.g.pitch.label} size={primary ? 'big' : undefined} />
            <span className="tc-vs">
              <span className="muted">vs</span> <Side side={opp(live)} division={division} plain />
            </span>
            <b className="d tc-score">
              {scoreText(live, s) || '–'}–{scoreText(live, (1 - s) as 0 | 1) || '–'}
            </b>
          </div>
          <div className="cap-track" aria-label={`${mins} of ${total} minutes`}>
            <b style={{ width: `${pct}%`, background: live.status === 'finishing' ? 'var(--ink3)' : undefined }} />
            {capPct !== undefined && <i style={{ left: `${capPct}%` }} />}
          </div>
          <div className="tc-livemeta">
            <span>
              {live.status === 'finishing' ? 'Finishing' : `${mins} of ${total} min`} · {stageText(live)}
            </span>
            {capAt && c.view.clock < capAt && (
              <span className="cap-text">
                Cap in {Math.round((capAt - c.view.clock) / 60000)} min · {timeOf(capAt, c.t.timeZone)}
              </span>
            )}
          </div>
          {primary && lastLine}
        </div>
      </article>
    );
  }

  if (!next) {
    return (
      <article className={`card team-card${primary ? ' mine primary' : ''}`}>
        {primary && <div className="tc-bar" style={{ background: color }} />}
        <div className="tc-body">
          {head(divTag)}
          <p className="tc-done">{place ? `Finished ${ordinal(place)}` : 'No more games scheduled.'}</p>
          {lastLine}
        </div>
      </article>
    );
  }

  const o = opp(next);
  const stake = primary ? stakeLines(c.view, next.g.id, name)[0] : undefined;
  const otherDay = next.g.day !== c.t.days.find((d) => d.date === new Date(c.view.clock).toLocaleDateString('en-CA', { timeZone: c.t.timeZone }))?.name;
  if (!primary) {
    return (
      <article className="card team-card secondary" onClick={() => open(next.g.id)} role="button" tabIndex={0}>
        <div className="tc-body">
          {head(
            <>
              {divTag}
              <span className="tag soon sm">{countdown(next.g.start, c.view.clock, c.t.timeZone)}</span>
            </>,
          )}
          <div className="tc-nextrow">
            <span className="d tc-time-sm">{timeOf(next.g.start, c.t.timeZone)}</span>
            <PitchBadge label={next.g.pitch.label} />
            <span className="tc-vs">
              <span className="muted">vs</span> <Side side={o} division={division} plain inline />
            </span>
          </div>
          <span className="tc-sub">
            {otherDay ? `${next.g.day} · ` : ''}
            {stageText(next)}
            {last ? ` · last: ` : ''}
            {last && (
              <>
                <b style={{ color: winnerSide(last) === side(last) ? 'var(--win)' : undefined }}>{last.result?.outcome === 'D' ? 'D' : winnerSide(last) === side(last) ? 'W' : 'L'}</b>
                {last.result?.sa !== undefined ? ` ${scoreText(last, side(last))}–${scoreText(last, (1 - side(last)) as 0 | 1)}` : ''} vs {sideText(opp(last))}
              </>
            )}
          </span>
        </div>
      </article>
    );
  }
  return (
    <article className="card team-card mine primary">
      <div className="tc-bar" style={{ background: color }} />
      <div className="tc-body">
        {head(
          <>
            <span className="lbl phone-only">{!c.view.started ? 'First game' : `Next · ${stageText(next)}`}</span>
            <span className="tag accent pill desk-only">{countdown(next.g.start, c.view.clock, c.t.timeZone)}</span>
          </>,
        )}
        <div className="tc-next" onClick={() => open(next.g.id)} role="button" tabIndex={0}>
          <div className="tc-when">
            <span className="d tc-time">{timeOf(next.g.start, c.t.timeZone)}</span>
            <span className="tc-pitch">
              <PitchBadge label={next.g.pitch.label} size="big" />
              <span className="small muted">{next.g.pitch.label ? `Pitch ${next.g.pitch.label}` : 'Pitch TBC'}</span>
            </span>
            <span style={{ flex: 1 }} />
            <span className="tag accent pill phone-only">{countdown(next.g.start, c.view.clock, c.t.timeZone)}</span>
          </div>
          <div className="tc-opp">
            <span className="tc-opp-vs">vs</span>
            <Side side={o} division={division} plain />
          </div>
          {otherDay && <span className="small muted">{dateLabel(c.t.days.find((d) => d.name === next.g.day)?.date ?? '')}</span>}
        </div>
        {stake && (
          <div className="tc-stake">
            <IArrowRight size={16} strokeWidth={2.4} />
            {stake.tag === 'Win' ? `A win puts ${stake.text}` : `${stake.tag === 'Winner' ? 'Win' : stake.tag} → ${stake.text}`}
          </div>
        )}
        {lastLine}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- on now, next, done

function OnNow({ games }: { games: GameView[] }) {
  const c = useT();
  const open = useOpenGame();
  const start = Math.min(...games.map((v) => v.g.start));
  const end = Math.max(...games.map((v) => v.g.end));
  const left = Math.round((end - c.view.clock) / 60000);
  return (
    <Section
      title="On now"
      sub={
        <>
          {timeOf(start, c.t.timeZone)}–{timeOf(end, c.t.timeZone)}
          <span className="desk-only">{left > 0 ? ` · ${left} min left` : ''}</span>
        </>
      }
      right={left > 0 ? <span className="left-text phone-only">{left} min left</span> : undefined}
    >
      <div className="board">
        {sortPitch(games).map((v) => (
          <LiveCard key={v.g.id} v={v} onOpen={() => open(v.g.id)} />
        ))}
      </div>
      {c.view.replay && <p className="hint-text">Live scores are hidden in replay: only final results are known, from each game’s scheduled end.</p>}
    </Section>
  );
}

function LiveCard({ v, onOpen }: { v: GameView; onOpen: () => void }) {
  const c = useT();
  const w = winnerSide(v);
  const pct = Math.min(100, Math.max(0, ((c.view.clock - v.g.start) / (v.g.end - v.g.start)) * 100));
  const lead = v.result ? (v.result.sa ?? 0) - (v.result.sb ?? 0) : 0;
  return (
    <article className={`card livecard${isMine(c, v) ? ' mine' : ''}${v.hypothetical ? ' hyp' : ''}`} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="lc-top">
        <PitchBadge label={v.g.pitch.label} size="xl" />
        <span className="lc-stage">
          {stageText(v)}
          {v.g.division && c.t.divisions.length > 1 && !c.division ? ` · ${v.g.division}` : ''}
        </span>
        <span style={{ flex: 1 }} />
        {v.status === 'live' ? <LiveTag /> : <span className="tag quiet">Finishing</span>}
      </div>
      {([0, 1] as const).map((i) => (
        <div key={i} className="lc-side">
          <Side side={v.sides[i]} division={v.g.division} bold={w === i || (lead > 0 && i === 0) || (lead < 0 && i === 1)} plain />
          <b className="d lc-score">{scoreText(v, i)}</b>
        </div>
      ))}
      <div className="track">
        <b style={{ width: `${pct}%`, background: v.status === 'finishing' ? 'var(--ink3)' : undefined }} />
      </div>
    </article>
  );
}

function NextList({ games }: { games: GameView[] }) {
  const open = useOpenGame();
  return (
    <div className="nlist">
      {sortPitch(games).map((v) => (
        <NextRow key={v.g.id} v={v} onOpen={() => open(v.g.id)} />
      ))}
    </div>
  );
}

function DoneList({ games }: { games: GameView[] }) {
  const open = useOpenGame();
  return (
    <div className="dlist">
      {sortPitch(games).map((v) => (
        <DoneRow key={v.g.id} v={v} onOpen={() => open(v.g.id)} />
      ))}
    </div>
  );
}

/** At scale: grouped by competition, each group collapsible; followed teams' groups open. */
function Grouped({ games, showMore = 3 }: { games: GameView[]; showMore?: number }) {
  const c = useT();
  const groups = new Map<string, GameView[]>();
  for (const v of games) groups.set(v.g.division ?? '', [...(groups.get(v.g.division ?? '') ?? []), v]);
  const order = c.t.divisions.map((d) => d.name);
  return (
    <div className="card groups">
      {[...groups.entries()]
        .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
        .map(([d, vs]) => (
          <Group key={d} title={d || 'Games'} games={sortPitch(vs)} mine={vs.some((v) => isMine(c, v))} limit={showMore} />
        ))}
    </div>
  );
}

function Group({ title, games, mine, limit }: { title: string; games: GameView[]; mine: boolean; limit: number }) {
  const open = useOpenGame();
  const [expanded, setExpanded] = useState(mine);
  const [all, setAll] = useState(false);
  const shown = all ? games : games.slice(0, limit);
  const rest = games.slice(limit);
  return (
    <div className="group">
      <button className="group-head" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        <b>{title}</b>
        <span style={{ flex: 1 }} />
        {mine && (
          <span className="star-chip" aria-label="followed team">
            <IStar filled size={12} />
          </span>
        )}
        <span className="d group-count">{games.length}</span>
        <IChevronDown size={16} className={`chev${expanded ? ' up' : ''}`} />
      </button>
      {expanded && (
        <div className="group-body">
          {shown.map((v) => (
            <LineRow key={v.g.id} v={v} onOpen={() => open(v.g.id)} />
          ))}
          {!all && rest.length > 0 && (
            <button className="more-link" onClick={() => setAll(true)}>
              {rest.length} more on {[...new Set(rest.map((v) => (v.g.pitch.label ? `P${v.g.pitch.label}` : '')))].filter(Boolean).slice(0, 4).join(', ')}
              {rest.length > 4 ? '…' : ''}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Large events: grouped on phones (with the full pitch board a tap away), a tile board on desktop. */
function Board({ live }: { live: GameView[] }) {
  const c = useT();
  const overlay = useOverlay();
  if (!live.length) return null;
  const start = Math.min(...live.map((v) => v.g.start));
  const end = Math.max(...live.map((v) => v.g.end));
  const pitches = new Set(live.map((v) => v.g.pitch.label)).size;
  return (
    <Section
      title="On now"
      sub={`${timeOf(start, c.t.timeZone)}–${timeOf(end, c.t.timeZone)} · ${plural(live.length, 'game')}`}
      right={c.t.links.pitchMap ? <a className="link desk-only" href={c.t.links.pitchMap} target="_blank" rel="noreferrer">Pitch map ↗</a> : undefined}
    >
      <div className="phone-only stack">
        <Grouped games={live} />
        <button className="btn block board-btn" onClick={() => overlay.openSheet(<PitchBoard games={live} />, { title: `All pitches · ${timeOf(c.view.clock, c.t.timeZone)}`, wide: true })}>
          Full pitch board · {pitches} pitches
        </button>
      </div>
      <div className="tiles desk-only">
        {sortPitch(live).map((v) => (
          <Tile key={v.g.id} v={v} />
        ))}
      </div>
    </Section>
  );
}

function Tile({ v }: { v: GameView }) {
  const c = useT();
  const open = useOpenGame();
  const w = winnerSide(v);
  const pct = Math.min(100, Math.max(0, ((c.view.clock - v.g.start) / (v.g.end - v.g.start)) * 100));
  const capPct = v.g.capMins ? ((v.g.end - v.g.capMins * 60000 - v.g.start) / (v.g.end - v.g.start)) * 100 : undefined;
  return (
    <article className={`card tile${isMine(c, v) ? ' mine' : ''}`} onClick={() => open(v.g.id)} role="button" tabIndex={0}>
      <div className="tile-top">
        <PitchBadge label={v.g.pitch.label} />
        <span className="tile-div">{v.g.division ?? stageText(v)}</span>
        <span style={{ flex: 1 }} />
        <StatusText v={v} />
      </div>
      {([0, 1] as const).map((i) => (
        <div key={i} className="tile-side">
          <Side side={v.sides[i]} division={v.g.division} plain inline bold={w === i} short />
          <b className="d">{scoreText(v, i)}</b>
        </div>
      ))}
      <div className="cap-track thin">
        <b style={{ width: `${pct}%` }} />
        {capPct !== undefined && <i style={{ left: `${capPct}%` }} />}
      </div>
    </article>
  );
}

function PitchBoard({ games }: { games: GameView[] }) {
  const open = useOpenGame();
  const [q, setQ] = useState('');
  const shown = sortPitch(games).filter((v) => !q || `p${v.g.pitch.label} ${v.g.pitch.label} ${v.sides.map((s) => s.team ?? '').join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <label className="search-field">
        <ISearch size={18} />
        <input placeholder="Pitch number or team" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Pitch number or team" />
      </label>
      <div className="card list">
        {shown.map((v) => (
          <LineRow key={v.g.id} v={v} onOpen={() => open(v.g.id)} meta={v.g.division} />
        ))}
      </div>
    </div>
  );
}

function Awaiting({ games, compact }: { games: GameView[]; compact?: boolean }) {
  const c = useT();
  const open = useOpenGame();
  const rows = (
    <div className={compact ? 'await-box' : 'card list'}>
      {games.map((v) =>
        compact ? (
          <span key={v.g.id} className="await-line">
            P{v.g.pitch.label} · {sideText(v.sides[0])} v {sideText(v.sides[1])} · {Math.max(1, Math.round((c.view.clock - v.g.end) / 60000))} min
          </span>
        ) : (
          <LineRow key={v.g.id} v={v} onOpen={() => open(v.g.id)} meta={v.g.division} right={<span className="small muted">{Math.max(1, Math.round((c.view.clock - v.g.end) / 60000))} min</span>} />
        ),
      )}
    </div>
  );
  if (compact)
    return (
      <section className="section">
        <span className="lbl">Awaiting results · {games.length}</span>
        {rows}
      </section>
    );
  return (
    <Section title="Awaiting results" sub={String(games.length)}>
      {rows}
    </Section>
  );
}

// ---------------------------------------------------------------- desktop sidebar

function primaryPoolStanding(c: ReturnType<typeof useT>) {
  if (!c.primary) return undefined;
  const { name, division } = parseTeamKey(c.primary);
  const sts = [...c.view.standings.values()].filter((s) => s.pool.division === division && s.rows.some((r) => r.team === name));
  return { name, division, st: sts.find((s) => !s.complete) ?? sts[sts.length - 1] };
}

function PrimaryPool() {
  const c = useT();
  const p = primaryPoolStanding(c);
  if (!p?.st) return null;
  const { st, name, division } = p;
  const left = st.total - st.played;
  const leads = st.rows.map((_, i) => leadsFor(c.view, st.pool.name, i + 1));
  const firstLead = leads[0];
  const topN = firstLead ? leads.findIndex((l) => l !== firstLead) : -1;
  return (
    <section className="card side-pool">
      <div className="side-head">
        <a href={tHref(c.id, 'pools', st.pool.name)}>
          <b>{st.pool.name.length <= 3 ? `Pool ${st.pool.name}` : st.pool.name}</b>
        </a>
        <span className={`tag sm ${st.complete ? 'quiet' : 'soon'}`}>{st.complete ? 'Complete' : `${plural(left, 'game')} left`}</span>
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
              <td>
                <TeamName name={r.team} division={division} size={8} />
              </td>
              <td>{r.p}</td>
              <td>{signed(r.diff)}</td>
              <td>{r.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="side-foot">
        Win {c.t.rules.points.win} · draw {c.t.rules.points.draw} · loss {c.t.rules.points.loss}
        {firstLead ? ` · 1st${topN > 1 ? `–${ordinal(topN)}` : ''} → ${firstLead}` : ''}
      </div>
    </section>
  );
}

function PrimaryStake() {
  const c = useT();
  if (!c.primary) return null;
  const { name, division } = parseTeamKey(c.primary);
  const next = teamGames(c.view, name, division).find((v) => v.status === 'upcoming' || v.status === 'live');
  if (!next) return null;
  const lines = stakeLines(c.view, next.g.id, name);
  if (!lines.length) return null;
  return (
    <section className="card side-card">
      <b className="side-title">{withoutTag(name)} · what’s at stake</b>
      {lines.map((l) => (
        <div key={l.tag} className="stake-row">
          <span className={`tag ${l.kind === 'good' ? 'win' : 'quiet'}`}>{l.tag}</span>
          <span>{l.text}</span>
        </div>
      ))}
      <button className="btn dashed-violet" onClick={() => setParams({ if: '_' })}>
        Explore what-ifs
      </button>
    </section>
  );
}

function LaterToday() {
  const c = useT();
  if (!c.primary) return null;
  const { name, division } = parseTeamKey(c.primary);
  const today = new Date(c.view.clock).toLocaleDateString('en-CA', { timeZone: c.t.timeZone });
  const dayName = c.t.days.find((d) => d.date === today)?.name ?? c.view.games.find((v) => v.g.start > c.view.clock)?.g.day;
  const mine = teamGames(c.view, name, division).filter((v) => v.g.day === dayName && v.status === 'upcoming').slice(1, 6);
  const maybe = possibleGames(c.view, name, division).filter((v) => v.g.day === dayName).slice(0, 3);
  if (!mine.length && !maybe.length) return null;
  return (
    <section className="card side-card">
      <b className="side-title">Later today</b>
      {mine.map((v) => (
        <div key={v.g.id} className="later-row">
          <span className="d later-time">{timeOf(v.g.start, c.t.timeZone)}</span>
          <PitchBadge label={v.g.pitch.label} size="sm" />
          <span>
            {sideText(v.sides[0])} v {sideText(v.sides[1])}
          </span>
        </div>
      ))}
      {maybe.map((v) => (
        <div key={v.g.id} className="later-row maybe">
          <span className="d later-time">{timeOf(v.g.start, c.t.timeZone)}</span>
          <span>
            {stageText(v)} · possible, depending on results
          </span>
        </div>
      ))}
    </section>
  );
}
