import { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from '../components/icons';
import { Badges, Dot, Freshness, Live } from '../components/ui';
import { ord, placeBadges } from '../engine/bracket';
import { sideTeam, type RGame, type Side } from '../engine/resolve';
import { shortDay } from '../engine/time';
import { useApp } from '../state/app';
import { FinalStandings } from './Now';

const NODE_H = 118;

type NodeState = 'on' | 'pos' | 'dim' | '';

export function BracketsView() {
  const { bracket, myTeam, t, setSearchOpen, whatIf, setWhatIf } = useApp();
  const [board, setBoard] = useState<0 | 1 | 'standings'>(0);
  const [hl, setHl] = useState<string | undefined>(myTeam);
  const [picking, setPicking] = useState(false);
  const desktop = useMedia('(min-width: 900px)');

  if (!bracket.games.length) {
    return (
      <main className="page">
        <div className="card empty">
          <b>No bracket games in this schedule</b>
        </div>
      </main>
    );
  }
  const half = bracket.maxPos / 2;
  return (
    <main className="page wide" style={{ gap: 14 }}>
      <div className="page-head">
        <h1>{desktop ? 'Sunday brackets' : 'Brackets'}</h1>
        <span className="mobile-only">
          <Freshness />
        </span>
        <button className="ib mobile-only" aria-label="Search" onClick={() => setSearchOpen(true)}>
          {Icons.search}
        </button>
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="seg" role="tablist" aria-label="Board" style={{ flex: desktop ? '0 0 auto' : 1 }}>
          <button role="tab" aria-selected={board === 0} onClick={() => setBoard(0)}>
            {desktop ? `Board 1 · 1st–${ord(half)}` : `1st–${ord(half)}`}
          </button>
          <button role="tab" aria-selected={board === 1} onClick={() => setBoard(1)}>
            {desktop ? `Board 2 · ${ord(half + 1)}–${ord(bracket.maxPos)}` : `${ord(half + 1)}–${ord(bracket.maxPos)}`}
          </button>
          <button role="tab" aria-selected={board === 'standings'} onClick={() => setBoard('standings')}>
            {desktop ? 'Final standings' : 'Standings'}
          </button>
        </div>
        <span className="grow desktop-only" />
        {board !== 'standings' && (
          <div className="row" style={{ gap: 8, width: desktop ? 'auto' : '100%' }}>
            {hl ? (
              <button className="chip" style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700 }} onClick={() => setHl(undefined)}>
                <Dot team={hl} size="sm" />
                {hl} path
                {Icons.close}
              </button>
            ) : null}
            {picking ? (
              <select
                autoFocus
                className="chip"
                onChange={(e) => {
                  setHl(e.target.value || undefined);
                  setPicking(false);
                }}
                onBlur={() => setPicking(false)}
                defaultValue={hl ?? ''}
              >
                <option value="">No highlight</option>
                {[...t.seeds].sort((a, b) => a.team.localeCompare(b.team, undefined, { numeric: true })).map((s) => (
                  <option key={s.team} value={s.team}>
                    {s.team}
                  </option>
                ))}
              </select>
            ) : (
              <button className="chip" onClick={() => setPicking(true)}>
                {hl ? 'Change' : 'Highlight a team'}
              </button>
            )}
            <span className="grow mobile-only" />
            {!whatIf && (
              <button className="chip" style={{ border: '1.5px dashed var(--whatif)', color: 'var(--whatif)', fontWeight: 700 }} onClick={() => setWhatIf(true)}>
                What-if
              </button>
            )}
          </div>
        )}
      </div>
      {board === 'standings' ? (
        <FinalStandings />
      ) : (
        <BracketBoard key={board} board={board} highlight={hl} desktop={desktop} />
      )}
    </main>
  );
}

function useMedia(q: string) {
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

function BracketBoard({ board, highlight, desktop }: { board: 0 | 1; highlight?: string; desktop: boolean }) {
  const { bracket, r, t } = useApp();
  const colW = desktop ? 214 : 236;
  const gap = desktop ? 46 : 40;
  const layout = useMemo(() => bracket.layout(board, { colW, gap, unit: NODE_H + 22, treeGap: 36 }), [bracket, board, colW, gap]);
  const scroller = useRef<HTMLDivElement>(null);
  const [activeCol, setActiveCol] = useState(0);
  const top = desktop ? 36 : 4;

  const stateOf = (rg: RGame): NodeState => {
    if (!highlight) return '';
    if (sideTeam(rg.lo) === highlight || sideTeam(rg.hi) === highlight) return 'on';
    if (rg.lo.teams.includes(highlight) || rg.hi.teams.includes(highlight)) return 'pos';
    return 'dim';
  };

  const half = bracket.maxPos / 2;
  const places = Array.from({ length: half }, (_, i) => (board === 0 ? i + 1 : half + i + 1));

  return (
    <>
      {!desktop && (
        <nav className="round-tabs" aria-label="Rounds">
          {layout.cols.map((c, i) => (
            <button
              key={i}
              className={`rd ${activeCol === i ? 'on' : ''}`}
              aria-current={activeCol === i}
              onClick={() => scroller.current?.scrollTo({ left: c.x, behavior: 'smooth' })}
            >
              {c.title.replace('Quarter-finals', 'QF').replace('Semi-finals', 'SF').replace('Medal games', 'Finals')}
            </button>
          ))}
        </nav>
      )}
      <div className="bracket-panel">
        <div className="bracket-wrap">
          <div
            className="bracket-scroll"
            style={{ flex: `1 1 ${layout.width}px`, maxWidth: '100%' }}
            ref={scroller}
            onScroll={(e) => setActiveCol(Math.round(e.currentTarget.scrollLeft / (colW + gap)))}
          >
            <div className="bracket-canvas" style={{ width: layout.width + (desktop ? 0 : 98), height: layout.height + top + 10 }}>
              {layout.cols.map((c, i) => (
                <span key={i} className="snap" style={{ left: c.x }} />
              ))}
              {desktop &&
                layout.cols.map((c, i) => (
                  <span key={i} className="colh" style={{ left: c.x }}>
                    {c.title} · {c.time}
                  </span>
                ))}
              <svg width={layout.width} height={layout.height + top} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} aria-hidden="true">
                {layout.nodes.map((n) => {
                  if (!n.parent) return null;
                  const p = layout.nodes.find((x) => x.game.id === n.parent!.id);
                  if (!p) return null;
                  const child = r.byId.get(n.game.id)!;
                  const parent = r.byId.get(p.game.id)!;
                  const x1 = n.x + colW;
                  const y1 = n.y + top + NODE_H / 2;
                  const x2 = p.x;
                  const y2 = p.y + top + NODE_H / 2;
                  const mx = x2 - gap / 2;
                  const rad = Math.min(10, Math.abs(y2 - y1) / 2);
                  const dir = y2 > y1 ? 1 : -1;
                  const d =
                    y1 === y2
                      ? `M${x1},${y1} H${x2}`
                      : `M${x1},${y1} H${mx - rad} Q${mx},${y1} ${mx},${y1 + dir * rad} V${y2 - dir * rad} Q${mx},${y2} ${mx + rad},${y2} H${x2}`;
                  let stroke = 'var(--line-strong)';
                  let dash: string | undefined;
                  let width = 2;
                  let opacity = 1;
                  if (highlight) {
                    const cs = stateOf(child);
                    const ps = stateOf(parent);
                    const flows = cs !== 'dim' && ps !== 'dim';
                    if (flows) {
                      stroke = 'var(--accent)';
                      width = 2.5;
                      const decided = !!child.outcome && sideTeam(child.outcome === 'lo' ? child.lo : child.hi) === highlight;
                      if (!decided) dash = '6 5';
                    } else opacity = 0.45;
                  }
                  return <path key={n.game.id} d={d} fill="none" stroke={stroke} strokeWidth={width} strokeDasharray={dash} opacity={opacity} />;
                })}
              </svg>
              {layout.nodes.map((n) => (
                <BracketNode key={n.game.id} rg={r.byId.get(n.game.id)!} x={n.x} y={n.y + top} w={colW} state={stateOf(r.byId.get(n.game.id)!)} />
              ))}
            </div>
          </div>
          {desktop && (
            <div className="places" style={{ width: 230, paddingTop: top, flex: 'none' }}>
              <span className="lbl" style={{ marginTop: -top, marginBottom: 12, fontSize: 12 }}>
                Placement
              </span>
              {places.map((p) => {
                const side = r.places.get(p);
                const team = side && sideTeam(side);
                const dec = bracket.decider(p);
                const from = dec.game ? `${dec.take === 'W' ? 'Winner' : 'Loser'} ${bracket.name(dec.game).toLowerCase().replace('game to go', 'game to go')}` : `Seed ${p}`;
                return (
                  <div key={p} className="place" style={team === highlight && team ? { boxShadow: 'inset 3px 0 0 var(--accent)' } : undefined}>
                    <span className="d n">{ord(p)}</span>
                    <span className="grow col" style={{ fontSize: 12, lineHeight: 1.25 }}>
                      {team && side?.settled ? (
                        <b className="row" style={{ fontSize: 13, gap: 6 }}>
                          <Dot team={team} size="xs" />
                          {team}
                        </b>
                      ) : (
                        <span style={{ color: 'var(--ink2)' }}>{from}</span>
                      )}
                    </span>
                    <Badges list={placeBadges(p, t, bracket)} />
                  </div>
                );
              })}
              <div className="col" style={{ gap: 6, padding: '12px 4px 0', fontSize: 12, color: 'var(--ink2)' }}>
                <span className="row">
                  <span className="badge Q">Q</span>Division 1 qualified
                </span>
                <span className="row">
                  <span className="badge q">q</span>Division 2 qualified
                </span>
                <span className="row">
                  <span className="badge GTG">GTG</span>Game to go
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      {!desktop && (
        <div className="row" style={{ justifyContent: 'center', gap: 6 }}>
          {layout.cols.map((_, i) => (
            <span key={i} style={{ width: i === activeCol ? 18 : 6, height: 6, borderRadius: 3, background: i === activeCol ? 'var(--ink)' : 'var(--line-strong)' }} />
          ))}
        </div>
      )}
      {!desktop && <PlacesList places={places} highlight={highlight} />}
    </>
  );
}

function PlacesList({ places, highlight }: { places: number[]; highlight?: string }) {
  const { r, t, bracket } = useApp();
  return (
    <section className="section">
      <span className="lbl">Placement</span>
      <div className="card list">
        {places.map((p) => {
          const side = r.places.get(p);
          const team = side && side.settled ? sideTeam(side) : undefined;
          const dec = bracket.decider(p);
          return (
            <div key={p} className={`lrow ${team && team === highlight ? 'mine-row' : ''}`} style={{ minHeight: 40, padding: '6px 14px' }}>
              <span className="d" style={{ fontSize: 18, fontWeight: 700, width: 38 }}>
                {ord(p)}
              </span>
              <span className="grow row" style={{ fontSize: 13 }}>
                {team ? (
                  <>
                    <Dot team={team} size="sm" />
                    <b>{team}</b>
                  </>
                ) : (
                  <span className="muted">{dec.game ? `${dec.take === 'W' ? 'Winner' : 'Loser'} ${bracket.name(dec.game)}` : `Seed ${p}`}</span>
                )}
              </span>
              <Badges list={placeBadges(p, t, bracket)} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BracketNode({ rg, x, y, w, state }: { rg: RGame; x: number; y: number; w: number; state: NodeState }) {
  const { status, openGame, whatIf, pick, bracket, flash } = useApp();
  const g = rg.game;
  const st = status(rg);
  const hyp = !rg.real && !!rg.outcome;
  const canPick = whatIf && !rg.real;
  const row = (side: 'lo' | 'hi') => {
    const s: Side = rg[side];
    const team = sideTeam(s);
    const win = rg.outcome === side;
    const lose = !!rg.outcome && !win;
    const score = side === 'lo' ? g.scoreLo : g.scoreHi;
    const content = (
      <>
        {team ? <Dot team={team} size="sm" /> : <span className="dot sm hollow" />}
        <span className="grow col" style={{ lineHeight: 1.2 }}>
          <span className="ellipsis" style={{ fontWeight: win ? 700 : 500, fontStyle: team ? 'normal' : 'italic', color: lose ? 'var(--ink3)' : team ? 'var(--ink)' : 'var(--ink2)' }}>
            {team ?? s.label}
          </span>
          {!team && s.teams.length > 0 && (
            <span className="ellipsis" style={{ fontSize: 11, color: 'var(--ink3)' }}>
              {s.teams.length <= 2 ? s.teams.join(' or ') : `1 of ${s.teams.length} teams`}
            </span>
          )}
        </span>
        {hyp && win && <span className="badge IF">IF</span>}
        <span className={`ns ${flash.has(g.id) ? 'flash' : ''}`} style={{ color: lose ? 'var(--ink3)' : undefined }}>
          {score ?? ''}
        </span>
      </>
    );
    if (canPick && s.teams.length > 0)
      return (
        <button className={`nr ${hyp && win ? 'picked' : ''}`} onClick={() => pick(g.id, rg.outcome === side ? undefined : side)} aria-label={`Pick ${team ?? s.label} to win`}>
          {content}
        </button>
      );
    return (
      <div className="nr" onClick={() => openGame(g.id)} style={{ cursor: 'pointer' }}>
        {content}
      </div>
    );
  };
  return (
    <div className={`node ${state} ${hyp ? 'hyp' : ''}`} style={{ left: x, top: y, width: w }}>
      <button className="nh" onClick={() => openGame(g.id)}>
        <span>
          {shortDay(g.day).toUpperCase()} {g.time} · P{g.pitch}
        </span>
        <span className="grow" />
        <span className="d" style={{ fontSize: 13 }}>
          {g.isGameToGo ? 'GTG' : bracket.name(g) === 'Final' ? 'FINAL' : g.code}
        </span>
        {st === 'live' && <Live />}
      </button>
      {row('lo')}
      {row('hi')}
    </div>
  );
}
