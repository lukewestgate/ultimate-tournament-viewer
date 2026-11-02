import { useState } from 'react';
import { pathsAhead, possibleGames, teamGames, relativePlace, type PathNode } from '../../engine/view';
import { parseTeamKey, teamKey } from '../../store/settings';
import { divKey } from '../../model/types';
import { withoutTag, regionTag } from '../../extract/names';
import { useT } from '../ctx';
import { ordinal, plural, timeOf } from '../fmt';
import { IStar, IExternal } from '../icons';
import { Empty, GameRow, Section, stageText, sideText, possibleText } from '../parts';
import { tHref } from '../router';
import { useOpenGame } from './GameDetail';
import { leadsFor, needFor, teamOutlook } from '../outlook';
import type { ScreenProps } from './index';

/** Team detail (spec §9.8; SpecPools #2). */
export function Team({ arg }: ScreenProps) {
  const c = useT();
  const open = useOpenGame();
  const { name, division } = parseTeamKey(arg ?? '');
  const team = c.t.teams.find((t) => t.name === name && t.division === division) ?? c.t.teams.find((t) => t.name === name);
  if (!team) return <Empty title="Team not found" body="It may have been renamed in the sheet." />;
  const div = team.division;
  const k = teamKey(team.name, div);
  const on = c.isFollowed(team.name, div);
  const games = teamGames(c.view, team.name, div);
  const later = possibleGames(c.view, team.name, div).filter((v) => v.sides.some((s) => !s.team && s.possible.includes(team.name) && s.possible.length <= 8));
  let w = 0;
  let d = 0;
  let l = 0;
  for (const v of games) {
    if (!v.result || v.g.isBye) continue;
    const mine = v.sides[0].team === team.name ? 'A' : 'B';
    if (v.result.outcome === 'D') d++;
    else if (v.result.outcome === mine) w++;
    else l++;
  }
  const pools = c.t.pools.filter((p) => p.division === div && c.view.standings.get(p.name)?.rows.some((r) => r.team === team.name));
  const currentPool = [...pools].reverse().find((p) => !c.view.standings.get(p.name)!.complete) ?? pools[pools.length - 1];
  const st = currentPool ? c.view.standings.get(currentPool.name) : undefined;
  const row = st?.rows.find((r) => r.team === team.name);
  const next = games.find((v) => v.status === 'upcoming' || v.status === 'live' || v.status === 'finishing');
  const level = c.view.levels[divKey(div)];
  const path = level !== 'basic' ? pathsAhead(c.view, team.name, div) : undefined;
  const finalPlace = !c.view.replay || c.view.ended ? c.t.finalStandings?.find((s) => s.team === team.name && (!div || s.division === div))?.place : undefined;
  const spirit = c.t.spirit?.find((s) => s.team === team.name);
  const spiritLink = c.t.links.items.find((i) => /spirit|sotg/i.test(i.label) && (!i.division || i.division === div))?.url ?? c.t.links.spirit;
  const tag = regionTag(team.name);
  return (
    <div className="team-page">
      <section className="team-head card">
        <div className="th-bar" style={{ background: c.colorOf(team.name, div) }} />
        <div className="th-body">
          <div className="th-top">
            <div className="th-titles">
              <span className="lbl">
                {team.club}
                {div ? ` · ${div}` : ''}
              </span>
              <h1>
                {tag ? withoutTag(team.name) : team.name}
                {tag && <span className="region big">{tag}</span>}
              </h1>
            </div>
            <button className={`follow-btn${on ? ' on' : ''}`} aria-pressed={on} onClick={() => c.toggleFollow(team.name, div)}>
              <IStar filled={on} size={18} /> {on ? 'Following' : 'Follow'}
            </button>
          </div>
          <div className="th-chips">
            {on &&
              (c.primary === k ? (
                <span className="chip-tag accent">Primary team</span>
              ) : (
                <button className="chip-tag button" onClick={() => c.setPrimary(k)}>
                  Make primary
                </button>
              ))}
            {team.seed !== undefined && <span className="chip-tag">Seed {team.seed}</span>}
            {row && currentPool && (
              <span className="chip-tag">
                {ordinal(row.rank)} in Pool {currentPool.name}
              </span>
            )}
            {finalPlace && <span className="chip-tag">Finished {ordinal(finalPlace)}</span>}
            <span className="chip-tag">
              W{w} · D{d} · L{l}
            </span>
          </div>
        </div>
      </section>

      {next && (
        <Section title={next.status === 'upcoming' ? 'Next game' : 'Playing now'}>
          <div className="card list">
            <GameRow v={next} showTime showDay noMine onOpen={() => open(next.g.id)} />
          </div>
        </Section>
      )}

      {currentPool && st && <PoolOutlook pool={currentPool.name} team={team.name} />}

      {path && (
        <section className="card pad stack">
          <div className="card-title">
            <b>Paths ahead</b>
            {level === 'partial' && <span className="tag warn sm">Partly known</span>}
          </div>
          <PathTree node={path} team={team.name} depth={0} />
        </section>
      )}

      {later.length > 0 && (
        <section className="section">
          <span className="lbl-head">Possible later games</span>
          <div className="later-list">
            {later.slice(0, 8).map((v) => {
              const s = v.sides.findIndex((x) => !x.team && x.possible.includes(team.name)) as 0 | 1;
              const opp = v.sides[1 - s];
              return (
                <button key={v.g.id} className="later-item" onClick={() => open(v.g.id)}>
                  <span className="d later-time">{timeOf(v.g.start, c.t.timeZone)}</span>
                  <span className="later-what">
                    {stageText(v)} · vs {opp.team ? withoutTag(opp.team) : opp.label}
                  </span>
                  <span className="later-if">if {v.sides[s].label}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <Section title="Games" sub={plural(games.length, 'game')}>
        {games.length ? (
          <div className="card list">
            {games.map((v) => (
              <GameRow key={v.g.id} v={v} showTime showDay noMine onOpen={() => open(v.g.id)} />
            ))}
          </div>
        ) : (
          <Empty title="No games yet" />
        )}
      </Section>

      {(spirit || spiritLink) && (
        <section className="card pad stack">
          <b className="card-title">Spirit</b>
          {spirit && (
            <span className="small">
              Submitted {spirit.submitted ?? 0} of {spirit.played ?? 0} games · received {spirit.received ?? 0}
            </span>
          )}
          {spiritLink && (
            <a className="btn" href={spiritLink} target="_blank" rel="noreferrer">
              Spirit form <IExternal size={16} />
            </a>
          )}
        </section>
      )}

      {currentPool && (
        <a className="btn dashed-violet block" href={tHref(c.id, 'whatif', currentPool.name)} onClick={() => sessionStorage.setItem('tv:whatifTeam', k)}>
          Explore what-ifs for {withoutTag(team.name)}
        </a>
      )}
    </div>
  );
}

/** Pool outlook (all engine levels): possible finishes, where they lead, what do we need. */
export function PoolOutlook({ pool, team }: { pool: string; team: string }) {
  const c = useT();
  const st = c.view.standings.get(pool)!;
  const size = st.rows.length;
  const o = teamOutlook(c.view, pool, team);
  const [target, setTarget] = useState(Math.min(2, Math.max(1, size - 1)));
  const need = !st.complete ? needFor(c.view, pool, team, target) : undefined;
  const f = c.view.finishes.get(pool);
  const left = st.total - st.played;
  const nextPoolGame = c.view.games.find((v) => v.g.pool === pool && !v.result && v.sides.some((s) => s.team === team));
  const leads: string[] = [];
  for (let i = 1; i <= size; ) {
    const lead = leadsFor(c.view, pool, i);
    let j = i;
    while (j + 1 <= size && leadsFor(c.view, pool, j + 1) === lead) j++;
    if (lead) leads.push(`${ordinal(i)}${j > i ? `–${ordinal(j)}` : ''} → ${lead}`);
    i = j + 1;
  }
  const finishes = f?.places.get(team);
  return (
    <>
      <section className="card pad stack outlook">
        <div className="card-title">
          <b>Pool {pool} outlook</b>
          <span className="muted small">
            {st.complete ? 'Complete' : `${plural(left, 'game')} left${nextPoolGame ? ` · ${nextPoolGame.g.day.slice(0, 3)} ${timeOf(nextPoolGame.g.start, c.t.timeZone)}` : ''}`}
          </span>
        </div>
        {o && (
          <>
            <span className="lbl">{st.complete ? 'Finish' : 'Possible finishes'}</span>
            <div className="finishes" style={{ gridTemplateColumns: `repeat(${Math.min(size, 4)}, minmax(0, 1fr))` }}>
              {Array.from({ length: size }, (_, i) => i + 1).map((p) => {
                const can = st.complete ? p >= o.best && p <= o.worst : (finishes?.has(p) ?? true);
                return (
                  <div key={p} className={`fin${can ? ' can' : st.complete ? ' other' : ' cant'}`}>
                    <b className="d">{ordinal(p)}</b>
                    <span>{st.complete ? (can ? 'final' : '') : can ? 'possible' : 'can’t'}</span>
                  </div>
                );
              })}
            </div>
            {leads.length > 0 && <span className="small muted">{leads.join(' · ')}</span>}
            {f?.approximate && <span className="small muted">Approximate: too many games left to check every outcome.</span>}
          </>
        )}
      </section>
      {!st.complete && size > 2 && need && (
        <section className="card pad stack">
          <div className="card-title">
            <b>What do we need?</b>
            <select className="field mini-select" value={target} onChange={(e) => setTarget(Number(e.target.value))} aria-label="Target">
              {Array.from({ length: Math.min(size - 1, 4) }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i === 0 ? 'Finish 1st' : `Finish top ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
          {need.conditions.map((t, i) => (
            <div key={t} className="need">
              <span className={`tag sm ${need.verdict === 'through' || (i === 0 && need.verdict === 'depends') ? 'win' : 'quiet'}`}>{need.verdict === 'through' ? 'Through' : need.verdict === 'out' ? 'Out' : need.verdict === 'tooLarge' ? 'Too early' : i === 0 ? 'Enough' : 'Or'}</span>
              <span>{t}</span>
            </div>
          ))}
          <span className="small muted">
            Worked out from the tie-break rules ({c.t.rules.points.win}/{c.t.rules.points.draw}/{c.t.rules.points.loss}). Margins checked up to 15.
          </span>
        </section>
      )}
    </>
  );
}

function PathTree({ node, team, depth }: { node: PathNode; team: string; depth: number }) {
  const c = useT();
  const v = node.game;
  const opp = v.sides[node.side === 0 ? 1 : 0];
  const branch = (label: string, n: PathNode | { place: number } | undefined, good: boolean) => {
    if (!n) return null;
    return (
      <li className={good ? 'win-branch' : 'lose-branch'}>
        <span className={`tag sm ${good ? 'win' : 'quiet'}`}>{label}</span>
        {'place' in n ? (
          <b className="path-place">Finish {ordinal(relativePlace(c.view, v.g.division, n.place))}</b>
        ) : depth < 2 ? (
          <PathTree node={n} team={team} depth={depth + 1} />
        ) : (
          <span className="small">
            {stageText(n.game)} · {timeOf(n.game.g.start, c.t.timeZone)}
          </span>
        )}
      </li>
    );
  };
  return (
    <div className="path">
      <div className="path-game">
        <span className="d path-time">{timeOf(v.g.start, c.t.timeZone)}</span>
        <b>{stageText(v)}</b>
        <span className="muted small">
          vs {opp.team ? withoutTag(opp.team) : `${sideText(opp)}${opp.possible.length ? ` (${possibleText(opp.possible)})` : ''}`}
        </span>
      </div>
      <ul className="path-branches">
        {branch('Win', node.win, true)}
        {branch('Lose', node.lose, false)}
      </ul>
    </div>
  );
}
