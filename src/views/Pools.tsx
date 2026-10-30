import { Icons } from '../components/icons';
import { Dot, Freshness, Possible } from '../components/ui';
import { initials } from '../engine/clubs';
import { DRAW_PTS, WIN_PTS, sideTeam, type PoolResult, type RGame } from '../engine/resolve';
import type { Outcome } from '../engine/types';
import { useApp } from '../state/app';
import { useState } from 'react';

export function PoolsView() {
  const { r, setSearchOpen, whatIf, setWhatIf } = useApp();
  const pools = [...r.pools.values()];
  const stage1 = pools.filter((p) => p.pool.stage === 1);
  const stage2 = pools.filter((p) => p.pool.stage === 2);
  const [active, setActive] = useState<string>();
  const jump = (l: string) => {
    setActive(l);
    document.getElementById(`pool-${l}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <main className="page" style={{ gap: 18 }}>
      <div className="sticky-sub">
        <div className="page-head">
          <h1>Pools</h1>
          <span className="mobile-only">
            <Freshness />
          </span>
          <button className="ib mobile-only" aria-label="Search" onClick={() => setSearchOpen(true)}>
            {Icons.search}
          </button>
          {!whatIf && (
            <button className="btn sm whatif desktop-only" onClick={() => setWhatIf(true)}>
              Explore what-ifs
            </button>
          )}
        </div>
        <div className="row" style={{ gap: 6 }}>
          {[stage1, stage2].filter((g) => g.length).map((group, i) => (
            <div key={i} role="tablist" className="row" style={{ flex: 1, gap: 2, padding: 3, borderRadius: 12, background: 'var(--surface2)' }}>
              {group.map((p) => (
                <button key={p.pool.letter} role="tab" aria-selected={active === p.pool.letter} className={`ps ${active === p.pool.letter ? 'on' : ''}`} onClick={() => jump(p.pool.letter)}>
                  {p.pool.letter}
                </button>
              ))}
            </div>
          ))}
        </div>
        {stage2.length > 0 && (
          <div className="row" style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>
            <span className="grow">Morning pools</span>
            <span className="grow" style={{ paddingLeft: 8 }}>
              Power pools · {stage2.map((p) => p.pool.letter).join('/')}
            </span>
          </div>
        )}
      </div>
      {[stage1, stage2].map((group, i) =>
        group.length ? (
          <div key={i} className="col" style={{ gap: 10 }}>
            <span className="lbl">{i === 0 ? 'Saturday morning' : 'Power pools'}</span>
            <div className="pools-grid">
              {group.map((p) => (
                <PoolCard key={p.pool.letter} p={p} />
              ))}
            </div>
          </div>
        ) : null,
      )}
      {!whatIf && (
        <button className="btn whatif mobile-only" style={{ height: 52, borderRadius: 14 }} onClick={() => setWhatIf(true)}>
          {Icons.whatif}Explore what-ifs
        </button>
      )}
    </main>
  );
}

function PoolCard({ p }: { p: PoolResult }) {
  const { myTeam, t, whatIf } = useApp();
  const [open, setOpen] = useState(whatIf);
  const started = [...p.games, ...p.carried].some((g) => g.outcome);
  const statusText = p.complete && !p.hyp ? 'Final' : p.complete ? 'Hypothetical' : started ? 'In progress' : 'Not started';
  const half = Math.ceil(p.rows.length / 2);
  const maxSeed = Math.max(...t.seeds.map((s) => s.seed));
  const dest = (pos: number) => {
    const seed = p.pool.finishToSeed[pos];
    if (seed === undefined) return { text: '', up: false };
    const next = t.pools.find((x) => x.stage > p.pool.stage && x.slots.some((s) => s.seed === seed));
    if (next) return { text: next.letter, up: seed <= maxSeed / 2 };
    return { text: `#${seed}`, up: seed <= maxSeed / 2 };
  };
  const tied = p.rows.some((r) => r.tied);
  return (
    <section id={`pool-${p.pool.letter}`} className={`card ${p.hyp ? 'hyp' : ''}`} style={{ overflow: 'hidden', scrollMarginTop: 170 }}>
      <div className="row" style={{ padding: '14px 16px 10px', gap: 10 }}>
        <h2 style={{ fontSize: 20 }}>{p.pool.stage === 2 ? 'Power pool' : 'Pool'} {p.pool.letter}</h2>
        <span className="lbl">{statusText}</span>
        <span className="grow" />
        <span className="cap" style={{ fontWeight: 500 }}>
          W {WIN_PTS} · D {DRAW_PTS} pts
        </span>
      </div>
      <table className="ptable">
        <thead>
          <tr className="lbl" style={{ borderTop: 0 }}>
            <th style={{ width: 16 }}>#</th>
            <th>Team</th>
            <th style={{ width: 24 }}>W</th>
            <th style={{ width: 24 }}>L</th>
            <th style={{ width: 24 }}>D</th>
            <th style={{ width: 34 }}>Pts</th>
            <th style={{ width: 56 }}>Next</th>
          </tr>
        </thead>
        <tbody>
          {p.rows.map((row, i) => {
            const d = dest(i + 1);
            const mine = row.team && row.team === myTeam;
            return (
              <tr key={row.slot} className={`${i === half ? 'cut' : ''} ${mine ? 'mine-row' : ''}`}>
                <td style={{ fontWeight: 700, color: 'var(--ink3)', textAlign: 'left' }}>
                  {row.rank ?? '–'}
                  {row.tied && row.played ? '=' : ''}
                </td>
                <td className="team" style={{ fontWeight: mine ? 700 : 500 }}>
                  {row.team ? (
                    <span className="row" style={{ gap: 8 }}>
                      <Dot team={row.team} />
                      {row.team}
                    </span>
                  ) : (
                    <span className="col" style={{ gap: 2 }}>
                      <span className="row" style={{ gap: 8, fontStyle: 'italic', color: 'var(--ink2)' }}>
                        <span className="dot hollow" />
                        {row.side.label || row.slot}
                      </span>
                      {row.side.teams.length <= 2 && <Possible teams={row.side.teams} />}
                    </span>
                  )}
                </td>
                <td>{row.team ? row.w : ''}</td>
                <td>{row.team ? row.l : ''}</td>
                <td>{row.team ? row.d : ''}</td>
                <td style={{ fontWeight: 700, fontSize: 19 }}>{row.team ? row.pts : ''}</td>
                <td>{d.text && <span className={`adv ${d.up ? 'up' : ''}`}>→ {d.text}</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {tied && p.complete && (
        <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--ink3)', borderTop: '1px solid var(--line)' }}>
          Teams marked “=” are level and need tiebreakers that depend on scores. The sheet has the final word.
        </div>
      )}
      {p.carried.map((c) => (
        <div key={c.game.id} className="row" style={{ padding: '10px 16px', borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--ink2)' }}>
          <span className="tag">CARRIED</span>
          {sideTeam(c.lo) && sideTeam(c.hi) ? (
            <span className="grow">
              {sideTeam(c.lo)} {c.game.scoreLo ?? ''}–{c.game.scoreHi ?? ''} {sideTeam(c.hi)}
            </span>
          ) : (
            <span className="grow">
              {c.lo.label} v {c.hi.label} result carries over
            </span>
          )}
        </div>
      ))}
      <div style={{ borderTop: '1px solid var(--line)' }}>
        <button aria-expanded={open} onClick={() => setOpen(!open)} className="row" style={{ width: '100%', minHeight: 48, padding: '0 16px', border: 0, background: 'transparent', fontWeight: 600, fontSize: 14 }}>
          <span className="grow" style={{ textAlign: 'left' }}>
            Games · {p.games.length}
          </span>
          <span style={{ transform: open ? 'rotate(180deg)' : 'none', display: 'inline-flex' }}>{Icons.chevron}</span>
        </button>
        {open && p.games.map((rg) => <PoolGameRow key={rg.game.id} rg={rg} />)}
      </div>
    </section>
  );
}

function PoolGameRow({ rg }: { rg: RGame }) {
  const { whatIf, pick, openGame, myTeam } = useApp();
  const g = rg.game;
  const canPick = whatIf && !rg.real && sideTeam(rg.lo) && sideTeam(rg.hi);
  const line = (side: 'lo' | 'hi') => {
    const s = rg[side];
    const tm = sideTeam(s);
    const win = rg.outcome === side;
    const lose = rg.outcome && rg.outcome !== 'draw' && !win;
    return (
      <span className="row" style={{ gap: 6, fontWeight: win || tm === myTeam ? 700 : 500, color: lose ? 'var(--ink3)' : undefined, fontStyle: tm ? undefined : 'italic' }}>
        <Dot team={tm} size="xs" />
        <span className="grow ellipsis">{tm ?? s.label}</span>
        <span className="d" style={{ fontSize: 17, fontWeight: 700 }}>
          {side === 'lo' ? g.scoreLo : g.scoreHi}
        </span>
      </span>
    );
  };
  const cur = rg.real ? undefined : rg.outcome;
  const set = (o: Outcome) => pick(g.id, cur === o ? undefined : o);
  return (
    <div className={`row ${!rg.real && rg.outcome ? 'hyp-row' : ''}`} style={{ padding: '8px 16px', borderTop: '1px solid var(--line)', fontSize: 14, gap: 10, background: !rg.real && rg.outcome ? 'var(--whatif-soft)' : undefined }}>
      <button onClick={() => openGame(g.id)} className="row grow" style={{ border: 0, background: 'transparent', padding: 0, textAlign: 'left', gap: 10 }}>
        <span className="d" style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink3)', width: 64 }}>
          {g.time} P{g.pitch}
        </span>
        <span className="grow col" style={{ gap: 1 }}>
          {line('lo')}
          {line('hi')}
        </span>
      </button>
      {canPick && (
        <div className="seg" style={{ padding: 2, gap: 2 }} role="group" aria-label="Pick result">
          {(['lo', 'draw', 'hi'] as Outcome[]).map((o) => (
            <button key={o} aria-pressed={cur === o} onClick={() => set(o)} style={{ height: 32, padding: '0 8px', fontSize: 12 }} title={o === 'draw' ? 'Draw' : `${sideTeam(rg[o])} win`}>
              {o === 'draw' ? 'D' : initials(sideTeam(rg[o]) ?? '')}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
