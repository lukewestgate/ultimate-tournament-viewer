import { GameCard, GameRow, resultFor, stageLabel } from '../components/game';
import { Badges, Dot, Live, Pitch, Possible, Section, WL } from '../components/ui';
import { placeBadges, ord } from '../engine/bracket';
import { clubColor } from '../engine/clubs';
import { mayPlay, sideTeam, teamSide, type RGame } from '../engine/resolve';
import { nowBoard } from '../engine/status';
import { formatClock, shortDay, untilText } from '../engine/time';
import { useApp } from '../state/app';
import { href } from '../state/router';

export function NowView() {
  const { r, now, t, feed } = useApp();
  if (!t.games.length) {
    return (
      <main className="page">
        {feed.loading || !feed.lastOk ? <Skeleton /> : <div className="card empty"><b>No games found</b><span>The schedule couldn’t be read.</span></div>}
      </main>
    );
  }
  const b = nowBoard(r, now);
  return (
    <main className="page">
      <MyTeamCard />
      {b.phase === 'before' && <BeforeCard start={r.games[0].game.start} />}
      {b.phase === 'after' && <FinalStandings />}
      {b.phase === 'between' && b.nextStart && (
        <div className="card empty">
          <b>Next games {untilText(b.nextStart - now)}</b>
          <span>
            {shortDay(b.upNext[0].game.day)} {b.upNext[0].game.time} · check the schedule or brackets to see who could play.
          </span>
        </div>
      )}

      {/* Mobile layout */}
      <div className="mobile-only col" style={{ gap: 28 }}>
        {b.onNow.length > 0 && (
          <Section title="On now" aside={b.slotLabel}>
            {b.onNow.map((rg) => (
              <GameCard key={rg.game.id} rg={rg} />
            ))}
          </Section>
        )}
        {b.upNext.length > 0 && b.phase !== 'after' && (
          <Section
            title="Up next"
            aside={`${b.phase === 'during' ? '' : shortDay(b.upNext[0].game.day) + ' '}${b.upNext[0].game.time}`}
            right={<span className="chip" style={{ height: 28 }}>{untilText(b.upNextAt! - now)}</span>}
          >
            <div className="card list">
              {b.upNext.map((rg) => (
                <GameRow key={rg.game.id} rg={rg} timeCol={false} />
              ))}
            </div>
          </Section>
        )}
        {b.justFinished.length > 0 && (
          <Section title="Just finished" aside={b.justFinishedTime}>
            <div className="card list">
              {b.justFinished.map((rg) => (
                <GameRow key={rg.game.id} rg={rg} timeCol={false} />
              ))}
            </div>
          </Section>
        )}
      </div>

      {/* Desktop "departure board" */}
      <div className="desktop-only col now-desktop" style={{ gap: 28 }}>
        {b.phase !== 'after' && <DepartureBoard onNow={b.onNow} slotLabel={b.slotLabel} />}
        {b.justFinished.length > 0 && (
          <Section title="Just finished" aside={b.justFinishedTime}>
            <div className="board results">
              {b.justFinished.map((rg) => (
                <div key={rg.game.id} className="card list" style={{ borderRadius: 14 }}>
                  <GameRow rg={rg} timeCol={false} />
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </main>
  );
}

function DepartureBoard({ onNow, slotLabel }: { onNow: RGame[]; slotLabel?: string }) {
  const { r, now, cfg, myTeam, openGame, bracket } = useApp();
  const today = r.games.filter((rg) => rg.game.slotEnd > now);
  const day = (onNow[0] ?? today[0])?.game.day;
  const pitches = [...new Set(r.games.filter((rg) => rg.game.day === day).map((rg) => rg.game.pitch))].sort();
  return (
    <>
      <div className="row" style={{ alignItems: 'baseline', gap: 16 }}>
        <h1 style={{ fontSize: 30, fontWeight: 700 }}>{onNow.length ? 'On now' : 'Coming up'}</h1>
        {slotLabel && (
          <span className="d" style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink3)' }}>
            {day?.slice(0, 3)} {slotLabel}
          </span>
        )}
        <span className="grow" />
        <span className="d" style={{ fontSize: 44, fontWeight: 700, lineHeight: 1 }}>
          {formatClock(now, cfg.timeZone)}
        </span>
      </div>
      <div className="board pitches">
        {pitches.map((p) => {
          const live = onNow.find((rg) => rg.game.pitch === p);
          const upcoming = today.filter((rg) => rg.game.pitch === p && rg.game.start > now && rg.game.day === day).slice(0, 2);
          return (
            <section key={p} className="pitchcol">
              <div className="pitchhead">
                <span className="pb">P{p}</span>
                <span className="lbl" style={{ fontSize: 12 }}>
                  Pitch {p}
                </span>
              </div>
              {live ? (
                <GameCard rg={live} big />
              ) : (
                <div className="pitchfree">
                  <b style={{ fontSize: 18, color: 'var(--ink2)' }}>Pitch free</b>
                  {upcoming[0] && <span>Next game {upcoming[0].game.time}</span>}
                </div>
              )}
              {upcoming.map((rg, i) => {
                const mine = !!myTeam && (sideTeam(rg.lo) === myTeam || sideTeam(rg.hi) === myTeam);
                const ms = rg.game.start - now;
                return (
                  <button key={rg.game.id} className={`nextrow ${mine ? 'mine' : ''} ${i > 0 && !mine ? 'later' : ''}`} style={mine ? { borderColor: 'var(--accent)' } : undefined} onClick={() => openGame(rg.game.id)}>
                    <span className="d" style={{ fontSize: 30, fontWeight: 700, width: 70 }}>
                      {rg.game.time}
                    </span>
                    <div className="grow col" style={{ gap: 2, fontSize: 16 }}>
                      {(['lo', 'hi'] as const).map((s) => (
                        <span key={s} className="row ellipsis" style={{ fontWeight: sideTeam(rg[s]) === myTeam ? 700 : 500, fontStyle: sideTeam(rg[s]) ? undefined : 'italic' }}>
                          <Dot team={sideTeam(rg[s])} size="sm" />
                          {sideTeam(rg[s]) ?? rg[s].label}
                        </span>
                      ))}
                    </div>
                    <div className="col" style={{ alignItems: 'flex-end', gap: 4 }}>
                      <span className="cap" style={{ fontSize: 13, color: 'var(--ink2)' }}>
                        {stageLabel(rg, bracket)}
                      </span>
                      {i === 0 && (
                        <span className="cap" style={{ fontSize: 13, fontWeight: 700, color: mine ? 'var(--accent)' : 'var(--ink2)' }}>
                          {untilText(ms)}
                          {mine ? ' · your game' : ''}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
              {!live && !upcoming.length && <span className="muted">No more games today</span>}
            </section>
          );
        })}
      </div>
    </>
  );
}

function MyTeamCard() {
  const { myTeam, r, now, status, bracket, t } = useApp();
  if (!myTeam) {
    return (
      <a className="card empty" href={href('teams')} style={{ textDecoration: 'none' }}>
        <b>Pick your team to see your games first</b>
        <span>Tap here, then the ☆ on your team.</span>
      </a>
    );
  }
  const mine = r.games.filter((rg) => teamSide(rg, myTeam));
  const next = mine.find((rg) => !(rg.real && rg.outcome) && status(rg) !== 'awaiting');
  const last = [...mine].reverse().find((rg) => rg.real && rg.outcome);
  const maybe = !next ? r.games.find((rg) => !rg.outcome && mayPlay(rg, myTeam) && !teamSide(rg, myTeam)) : undefined;
  const color = clubColor(myTeam);
  const finalPlace = [...r.places].find(([, s]) => sideTeam(s) === myTeam && s.settled)?.[0];

  return (
    <a className="card mine hero" href={href('team', myTeam)} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="band" style={{ background: color }} />
      <div className="body">
        <div className="row">
          <Dot team={myTeam} />
          <b style={{ fontSize: 15 }}>{myTeam}</b>
          <span className="grow" />
          <span className="lbl" style={{ color: 'var(--accent)' }}>
            My team
          </span>
        </div>
        {next ? (
          <>
            <div className="lbl">{status(next) === 'upcoming' ? 'Next game' : 'Playing now'} · {stageLabel(next, bracket)}</div>
            <div className="row" style={{ gap: 14 }}>
              <span className="d bigtime">{next.game.time}</span>
              <span className="col" style={{ alignItems: 'center', gap: 2 }}>
                <Pitch n={next.game.pitch} size="xl" />
                <span className="cap" style={{ fontSize: 11 }}>
                  Pitch {next.game.pitch}
                </span>
              </span>
              <span className="grow" />
              {status(next) === 'upcoming' ? (
                <span className="chip accent" style={{ height: 36, fontSize: 14 }}>
                  {next.game.start - now < 60_000 ? 'Starting now' : untilText(next.game.start - now)}
                </span>
              ) : (
                <Live />
              )}
            </div>
            <Opponent rg={next} team={myTeam} />
          </>
        ) : maybe ? (
          <>
            <div className="lbl">Next game depends on results</div>
            <div className="row" style={{ gap: 14 }}>
              <span className="d bigtime" style={{ fontSize: 48 }}>
                {shortDay(maybe.game.day)} {maybe.game.time}
              </span>
            </div>
            <span className="muted" style={{ fontSize: 14 }}>
              Possibly {stageLabel(maybe, bracket)} on Pitch {maybe.game.pitch}. See paths ahead →
            </span>
          </>
        ) : finalPlace ? (
          <div className="row" style={{ gap: 12 }}>
            <span className="d bigtime">{ord(finalPlace)}</span>
            <Badges list={placeBadges(finalPlace, t, bracket)} full />
          </div>
        ) : (
          <span className="muted">No more games scheduled.</span>
        )}
        {last && (
          <div className="row" style={{ paddingTop: 12, borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--ink2)' }}>
            <span className="lbl">Last</span>
            <WL r={resultFor(last, teamSide(last, myTeam)!)} />
            <span>
              <b className="d" style={{ fontSize: 17 }}>
                {teamSide(last, myTeam) === 'lo' ? `${last.game.scoreLo}–${last.game.scoreHi}` : `${last.game.scoreHi}–${last.game.scoreLo}`}
              </b>{' '}
              vs {sideTeam(teamSide(last, myTeam) === 'lo' ? last.hi : last.lo)}
            </span>
          </div>
        )}
      </div>
    </a>
  );
}

function Opponent({ rg, team }: { rg: RGame; team: string }) {
  const side = teamSide(rg, team)!;
  const opp = side === 'lo' ? rg.hi : rg.lo;
  const name = sideTeam(opp);
  return (
    <div className="col" style={{ gap: 2 }}>
      <div className="row" style={{ fontSize: 21, fontWeight: 700 }}>
        <span style={{ color: 'var(--ink3)', fontWeight: 500 }}>vs</span>
        {name ? (
          <>
            <Dot team={name} />
            {name}
          </>
        ) : (
          <span style={{ fontStyle: 'italic' }}>{opp.label}</span>
        )}
      </div>
      {!name && <Possible teams={opp.teams} />}
      <div className="cap" style={{ fontWeight: 500, fontSize: 13 }}>
        {rg.game.code}
      </div>
    </div>
  );
}

function BeforeCard({ start }: { start: number }) {
  const { now, r } = useApp();
  const first = r.games[0].game;
  const pitches = [...new Set(r.games.filter((x) => x.game.start === first.start).map((x) => x.game.pitch))];
  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="lbl">Tournament starts {untilText(start - now)}</span>
      <span className="d" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1 }}>
        {first.day} {first.time}
      </span>
      <span className="muted">Pitch {pitches.join(' & ')}</span>
    </div>
  );
}

export function FinalStandings() {
  const { r, t, bracket } = useApp();
  const n = bracket.maxPos;
  if (!n) return null;
  const places = Array.from({ length: n }, (_, i) => ({ p: i + 1, side: r.places.get(i + 1) }));
  const name = (p: number) => {
    const s = places[p - 1]?.side;
    return s && sideTeam(s);
  };
  return (
    <Section title="Final standings">
      <div className="podium">
        {[2, 1, 3].map((p) => (
          <div key={p} className="card" style={{ minHeight: p === 1 ? 150 : 120, justifyContent: 'flex-end' }}>
            <span className="d" style={{ fontSize: p === 1 ? 44 : 34, fontWeight: 700, lineHeight: 1 }}>
              {ord(p)}
            </span>
            {name(p) ? (
              <b className="row" style={{ fontSize: 14, justifyContent: 'center' }}>
                <Dot team={name(p)} size="sm" />
                {name(p)}
              </b>
            ) : (
              <span className="muted">TBC</span>
            )}
          </div>
        ))}
      </div>
      <div className="card list">
        {places.slice(3).map(({ p, side }) => (
          <div key={p} className="lrow">
            <span className="d" style={{ fontSize: 20, fontWeight: 700, width: 40 }}>
              {ord(p)}
            </span>
            <span className="grow row">
              {side && sideTeam(side) ? (
                <>
                  <Dot team={sideTeam(side)} size="sm" />
                  {sideTeam(side)}
                </>
              ) : (
                <span className="muted" style={{ fontStyle: 'italic' }}>
                  {side?.label ?? 'TBC'}
                </span>
              )}
            </span>
            <Badges list={placeBadges(p, t, bracket)} />
          </div>
        ))}
      </div>
    </Section>
  );
}

function Skeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <span className="sk" style={{ width: 36, height: 30 }} />
            <span className="sk" style={{ width: 80, height: 14 }} />
          </div>
          <span className="sk" style={{ width: '70%', height: 16 }} />
          <span className="sk" style={{ width: '55%', height: 16 }} />
        </div>
      ))}
    </>
  );
}
