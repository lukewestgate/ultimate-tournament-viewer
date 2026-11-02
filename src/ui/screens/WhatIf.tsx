import { useEffect, useMemo, useState } from 'react';
import { buildView } from '../../engine/view';
import { parseTeamKey } from '../../store/settings';
import { withoutTag } from '../../extract/names';
import { useT } from '../ctx';
import { ordinal, signed } from '../fmt';
import { Empty, GameRow, Section, Seg, TeamName } from '../parts';
import { setParams, tHref } from '../router';
import { WhatIfControls } from './WhatIfControls';
import { needFor } from '../outlook';
import type { Scenario } from '../../engine/scenario';
import type { ScreenProps } from './index';

/** Pool what-if workspace (spec §10.4). */
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
  const [team, setTeam] = useState<string | undefined>(initial && teams.includes(initial) ? initial : teams[0]);
  const [target, setTarget] = useState(2);
  const [showFinished, setShowFinished] = useState(false);
  if (!pool || !st) return <Empty title="No pools" body="What-if needs a pool to explore." />;
  const realSt = real.standings.get(pool.name)!;
  const games = c.view.games.filter((v) => v.g.pool === pool.name && v.g.division === pool.division && !v.g.isBye);
  const remaining = games.filter((v) => !v.result || v.result.hypothetical);
  const finished = games.filter((v) => v.result && !v.result.hypothetical);
  const need = team && !st.complete ? needFor(c.view, pool.name, team, Math.min(target, teams.length - 1)) : undefined;
  const quick = (mode: 'win' | 'lose' | 'clear') => {
    const s: Scenario = { ...c.scenario };
    for (const v of remaining) {
      if (mode === 'clear') {
        delete s[v.g.id];
        continue;
      }
      const i = v.sides.findIndex((x) => x.team === team);
      if (i < 0) continue;
      const won = mode === 'win';
      s[v.g.id] = { outcome: (i === 0) === won ? 'A' : 'B' };
    }
    c.setScenario(s);
  };
  const name = pool.name.length <= 3 ? `Pool ${pool.name}` : pool.name;
  return (
    <>
      <div className="home-head">
        <h1 style={{ fontSize: 22 }}>What-if · {name}</h1>
        <span style={{ flex: 1 }} />
        <a className="btn small" href={tHref(c.id, 'pools', pool.name)}>
          Pool page
        </a>
      </div>
      <div className="grid2">
        <div className="stack" style={{ gap: 20 }}>
          <section className="card table-scroll">
            <table className="pt">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th>P</th>
                  <th>W</th>
                  <th>D</th>
                  <th>L</th>
                  <th>±</th>
                  <th>Pts</th>
                  <th title="Change from the real table">Δ</th>
                </tr>
              </thead>
              <tbody>
                {st.rows.map((r) => {
                  const before = realSt.rows.find((x) => x.team === r.team)?.rank ?? r.rank;
                  const moved = before - r.rank;
                  return (
                    <tr key={r.team} className={r.team === team ? 'mine' : ''}>
                      <td>
                        {r.rank}
                        {r.tiedWith.length > 0 && <span className="tie-mark">=</span>}
                      </td>
                      <td>
                        <TeamName name={r.team} division={pool.division} />
                      </td>
                      <td>{r.p}</td>
                      <td>{r.w}</td>
                      <td>{r.d}</td>
                      <td>{r.l}</td>
                      <td>{signed(r.diff)}</td>
                      <td>{r.pts}</td>
                      <td className={moved > 0 ? 'up' : moved < 0 ? 'down' : ''}>{moved > 0 ? `▲${moved}` : moved < 0 ? `▼${-moved}` : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          <Section title="Tie-breaks">
            <div className="card pad stack small">
              {!st.explanations.length && !st.tied.some((g) => st.rows.some((r) => g.teams.includes(r.team) && r.p > 0)) && <span className="muted">No teams are level on points.</span>}
              {st.explanations.map((e) => (
                <span key={`${e.above}-${e.below}`}>{e.text}.</span>
              ))}
              {st.tied.filter((g) => st.rows.some((r) => g.teams.includes(r.team) && r.p > 0)).map((g) => (
                <span key={g.teams.join('|')}>
                  <b>Still tied:</b> {g.teams.map(withoutTag).join(', ')} — {g.reason}.
                </span>
              ))}
            </div>
          </Section>
          <Section title="Games" right={finished.length > 0 ? <button className="btn small" onClick={() => setShowFinished(!showFinished)}>{showFinished ? 'Hide finished' : 'Show finished'}</button> : undefined}>
            {!remaining.length && !showFinished && <Empty title="No games left" body="Show finished games to override a real result." />}
            {[...remaining, ...(showFinished ? finished : [])].map((v) => (
              <div key={v.g.id} className="stack" style={{ gap: 6 }}>
                <div className="card list">
                  <GameRow v={v} showTime showDay />
                </div>
                <WhatIfControls id={v.g.id} />
              </div>
            ))}
          </Section>
        </div>
        <aside className="stack" style={{ gap: 20 }}>
          <Section title="What do we need?">
            <div className="card pad stack">
              <select className="field" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
                {teams.map((t) => (
                  <option key={t} value={t}>
                    {withoutTag(t)}
                  </option>
                ))}
              </select>
              <Seg label="Target" value={String(target)} options={Array.from({ length: Math.min(teams.length - 1, 4) }, (_, i) => ({ value: String(i + 1), label: i === 0 ? '1st' : `Top ${i + 1}` }))} onChange={(v) => setTarget(Number(v))} />
              {st.complete ? (
                <span>
                  {withoutTag(team ?? '')} finish {ordinal(st.rows.findIndex((r) => r.team === team) + 1)} in this scenario.
                </span>
              ) : (
                need?.conditions.map((t, i) => (
                  <div key={t} className={`need${i === 0 ? ' first' : ''}`}>
                    {t}
                  </div>
                ))
              )}
            </div>
          </Section>
          <Section title="Quick scenarios">
            <div className="row-btns">
              <button className="btn small" onClick={() => quick('win')}>
                All remaining won by {withoutTag(team ?? '')}
              </button>
              <button className="btn small" onClick={() => quick('lose')}>
                All lost by {withoutTag(team ?? '')}
              </button>
              <button className="btn small" onClick={() => quick('clear')}>
                Clear
              </button>
            </div>
          </Section>
        </aside>
      </div>
    </>
  );
}
