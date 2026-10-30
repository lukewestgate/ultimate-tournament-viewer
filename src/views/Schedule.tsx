import { useEffect, useMemo, useRef, useState } from 'react';
import { GameRow, involves, stageLabel } from '../components/game';
import { Icons } from '../components/icons';
import { Dot } from '../components/ui';
import { sideTeam, type RGame } from '../engine/resolve';
import { untilText, zonedDate } from '../engine/time';
import { useApp } from '../state/app';

type StageFilter = 'all' | 'pool' | 'powerPool' | 'placement';

export function ScheduleView() {
  const { r, now, cfg, myTeam, status, setSearchOpen } = useApp();
  const days = useMemo(() => [...new Set(r.games.map((x) => x.game.day))], [r]);
  const today = days.find((d) => r.games.some((x) => x.game.day === d && zonedDate(x.game.start, cfg.timeZone) === zonedDate(now, cfg.timeZone)));
  const [picked, setDay] = useState<string>();
  const day = picked && days.includes(picked) ? picked : (today ?? days.find((d) => r.games.some((x) => x.game.day === d && x.game.slotEnd > now)) ?? days[0]);
  const [view, setView] = useState<'list' | 'grid'>(() => (matchMedia('(min-width: 900px)').matches ? 'grid' : 'list'));
  const [pitch, setPitch] = useState<number>();
  const [stage, setStage] = useState<StageFilter>('all');
  const [mineOnly, setMineOnly] = useState(false);

  const dayGames = r.games.filter((x) => x.game.day === day);
  const pitches = [...new Set(dayGames.map((x) => x.game.pitch))].sort();
  const stages = [...new Set(dayGames.map((x) => x.game.stage))];
  const filtered = dayGames.filter(
    (x) =>
      (pitch === undefined || x.game.pitch === pitch) &&
      (stage === 'all' || x.game.stage === stage) &&
      (!mineOnly || involves(x, myTeam) || (!!myTeam && (x.lo.teams.includes(myTeam) || x.hi.teams.includes(myTeam)))),
  );
  const times = [...new Set(dayGames.map((x) => x.game.time))].sort();

  const nowRef = useRef<HTMLElement>(null);
  useEffect(() => {
    nowRef.current?.scrollIntoView({ block: 'start' });
  }, [day, view]);

  const stageName: Record<StageFilter, string> = { all: 'All stages', pool: 'Pools', powerPool: 'Power pools', placement: 'Brackets' };

  return (
    <main className="page" style={{ gap: 18 }}>
      <div className="sticky-sub">
        <div className="page-head">
          <h1>Schedule</h1>
          <div className="seg" role="group" aria-label="View" style={{ padding: 3, gap: 2 }}>
            <button aria-pressed={view === 'list'} aria-label="List view" onClick={() => setView('list')} style={{ width: 40, padding: 0 }}>
              {Icons.list}
            </button>
            <button aria-pressed={view === 'grid'} aria-label="Grid view" onClick={() => setView('grid')} style={{ width: 40, padding: 0 }}>
              {Icons.grid}
            </button>
          </div>
          <button className="ib mobile-only" aria-label="Search" onClick={() => setSearchOpen(true)}>
            {Icons.search}
          </button>
        </div>
        <div className="seg" role="tablist">
          {days.map((d) => (
            <button key={d} role="tab" aria-selected={d === day} onClick={() => setDay(d)}>
              {d}
            </button>
          ))}
        </div>
        <div className="chips">
          <button className={`chip ${pitch === undefined ? 'on' : ''}`} onClick={() => setPitch(undefined)}>
            All pitches
          </button>
          {pitches.map((p) => (
            <button key={p} className={`chip ${pitch === p ? 'on' : ''}`} onClick={() => setPitch(pitch === p ? undefined : p)}>
              P{p}
            </button>
          ))}
          {stages.length > 1 && (
            <button
              className={`chip ${stage !== 'all' ? 'on' : ''}`}
              onClick={() => {
                const order: StageFilter[] = ['all', ...(stages as StageFilter[])];
                setStage(order[(order.indexOf(stage) + 1) % order.length]);
              }}
            >
              {stageName[stage]}
            </button>
          )}
          {myTeam && (
            <button className={`chip ${mineOnly ? 'on' : ''}`} onClick={() => setMineOnly(!mineOnly)}>
              <Dot team={myTeam} size="sm" />
              {myTeam}
            </button>
          )}
        </div>
      </div>

      {view === 'list' ? (
        times.map((time) => {
          const slot = filtered.filter((x) => x.game.time === time);
          const all = dayGames.filter((x) => x.game.time === time);
          if (!slot.length) return null;
          const g0 = all[0].game;
          const isNow = g0.start <= now && now < g0.slotEnd;
          const allFinal = all.every((x) => status(x) === 'final');
          const note = allFinal ? 'Final' : isNow ? (now < g0.end ? `${Math.ceil((g0.end - now) / 60_000)} min left` : 'Finishing') : g0.start > now && g0.start - now < 3 * 3600_000 ? untilText(g0.start - now) : '';
          const nextUp = !isNow && g0.start > now && !dayGames.some((x) => x.game.start > now && x.game.start < g0.start);
          const showFree = pitch === undefined && stage === 'all' && !mineOnly;
          return (
            <section key={time} className="slot" ref={isNow || (nextUp && !dayGames.some((x) => x.game.start <= now && now < x.game.slotEnd)) ? nowRef : undefined}>
              <div className="slot-head">
                <span className="d" style={{ color: allFinal ? 'var(--ink3)' : undefined }}>
                  {time}
                </span>
                {isNow && <span className="nowtag">NOW</span>}
                <span className="rule" style={{ background: isNow ? 'var(--live)' : undefined }} />
                <span className="cap">{note}</span>
              </div>
              <div className="card list">
                {(showFree ? pitches : [...new Set(slot.map((x) => x.game.pitch))]).map((p) => {
                  const games = slot.filter((x) => x.game.pitch === p);
                  if (!games.length)
                    return (
                      <div key={p} className="lrow" style={{ color: 'var(--ink3)', fontSize: 13, padding: '8px 14px', minHeight: 0 }}>
                        <span className="pb free">P{p}</span>No game
                      </div>
                    );
                  return games.map((rg) => <GameRow key={rg.game.id} rg={rg} timeCol={false} />);
                })}
              </div>
            </section>
          );
        })
      ) : (
        <Grid games={filtered} times={times} pitches={pitch === undefined ? pitches : [pitch]} nowRef={nowRef} />
      )}
      {!filtered.length && (
        <div className="card empty">
          <b>No games match</b>
          <span>Try another pitch or clear filters.</span>
        </div>
      )}
    </main>
  );
}

function Grid({ games, times, pitches, nowRef }: { games: RGame[]; times: string[]; pitches: number[]; nowRef: React.RefObject<HTMLElement | null> }) {
  const { now, myTeam, openGame, bracket, status } = useApp();
  return (
    <div className="grid-sched card" style={{ padding: 6 }}>
      <table>
        <thead>
          <tr>
            <th />
            {pitches.map((p) => (
              <th key={p}>Pitch {p}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {times.map((time) => {
            const row = games.filter((x) => x.game.time === time);
            if (!row.length) return null;
            const g0 = row[0].game;
            const isNow = g0.start <= now && now < g0.slotEnd;
            return (
              <tr key={time} className={isNow ? 'nowrow' : ''} ref={isNow ? (nowRef as React.RefObject<HTMLTableRowElement>) : undefined}>
                <td className="t">{time}</td>
                {pitches.map((p) => {
                  const rg = row.find((x) => x.game.pitch === p);
                  if (!rg) return <td key={p} />;
                  const st = status(rg);
                  const mine = involves(rg, myTeam);
                  return (
                    <td key={p}>
                      <button className={mine ? 'mine' : ''} onClick={() => openGame(rg.game.id)} style={st === 'live' ? { borderColor: 'var(--live)' } : undefined}>
                        {(['lo', 'hi'] as const).map((s) => {
                          const tm = sideTeam(rg[s]);
                          const sc = s === 'lo' ? rg.game.scoreLo : rg.game.scoreHi;
                          return (
                            <span key={s} className="row ellipsis" style={{ gap: 6, fontStyle: tm ? undefined : 'italic', color: tm ? undefined : 'var(--ink2)', fontWeight: rg.outcome === s ? 700 : 500 }}>
                              <Dot team={tm} size="xs" />
                              <span className="grow ellipsis">{tm ?? rg[s].label}</span>
                              {sc !== undefined && <b className="d">{sc}</b>}
                            </span>
                          );
                        })}
                        <span className="cap" style={{ fontSize: 11 }}>
                          {stageLabel(rg, bracket)}
                        </span>
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
