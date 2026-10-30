import { useEffect } from 'react';
import { resultFor, stageLabel } from '../components/game';
import { Icons } from '../components/icons';
import { Badges, Dot, Live, Pitch, Possible, WL } from '../components/ui';
import { gameBadges } from '../engine/bracket';
import { sideTeam, type RGame } from '../engine/resolve';
import { formatClock } from '../engine/time';
import { useApp } from '../state/app';
import { href } from '../state/router';

export function GameSheet() {
  const { gameSheet, openGame, r } = useApp();
  const rg = gameSheet ? r.byId.get(gameSheet) : undefined;
  useEffect(() => {
    if (!rg) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openGame(undefined);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rg, openGame]);
  if (!rg) return null;
  return (
    <div className="scrim" onClick={() => openGame(undefined)}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`Game ${rg.game.code}`} onClick={(e) => e.stopPropagation()}>
        <span className="grabber" />
        <Body rg={rg} />
      </div>
    </div>
  );
}

function Body({ rg }: { rg: RGame }) {
  const { status, bracket, openGame, now, cfg, t, r, whatIf, pick } = useApp();
  const g = rg.game;
  const st = status(rg);
  const isPlacement = g.stage === 'placement';
  const [w, l] = isPlacement ? bracket.pos(g) : [0, 0];
  const nextW = isPlacement ? bracket.next(w, g.ordinal) : undefined;
  const nextL = isPlacement ? bracket.next(l, g.ordinal) : undefined;
  const a = sideTeam(rg.lo);
  const b = sideTeam(rg.hi);
  const h2h = a && b ? r.games.filter((x) => x.game.id !== g.id && x.game.start < g.start && x.real && [sideTeam(x.lo), sideTeam(x.hi)].sort().join('|') === [a, b].sort().join('|')) : [];
  const mins = Math.round((g.end - g.start) / 60_000);

  const side = (s: 'lo' | 'hi') => {
    const x = rg[s];
    const team = sideTeam(x);
    const res = resultFor(rg, s);
    const score = s === 'lo' ? g.scoreLo : g.scoreHi;
    return (
      <div className="row" style={{ gap: 12, minHeight: 52 }}>
        {team ? <Dot team={team} /> : <span className="dot hollow" />}
        <div className="grow col" style={{ gap: 2 }}>
          {team ? (
            <a href={href('team', team)} onClick={() => openGame(undefined)} style={{ fontSize: 22, fontWeight: res === 'W' ? 800 : 600, color: res === 'L' ? 'var(--ink3)' : 'inherit', textDecoration: 'none' }}>
              {team}
            </a>
          ) : (
            <>
              <span style={{ fontSize: 20, fontStyle: 'italic', color: 'var(--ink2)' }}>{x.label}</span>
              <Possible teams={x.teams} max={4} />
            </>
          )}
        </div>
        {rg.real && <WL r={res} />}
        {!rg.real && rg.outcome === s && <span className="badge IF">IF</span>}
        <span className="d" style={{ fontSize: 44, fontWeight: 700, lineHeight: 1 }}>
          {score ?? ''}
        </span>
      </div>
    );
  };

  return (
    <>
      <div className="row" style={{ gap: 10 }}>
        <Pitch n={g.pitch} size="xl" />
        <div className="grow col">
          <b style={{ fontSize: 17 }}>{stageLabel(rg, bracket)}</b>
          <span className="muted" style={{ fontSize: 13 }}>
            {g.day} {g.time}–{formatClock(g.end, cfg.timeZone)} · Pitch {g.pitch} · {g.code}
          </span>
        </div>
        <button className="ib" aria-label="Close" onClick={() => openGame(undefined)}>
          {Icons.close}
        </button>
      </div>
      <div className="row">
        {st === 'live' ? (
          <>
            <Live />
            <span className="cap">{Math.max(0, Math.ceil((g.end - now) / 60_000))} min left of {mins}</span>
          </>
        ) : (
          <span className="lbl">
            {st === 'final' ? 'Final' : st === 'finishing' ? 'Finishing' : st === 'awaiting' ? 'Awaiting result' : 'Upcoming'}
          </span>
        )}
        {isPlacement && bracket.reach(g).length <= 2 && <Badges list={gameBadges(g, t, bracket)} full />}
      </div>
      <div className="card" style={{ padding: '6px 16px' }}>
        {side('lo')}
        <div style={{ borderTop: '1px solid var(--line)' }} />
        {side('hi')}
      </div>

      {whatIf && !rg.real && (rg.lo.teams.length > 0 || rg.hi.teams.length > 0) && (
        <div className="col" style={{ gap: 8 }}>
          <span className="lbl">What if…</span>
          <div className="seg">
            {(['lo', ...(isPlacement ? [] : ['draw']), 'hi'] as const).map((o) => (
              <button key={o} aria-pressed={rg.outcome === o} onClick={() => pick(g.id, rg.outcome === o ? undefined : (o as 'lo' | 'hi' | 'draw'))}>
                {o === 'draw' ? 'Draw' : `${sideTeam(rg[o as 'lo' | 'hi']) ?? rg[o as 'lo' | 'hi'].label} win`}
              </button>
            ))}
          </div>
        </div>
      )}

      {isPlacement && (nextW || nextL) && (
        <div className="col" style={{ gap: 8 }}>
          <span className="lbl">What’s at stake</span>
          <div className="card list">
            {[
              { lab: 'Winner', n: nextW, pos: w },
              { lab: 'Loser', n: nextL, pos: l },
            ].map(({ lab, n, pos }) => (
              <button key={lab} className="lrow" onClick={() => n && openGame(n.id)} disabled={!n}>
                <span className={`wl ${lab === 'Winner' ? 'W' : 'L'} wide`}>{lab === 'Winner' ? 'Win' : 'Lose'}</span>
                <span className="grow">
                  {n ? (
                    <>
                      <b>{bracket.name(n)}</b>{' '}
                      <span className="muted">
                        {n.time} · P{n.pitch}
                      </span>
                    </>
                  ) : (
                    <b>Finish {ordinal(pos)}</b>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!isPlacement && g.pool && (
        <a className="btn" href={href('pools')} onClick={() => openGame(undefined)}>
          See {g.stage === 'powerPool' ? 'power pool' : 'pool'} {g.pool} table
        </a>
      )}

      {h2h.length > 0 && (
        <div className="col" style={{ gap: 8 }}>
          <span className="lbl">Earlier this weekend</span>
          <div className="card list">
            {h2h.map((x) => (
              <div key={x.game.id} className="lrow">
                <span className="d" style={{ fontSize: 17, fontWeight: 700, width: 70, color: 'var(--ink3)' }}>
                  {x.game.day.slice(0, 3)} {x.game.time}
                </span>
                <span className="grow">
                  {sideTeam(x.lo)} <b className="d" style={{ fontSize: 17 }}>{x.game.scoreLo}–{x.game.scoreHi}</b> {sideTeam(x.hi)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
