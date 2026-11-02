import { useEffect, useState } from 'react';
import { useT } from '../ctx';
import { Empty, GameRow, Side, TeamName, sideText } from '../parts';
import type { SideRes } from '../../engine/resolve';
import { PageHead } from '../Shell';
import { tHref } from '../router';
import { useOpenGame } from './GameDetail';
import { leadsFor, teamOutlook } from '../outlook';
import { ordinal, plural, signed, timeOf } from '../fmt';
import { withoutTag } from '../../extract/names';
import type { PoolStanding } from '../../engine/standings';
import type { Pool } from '../../model/types';
import { IChevronDown } from '../icons';
import type { ScreenProps } from './index';

const poolLabel = (p: Pool) => (p.name.length <= 3 ? `Pool ${p.name}` : p.name);

/** Pools (spec §9.9; SpecPools, LargeTabs, SpecOutdoorScreens). */
export function Pools({ arg }: ScreenProps) {
  const c = useT();
  const pools = c.t.pools.filter((p) => c.inDiv(p.division));
  const [sel, setSel] = useState<string | undefined>(arg ?? pools[0]?.name);
  useEffect(() => {
    if (arg) requestAnimationFrame(() => document.getElementById(`pool-${arg}`)?.scrollIntoView({ block: 'start' }));
  }, [arg]);
  if (!pools.length) return <Empty title="No pools" body="This tournament has no pool tables." />;
  const first = pools.filter((p) => p.stage !== 'powerPool');
  const power = pools.filter((p) => p.stage === 'powerPool');
  const range = (ps: Pool[]) => (ps.length > 1 ? `${ps[0].name}–${ps[ps.length - 1].name}` : (ps[0]?.name ?? ''));
  const desc = power.length ? [first.length ? `${first.length > 1 ? 'Pools' : 'Pool'} ${range(first)}` : '', power.length ? `then ${power.length > 1 ? 'power pools' : 'power pool'} ${range(power)}` : ''].filter(Boolean).join(' · ') : '';
  const many = pools.length > 4;
  const go = (name: string) => {
    setSel(name);
    document.getElementById(`pool-${name}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  return (
    <>
      <PageHead title={c.division ? `Pools · ${c.division}` : 'Pools'} />
      {pools.length > 1 && (
        <div className="pool-switch" role="tablist" aria-label="Pools">
          {[first, power].map((group, gi) =>
            group.length ? (
              <div key={gi} className="pool-switch-group">
                {group.map((p) => (
                  <button key={p.name} role="tab" aria-selected={sel === p.name} className={`psw${sel === p.name ? ' on' : ''}`} onClick={() => go(p.name)}>
                    {p.name}
                  </button>
                ))}
              </div>
            ) : null,
          )}
        </div>
      )}
      {desc && <p className="context">{desc}</p>}
      <div className="pool-grid">
        {pools.map((p) => {
          const st = c.view.standings.get(p.name);
          if (!st) return null;
          if (st.rows.length === 2 && p.slots.length <= 2) return <PlayoffCard key={p.name} st={st} />;
          const compact = many && st.complete && p.name !== arg && !st.rows.some((r) => c.isFollowed(r.team, p.division));
          return <PoolCard key={p.name} st={st} compact={compact} />;
        })}
      </div>
    </>
  );
}

function outlookChip(c: ReturnType<typeof useT>, st: PoolStanding, team: string): { text: string; kind: 'good' | 'open' | 'bad' } | undefined {
  if (st.complete || st.played === 0) return undefined;
  const o = teamOutlook(c.view, st.pool.name, team);
  if (!o) return undefined;
  const size = st.rows.length;
  const leads = new Set<string | undefined>();
  for (let p = o.best; p <= o.worst; p++) leads.add(leadsFor(c.view, st.pool.name, p));
  const one = leads.size === 1 ? [...leads][0] : undefined;
  if (one && o.best === 1 && o.worst < size) return { text: `Through to ${one}`, kind: 'good' };
  if (o.best === o.worst) return { text: `Finishes ${ordinal(o.best)}`, kind: 'good' };
  if (o.best >= 3) return { text: `Can’t finish top ${o.best - 1}`, kind: 'bad' };
  return { text: `Can finish ${ordinal(o.best)}–${ordinal(o.worst)}`, kind: 'open' };
}

export function PoolCard({ st, compact: initialCompact }: { st: PoolStanding; compact?: boolean }) {
  const c = useT();
  const open = useOpenGame();
  const [showGames, setShowGames] = useState(false);
  const [compact, setCompact] = useState(Boolean(initialCompact));
  const p = st.pool;
  const left = st.total - st.played;
  const games = c.view.games.filter((v) => v.g.pool === p.name && v.g.division === p.division);
  const live = games.filter((v) => v.status === 'live' || v.status === 'finishing').length;
  const carried = st.results.filter((r) => r.carried);
  const tied = new Set(st.rows.filter((r) => r.tiedWith.length && r.p > 0).map((r) => r.team));
  const perRound = Math.max(1, Math.floor(st.rows.length / 2));
  const status = st.complete ? 'Complete' : left <= perRound ? '1 round left' : `${plural(left, 'game')} left`;
  const tieGroups = st.tied.filter((g) => st.rows.some((r) => g.teams.includes(r.team) && r.p > 0));
  const td = st.source === 'td' && p.tdOrder?.length;
  return (
    <section className="card pool-card" id={`pool-${p.name}`} aria-labelledby={`pool-h-${p.name}`}>
      <div className="pool-head">
        <h3 id={`pool-h-${p.name}`}>{poolLabel(p)}</h3>
        {p.stage === 'powerPool' && <span className="tag outline sm">Power pool</span>}
        <span style={{ flex: 1 }} />
        <span className={`tag sm ${st.complete ? 'quiet' : 'soon'}`}>{status}</span>
      </div>
      {td && (
        <div className="td-box">
          <b className="td-mark">TD</b>
          <span>
            <b>TD’s tie-break decision:</b> {p.tdOrder!.map((x) => `${withoutTag(x.team)} ${ordinal(x.rank)}`).join(', ')}. Used for the real standings.
          </span>
        </div>
      )}
      {st.rows.length === 0 ? (
        <Slots games={games} />
      ) : compact ? (
        <button className="pool-summary" onClick={() => setCompact(false)} aria-label={`Show ${poolLabel(p)} table`}>
          <span>{st.rows.map((r) => `${r.rank} ${withoutTag(r.team)}`).join(' · ')}</span>
          <IChevronDown size={16} className="chev" />
        </button>
      ) : (
        <>
          <div className="table-scroll">
            <table className="pt pool-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Team</th>
                  <th scope="col" title="Played">P</th>
                  <th scope="col" title="Won">W</th>
                  <th scope="col" title="Drawn">D</th>
                  <th scope="col" title="Lost">L</th>
                  <th scope="col" title="Points for" className="col-fa">F</th>
                  <th scope="col" title="Points against" className="col-fa">A</th>
                  <th scope="col" title="Difference">±</th>
                  <th scope="col" title="League points">Pts</th>
                </tr>
              </thead>
              <tbody>
                {st.rows.map((r, i) => {
                  const chip = outlookChip(c, st, r.team);
                  const mine = c.isFollowed(r.team, p.division);
                  const next = st.rows[i + 1];
                  const tieNext = next && tied.has(r.team) && r.tiedWith.includes(next.team);
                  return (
                    <tr key={r.team} className={[mine ? 'mine' : '', tieNext ? 'tie-next' : ''].join(' ').trim() || undefined}>
                      <td className="d pt-rank">
                        {st.played === 0 ? '–' : r.rank}
                        {st.played > 0 && tied.has(r.team) && <span className="tie-mark" title="Tied">=</span>}
                      </td>
                      <td>
                        <div className="pt-team">
                          <TeamName name={r.team} division={p.division} bold={mine || (st.complete && r.rank === 1)} />
                          {chip && <span className={`ochip ${chip.kind}`}>{chip.text}</span>}
                        </div>
                      </td>
                      <td>{r.p}</td>
                      <td>{r.w}</td>
                      <td>{r.d}</td>
                      <td>{r.l}</td>
                      <td className="col-fa">{r.pf}</td>
                      <td className="col-fa">{r.pa}</td>
                      <td>{signed(r.diff)}</td>
                      <td className="pt-pts">{r.pts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {st.source === 'sheet' && st.disagreement && <p className="pool-note">Order as the sheet shows it.</p>}
          {(st.explanations.length > 0 || tieGroups.length > 0) && (
            <div className="explain">
              {st.explanations.map((e) => {
                const ra = st.rows.findIndex((r) => r.team === e.above) + 1;
                const rb = st.rows.findIndex((r) => r.team === e.below) + 1;
                const at = e.text.indexOf(': ');
                return (
                  <div key={`${e.above}-${e.below}`} className="ex-row">
                    <span className="ex-badge d">
                      {ra}={rb}
                    </span>
                    {at > 0 ? (
                      <span>
                        <b>{e.text.slice(0, at)}:</b> {e.text.slice(at + 2)}.
                      </span>
                    ) : (
                      <span>{e.text}.</span>
                    )}
                  </div>
                );
              })}
              {tieGroups.map((g) => (
                <div key={g.teams.join('|')} className="ex-row">
                  <span className="ex-badge d">=</span>
                  <span>
                    <b>Still tied: {g.teams.map(withoutTag).join(', ')}.</b> {g.reason}.
                  </span>
                </div>
              ))}
            </div>
          )}
          <Leads st={st} />
          <button className="games-toggle" onClick={() => setShowGames(!showGames)} aria-expanded={showGames}>
            <span>
              Games · {games.length + carried.length}
              {live ? ` (${live} live)` : ''}
            </span>
            <span style={{ flex: 1 }} />
            <IChevronDown size={16} className={`chev${showGames ? ' up' : ''}`} />
          </button>
          {showGames && (
            <div className="pool-games">
              {carried.length > 0 && <p className="pool-note">Includes {plural(carried.length, 'carried result')} from the earlier stage.</p>}
              {games.map((v) => (
                <GameRow key={v.g.id} v={v} showTime showDay onOpen={() => open(v.g.id)} />
              ))}
              {carried.map((r) => {
                const v = c.view.byId.get(r.gameId!);
                return v ? <GameRow key={`c-${r.gameId}`} v={v} showTime showDay onOpen={() => open(v.g.id)} extra={<span className="tag quiet sm">Carried</span>} /> : null;
              })}
            </div>
          )}
          <div className="pool-foot">
            <span>
              Win {c.t.rules.points.win} · draw {c.t.rules.points.draw} · loss {c.t.rules.points.loss}
              {c.t.rules.preset === 'uku' ? ' · UKU tie-breaks' : ''}
            </span>
            <span style={{ flex: 1 }} />
            <a href={tHref(c.id, 'settings')}>Rules</a>
            <a className="violet-link" href={tHref(c.id, 'whatif', p.name)}>
              What-if
            </a>
          </div>
        </>
      )}
    </section>
  );
}

/** A pool whose teams aren't known yet: list who fills each slot. */
function Slots({ games }: { games: ReturnType<typeof useT>['view']['games'] }) {
  const seen = new Map<string, { side: SideRes; division?: string }>();
  for (const v of games) for (const s of v.sides) if (!seen.has(s.team ?? s.label ?? '')) seen.set(s.team ?? s.label ?? '', { side: s, division: v.g.division });
  if (!seen.size) return <p className="pool-note">Teams not known yet.</p>;
  return (
    <div className="pool-slots">
      {[...seen.values()].map(({ side, division }, i) => (
        <div key={i} className="pool-slot">
          <span className="d pt-rank">–</span>
          <Side side={side} division={division} />
        </div>
      ))}
    </div>
  );
}

/** A 2-team "pool" is really one playoff game. */
function PlayoffCard({ st }: { st: PoolStanding }) {
  const c = useT();
  const open = useOpenGame();
  const p = st.pool;
  const games = c.view.games.filter((v) => v.g.pool === p.name && v.g.division === p.division && !v.g.isBye);
  const w = leadsFor(c.view, p.name, 1);
  const l = leadsFor(c.view, p.name, 2);
  const g0 = games[0];
  return (
    <section className="card pool-card playoff" id={`pool-${p.name}`}>
      <div className="pool-head">
        <h3>{poolLabel(p)} · playoff</h3>
        <span style={{ flex: 1 }} />
        <span className={`tag sm ${st.complete ? 'quiet' : 'soon'}`}>{st.complete ? 'Complete' : `${plural(games.length, 'game')}${g0 ? ` · ${timeOf(g0.g.start, c.t.timeZone)}` : ''}`}</span>
      </div>
      {games.map((v) =>
        v.result || v.sides.every((s) => s.team) ? (
          <GameRow key={v.g.id} v={v} showTime onOpen={() => open(v.g.id)} />
        ) : (
          <button key={v.g.id} className="playoff-line" onClick={() => open(v.g.id)}>
            <i>
              {sideText(v.sides[0])} v {sideText(v.sides[1])}
            </i>
            {w && <span> · winner → {w}</span>}
            {l && <span> · loser → {l}</span>}
          </button>
        ),
      )}
    </section>
  );
}

function Leads({ st }: { st: PoolStanding }) {
  const c = useT();
  const leads = st.rows.map((_, i) => leadsFor(c.view, st.pool.name, i + 1));
  if (!leads.some(Boolean)) return null;
  // Merge consecutive places with the same destination: "1st–2nd → Pool E".
  const parts: { text: string; top: boolean }[] = [];
  let i = 0;
  while (i < leads.length) {
    let j = i;
    while (j + 1 < leads.length && leads[j + 1] === leads[i]) j++;
    if (leads[i]) parts.push({ text: `${ordinal(i + 1)}${j > i ? `–${ordinal(j + 1)}` : ''} → ${leads[i]}`, top: i === 0 });
    i = j + 1;
  }
  return (
    <div className="leads">
      {parts.map((x) => (
        <span key={x.text} className={`lead-chip${x.top ? ' top' : ''}`}>
          {x.text}
        </span>
      ))}
    </div>
  );
}
