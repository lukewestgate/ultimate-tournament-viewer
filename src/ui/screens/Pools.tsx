import { useT } from '../ctx';
import { Empty, GameRow, TeamName } from '../parts';
import { tHref } from '../router';
import { useOpenGame } from './GameDetail';
import { leadsFor, outlookText, teamOutlook } from '../outlook';
import { TIEBREAK_LABEL } from '../../engine/rulesPresets';
import { ordinal, signed } from '../fmt';
import type { PoolStanding } from '../../engine/standings';
import { IWhatIf } from '../icons';
import type { ScreenProps } from './index';

/** Pools (spec §9.9). */
export function Pools({ arg }: ScreenProps) {
  const c = useT();
  const pools = c.t.pools.filter((p) => c.inDiv(p.division));
  if (!pools.length) return <Empty title="No pools" body="This tournament has no pool tables." />;
  const selected = pools.find((p) => p.name === arg);
  const shown = selected ? [selected] : pools;
  return (
    <>
      <div className="chips pool-chips" role="tablist" aria-label="Pools">
        <a className={`chip${!selected ? ' on' : ''}`} href={tHref(c.id, 'pools')} role="tab" aria-selected={!selected}>
          All
        </a>
        {pools.map((p) => (
          <a key={p.name} className={`chip${selected?.name === p.name ? ' on' : ''}`} href={tHref(c.id, 'pools', p.name)} role="tab" aria-selected={selected?.name === p.name}>
            {p.name.length <= 3 ? `Pool ${p.name}` : p.name}
          </a>
        ))}
      </div>
      <div className="pool-grid">
        {shown.map((p) => {
          const st = c.view.standings.get(p.name);
          return st ? <PoolCard key={p.name} st={st} full={Boolean(selected) || pools.length <= 2} /> : null;
        })}
      </div>
      <RulesInUse />
    </>
  );
}

export function PoolCard({ st, full }: { st: PoolStanding; full?: boolean }) {
  const c = useT();
  const open = useOpenGame();
  const p = st.pool;
  const name = p.name.length <= 3 ? `Pool ${p.name}` : p.name;
  const left = st.total - st.played;
  const games = c.view.games.filter((v) => v.g.pool === p.name && v.g.division === p.division);
  const carried = st.results.filter((r) => r.carried);
  const tiedTeams = new Set(st.rows.filter((r) => r.tiedWith.length).map((r) => r.team));
  const twoTeam = st.rows.length === 2;
  return (
    <section className="card pool-card" aria-labelledby={`pool-${p.name}`}>
      <div className="pool-head">
        <h3 id={`pool-${p.name}`}>
          <a href={tHref(c.id, 'pools', p.name)}>{name}</a>
        </h3>
        {p.stage === 'powerPool' && <span className="tag quiet">Power pool</span>}
        {twoTeam && <span className="tag quiet">Playoff game</span>}
        <span style={{ flex: 1 }} />
        <span className="muted small">{st.complete ? 'Complete' : `${left} game${left === 1 ? '' : 's'} left`}</span>
      </div>
      {st.source === 'td' && <div className="td-note"><span className="tag quiet">TD</span> TD’s tie-break decision. Used for the real standings.</div>}
      {st.source === 'sheet' && st.disagreement && <div className="td-note small muted">Order as the sheet shows it.</div>}
      <div className="table-scroll">
        <table className="pt">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Team</th>
              <th scope="col" title="Played">P</th>
              <th scope="col" title="Won">W</th>
              <th scope="col" title="Drawn">D</th>
              <th scope="col" title="Lost">L</th>
              {full && <th scope="col" title="Points for">F</th>}
              {full && <th scope="col" title="Points against">A</th>}
              <th scope="col" title="Difference">±</th>
              <th scope="col" title="League points">Pts</th>
            </tr>
          </thead>
          <tbody>
            {st.rows.map((r) => {
              const mine = c.isFollowed(r.team, p.division);
              const o = !st.complete ? teamOutlook(c.view, p.name, r.team) : undefined;
              return (
                <tr key={r.team} className={mine ? 'mine' : ''}>
                  <td>
                    {r.rank}
                    {tiedTeams.has(r.team) && <span className="tie-mark" title="Tied">=</span>}
                  </td>
                  <td>
                    <div className="pt-team">
                      <TeamName name={r.team} division={p.division} />
                      {o && full && o.best !== 1 && <span className="ochip bad">Can’t finish 1st</span>}
                      {o && full && o.best === o.worst && <span className="ochip good">Finishes {ordinal(o.best)}</span>}
                      {o && full && o.best !== o.worst && o.best === 1 && o.worst < st.rows.length && <span className="ochip open">{outlookText(o, st.rows.length).text}</span>}
                    </div>
                  </td>
                  <td>{r.p}</td>
                  <td>{r.w}</td>
                  <td>{r.d}</td>
                  <td>{r.l}</td>
                  {full && <td>{r.pf}</td>}
                  {full && <td>{r.pa}</td>}
                  <td>{signed(r.diff)}</td>
                  <td>{r.pts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {st.explanations.length > 0 && (
        <div className="explain">
          {st.explanations.map((e) => {
            const ra = st.rows.findIndex((r) => r.team === e.above) + 1;
            const rb = st.rows.findIndex((r) => r.team === e.below) + 1;
            return (
              <div key={`${e.above}-${e.below}`} className="ex-row">
                <span className="ex-badge d">
                  {ra}↕{rb}
                </span>
                <span>{e.text}.</span>
              </div>
            );
          })}
        </div>
      )}
      {st.tied.map((g) => (
        <div key={g.teams.join('|')} className="ex-row tied">
          <span className="ex-badge d">=</span>
          <span>
            <b>Still tied:</b> {g.teams.join(', ')}: {g.reason}.
          </span>
        </div>
      ))}
      <Leads st={st} />
      {full && (
        <div className="stack" style={{ gap: 6, padding: '0 14px 14px' }}>
          <span className="lbl">Games · {games.length + carried.length}</span>
          {carried.length > 0 && <span className="small muted">Includes {carried.length} carried result{carried.length === 1 ? '' : 's'} from the earlier stage.</span>}
          <div className="card list">
            {games.map((v) => (
              <GameRow key={v.g.id} v={v} showTime showDay onOpen={() => open(v.g.id)} />
            ))}
            {carried.map((r) => {
              const v = c.view.byId.get(r.gameId!);
              return v ? <GameRow key={`c-${r.gameId}`} v={v} showTime showDay onOpen={() => open(v.g.id)} extra={<span className="tag quiet">Carried</span>} /> : null;
            })}
          </div>
          <a className="btn" href={tHref(c.id, 'whatif', p.name)}>
            <IWhatIf size={18} /> What-if for {name}
          </a>
        </div>
      )}
    </section>
  );
}

function Leads({ st }: { st: PoolStanding }) {
  const c = useT();
  const leads = st.rows.map((_, i) => leadsFor(c.view, st.pool.name, i + 1));
  if (!leads.some(Boolean)) return null;
  // Merge consecutive places with the same destination: "1st–2nd → Pool E".
  const parts: string[] = [];
  let i = 0;
  while (i < leads.length) {
    let j = i;
    while (j + 1 < leads.length && leads[j + 1] === leads[i]) j++;
    if (leads[i]) parts.push(`${ordinal(i + 1)}${j > i ? `–${ordinal(j + 1)}` : ''} → ${leads[i]}`);
    i = j + 1;
  }
  return <div className="leads small">{parts.join(' · ')}</div>;
}

export function RulesInUse() {
  const c = useT();
  const r = c.t.rules;
  return (
    <p className="small muted rules-line">
      Win {r.points.win} · draw {r.points.draw} · loss {r.points.loss} · tie-breaks: {r.tiebreaks.map((x) => TIEBREAK_LABEL[x].toLowerCase()).join(', ')} ·{' '}
      <a href={tHref(c.id, 'settings')}>Rules</a>
    </p>
  );
}
