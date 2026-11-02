import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameView } from '../../engine/view';
import { possibleGames } from '../../engine/view';
import { parseTeamKey } from '../../store/settings';
import { withoutTag } from '../../extract/names';
import { useT } from '../ctx';
import { plural, timeOf } from '../fmt';
import { useOverlay } from '../overlay';
import { Empty, PitchBadge, Seg, Side, StatusText, scoreText, winnerSide, isMine, stageText } from '../parts';
import { PageHead } from '../Shell';
import { useOpenGame } from './GameDetail';
import { IStar, ISearch } from '../icons';
import type { ScreenProps } from './index';

type Stage = 'all' | 'pool' | 'placement';

/** Schedule (spec §9.6; SpecSchedule, LargeTabs, SpecOutdoorScreens). */
export function Schedule(_: ScreenProps) {
  const c = useT();
  const overlay = useOverlay();
  const days = c.t.days;
  const todayDate = new Date(c.view.clock).toLocaleDateString('en-CA', { timeZone: c.t.timeZone });
  const defaultDay = days.find((d) => d.date === todayDate)?.name ?? days.find((d) => d.date > todayDate)?.name ?? days[days.length - 1]?.name;
  const [day, setDay] = useState(defaultDay);
  const [mode, setMode] = useState<'list' | 'grid'>(() => (window.matchMedia('(min-width: 900px)').matches ? 'grid' : 'list'));
  const [stage, setStage] = useState<Stage>('all');
  const [pitches, setPitches] = useState<string[]>([]);
  const [followedOnly, setFollowedOnly] = useState(false);

  const followedTeams = c.followed.map(parseTeamKey);
  const possibleIds = useMemo(() => {
    const s = new Set<string>();
    if (followedOnly)
      for (const f of followedTeams)
        for (const v of possibleGames(c.view, f.name, f.division)) if (v.sides.some((sd) => !sd.team && sd.possible.includes(f.name) && sd.possible.length <= 6)) s.add(v.g.id);
    return s;
  }, [followedOnly, c.view, c.followed.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = c.view.games.filter((v) => v.g.day === day && c.inDiv(v.g.division));
  const dayPitches = [...new Map(all.filter((v) => !v.g.unscheduled && v.g.pitch.label).map((v) => [v.g.pitch.label, v.g.pitch.order])).entries()].sort((a, b) => a[1] - b[1]).map(([l]) => l);
  const games = all.filter((v) => {
    if (v.g.unscheduled) return false;
    if (stage === 'pool' && v.g.stage === 'placement') return false;
    if (stage === 'placement' && v.g.stage !== 'placement') return false;
    if (pitches.length && !pitches.includes(v.g.pitch.label)) return false;
    if (followedOnly && !(isMine(c, v) || possibleIds.has(v.g.id))) return false;
    return true;
  });
  const unscheduled = c.view.games.filter((v) => v.g.unscheduled && c.inDiv(v.g.division));
  const timing = c.t.timing.find((t) => t.day === day);
  const context = c.division
    ? `${c.division} · ${plural(c.t.teams.filter((t) => t.division === c.division).length, 'team')} · ${plural(dayPitches.length, 'pitch', 'pitches')}${dayPitches.length > 1 ? ` (P${dayPitches[0]}–P${dayPitches[dayPitches.length - 1]})` : ''}${timing ? ` · ${timing.gameMins} min games${timing.capMins ? `, cap at ${timing.gameMins - timing.capMins}` : ''}` : ''}`
    : undefined;
  const followedNames = followedTeams.map((f) => withoutTag(f.name));

  return (
    <>
      <PageHead title="Schedule" right={<Seg className="compact" label="View" value={mode} options={[{ value: 'list', label: 'List' }, { value: 'grid', label: 'Grid' }]} onChange={setMode} />} />
      <div className="sched-controls">
        {days.length > 1 && <Seg label="Day" value={day ?? ''} options={days.map((d) => ({ value: d.name, label: d.name }))} onChange={setDay} className="day-seg" />}
        <div className="filters">
          {c.followed.length > 0 && (
            <button className={`chip${followedOnly ? ' on' : ''}`} onClick={() => setFollowedOnly(!followedOnly)} aria-pressed={followedOnly}>
              <IStar size={14} filled={followedOnly} /> {followedOnly ? 'Followed only' : 'Followed'}
            </button>
          )}
          <button className={`chip${pitches.length ? ' accent' : ''}`} onClick={() => overlay.openSheet(<PitchPicker all={dayPitches} games={all} selected={pitches} onChange={setPitches} />, { title: 'Pitches' })}>
            {pitches.length ? `Pitches: ${pitches.slice(0, 3).map((p) => `P${p}`).join(', ')}${pitches.length > 3 ? '…' : ''}` : 'All pitches'} ▾
          </button>
          <select className={`chip${stage !== 'all' ? ' accent' : ''}`} value={stage} onChange={(e) => setStage(e.target.value as Stage)} aria-label="Stage">
            <option value="all">Stage</option>
            <option value="pool">Pools</option>
            <option value="placement">Finals & placings</option>
          </select>
        </div>
      </div>
      {followedOnly ? (
        <p className="context">
          Showing games for <b>{followedNames.join(' and ')}</b>, including ones they <i>might</i> play.
        </p>
      ) : (
        context && <p className="context">{context}</p>
      )}
      {!games.length ? (
        <Empty title={all.length ? 'Nothing matches these filters' : 'No games this day'} body={all.length ? undefined : 'Pick another day above.'}>
          {all.length > 0 && (
            <button className="link-btn" onClick={() => (setPitches([]), setStage('all'), setFollowedOnly(false))}>
              Clear filters
            </button>
          )}
        </Empty>
      ) : followedOnly ? (
        <FollowedList games={games} possibleIds={possibleIds} />
      ) : mode === 'list' ? (
        <ListView games={games} compact={games.length > 60} />
      ) : (
        <GridView games={games} pitches={pitches.length ? pitches : dayPitches} />
      )}
      {unscheduled.length > 0 && (
        <details className="unsched">
          <summary>
            <span className="tag dashed sm">Unscheduled</span> {plural(unscheduled.length, 'row')} with no pitch or day
          </summary>
          <div className="card list">
            {unscheduled.map((v) => (
              <SchedRow key={v.g.id} v={v} />
            ))}
          </div>
        </details>
      )}
    </>
  );
}

/** One schedule line: pitch, "Leeds 1 15–8 St Andrews 1", pool on the right. */
function SchedRow({ v, onOpen }: { v: GameView; onOpen?: () => void }) {
  const c = useT();
  const w = winnerSide(v);
  if (v.g.isBye) {
    const team = v.sides[0].team ?? v.sides[1].team;
    return (
      <div className="srow bye">
        <span className="pb muted-pb">–</span>
        <span className="srow-main">
          {team ? withoutTag(team) : ''} <span className="muted">· bye</span>
        </span>
        <span className="srow-meta">{v.g.pool ?? ''}</span>
      </div>
    );
  }
  const name = (i: 0 | 1) => {
    const s = v.sides[i];
    const strong = w === i || (s.team && c.isFollowed(s.team, v.g.division));
    return <span className={`${strong ? 'strong' : ''}${s.team ? '' : ' slot-label'}`}>{s.team ? withoutTag(s.team) : s.label ?? 'TBC'}</span>;
  };
  const score = v.result && v.result.sa !== undefined ? `${scoreText(v, 0)}–${scoreText(v, 1)}` : undefined;
  const meta = v.g.pool ? (v.g.pool.length <= 3 ? v.g.pool : 'Pool') : stageText(v);
  const cls = ['srow', isMine(c, v) ? 'mine-row' : '', v.hypothetical ? 'hyp' : '', v.simulated ? 'simrow' : '', v.status === 'notPlayed' ? 'np' : '', v.status === 'ifRequired' ? 'ifreq' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls} role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined} onClick={onOpen} onKeyDown={(e) => onOpen && e.key === 'Enter' && onOpen()}>
      <PitchBadge label={v.g.pitch.label} />
      <span className="srow-main">
        {name(0)}
        {score ? <b className="d srow-score"> {score} </b> : <span className="muted"> v </span>}
        {name(1)}
      </span>
      {v.status === 'live' || v.status === 'ifRequired' || v.hypothetical || v.simulated ? <StatusText v={v} /> : null}
      <span className="srow-meta">{meta}</span>
    </div>
  );
}

function SlotStatus({ vs }: { vs: GameView[] }) {
  const c = useT();
  const live = vs.some((v) => v.status === 'live' || v.status === 'finishing');
  const allFinal = vs.every((v) => v.status === 'final' || v.g.isBye);
  const capMins = vs[0].g.capMins;
  if (live)
    return (
      <>
        <span className="now-badge">NOW</span>
        <span className="slot-line live" />
        {capMins ? <span className="slot-status">Cap {timeOf(vs[0].g.end - capMins * 60000, c.t.timeZone)}</span> : null}
      </>
    );
  return (
    <>
      <span className="slot-line" />
      <span className="slot-status">{allFinal ? 'Final' : vs.some((v) => v.status === 'awaiting') ? 'Awaiting results' : ''}</span>
    </>
  );
}

function ListView({ games, compact }: { games: GameView[]; compact: boolean }) {
  const c = useT();
  const open = useOpenGame();
  const nowRef = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const slots = new Map<number, GameView[]>();
  for (const v of games) slots.set(v.g.start, [...(slots.get(v.g.start) ?? []), v]);
  const entries = [...slots.entries()].sort((a, b) => a[0] - b[0]);
  const nowIdx = entries.findIndex(([, vs]) => Math.max(...vs.map((v) => v.g.end)) > c.view.clock);
  useEffect(() => {
    if (nowIdx > 0) nowRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="sched-list">
      {entries.map(([start, vs], i) => {
        const sorted = [...vs].sort((a, b) => Number(isMine(c, b)) - Number(isMine(c, a)) || a.g.pitch.order - b.g.pitch.order);
        const limit = compact && !expanded.has(start) ? 3 : sorted.length;
        const pools = [...new Set(vs.map((v) => v.g.pool ?? '').filter(Boolean))].sort((a, b) => a.localeCompare(b));
        const sub =
          pools.length === 1 && vs.every((v) => v.g.pool) ? (pools[0].length <= 3 ? `Pool ${pools[0]}` : pools[0]) : vs.every((v) => v.g.stage === 'placement') ? 'Placement' : pools.length > 1 && pools.every((p) => p.length <= 3) ? `Pools ${pools[0]}–${pools[pools.length - 1]}` : '';
        return (
          <section key={start} className="sslot" ref={i === nowIdx ? nowRef : undefined}>
            <div className="sslot-head">
              <span className="d sslot-time">{timeOf(start, c.t.timeZone)}</span>
              {sub && <span className="sslot-sub">{sub}</span>}
              <SlotStatus vs={vs} />
            </div>
            <div className="card list">
              {sorted.slice(0, limit).map((v) => (
                <SchedRow key={v.g.id} v={v} onOpen={() => open(v.g.id)} />
              ))}
              {limit < sorted.length && (
                <button className="more-link" onClick={() => setExpanded(new Set([...expanded, start]))}>
                  {plural(sorted.length - limit, 'more game')}
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** "Followed only": a card per game, confirmed (the team is known to play) or possible (depending on results). */
function FollowedList({ games, possibleIds }: { games: GameView[]; possibleIds: Set<string> }) {
  const c = useT();
  const open = useOpenGame();
  return (
    <div className="sched-list">
      {[...games]
        .sort((a, b) => a.g.start - b.g.start)
        .map((v) => {
          const confirmed = isMine(c, v) && !possibleIds.has(v.g.id);
          return (
            <section key={v.g.id} className="sslot">
              <div className="sslot-head">
                <span className="d sslot-time">{timeOf(v.g.start, c.t.timeZone)}</span>
                <span className="sslot-sub">{stageText(v)}</span>
                <span className="slot-line" />
                <span className={`slot-status${confirmed ? ' ok' : ''}`}>{v.status === 'final' ? 'Final' : confirmed ? 'Confirmed' : 'Possible'}</span>
              </div>
              <div className={`fcard${confirmed ? ' card' : ' possible'}`} role="button" tabIndex={0} onClick={() => open(v.g.id)}>
                <PitchBadge label={v.g.pitch.label} />
                <div className="fcard-teams">
                  {([0, 1] as const).map((i) => (
                    <Side key={i} side={v.sides[i]} division={v.g.division} plain bold={!!v.sides[i].team && c.isFollowed(v.sides[i].team, v.g.division)} />
                  ))}
                </div>
                {v.result?.sa !== undefined && (
                  <b className="d srow-score">
                    {scoreText(v, 0)}–{scoreText(v, 1)}
                  </b>
                )}
              </div>
            </section>
          );
        })}
    </div>
  );
}

/** Pitches × times, mirroring the sheet. */
function GridView({ games, pitches }: { games: GameView[]; pitches: string[] }) {
  const c = useT();
  const open = useOpenGame();
  const times = [...new Set(games.map((v) => v.g.start))].sort((a, b) => a - b);
  const cell = new Map(games.map((v) => [`${v.g.start}|${v.g.pitch.label}`, v]));
  return (
    <div className="grid-wrap">
      <table className="sgrid">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Time</span>
            </th>
            {pitches.map((p) => (
              <th key={p} scope="col">
                <PitchBadge label={p} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {times.map((t) => {
            const isNow = games.some((v) => v.g.start === t && (v.status === 'live' || v.status === 'finishing'));
            return (
              <tr key={t}>
                <th scope="row" className={`d gtime-h${isNow ? ' now' : ''}`}>
                  {timeOf(t, c.t.timeZone)}
                  {isNow && <span className="now-mini">NOW</span>}
                </th>
                {pitches.map((p) => {
                  const v = cell.get(`${t}|${p}`);
                  if (!v)
                    return (
                      <td key={p}>
                        <div className="gcell free" aria-label="free" />
                      </td>
                    );
                  const w = winnerSide(v);
                  return (
                    <td key={p}>
                      <button className={`gcell${isMine(c, v) ? ' mine' : ''}${v.hypothetical ? ' hyp' : ''}${v.status === 'live' ? ' live' : ''}${v.status === 'final' ? ' final' : ''}`} onClick={() => open(v.g.id)}>
                        {v.status === 'live' && (
                          <span className="gcell-live">
                            <i className="li" /> LIVE
                          </span>
                        )}
                        {v.g.isBye ? (
                          <span className="muted">{withoutTag(v.sides[0].team ?? v.sides[1].team ?? '')} · bye</span>
                        ) : (
                          ([0, 1] as const).map((i) => (
                            <span key={i} className={`gcell-side${w === i ? ' won' : w !== undefined ? ' lost' : ''}`}>
                              <Side side={v.sides[i]} division={v.g.division} plain short size={8} inline bold={w === i || (!!v.sides[i].team && c.isFollowed(v.sides[i].team, v.g.division))} />
                              <b className="d">{scoreText(v, i)}</b>
                            </span>
                          ))
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Pitch filter as a searchable list (SpecOutdoorComponents). */
function PitchPicker({ all, games, selected, onChange }: { all: string[]; games: GameView[]; selected: string[]; onChange: (p: string[]) => void }) {
  const overlay = useOverlay();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(selected);
  const now = games.filter((v) => v.status === 'live' || v.status === 'upcoming');
  const label = (p: string) => {
    const v = now.find((x) => x.g.pitch.label === p) ?? games.find((x) => x.g.pitch.label === p);
    if (!v) return 'free';
    return `${v.g.division ? `${v.g.division} · ` : ''}${v.sides[0].team ? withoutTag(v.sides[0].team) : v.sides[0].label ?? ''} v ${v.sides[1].team ? withoutTag(v.sides[1].team) : v.sides[1].label ?? ''}`;
  };
  const shown = all.filter((p) => !q || `p${p} ${p} ${label(p)}`.toLowerCase().includes(q.toLowerCase().trim()));
  return (
    <div className="stack pitch-picker">
      <label className="search-field">
        <ISearch size={18} />
        <input placeholder="Pitch number or team" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a pitch" />
      </label>
      <div className="card list">
        {shown.map((p) => (
          <label key={p} className="pp-row">
            <input type="checkbox" checked={sel.includes(p)} onChange={() => setSel(sel.includes(p) ? sel.filter((x) => x !== p) : [...sel, p])} />
            <PitchBadge label={p} />
            <span className="pp-label">{label(p)}</span>
          </label>
        ))}
      </div>
      <div className="row-btns">
        <button className="btn grow" onClick={() => setSel([])}>
          Clear
        </button>
        <button
          className="btn grow ink"
          onClick={() => {
            onChange(sel);
            overlay.closeSheet();
          }}
        >
          {sel.length ? `Show ${plural(sel.length, 'pitch', 'pitches')}` : 'Show all pitches'}
        </button>
      </div>
    </div>
  );
}
