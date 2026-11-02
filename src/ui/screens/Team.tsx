import { useState } from 'react';
import { pathsAhead, possibleGames, teamGames, relativePlace, type PathNode } from '../../engine/view';
import { parseTeamKey, teamKey } from '../../store/settings';
import { divKey } from '../../model/types';
import { withoutTag, regionTag } from '../../extract/names';
import { useT } from '../ctx';
import { ordinal, timeOf } from '../fmt';
import { IStar, IWhatIf, IExternal } from '../icons';
import { Empty, GameRow, Section, Seg, Side, stageText } from '../parts';
import { tHref } from '../router';
import { useOpenGame } from './GameDetail';
import { leadsFor, needFor, outlookText, teamOutlook } from '../outlook';
import type { ScreenProps } from './index';

/** Team detail (spec §9.8). */
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
  const later = possibleGames(c.view, team.name, div);
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
  const finalPlace = c.t.finalStandings?.find((s) => s.team === team.name && (!div || s.division === div))?.place;
  const spirit = c.t.spirit?.find((s) => s.team === team.name);
  const spiritLink = c.t.links.items.find((i) => /spirit|sotg/i.test(i.label) && (!i.division || i.division === div))?.url ?? c.t.links.spirit;
  const tag = regionTag(team.name);
  return (
    <>
      <section className="team-head card pad">
        <div className="th-top">
          <span className="dot" style={{ background: c.colorOf(team.name, div), width: 14, height: 14 }} />
          <h1>{withoutTag(team.name)}</h1>
          {tag && <span className="region">{tag}</span>}
        </div>
        <span className="muted small">
          {team.club}
          {div ? ` · ${div}` : ''}
          {team.seed !== undefined ? ` · Seed ${team.seed}` : ''}
          {row ? ` · ${ordinal(row.rank)} in Pool ${currentPool!.name}` : ''}
          {finalPlace ? ` · Finished ${ordinal(finalPlace)}` : ''}
        </span>
        <span className="d th-record">
          W{w} · D{d} · L{l}
        </span>
        <div className="row-btns">
          <button className={`btn${on ? ' primary' : ''}`} aria-pressed={on} onClick={() => c.toggleFollow(team.name, div)}>
            <IStar filled={on} size={18} /> {on ? 'Following' : 'Follow'}
          </button>
          {on && c.primary !== k && (
            <button className="btn" onClick={() => c.setPrimary(k)}>
              Make primary
            </button>
          )}
          {on && c.primary === k && <span className="tag primary" style={{ alignSelf: 'center' }}>PRIMARY TEAM</span>}
        </div>
      </section>

      {next && (
        <Section title={next.status === 'upcoming' ? 'Next game' : 'Now'}>
          <div className="card list">
            <GameRow v={next} showTime showDay onOpen={() => open(next.g.id)} />
          </div>
        </Section>
      )}

      {currentPool && st && <PoolOutlook pool={currentPool.name} team={team.name} />}

      {path && (
        <Section title="Paths ahead" sub={level === 'partial' ? 'Partly known' : undefined}>
          <div className="card pad">
            <PathTree node={path} team={team.name} depth={0} />
          </div>
        </Section>
      )}

      <Section title="Games">
        {games.length ? (
          <div className="card list">
            {games.map((v) => (
              <GameRow key={v.g.id} v={v} showTime showDay onOpen={() => open(v.g.id)} />
            ))}
          </div>
        ) : (
          <Empty title="No games yet" />
        )}
      </Section>

      {later.length > 0 && (
        <Section title="Possible later games" sub="depending on results">
          <div className="card list">
            {later.slice(0, 12).map((v) => (
              <GameRow key={v.g.id} v={v} showTime showDay onOpen={() => open(v.g.id)} />
            ))}
          </div>
        </Section>
      )}

      {(spirit || spiritLink) && (
        <Section title="Spirit">
          <div className="card pad stack">
            {spirit && (
              <span>
                Submitted {spirit.submitted ?? 0} of {spirit.played ?? 0} games · received {spirit.received ?? 0}
              </span>
            )}
            {spiritLink && (
              <a className="btn" href={spiritLink} target="_blank" rel="noreferrer">
                Spirit form <IExternal size={16} />
              </a>
            )}
          </div>
        </Section>
      )}

      {currentPool && (
        <a className="btn" href={`${tHref(c.id, 'whatif', currentPool.name)}`} onClick={() => sessionStorage.setItem('tv:whatifTeam', k)}>
          <IWhatIf size={18} /> Explore what-ifs for {withoutTag(team.name)}
        </a>
      )}
    </>
  );
}

/** Pool outlook (all engine levels): possible finishes, where they lead, what do we need. */
export function PoolOutlook({ pool, team }: { pool: string; team: string }) {
  const c = useT();
  const st = c.view.standings.get(pool)!;
  const size = st.rows.length;
  const o = teamOutlook(c.view, pool, team);
  const [target, setTarget] = useState(Math.min(2, size));
  const need = !st.complete ? needFor(c.view, pool, team, target) : undefined;
  const f = c.view.finishes.get(pool);
  const left = st.total - st.played;
  return (
    <Section title={`Pool ${pool} outlook`} sub={st.complete ? 'Complete' : `${left} game${left === 1 ? '' : 's'} left`}>
      <div className="card pad stack">
        {o && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="lbl">Possible finishes</span>
            <div className="finishes">
              {Array.from({ length: size }, (_, i) => i + 1).map((p) => {
                const can = st.complete ? p >= o.best && p <= o.worst : (f?.places.get(team)?.has(p) ?? true);
                const lead = leadsFor(c.view, pool, p);
                return (
                  <div key={p} className={`fin${can ? ' can' : ''}`}>
                    <b>{ordinal(p)}</b>
                    <span>{can ? 'possible' : 'can’t'}</span>
                    {lead && <span className="small muted">→ {lead}</span>}
                  </div>
                );
              })}
            </div>
            <span className={`tag ${o.best === o.worst ? 'win' : 'quiet'}`} style={{ alignSelf: 'flex-start' }}>
              {outlookText(o, size).text}
            </span>
            {f?.approximate && <span className="small muted">Approximate: too many games left to check every outcome.</span>}
          </div>
        )}
        {!st.complete && size > 2 && (
          <div className="stack" style={{ gap: 8 }}>
            <span className="lbl">What do we need?</span>
            <Seg
              label="Target"
              value={String(target)}
              options={Array.from({ length: Math.min(size - 1, 4) }, (_, i) => ({ value: String(i + 1), label: i === 0 ? 'Finish 1st' : `Top ${i + 1}` }))}
              onChange={(v) => setTarget(Number(v))}
            />
            {need?.conditions.map((t, i) => (
              <div key={t} className={`need${i === 0 ? ' first' : ''}`}>
                {i > 0 && <span className="lbl">Or</span>}
                <span>{t}</span>
              </div>
            ))}
            <span className="small muted">Worked out from the tie-break rules ({c.t.rules.points.win}/{c.t.rules.points.draw}/{c.t.rules.points.loss}). Margins checked up to 15.</span>
          </div>
        )}
      </div>
    </Section>
  );
}

function PathTree({ node, team, depth }: { node: PathNode; team: string; depth: number }) {
  const c = useT();
  const v = node.game;
  const opp = node.opponents;
  const branch = (label: string, n: PathNode | { place: number } | undefined, good: boolean) => {
    if (!n) return null;
    return (
      <li className={good ? 'win-branch' : 'lose-branch'}>
        <span className={`tag ${good ? 'win' : 'quiet'}`}>{label}</span>
        {'place' in n ? (
          <b> Finish {ordinal(relativePlace(c.view, v.g.division, n.place))}</b>
        ) : depth < 2 ? (
          <PathTree node={n} team={team} depth={depth + 1} />
        ) : (
          <span> {stageText(n.game)} at {timeOf(n.game.g.start, c.t.timeZone)}</span>
        )}
      </li>
    );
  };
  return (
    <div className="path">
      <div className="path-game">
        <span className="d">{timeOf(v.g.start, c.t.timeZone)}</span>
        <b>{stageText(v)}</b>
        <span className="muted">
          vs{' '}
          {opp.length === 1 ? (
            withoutTag(opp[0])
          ) : (
            <Side side={v.sides[node.side === 0 ? 1 : 0]} division={v.g.division} plain />
          )}
        </span>
      </div>
      <ul className="path-branches">
        {branch('Win', node.win, true)}
        {branch('Lose', node.lose, false)}
      </ul>
    </div>
  );
}
