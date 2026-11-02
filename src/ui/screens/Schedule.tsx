import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameView } from '../../engine/view';
import { possibleGames } from '../../engine/view';
import { parseTeamKey } from '../../store/settings';
import { useT } from '../ctx';
import { dateLabel, timeOf } from '../fmt';
import { useOverlay } from '../overlay';
import { Empty, GameRow, Seg, Side, scoreText } from '../parts';
import { useOpenGame } from './GameDetail';
import { IStar } from '../icons';
import type { ScreenProps } from './index';

type Stage = 'all' | 'pool' | 'placement';

/** Schedule (spec §9.6): day selector, list with a now marker, or a pitches × times grid. */
export function Schedule(_: ScreenProps) {
  const c = useT();
  const overlay = useOverlay();
  const open = useOpenGame();
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
    if (followedOnly) for (const f of followedTeams) for (const v of possibleGames(c.view, f.name, f.division)) s.add(v.g.id);
    return s;
  }, [followedOnly, c.view, c.followed.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = c.view.games.filter((v) => v.g.day === day && c.inDiv(v.g.division));
  const dayPitches = [...new Map(all.filter((v) => !v.g.unscheduled && v.g.pitch.label).map((v) => [v.g.pitch.label, v.g.pitch.order])).entries()].sort((a, b) => a[1] - b[1]).map(([l]) => l);
  const games = all.filter((v) => {
    if (v.g.unscheduled) return false;
    if (stage === 'pool' && v.g.stage === 'placement') return false;
    if (stage === 'placement' && v.g.stage !== 'placement') return false;
    if (pitches.length && !pitches.includes(v.g.pitch.label)) return false;
    if (followedOnly && !(c.isFollowed(v.sides[0].team, v.g.division) || c.isFollowed(v.sides[1].team, v.g.division) || possibleIds.has(v.g.id))) return false;
    return true;
  });
  const unscheduled = c.view.games.filter((v) => v.g.unscheduled && c.inDiv(v.g.division));
  const pitchFilter = () =>
    overlay.openSheet(<PitchPicker all={dayPitches} selected={pitches} onChange={setPitches} />, { title: 'Pitches' });

  return (
    <>
      <div className="sched-bar">
        {days.length > 1 && (
          <Seg
            label="Day"
            value={day ?? ''}
            options={days.map((d) => ({ value: d.name, label: `${d.name.slice(0, 3)} ${dateLabel(d.date).split(' ').slice(1).join(' ')}` }))}
            onChange={setDay}
          />
        )}
        <Seg label="View" value={mode} options={[{ value: 'list', label: 'List' }, { value: 'grid', label: 'Grid' }]} onChange={setMode} />
      </div>
      <div className="filters">
        {dayPitches.length > 8 ? (
          <button className={`chip${pitches.length ? ' on' : ''}`} onClick={pitchFilter}>
            Pitches: {pitches.length ? pitches.length : 'all'} ▾
          </button>
        ) : (
          dayPitches.length > 1 &&
          dayPitches.map((p) => (
            <button key={p} className={`chip${pitches.includes(p) ? ' on' : ''}`} onClick={() => setPitches(pitches.includes(p) ? pitches.filter((x) => x !== p) : [...pitches, p])} aria-pressed={pitches.includes(p)}>
              P{p}
            </button>
          ))
        )}
        {c.followed.length > 0 && (
          <button className={`chip${followedOnly ? ' on' : ''}`} onClick={() => setFollowedOnly(!followedOnly)} aria-pressed={followedOnly}>
            <IStar size={14} filled={followedOnly} /> Followed
          </button>
        )}
        <select className="chip select" value={stage} onChange={(e) => setStage(e.target.value as Stage)} aria-label="Stage">
          <option value="all">All stages</option>
          <option value="pool">Pools</option>
          <option value="placement">Finals & placings</option>
        </select>
      </div>
      {!games.length ? (
        <Empty title={all.length ? 'Nothing matches these filters' : 'No games this day'} body={all.length ? 'Try clearing a filter.' : undefined}>
          {all.length > 0 && (
            <button className="btn small" onClick={() => (setPitches([]), setStage('all'), setFollowedOnly(false))}>
              Clear filters
            </button>
          )}
        </Empty>
      ) : mode === 'list' ? (
        <ListView games={games} pitches={pitches.length ? pitches : dayPitches} onOpen={open} possibleIds={possibleIds} />
      ) : (
        <GridView games={games} pitches={pitches.length ? pitches : dayPitches} onOpen={open} />
      )}
      {unscheduled.length > 0 && (
        <details className="card pad">
          <summary>
            <b>Unscheduled</b> <span className="muted">{unscheduled.length} rows with no pitch or an unused day</span>
          </summary>
          <div className="list" style={{ marginTop: 10 }}>
            {unscheduled.map((v) => (
              <GameRow key={v.g.id} v={v} showTime showDay />
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function ListView({ games, pitches, onOpen, possibleIds }: { games: GameView[]; pitches: string[]; onOpen: (id: string) => void; possibleIds: Set<string> }) {
  const c = useT();
  const nowRef = useRef<HTMLDivElement>(null);
  const slots = new Map<number, GameView[]>();
  for (const v of games) slots.set(v.g.start, [...(slots.get(v.g.start) ?? []), v]);
  const entries = [...slots.entries()].sort((a, b) => a[0] - b[0]);
  const nowIdx = entries.findIndex(([, vs]) => Math.max(...vs.map((v) => v.g.end)) > c.view.clock);
  useEffect(() => {
    nowRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, []);
  return (
    <div className="stack" style={{ gap: 14 }}>
      {entries.map(([start, vs], i) => {
        const used = new Set(vs.map((v) => v.g.pitch.label));
        const gaps = pitches.length <= 8 ? pitches.filter((p) => !used.has(p)) : [];
        return (
          <section key={start} className="sslot">
            {i === nowIdx && c.view.started && !c.view.ended && (
              <div className="now-marker" ref={nowRef}>
                <span>NOW · {timeOf(c.view.clock, c.t.timeZone)}</span>
              </div>
            )}
            <div className="slot-head">
              <span className="d slot-time">{timeOf(start, c.t.timeZone)}</span>
              <span className="muted small">{vs.length} game{vs.length === 1 ? '' : 's'}</span>
            </div>
            <div className="card list">
              {[...vs].sort((a, b) => a.g.pitch.order - b.g.pitch.order).map((v) => (
                <GameRow key={v.g.id} v={v} onOpen={() => onOpen(v.g.id)} extra={possibleIds.has(v.g.id) ? <span className="tag dashed">possible</span> : undefined} />
              ))}
              {gaps.map((p) => (
                <div key={p} className="grow gap-row" aria-label={`Pitch ${p} free`}>
                  <span className="pb muted-pb">P{p}</span>
                  <span className="muted small">free</span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Pitches × times, mirroring the sheet (useful on desktop). */
function GridView({ games, pitches, onOpen }: { games: GameView[]; pitches: string[]; onOpen: (id: string) => void }) {
  const c = useT();
  const times = [...new Set(games.map((v) => v.g.start))].sort((a, b) => a - b);
  const cell = new Map(games.map((v) => [`${v.g.start}|${v.g.pitch.label}`, v]));
  return (
    <div className="grid-wrap card">
      <table className="sgrid">
        <thead>
          <tr>
            <th scope="col">Time</th>
            {pitches.map((p) => (
              <th key={p} scope="col">
                P{p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {times.map((t) => {
            const isNow = games.some((v) => v.g.start === t && (v.status === 'live' || v.status === 'finishing'));
            return (
              <tr key={t} className={isNow ? 'now' : ''}>
                <th scope="row" className="d">
                  {timeOf(t, c.t.timeZone)}
                </th>
                {pitches.map((p) => {
                  const v = cell.get(`${t}|${p}`);
                  if (!v) return <td key={p} className="free" />;
                  const mine = c.isFollowed(v.sides[0].team, v.g.division) || c.isFollowed(v.sides[1].team, v.g.division);
                  return (
                    <td key={p} className={`${mine ? 'mine' : ''}${v.hypothetical ? ' hyp' : ''}${v.status === 'live' ? ' live' : ''}`}>
                      <button className="gcell" onClick={() => onOpen(v.g.id)}>
                        {([0, 1] as const).map((i) => (
                          <span key={i} className="gcell-side">
                            <Side side={v.sides[i]} division={v.g.division} plain />
                            <b className="d">{scoreText(v, i)}</b>
                          </span>
                        ))}
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

/** Pitch filter as a searchable list (large events). */
function PitchPicker({ all, selected, onChange }: { all: string[]; selected: string[]; onChange: (p: string[]) => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(selected);
  const shown = all.filter((p) => p.toLowerCase().includes(q.toLowerCase().replace(/^p(itch)?\s*/, '')));
  const set = (next: string[]) => {
    setSel(next);
    onChange(next);
  };
  return (
    <div className="stack">
      <input className="field" placeholder="Find a pitch" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a pitch" />
      <div className="row-btns">
        <button className="btn small" onClick={() => set([])}>
          All pitches
        </button>
      </div>
      <div className="pitch-grid">
        {shown.map((p) => (
          <button key={p} className={`chip${sel.includes(p) ? ' on' : ''}`} aria-pressed={sel.includes(p)} onClick={() => set(sel.includes(p) ? sel.filter((x) => x !== p) : [...sel, p])}>
            P{p}
          </button>
        ))}
      </div>
    </div>
  );
}
