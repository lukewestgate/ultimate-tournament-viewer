import { useT } from '../ctx';
import { useOverlay } from '../overlay';
import { PitchBadge, Side, StatusTag, scoreText, stageText, winnerSide, GameRow } from '../parts';
import { dateLabel, ordinal, timeOf } from '../fmt';
import { divKey } from '../../model/types';
import { poolEffect } from '../outlook';
import { withoutTag } from '../../extract/names';
import { WhatIfControls } from './WhatIfControls';
import { IWhatIf, IExternal } from '../icons';
import { setParams } from '../router';

/** Game detail (spec §9.11): teams, score, when/where, what's at stake, earlier meetings, what-if controls. */
export function GameDetail({ id }: { id: string }) {
  const c = useT();
  const v = c.view.byId.get(id);
  if (!v) return <p className="muted">Game not found.</p>;
  const w = winnerSide(v);
  const day = c.t.days.find((d) => d.name === v.g.day);
  const [a, b] = [v.sides[0].team, v.sides[1].team];
  const earlier =
    a && b
      ? c.view.games.filter((x) => x.g.id !== id && x.g.start < v.g.start && x.g.division === v.g.division && ((x.sides[0].team === a && x.sides[1].team === b) || (x.sides[0].team === b && x.sides[1].team === a)))
      : [];
  return (
    <div className="stack gd">
      <div className="gd-teams">
        {([0, 1] as const).map((i) => (
          <div key={i} className={`gd-side${w === i ? ' won' : ''}`}>
            <Side side={v.sides[i]} division={v.g.division} bold={w === i} />
            <b className="d gd-score">{scoreText(v, i)}</b>
          </div>
        ))}
      </div>
      <div className="gd-meta">
        <PitchBadge label={v.g.pitch.label} />
        <span className="d gd-time">{timeOf(v.g.start, c.t.timeZone)}</span>
        <span className="muted">{day ? dateLabel(day.date) : v.g.day}</span>
        <span className="muted">· {stageText(v)}</span>
        {v.g.code && v.g.pool && <span className="muted">· {v.g.code}</span>}
        {v.g.division && <span className="muted">· {v.g.division}</span>}
        <span style={{ flex: 1 }} />
        <StatusTag v={v} />
      </div>
      {v.g.capMins && <span className="small" style={{ color: 'var(--cap)' }}>Cap {v.g.capMins} min before the end</span>}
      {(v.sides[0].doubtful || v.sides[1].doubtful) && <span className="small muted">The sheet named a team the format didn’t predict; the sheet’s name is shown.</span>}
      <Stake id={id} />
      {c.view.replay && <span className="small muted">Replay shows scores at their scheduled end; real entry may have been later.</span>}
      {earlier.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="lbl">Earlier meetings</span>
          <div className="card list">
            {earlier.map((x) => (
              <GameRow key={x.g.id} v={x} showTime showDay />
            ))}
          </div>
        </div>
      )}
      {c.whatIf ? (
        <WhatIfControls id={id} />
      ) : (
        v.status !== 'bye' && (
          <button className="btn" onClick={() => setParams({ if: '_' })}>
            <IWhatIf size={18} /> Explore what-ifs
          </button>
        )
      )}
      {c.t.links.pitchMap && (
        <a className="btn" href={c.t.links.pitchMap} target="_blank" rel="noreferrer">
          Pitch map <IExternal size={16} />
        </a>
      )}
    </div>
  );
}

/** What's at stake: where the winner and loser go, or the pool effect. */
function Stake({ id }: { id: string }) {
  const c = useT();
  const v = c.view.byId.get(id)!;
  if (v.status === 'final' && !v.g.pool) return null;
  const f = c.view.format.divisions[divKey(v.g.division)];
  const lines: string[] = [];
  if (v.g.stage === 'placement' && f) {
    for (const take of ['winner', 'loser'] as const) {
      let to: string | undefined;
      for (const [key, e] of Object.entries(f.sources)) {
        if (e.source.kind === 'gameResult' && e.source.game === id && e.source.take === take) {
          const target = c.view.byId.get(key.split(':')[1]);
          if (target) to = `${target.g.code?.replace(/[[\]]/g, '') ?? 'next game'} at ${timeOf(target.g.start, c.t.timeZone)}`;
        }
      }
      if (!to) {
        const place = Object.entries(f.places ?? {}).find(([, e]) => e.source.kind === 'gameResult' && e.source.game === id && e.source.take === take)?.[0];
        if (place) to = `finishes ${ordinal(Number(place) - Math.min(...Object.keys(f.places ?? {}).map(Number)) + 1)}`;
      }
      if (to) lines.push(`${take === 'winner' ? 'Winner' : 'Loser'} → ${to}`);
    }
  } else if (v.g.pool && v.status !== 'final') {
    const [a, b] = [v.sides[0].team, v.sides[1].team];
    if (a && b) {
      const pa = poolEffect(c.view, v.g.pool, id, 'A');
      const pb = poolEffect(c.view, v.g.pool, id, 'B');
      if (pa) lines.push(`A win puts ${withoutTag(a)} ${ordinal(pa.get(a)!)} in Pool ${v.g.pool} for now`);
      if (pb) lines.push(`A win puts ${withoutTag(b)} ${ordinal(pb.get(b)!)} in Pool ${v.g.pool} for now`);
    }
  }
  if (!lines.length) return null;
  return (
    <div className="stake">
      <span className="lbl">What’s at stake</span>
      {lines.map((l) => (
        <span key={l}>{l}</span>
      ))}
      {v.g.stage === 'placement' && f && <span className="small muted">From the tournament format; checked against the sheet as results come in.</span>}
    </div>
  );
}

export function useOpenGame() {
  const overlay = useOverlay();
  return (id: string) => overlay.openSheet(<GameDetail id={id} />, { title: 'Game' });
}
