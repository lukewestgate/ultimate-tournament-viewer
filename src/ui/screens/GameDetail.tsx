import { useT } from '../ctx';
import { useOverlay } from '../overlay';
import { PitchBadge, Side, StatusTag, scoreText, stageText, winnerSide } from '../parts';
import { ordinal, timeOf } from '../fmt';
import { divKey } from '../../model/types';
import { feedsOf, leadsFor, stakeLines, teamOutlook } from '../outlook';
import { withoutTag } from '../../extract/names';
import { WhatIfControls } from './WhatIfControls';
import { IExternal } from '../icons';
import { setParams, tHref } from '../router';
import type { GameView } from '../../engine/view';

/** Game detail (spec §9.11; SpecGame): teams, score, when/where, what's at stake, earlier meetings, what-if controls. */
export function GameDetail({ id }: { id: string }) {
  const c = useT();
  const overlay = useOverlay();
  const v = c.view.byId.get(id);
  if (!v) return <p className="muted">Game not found.</p>;
  const w = winnerSide(v);
  const [a, b] = [v.sides[0].team, v.sides[1].team];
  const earlier =
    a && b
      ? c.view.games.filter((x) => x.g.id !== id && x.g.start < v.g.start && x.result && x.g.division === v.g.division && ((x.sides[0].team === a && x.sides[1].team === b) || (x.sides[0].team === b && x.sides[1].team === a)))
      : [];
  const code = v.g.code?.replace(/[[\]]/g, '');
  const title = [stageText(v), code && !stageText(v).includes(code) ? code : ''].filter(Boolean).join(' · ');
  const editing = Boolean(c.whatIf) && v.status !== 'bye';
  const live = v.status === 'live' || v.status === 'finishing';
  const upcoming = v.status === 'upcoming' || v.status === 'ifRequired';
  const st = v.g.pool ? c.view.standings.get(v.g.pool) : undefined;
  const standing = (team?: string) => {
    const r = team && st?.rows.find((x) => x.team === team);
    return r && st!.played > 0 ? `${ordinal(r.rank)} · ${r.pts} pts` : undefined;
  };
  const dur = Math.round((v.g.end - v.g.start) / 60000);
  const capAt = v.g.capMins ? v.g.end - v.g.capMins * 60000 : undefined;
  const isBracket = v.g.stage === 'placement' && c.view.levels[divKey(v.g.division)] !== 'basic';
  return (
    <div className={`gd${editing ? ' editing' : ''}`}>
      <div className="gd-head">
        <PitchBadge label={v.g.pitch.label} />
        <b className="gd-title">{editing ? `${v.g.pool ? `Pool ${v.g.pool}` : stageText(v)} · ${timeOf(v.g.start, c.t.timeZone)}` : title}</b>
        <span style={{ flex: 1 }} />
        {editing ? v.hypothetical && <span className="tag if sm">IF</span> : <StatusTag v={v} />}
      </div>

      {editing ? (
        <>
          <WhatIfControls id={id} sheet />
          <IfThisHappens v={v} />
          <div className="gd-actions">
            <button
              className="btn"
              onClick={() => {
                const s = { ...c.scenario };
                delete s[id];
                c.setScenario(s);
              }}
              disabled={!c.scenario[id]}
            >
              Clear this game
            </button>
            <button className="btn violet" onClick={overlay.closeSheet}>
              Done
            </button>
          </div>
        </>
      ) : (
        <>
          {upcoming && (
            <div className="gd-when">
              <span className="d gd-time">{timeOf(v.g.start, c.t.timeZone)}</span>
              <span className="muted">
                {v.g.day.slice(0, 3)} · {dur} min
                {capAt ? ` · cap ${timeOf(capAt, c.t.timeZone)}` : ''}
                {v.g.division ? ` · ${v.g.division}` : ''}
              </span>
            </div>
          )}
          <div className={`gd-teams${upcoming ? ' small' : ''}`}>
            {([0, 1] as const).map((i) => (
              <div key={i} className={`gd-side${w === i ? ' won' : ''}${w !== undefined && w !== i ? ' lost' : ''}`}>
                <Side side={v.sides[i]} division={v.g.division} bold={w === i} />
                {v.result || live ? <b className="d gd-score">{scoreText(v, i) || '–'}</b> : standing(v.sides[i].team) && <span className="gd-standing">{standing(v.sides[i].team)}</span>}
              </div>
            ))}
          </div>
          {live && (
            <div className="gd-progress">
              <div className="cap-track">
                <b style={{ width: `${Math.min(100, Math.max(0, ((c.view.clock - v.g.start) / (v.g.end - v.g.start)) * 100))}%`, background: v.status === 'finishing' ? 'var(--ink3)' : undefined }} />
                {capAt && <i style={{ left: `${((capAt - v.g.start) / (v.g.end - v.g.start)) * 100}%` }} />}
              </div>
              <span className="small muted">
                {v.status === 'finishing' ? 'Finishing' : `${Math.max(0, Math.round((c.view.clock - v.g.start) / 60000))} of ${dur} min`} · {v.g.day.slice(0, 3)} {timeOf(v.g.start, c.t.timeZone)}
              </span>
            </div>
          )}
          {!upcoming && !live && (
            <span className="small muted">
              {v.g.day.slice(0, 3)} {timeOf(v.g.start, c.t.timeZone)} · {dur} min{v.g.division ? ` · ${v.g.division}` : ''}
            </span>
          )}
          {(v.sides[0].doubtful || v.sides[1].doubtful) && <span className="small muted">The sheet named a team the format didn’t predict; the sheet’s name is shown.</span>}
          <Stake v={v} />
          {c.view.replay && v.result && <span className="small muted">Replay shows scores at their scheduled end; the real entry may have been later.</span>}
          {a && b && v.g.stage !== 'placement' ? (
            <Earlier v={v} games={earlier} />
          ) : (
            earlier.length > 0 && <Earlier v={v} games={earlier} />
          )}
          {v.status !== 'bye' && (
            <div className="gd-actions">
              <button className="btn" onClick={() => setParams({ if: '_' })}>
                Explore what-ifs
              </button>
              {isBracket && (
                <a className="btn" href={tHref(c.id, 'brackets')} onClick={overlay.closeSheet}>
                  Open bracket
                </a>
              )}
              {!isBracket && v.g.pool && (
                <a className="btn" href={tHref(c.id, 'pools', v.g.pool)} onClick={overlay.closeSheet}>
                  Pool {v.g.pool}
                </a>
              )}
            </div>
          )}
          {c.t.links.pitchMap && (
            <a className="gd-link" href={c.t.links.pitchMap} target="_blank" rel="noreferrer">
              Pitch map{v.g.pitch.label ? ` · P${v.g.pitch.label}` : ''} <IExternal size={16} />
            </a>
          )}
        </>
      )}
    </div>
  );
}

/** What's at stake: where the winner and loser go, or the pool effect. */
function Stake({ v }: { v: GameView }) {
  const c = useT();
  if (v.status === 'final' && !v.g.pool) return null;
  if (v.g.pool && (v.status === 'final' || v.status === 'awaiting')) return null;
  const lines = stakeLines(c.view, v.g.id).filter((l) => l.text);
  if (!lines.length) return null;
  return (
    <div className="stake-box">
      <span className="lbl">What’s at stake</span>
      {lines.map((l) => (
        <div key={l.tag} className="stake-row">
          <span className={`tag sm ${l.kind === 'good' ? 'win' : 'quiet'}`}>{l.tag}</span>
          <span>{l.text}</span>
        </div>
      ))}
    </div>
  );
}

function Earlier({ v, games }: { v: GameView; games: GameView[] }) {
  const c = useT();
  const me = v.sides[0].team;
  return (
    <div className="gd-earlier">
      <span className="lbl">Earlier this weekend</span>
      {games.length === 0 ? (
        <span className="small muted">First meeting.</span>
      ) : (
        games.map((x) => {
          const s = x.sides[0].team === me ? 0 : 1;
          const o = x.result?.outcome;
          const res = o === 'D' ? 'D' : (o === 'A') === (s === 0) ? 'W' : 'L';
          return (
            <div key={x.g.id} className="gd-meet">
              <span className="muted">
                {x.g.day.slice(0, 3)} {timeOf(x.g.start, c.t.timeZone)}
              </span>
              <span className="gd-meet-what">
                {x.g.pool ? `Pool ${x.g.pool}` : stageText(x)} · <b>{withoutTag(me!)}</b> {scoreText(x, s as 0 | 1)}–{scoreText(x, (1 - s) as 0 | 1)}
              </span>
              <span className={`tag sm ${res === 'W' ? 'win' : 'quiet'}`}>{res}</span>
            </div>
          );
        })
      )}
    </div>
  );
}

/** Live effect of the hypothetical result on the pool table or bracket. */
function IfThisHappens({ v }: { v: GameView }) {
  const c = useT();
  if (!c.scenario[v.g.id]) return null;
  const rows: { left: string; text: string; good?: string }[] = [];
  if (v.g.pool) {
    const st = c.view.standings.get(v.g.pool);
    for (const s of v.sides) {
      const r = s.team && st?.rows.find((x) => x.team === s.team);
      if (!r || !st) continue;
      const o = teamOutlook(c.view, v.g.pool, r.team);
      let good: string | undefined;
      if (o && o.best === o.worst) {
        const lead = leadsFor(c.view, v.g.pool, o.best);
        good = lead ? `through to ${lead}` : `finishes ${ordinal(o.best)}`;
      } else if (o && o.best >= 3) good = undefined;
      rows.push({ left: ordinal(r.rank), text: `${withoutTag(r.team)} · ${r.pts} pts${o && o.best >= 3 ? ` · can’t finish top ${o.best - 1}` : ''}`, good });
    }
  } else {
    const f = feedsOf(c.view, v.g.id);
    const w = winnerSide(v);
    if (w !== undefined) {
      const name = (i: 0 | 1) => withoutTag(v.sides[i].team ?? v.sides[i].label ?? '');
      if (f.winner) rows.push({ left: 'W', text: `${name(w)} → ${f.winner}` });
      if (f.loser) rows.push({ left: 'L', text: `${name((1 - w) as 0 | 1)} → ${f.loser}` });
    }
  }
  if (!rows.length) return null;
  return (
    <div className="if-box">
      <span className="lbl">If this happens</span>
      {rows.map((r) => (
        <div key={r.text} className="if-row">
          <b className="d">{r.left}</b>
          <span>
            {r.text}
            {r.good && (
              <>
                {' · '}
                <b className="if-good">{r.good}</b>
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export function useOpenGame() {
  const overlay = useOverlay();
  return (id: string) => overlay.openSheet(<GameDetail id={id} />);
}
