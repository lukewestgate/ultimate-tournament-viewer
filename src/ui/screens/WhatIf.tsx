import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildView } from '../../engine/view';
import { parseTeamKey } from '../../store/settings';
import { withoutTag } from '../../extract/names';
import { useT } from '../ctx';
import { ordinal, signed } from '../fmt';
import { Empty, TeamName } from '../parts';
import { setParams, tHref } from '../router';
import { WhatIfGameCard } from './WhatIfControls';
import { leadsFor, needFor, teamOutlook } from '../outlook';
import type { Scenario } from '../../engine/scenario';
import type { ScreenProps } from './index';

/** Pool what-if workspace (spec §10.4; SpecWhatIf #1). */
export function WhatIf({ arg }: ScreenProps) {
  const c = useT();
  useEffect(() => {
    if (!c.whatIf) setParams({ if: '_' });
  }, [c.whatIf]);
  const pool = c.t.pools.find((p) => p.name === arg) ?? c.t.pools.find((p) => c.inDiv(p.division));
  const real = useMemo(() => buildView(c.t, c.view.format, { now: c.now, at: c.replayAt }), [c.t, c.view.format, c.now, c.replayAt]);
  const st = pool ? c.view.standings.get(pool.name) : undefined;
  const teams = st?.rows.map((r) => r.team) ?? [];
  const stored = sessionStorage.getItem('tv:whatifTeam');
  const initial = stored ? parseTeamKey(stored).name : c.primary ? parseTeamKey(c.primary).name : undefined;
  const [team, setTeam] = useState<string | undefined>(initial && teams.includes(initial) ? initial : (teams.find((t) => c.isFollowed(t, pool?.division)) ?? teams[0]));
  const [target, setTarget] = useState(2);
  const [showFinished, setShowFinished] = useState(false);
  if (!pool || !st) return <Empty title="No pools" body="What-if needs a pool to explore." />;
  const realSt = real.standings.get(pool.name)!;
  const games = c.view.games.filter((v) => v.g.pool === pool.name && v.g.division === pool.division && !v.g.isBye);
  const remaining = games.filter((v) => !v.result || v.result.hypothetical || c.scenario[v.g.id]?.override);
  const finished = games.filter((v) => !remaining.includes(v));
  const tgt = Math.max(1, Math.min(target, teams.length - 1));
  const need = team && !st.complete ? needFor(c.view, pool.name, team, tgt) : undefined;
  const o = team ? teamOutlook(c.view, pool.name, team) : undefined;
  const quick = (mode: 'win' | 'lose' | 'clear') => {
    const s: Scenario = { ...c.scenario };
    for (const v of remaining) {
      if (mode === 'clear') {
        delete s[v.g.id];
        continue;
      }
      const i = v.sides.findIndex((x) => x.team === team);
      if (i < 0) continue;
      s[v.g.id] = { outcome: (i === 0) === (mode === 'win') ? 'A' : 'B' };
    }
    c.setScenario(s);
  };
  const name = pool.name.length <= 3 ? `Pool ${pool.name}` : pool.name;
  const tieGroups = st.tied.filter((g) => st.rows.some((r) => g.teams.includes(r.team) && r.p > 0));
  const teamName = withoutTag(team ?? '');
  let verdict: ReactNode = null;
  if (team && o) {
    const lead = o.worst <= tgt ? leadsFor(c.view, pool.name, o.worst) : undefined;
    if (o.worst <= tgt)
      verdict = (
        <>
          In this scenario: <b className="if-good">already {tgt === 1 ? 'top' : 'through'}</b>
          {lead && tgt > 1 ? ` to ${lead}` : ''}.{o.best !== o.worst ? ` The rest only decides ${ordinal(o.best)} or ${ordinal(o.worst)}.` : ''}
        </>
      );
    else if (o.best > tgt) verdict = <>In this scenario: <b className="if-bad">out of the top {tgt}</b>; best possible is {ordinal(o.best)}.</>;
  }
  return (
    <div className="wi-page">
      <div className="wi-title">
        <h1>{name} · what if…</h1>
        <span style={{ flex: 1 }} />
        {finished.length > 0 && (
          <label className="check-row">
            <input type="checkbox" checked={showFinished} onChange={(e) => setShowFinished(e.target.checked)} /> Show finished
          </label>
        )}
      </div>
      <div className="wi-grid">
        <div className="wi-main">
          <section className="card wi-table">
            {st.rows.map((r) => {
              const before = realSt.rows.find((x) => x.team === r.team)?.rank ?? r.rank;
              const moved = before - r.rank;
              return (
                <div key={r.team} className={`wi-row${r.team === team ? ' on' : ''}`}>
                  <b className="d wi-rank">{r.rank}</b>
                  <span className={`delta${moved > 0 ? ' up' : moved < 0 ? ' down' : ''}`}>{moved > 0 ? `↑${moved}` : moved < 0 ? `↓${-moved}` : '='}</span>
                  <button className="wi-team" onClick={() => setTeam(r.team)} aria-pressed={r.team === team}>
                    <TeamName name={r.team} division={pool.division} bold={r.team === team} plain />
                  </button>
                  <span className="d wi-diff">{signed(r.diff)}</span>
                  <b className="d wi-pts">{r.pts}</b>
                </div>
              );
            })}
            {(st.explanations.length > 0 || tieGroups.length > 0) && (
              <div className="explain flush">
                {st.explanations.map((e) => {
                  const ra = st.rows.findIndex((r) => r.team === e.above) + 1;
                  const rb = st.rows.findIndex((r) => r.team === e.below) + 1;
                  const at = e.text.indexOf(': ');
                  return (
                    <div key={`${e.above}-${e.below}`} className="ex-row">
                      <span className="ex-badge d">
                        {ra}={rb}
                      </span>
                      <span>{at > 0 ? <><b>{e.text.slice(0, at)}:</b> {e.text.slice(at + 2)}.</> : `${e.text}.`}</span>
                    </div>
                  );
                })}
                {tieGroups.map((g) => (
                  <div key={g.teams.join('|')} className="ex-row">
                    <span className="ex-badge d">=</span>
                    <span>
                      <b>Still tied:</b> {g.teams.map(withoutTag).join(' and ')} · {g.reason}.
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="wi-games">
            <span className="lbl">{showFinished ? 'Games' : 'Remaining games'}</span>
            {!remaining.length && !showFinished && <Empty title="No games left" body="Tick “Show finished” to override a real result." />}
            <div className="wi-cards">
              {[...remaining, ...(showFinished ? finished : [])].map((v) => (
                <WhatIfGameCard key={v.g.id} id={v.g.id} />
              ))}
            </div>
          </section>
        </div>
        <aside className="wi-side">
          {team && remaining.some((v) => v.sides.some((s) => s.team === team)) && (
            <section className="wi-quick">
              <span className="lbl">Quick scenarios</span>
              <div className="sr-tries">
                <button className="chip" onClick={() => quick('win')}>
                  {teamName} win all
                </button>
                <button className="chip" onClick={() => quick('lose')}>
                  {teamName} lose all
                </button>
                <button className="chip" onClick={() => quick('clear')}>
                  Clear
                </button>
              </div>
            </section>
          )}
          <section className="card wi-need">
            <div className="wi-need-head">
              <b>What does</b>
              <select className="inline-select" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
                {teams.map((t) => (
                  <option key={t} value={t}>
                    {withoutTag(t)}
                  </option>
                ))}
              </select>
              <b>need?</b>
              <span className="muted">·</span>
              <select className="inline-select muted" value={tgt} onChange={(e) => setTarget(Number(e.target.value))} aria-label="Target">
                {Array.from({ length: Math.min(teams.length - 1, 4) }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {i === 0 ? 'finish 1st' : `finish top ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
            {st.complete ? (
              <p>
                {teamName} finish {ordinal(st.rows.findIndex((r) => r.team === team) + 1)} in this scenario.
              </p>
            ) : verdict ? (
              <p>{verdict}</p>
            ) : (
              need?.conditions.map((t, i) => (
                <div key={t} className="need">
                  <span className={`tag sm ${i === 0 ? 'win' : 'quiet'}`}>{i === 0 ? 'Enough' : 'Or'}</span>
                  <span>{t}</span>
                </div>
              ))
            )}
          </section>
          <a className="link" href={tHref(c.id, 'pools', pool.name)}>
            Back to {name}
          </a>
        </aside>
      </div>
    </div>
  );
}
