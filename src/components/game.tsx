import type { BracketModel } from '../engine/bracket';
import { sideTeam, type RGame, type Side } from '../engine/resolve';
import type { Status } from '../engine/status';
import { shortDay, untilText } from '../engine/time';
import { useApp } from '../state/app';
import { Dot, Live, Pitch, Possible, WL } from './ui';
import { Icons } from './icons';

export function stageLabel(rg: RGame, b: BracketModel): string {
  const g = rg.game;
  if (g.stage === 'pool') return `Pool ${g.pool}`;
  if (g.stage === 'powerPool') return `Power pool ${g.pool}`;
  return b.name(g);
}

export function resultFor(rg: RGame, side: 'lo' | 'hi'): 'W' | 'L' | 'D' | undefined {
  if (!rg.outcome) return undefined;
  if (rg.outcome === 'draw') return 'D';
  return rg.outcome === side ? 'W' : 'L';
}

export function involves(rg: RGame, team?: string) {
  return !!team && (sideTeam(rg.lo) === team || sideTeam(rg.hi) === team);
}

/** One team line inside a full game card. */
function TeamLine({ rg, side, score, flash }: { rg: RGame; side: 'lo' | 'hi'; score?: number; flash: boolean }) {
  const { myTeam } = useApp();
  const s: Side = rg[side];
  const team = sideTeam(s);
  const res = resultFor(rg, side);
  if (!team) {
    return (
      <div className="side-pending">
        <span className="dot hollow" />
        <div className="col" style={{ gap: 3 }}>
          <span className="lab" style={{ fontSize: 16 }}>
            {s.label}
          </span>
          <Possible teams={s.teams} />
        </div>
      </div>
    );
  }
  const weight = res === 'W' ? 700 : res === 'D' ? 600 : res === 'L' ? 500 : team === myTeam ? 700 : 500;
  return (
    <div className={`tr ${res === 'L' ? 'loser' : ''}`}>
      <Dot team={team} />
      <span className="nm ellipsis" style={{ fontWeight: weight }}>
        {team}
      </span>
      {team === myTeam && <span style={{ color: 'var(--accent)' }}>{Icons.star}</span>}
      {!rg.real && rg.outcome && res === 'W' && <span className="cap" style={{ color: 'var(--whatif)' }}>picked W</span>}
      {rg.real && (res === 'W' || res === 'D') && <WL r={res} />}
      {score !== undefined && <span className={`sc ${flash ? 'flash' : ''}`}>{score}</span>}
    </div>
  );
}

function StatusTag({ rg, st }: { rg: RGame; st: Status }) {
  const { now, myTeam } = useApp();
  const mine = involves(rg, myTeam);
  if (!rg.real && rg.outcome) return <span className="badge IF">IF</span>;
  if (st === 'live') return <Live />;
  if (st === 'finishing') return <span className="lbl" style={{ color: 'var(--ink2)' }}>Finishing</span>;
  if (st === 'awaiting') return <span className="lbl">Awaiting result</span>;
  if (st === 'final') return <span className="lbl">{rg.outcome === 'draw' ? 'Final · Draw' : 'Final'}</span>;
  const ms = rg.game.start - now;
  if (mine && ms < 3 * 3600_000) return <span className="lbl" style={{ color: 'var(--accent)' }}>Your game</span>;
  if (ms < 2 * 3600_000) return <span className={`chip ${ms < 5 * 60_000 ? 'soon' : ''}`} style={{ height: 26, fontSize: 12 }}>{ms < 60_000 ? 'Starting now' : untilText(ms)}</span>;
  return null;
}

export function GameCard({ rg, showTime, big }: { rg: RGame; showTime?: boolean; big?: boolean }) {
  const { status, bracket, myTeam, openGame, flash, now } = useApp();
  const g = rg.game;
  const st = status(rg);
  const hyp = !rg.real && !!rg.outcome;
  const mine = involves(rg, myTeam);
  const mins = Math.round((g.end - g.start) / 60_000);
  const elapsed = Math.min(mins, Math.max(0, Math.floor((now - g.start) / 60_000)));
  const showScore = rg.real || g.scoreLo !== undefined;
  const f = flash.has(g.id);
  return (
    <button className={`card gc ${mine ? 'mine' : ''} ${hyp ? 'hyp' : ''}`} onClick={() => openGame(g.id)}>
      <div className="top">
        <Pitch n={g.pitch} />
        <span className="stg">{stageLabel(rg, bracket)}</span>
        <span className="grow" />
        <StatusTag rg={rg} st={st} />
      </div>
      {showTime && st === 'upcoming' && (
        <div className="d" style={{ fontSize: big ? 34 : 28, fontWeight: 700, lineHeight: 1 }}>
          {g.stage === 'placement' ? `${shortDay(g.day)} ${g.time}` : g.time}
        </div>
      )}
      <div className="col" style={{ gap: 2 }}>
        <TeamLine rg={rg} side="lo" score={showScore ? g.scoreLo : undefined} flash={f} />
        <TeamLine rg={rg} side="hi" score={showScore ? g.scoreHi : undefined} flash={f} />
      </div>
      {st === 'live' && (
        <div className="top">
          <div className="track grow">
            <b style={{ width: `${(elapsed / mins) * 100}%` }} />
          </div>
          <span className="cap" style={{ color: 'var(--ink2)' }}>
            {mins - elapsed} min left
          </span>
          <span className="code">{g.code}</span>
        </div>
      )}
      {(st === 'finishing' || st === 'awaiting') && (
        <div className="top">
          <div className="track grow">
            <b style={{ width: '100%', background: 'var(--ink3)' }} />
          </div>
          <span className="cap">Awaiting result</span>
        </div>
      )}
      {(st === 'upcoming' || st === 'final') && <div className="code">{mine && !showTime ? `${g.time} · ${g.code}` : g.code}</div>}
    </button>
  );
}

/** Compact list row (Schedule, Team, Search). */
export function GameRow({ rg, timeCol = true, meta }: { rg: RGame; timeCol?: boolean; meta?: string }) {
  const { status, bracket, myTeam, openGame, flash } = useApp();
  const g = rg.game;
  const st = status(rg);
  const mine = involves(rg, myTeam);
  const hyp = !rg.real && !!rg.outcome;
  const f = flash.has(g.id);
  const line = (side: 'lo' | 'hi', score?: number) => {
    const s = rg[side];
    const team = sideTeam(s);
    const res = resultFor(rg, side);
    if (!team)
      return (
        <span>
          <span className="dot sm hollow" />
          <span className="ellipsis" style={{ fontStyle: 'italic', color: 'var(--ink2)' }}>
            {s.label}
            {s.teams.length > 0 && s.teams.length <= 2 && <span className="muted" style={{ fontStyle: 'normal' }}> · {s.teams.join(' or ')}</span>}
          </span>
        </span>
      );
    return (
      <span style={{ fontWeight: res === 'W' || (team === myTeam && !res) ? 700 : 500, color: res === 'L' ? 'var(--ink3)' : team === myTeam && !res ? 'var(--accent)' : undefined }}>
        <Dot team={team} size="sm" />
        <span className="grow ellipsis">{team}</span>
        {score !== undefined && <span className={`d sc ${f ? 'flash' : ''}`}>{score}</span>}
      </span>
    );
  };
  return (
    <button className={`lrow ${mine ? 'mine-row' : ''} ${hyp ? 'hyp-row' : ''}`} onClick={() => openGame(g.id)}>
      {timeCol &&
        (st === 'live' ? (
          <span style={{ width: 46 }}>
            <Live />
          </span>
        ) : (
          <span className="d" style={{ fontSize: 20, fontWeight: 700, width: 46, color: st === 'final' || st === 'awaiting' ? 'var(--ink3)' : undefined }}>
            {g.time}
          </span>
        ))}
      <Pitch n={g.pitch} />
      <div className="teams">
        {line('lo', g.scoreLo)}
        {line('hi', g.scoreHi)}
      </div>
      <div className="meta">
        {!timeCol && st === 'live' && <Live />}
        {hyp && <span className="badge IF">IF</span>}
        <span>{meta ?? stageLabel(rg, bracket)}</span>
        {st === 'awaiting' && <span>Awaiting</span>}
      </div>
    </button>
  );
}
