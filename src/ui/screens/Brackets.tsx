import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildBoards, type Board } from '../../engine/bracket';
import { finalSections, pathsAhead, relativePlace, type GameView, type PathNode } from '../../engine/view';
import { divKey } from '../../model/types';
import { parseTeamKey } from '../../store/settings';
import { withoutTag } from '../../extract/names';
import { useT } from '../ctx';
import { dateLabel, ordinal, plural, timeOf } from '../fmt';
import { Empty, GameRow, Seg, LiveTag, TeamName, possibleText, scoreText, winnerSide } from '../parts';
import { PageHead } from '../Shell';
import { feedsOf } from '../outlook';
import { IStar, IClose } from '../icons';
import { setParams } from '../router';
import { useOpenGame } from './GameDetail';
import { boardSections, columnNames, elbow, gameTitle, layoutColumns, type BoardSections } from '../bracketLayout';
import type { ScreenProps } from './index';

function useDesktop() {
  const q = '(min-width: 900px)';
  const [on, setOn] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setOn(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return on;
}

/** Brackets / Finals & placings (spec §9.10; BracketPhone, BracketDesktop, SpecInfo). */
export function Brackets(_: ScreenProps) {
  const c = useT();
  const desktop = useDesktop();
  const boards = useMemo(() => buildBoards(c.t, c.view.format).filter((b) => c.inDiv(b.division)), [c.t, c.view.format, c.division]); // eslint-disable-line react-hooks/exhaustive-deps
  const placement = c.view.games.filter((v) => v.g.stage === 'placement' && c.inDiv(v.g.division) && !v.g.unscheduled);
  const divs = c.t.divisions.length ? c.t.divisions.map((d) => d.name).filter((d) => c.inDiv(d)) : [undefined];
  const basicDivs = divs.filter((d) => c.view.levels[divKey(d)] === 'basic');
  const allBasic = basicDivs.length === divs.length;
  const [tab, setTab] = useState<string>('0');
  const [hlChoice, setHl] = useState<string | null | undefined>(undefined);
  useEffect(() => setTab('0'), [c.division]);
  const name = c.division ?? (c.t.divisions.length === 1 ? c.t.divisions[0].name : undefined);
  const title = allBasic ? `Finals & placings${name ? ` · ${name}` : ''}` : (name ?? 'Brackets');
  if (!placement.length && !c.t.finalStandings?.length)
    return (
      <>
        <PageHead title={title} />
        <Empty title="No brackets yet" body="Placement games appear once the sheet lists them." />
      </>
    );
  const multiDiv = !c.division && c.t.divisions.length > 1;
  const tabs = [...boards.map((b, i) => ({ value: String(i), label: multiDiv ? `${b.division ?? ''} ${b.title}`.trim() : b.title })), { value: 'standings', label: desktop ? 'Final standings' : 'Standings' }];
  const board = tab === 'standings' ? undefined : boards[Number(tab)];
  const div = board?.division;
  const followed = c.followed.map(parseTeamKey).filter((f) => (f.division ?? '') === (div ?? ''));
  const primary = c.primary ? parseTeamKey(c.primary) : undefined;
  const defaultHl = primary && (primary.division ?? '') === (div ?? '') ? primary.name : followed[0]?.name;
  const hl = hlChoice === null ? undefined : hlChoice && followed.some((f) => f.name === hlChoice) ? hlChoice : defaultHl;
  const level = board ? c.view.levels[divKey(board.division)] : undefined;
  const seg = boards.length > 0 && <Seg label="Bracket" value={tab} options={tabs} onChange={setTab} className={`board-seg${tabs.length > 4 ? ' scroll' : ''}`} />;
  const highlight = board && followed.length > 0 && (
    <label className={`path-pill${hl ? ' on' : ''}`}>
      <IStar size={14} filled={Boolean(hl)} />
      <span>{hl ? (desktop ? `Highlighting ${withoutTag(hl)}` : `${withoutTag(hl)} path`) : 'Highlight a team'}</span>
      {hl && desktop && (
        <button className="pill-x" aria-label="Stop highlighting" onClick={(e) => (e.preventDefault(), setHl(null))}>
          <IClose size={14} />
        </button>
      )}
      <select value={hl ?? ''} onChange={(e) => setHl(e.target.value || null)} aria-label="Highlight a team’s path">
        <option value="">No highlight</option>
        {followed.map((f) => (
          <option key={f.name} value={f.name}>
            {withoutTag(f.name)}
          </option>
        ))}
      </select>
    </label>
  );
  const levelTag = level && level !== 'basic' && <span className={`tag sm ${level === 'full' ? 'win' : 'soon'}`}>{level === 'full' ? 'Full' : 'Partial'}</span>;
  const partialNote = level === 'partial' && (
    <div className="partial-note">
      <span className="tag sm solid-accent">Partial</span>
      <span>We know where most teams come from. Where we don’t, you’ll see the TD’s own words until the sheet names a team.</span>
    </div>
  );
  const body = !board ? (
    <FinalStandings quiet={tab !== 'standings'} />
  ) : desktop ? (
    <DesktopBoard board={board} hl={hl} />
  ) : (
    <PhoneBoard
      key={tab}
      board={board}
      hl={hl}
      tools={
        (highlight || levelTag) && (
          <div className="board-tools">
            {highlight}
            <span style={{ flex: 1 }} />
            {levelTag}
          </div>
        )
      }
    />
  );
  if (desktop)
    return (
      <div className="br-page">
        <div className="br-main">
          <div className="br-head">
            <h1>{title}</h1>
            {seg}
            <span style={{ flex: 1 }} />
            {levelTag}
            {highlight}
            {board && !c.whatIf && (
              <button className="chip whatif-chip" onClick={() => setParams({ if: '_' })}>
                What-if
              </button>
            )}
          </div>
          {partialNote}
          {body}
          {basicDivs.length > 0 && tab !== 'standings' && <FinalsList divisions={basicDivs} />}
        </div>
        {board && <SidePanel board={board} boards={boards} hl={hl} onBoard={setTab} />}
      </div>
    );
  return (
    <>
      <PageHead title={title} />
      {seg}
      {partialNote}
      {body}
      {basicDivs.length > 0 && tab !== 'standings' && <FinalsList divisions={basicDivs} />}
    </>
  );
}

// ---------------------------------------------------------------- shared model

interface Model {
  s: BoardSections;
  views: Map<string, GameView>;
  names: { long: string; short: string; one: string }[];
  title: (id: string) => string;
  state: (v: GameView) => '' | 'on' | 'pos' | 'dim';
  lowerLabel: string;
  lowerFrom: string;
}

function useModel(board: Board, hl?: string): Model {
  const c = useT();
  const f = c.view.format.divisions[divKey(board.division)];
  const s = useMemo(() => boardSections(board, f), [board, f]);
  const views = new Map(board.rounds.flat().map((id) => [id, c.view.byId.get(id)!]).filter(([, v]) => v) as [string, GameView][]);
  const minPlace = Math.min(...(c.view.places.get(divKey(board.division)) ?? []).map((p) => p.place), Infinity);
  const min = Number.isFinite(minPlace) ? minPlace : 1;
  const names = columnNames(s.upper);
  const title = (id: string) => {
    const v = views.get(id);
    return v ? gameTitle(v.g, s.decides.get(id), min, ordinal, `${timeOf(v.g.start, c.t.timeZone)}${v.g.pitch.label ? ` P${v.g.pitch.label}` : ''}`) : id;
  };
  const state = (v: GameView): '' | 'on' | 'pos' | 'dim' => {
    if (!hl) return '';
    if (v.sides.some((x) => x.team === hl)) return 'on';
    if (v.sides.some((x) => !x.team && x.possible.includes(hl))) return 'pos';
    return 'dim';
  };
  const lowerPlaces = s.lower.flat().flatMap((id) => {
    const v = views.get(id);
    if (!v || v.g.conditional || v.g.isGameToGo) return [];
    const d = s.decides.get(id);
    return [d?.winner, d?.loser].filter((x): x is number => x !== undefined);
  });
  const upperIds = new Set(s.upper.flat());
  const entering = (s.lower[0] ?? []).flatMap((id) => s.inputs.get(id) ?? []).filter((x) => upperIds.has(x.game) && x.take === 'loser').length;
  const hi = lowerPlaces.length ? Math.max(...lowerPlaces) - min + 1 : 0;
  const lo = lowerPlaces.length ? (entering > 1 ? Math.max(1, hi - entering + 1) : Math.min(...lowerPlaces) - min + 1) : 0;
  const lowerLabel = lowerPlaces.length ? `${ordinal(lo)}–${ordinal(hi)}` : 'Placings';
  const feeder = s.lower[0]?.flatMap((id) => s.inputs.get(id) ?? []).find((x) => upperIds.has(x.game));
  const feederCol = feeder ? s.upper.findIndex((col) => col.includes(feeder.game)) : -1;
  const lowerFrom = feederCol >= 0 ? `${names[feederCol].one} losers` : '';
  return { s, views, names, title, state, lowerLabel, lowerFrom };
}

function NodeTags({ v }: { v: GameView }) {
  if (v.simulated) return <span className="tag sim">SIM</span>;
  if (v.result?.hypothetical) return <span className="tag if">IF</span>;
  if (v.status === 'live' || v.status === 'finishing') return <LiveTag />;
  if (v.status === 'ifRequired') return <span className="tag dashed">If required</span>;
  if (v.status === 'notPlayed') return <span className="tag struck">Not played</span>;
  if (v.status === 'awaiting') return <span className="tag outline">Awaiting</span>;
  return null;
}

function NodeRow({ v, i, sub }: { v: GameView; i: 0 | 1; sub?: boolean }) {
  const c = useT();
  const w = winnerSide(v);
  const side = v.sides[i];
  const cls = `nr${w === i ? ' won' : ''}${w !== undefined && w !== i ? ' lost' : ''}`;
  const score = v.result && <b className="d ns">{scoreText(v, i)}</b>;
  if (side.team)
    return (
      <span className={cls}>
        <TeamName name={side.team} division={v.g.division} bold={w === i} />
        {score}
      </span>
    );
  const partialUnknown = !side.possible.length && c.view.levels[divKey(v.g.division)] === 'partial';
  const label = side.label ?? 'To be decided';
  const subText = side.possible.length ? possibleText(side.possible) : partialUnknown ? 'From the sheet · we can’t predict this one' : '';
  return (
    <span className={`${cls} open${sub && subText ? ' tall' : ''}`}>
      <span className="dot ring" />
      <span className="nr-text">
        <i>{partialUnknown && !/^["“]/.test(label) ? `“${label}”` : label}</i>
        {sub && subText && <small>{subText}</small>}
      </span>
      {score}
    </span>
  );
}

function Node({ v, state, x, y, w, sub, onOpen, className }: { v: GameView; state: string; x: number; y: number; w: number; sub?: boolean; onOpen: () => void; className?: string }) {
  const c = useT();
  const cls = ['bnode', state, v.status === 'ifRequired' || v.g.conditional ? 'ifreq' : '', v.status === 'notPlayed' ? 'np' : '', v.result?.hypothetical ? 'hyp' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <button className={cls} style={{ left: x, top: y, width: w }} onClick={onOpen}>
      <span className="nh">
        <span className="nh-when">
          {v.g.day.slice(0, 3).toUpperCase()} {timeOf(v.g.start, c.t.timeZone)}
          {v.g.pitch.label ? ` · P${v.g.pitch.label}` : ''}
        </span>
        <span style={{ flex: 1 }} />
        {v.g.code && <span className="nh-code">{v.g.code.replace(/[[\]]/g, '')}</span>}
        <NodeTags v={v} />
      </span>
      <NodeRow v={v} i={0} sub={sub} />
      <NodeRow v={v} i={1} sub={sub} />
    </button>
  );
}

/** Whether an unknown side has a second line: who could be there, or (Partial) that it's the sheet's own text. */
const hasSub = (v: GameView, i: 0 | 1, partial: boolean) => !v.sides[i].team && (v.sides[i].possible.length > 0 || partial);

/** Node height: a 28px header plus two rows; on phones unknown sides with a second line are taller. */
const nodeHeight = (v: GameView | undefined, rowH: number, tallH: number, partial = false) => {
  if (!v) return 32 + rowH * 2;
  const row = (i: 0 | 1) => (hasSub(v, i, partial) ? tallH : rowH);
  return 32 + row(0) + row(1);
};

/** SVG connectors: winners feeding the next column (dashed into conditional games), dotted between sections. */
function Connectors({ m, pos, xOf, w, width, height, crossDotted }: { m: Model; pos: Map<string, { col: number; y: number; h: number }>; xOf: (id: string) => number; w: number; width: number; height: number; crossDotted?: boolean }) {
  const upperIds = new Set(m.s.upper.flat());
  const paths: ReactNode[] = [];
  for (const [id, p] of pos) {
    const v = m.views.get(id);
    if (!v) continue;
    const target = m.state(v);
    for (const x of m.s.inputs.get(id) ?? []) {
      const q = pos.get(x.game);
      const src = m.views.get(x.game);
      if (!q || !src) continue;
      const sameSection = upperIds.has(id) === upperIds.has(x.game);
      if (sameSection && x.take === 'winner' && xOf(x.game) < xOf(id)) {
        const st = m.state(src);
        const cls = target === '' ? '' : st === 'on' && target === 'on' ? 'on' : (st === 'on' || st === 'pos') && (target === 'pos' || target === 'on') ? 'pos' : 'dim';
        const dashed = v.status === 'ifRequired' || v.g.conditional;
        paths.push(<path key={`${x.game}-${id}`} className={`cn ${cls}${dashed ? ' dashed' : ''}`} d={elbow(xOf(x.game) + w, q.y + q.h / 2, xOf(id), p.y + p.h / 2)} />);
      } else if (crossDotted && !sameSection && Math.abs(xOf(x.game) - xOf(id)) < 1 && q.y < p.y && ![...pos.entries()].some(([o, r]) => o !== id && o !== x.game && Math.abs(xOf(o) - xOf(id)) < 1 && r.y > q.y && r.y < p.y)) {
        const cx = xOf(id) + w / 2;
        paths.push(<path key={`${x.game}-${id}`} className="cn dotted" d={`M${cx},${q.y + q.h} V${p.y}`} />);
      }
    }
  }
  return (
    <svg className="br-svg" width={width} height={height} aria-hidden="true">
      {paths}
    </svg>
  );
}

// ---------------------------------------------------------------- desktop

const D = { w: 224, stride: 280, row: 34, gap: 42, below: 86, head: 34 };

function DesktopBoard({ board, hl }: { board: Board; hl?: string }) {
  const c = useT();
  const open = useOpenGame();
  const m = useModel(board, hl);
  const h = (id: string) => nodeHeight(m.views.get(id), D.row, D.row);
  const up = layoutColumns(m.s.upper, m.s.inputs, h, D.gap, D.below);
  const lowerTop = m.s.lower.length ? up.height + 96 : up.height;
  const lo = layoutColumns(m.s.lower, m.s.inputs, h, D.gap, D.below);
  const pos = new Map<string, { col: number; y: number; h: number }>();
  for (const [id, p] of up.pos) pos.set(id, p);
  for (const [id, p] of lo.pos) pos.set(id, { ...p, y: p.y + lowerTop });
  const nCols = Math.max(m.s.upper.length, m.s.lower.length);
  // Four or more rounds: tighter columns, and the places go underneath so nothing scrolls off.
  const wide = nCols >= 4;
  const stride = wide ? 246 : D.stride;
  const nodeW = wide ? 214 : D.w;
  const xOf = (id: string) => pos.get(id)!.col * stride;
  const places = usePlaces(board, m);
  const treeBottom = lowerTop + lo.height;
  const placesX = wide ? 0 : nCols * stride + 10;
  const placesY = wide ? treeBottom + 72 : 0;
  const placesRows = wide ? Math.ceil(places.length / 4) : places.length;
  const height = wide ? placesY + placesRows * 50 + 60 : Math.max(treeBottom, places.length * 50 + 120);
  const width = wide ? (nCols - 1) * stride + nodeW : placesX + 240;
  const loserLabels: { x: number; y: number; text: string }[] = [];
  m.s.upper.forEach((col, ci) => {
    const fedByLosers = col.filter((id) => (m.s.inputs.get(id) ?? []).length > 0 && (m.s.inputs.get(id) ?? []).every((x) => x.take === 'loser'));
    if (!fedByLosers.length || ci === 0) return;
    const top = Math.min(...fedByLosers.map((id) => pos.get(id)!.y));
    const feederCol = m.s.upper.findIndex((cc) => cc.includes(m.s.inputs.get(fedByLosers[0])![0].game));
    const one = feederCol >= 0 ? m.names[feederCol].one : 'earlier';
    loserLabels.push({ x: ci * stride, y: top - 24, text: `${one[0].toUpperCase()}${one.slice(1)} losers ↓` });
  });
  return (
    <div className="br-canvas-wrap">
      <div className="br-canvas" style={{ width, height: height + D.head }}>
        {m.s.upper.map((col, i) => (
          <span key={i} className="colh" style={{ left: i * stride }}>
            {m.names[i].long} · <span className="d">{timeOf(m.views.get(col[0])!.g.start, c.t.timeZone)}</span>
          </span>
        ))}
        {!wide && (
          <span className="colh" style={{ left: placesX }}>
            Places
          </span>
        )}
        <div className="br-area" style={{ top: D.head, width, height }}>
          <Connectors m={m} pos={pos} xOf={xOf} w={nodeW} width={width} height={height} crossDotted />
          {loserLabels.map((l) => (
            <span key={l.text + l.x} className="loser-label" style={{ left: l.x, top: l.y }}>
              {l.text}
            </span>
          ))}
          {m.s.lower.length > 0 && (
            <span className="lbl sect-label" style={{ top: lowerTop - 36 }}>
              {m.lowerLabel}
              {m.lowerFrom ? ` · ${m.lowerFrom}` : ''}
            </span>
          )}
          {[...pos.entries()].map(([id, p]) => {
            const v = m.views.get(id);
            return v ? <Node key={id} v={v} state={m.state(v)} x={xOf(id)} y={p.y} w={nodeW} onOpen={() => open(id)} /> : null;
          })}
          {wide && (
            <span className="lbl sect-label" style={{ top: placesY - 32 }}>
              Places
            </span>
          )}
          <div className={`br-places${wide ? ' below' : ''}`} style={{ left: placesX, top: placesY, width: wide ? width : undefined }}>
            <PlacesList rows={places} division={board.division} variant="tiles" />
            <QualLegend board={board} rows={places} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SidePanel({ board, boards, hl, onBoard }: { board: Board; boards: Board[]; hl?: string; onBoard: (tab: string) => void }) {
  const c = useT();
  const div = board.division;
  const mine = boards.map((b, i) => ({ b, i })).filter(({ b }) => b.division === div);
  const boardNote = (b: Board) => {
    if (b === board) return 'this board';
    const vs = b.rounds.flat().map((id) => c.view.byId.get(id)).filter(Boolean) as GameView[];
    const live = vs.filter((v) => v.status === 'live' || v.status === 'finishing').length;
    if (live) return `${live} live`;
    const next = vs.find((v) => v.status === 'upcoming');
    if (next) return `${next.g.day.slice(0, 3)} ${timeOf(next.g.start, c.t.timeZone)}`;
    return 'final';
  };
  const allGames = c.view.games.filter((v) => v.g.stage === 'placement' && v.g.division === div);
  const lastEnd = Math.max(...allGames.map((v) => v.g.end), 0);
  const others = c.t.divisions.filter((d) => d.name !== div);
  const otherNote = (d: string) => {
    const vs = c.view.games.filter((v) => v.g.division === d && !v.g.unscheduled && !v.g.isBye);
    const lvl = c.view.levels[divKey(d)];
    const live = vs.filter((v) => v.status === 'live' || v.status === 'finishing');
    if (live.length) return `${plural(live.length, 'game')} live`;
    const next = vs.find((v) => v.status === 'upcoming');
    if (lvl === 'partial') return `Partial${next ? ` · next ${timeOf(next.g.start, c.t.timeZone)}` : ''}`;
    if (next) return `Next ${next.g.day.slice(0, 3)} ${timeOf(next.g.start, c.t.timeZone)}`;
    return 'Finished';
  };
  return (
    <aside className="br-side">
      {hl && <TeamPaths team={hl} division={div} />}
      {mine.length > 0 && (
        <section className="card set-list">
          <div className="lbl side-lbl">Boards in {div ?? 'this tournament'}</div>
          {mine.map(({ b, i }) => (
            <button key={i} className={`set-row nav${b === board ? ' current' : ''}`} onClick={() => onBoard(String(i))}>
              <span>{b.title}</span>
              <small className="muted">{boardNote(b)}</small>
            </button>
          ))}
          <button className="set-row nav" onClick={() => onBoard('standings')}>
            <span>Final standings</span>
            <small className="muted">{lastEnd > c.view.clock ? `after ${timeOf(lastEnd, c.t.timeZone)}` : 'final'}</small>
          </button>
        </section>
      )}
      {others.length > 0 && (
        <section className="card set-list">
          <div className="lbl side-lbl">Other competitions now</div>
          {others.map((d) => (
            <button key={d.name} className="set-row nav" onClick={() => c.setDivision(d.name)}>
              <span>
                {d.name}
                {c.followed.some((k) => parseTeamKey(k).division === d.name) ? ' ★' : ''}
              </span>
              <small className="muted">{otherNote(d.name)}</small>
            </button>
          ))}
        </section>
      )}
    </aside>
  );
}

function TeamPaths({ team, division }: { team: string; division?: string }) {
  const c = useT();
  const path = pathsAhead(c.view, team, division, 2);
  const quals = c.view.format.divisions[divKey(division)]?.qualification;
  const qualOf = (rel: number) => quals?.find((q) => rel >= q.from && rel <= q.to)?.label;
  const where = (n: PathNode | { place: number } | undefined) => {
    if (!n) return undefined;
    if ('place' in n) {
      const rel = relativePlace(c.view, division, n.place);
      const q = qualOf(rel);
      return `Finishes ${ordinal(rel)}${q ? ` · ${q}` : ''}`;
    }
    const g = n.game;
    const opp = n.opponents.length ? ` vs ${n.opponents.slice(0, 2).map(withoutTag).join(' or ')}${n.opponents.length > 2 ? ' …' : ''}` : '';
    return `${g.g.code ? `${g.g.code.replace(/[[\]]/g, '')} ` : ''}${timeOf(g.g.start, c.t.timeZone)}${g.g.pitch.label ? ` P${g.g.pitch.label}` : ''}${opp}`;
  };
  const finished = c.view.places.get(divKey(division))?.find((p) => p.team === team);
  const live = path && (path.game.status === 'live' || path.game.status === 'finishing');
  return (
    <section className="card team-paths">
      <b className="tp-title">
        <TeamName name={team} division={division} plain /> · paths
      </b>
      {path ? (
        <>
          <span className="tp-now">
            {live ? 'Playing' : 'Next:'} {path.game.g.code?.replace(/[[\]]/g, '') ?? ''}{' '}
            {live ? (
              path.game.result ? (
                <>
                  now ·{' '}
                  <b className="d">
                    {scoreText(path.game, path.side)}–{scoreText(path.game, (1 - path.side) as 0 | 1)}
                  </b>
                </>
              ) : (
                'now'
              )
            ) : (
              `${timeOf(path.game.g.start, c.t.timeZone)}${path.game.g.pitch.label ? ` P${path.game.g.pitch.label}` : ''}`
            )}{' '}
            vs {path.opponents.slice(0, 2).map(withoutTag).join(' or ') || 'TBC'}
          </span>
          {where(path.win) && (
            <span className="tp-line">
              <b className="win-text">Win</b> → {where(path.win)}
            </span>
          )}
          {where(path.lose) && (
            <span className="tp-line">
              <b>Lose</b> → {where(path.lose)}
            </span>
          )}
        </>
      ) : finished ? (
        <span className="tp-now">Finished {ordinal(relativePlace(c.view, division, finished.place))}</span>
      ) : (
        <span className="tp-line">No placement game ahead yet.</span>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- phone

const P = { w: 236, x2: 292, row: 40, tall: 48, gap: 40 };

function PhoneBoard({ board, hl, tools }: { board: Board; hl?: string; tools?: ReactNode }) {
  const open = useOpenGame();
  const m = useModel(board, hl);
  const upperN = m.s.upper.length;
  const tabs = [...m.names.map((n) => n.short), ...(m.s.lower.length ? [m.lowerLabel] : [])];
  const unfinished = (ids: string[]) =>
    ids.some((id) => {
      const v = m.views.get(id);
      return v && !['final', 'notPlayed', 'bye'].includes(v.status);
    });
  const initial = (() => {
    if (hl) {
      const i = m.s.upper.findIndex((col) => col.some((id) => m.views.get(id)?.sides.some((s) => s.team === hl) && unfinished([id])));
      if (i >= 0) return i;
    }
    const i = m.s.upper.findIndex(unfinished);
    if (i >= 0) return i;
    return m.s.lower.length && m.s.lower.some(unfinished) ? upperN : Math.max(0, upperN - 1);
  })();
  const [tab, setTab] = useState(initial);
  const touch = useRef<number | undefined>(undefined);
  const go = (i: number) => setTab(Math.max(0, Math.min(tabs.length - 1, i)));
  const places = usePlaces(board, m);
  return (
    <div className="pboard">
      {tabs.length > 1 && (
        <nav className="round-tabs" aria-label="Rounds">
          {tabs.map((t, i) => (
            <button key={t + i} className={i === tab ? 'on' : ''} aria-current={i === tab} onClick={() => go(i)}>
              {t}
            </button>
          ))}
        </nav>
      )}
      {tools}
      {tab < upperN ? (
        <>
          <div
            className="swipe"
            onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
            onTouchEnd={(e) => {
              if (touch.current === undefined) return;
              const dx = e.changedTouches[0].clientX - touch.current;
              touch.current = undefined;
              if (Math.abs(dx) > 50) go(tab + (dx < 0 ? 1 : -1));
            }}
          >
            <PhoneTree m={m} col={tab} onOpen={open} onNext={() => go(tab + 1)} />
          </div>
          {tabs.length > 1 && (
            <div className="pager" aria-hidden="true">
              {tabs.map((t, i) => (
                <span key={t + i} className={i === tab ? 'on' : ''} />
              ))}
            </div>
          )}
          {tab > 0 && <PrevResults m={m} col={tab - 1} />}
          {!m.s.lower.length && tab === upperN - 1 && (
            <section className="pb-sect">
              <span className="lbl">Places</span>
              <PlacesList rows={places} division={board.division} />
              <QualLegend board={board} rows={places} />
            </section>
          )}
        </>
      ) : (
        <div className="lower-list">
          <p className="context">
            {m.lowerFrom ? `${m.lowerFrom[0].toUpperCase()}${m.lowerFrom.slice(1)} play for ${m.lowerLabel}. ` : ''}Each game says where its teams come from and where they go.
          </p>
          {m.s.lower.flat().map((id) => {
            const v = m.views.get(id);
            return v ? <LowerGame key={id} v={v} m={m} onOpen={() => open(id)} /> : null;
          })}
          <span className="lbl">Places</span>
          <PlacesList rows={places} division={board.division} />
          <QualLegend board={board} rows={places} />
        </div>
      )}
    </div>
  );
}

function PhoneTree({ m, col, onOpen, onNext }: { m: Model; col: number; onOpen: (id: string) => void; onNext: () => void }) {
  const c = useT();
  const cols = [m.s.upper[col], ...(m.s.upper[col + 1] ? [m.s.upper[col + 1]] : [])];
  const partial = useT().view.levels[divKey(m.views.get(cols[0][0])?.g.division)] === 'partial';
  const h = (id: string) => nodeHeight(m.views.get(id), P.row, P.tall, partial);
  const { pos, height } = layoutColumns(cols, m.s.inputs, h, P.gap, P.gap + 20);
  const xOf = (id: string) => (pos.get(id)!.col === 0 ? 16 : P.x2);
  const t0 = m.views.get(cols[0][0]);
  const nextName = cols[1] ? m.names[col + 1].long : '';
  return (
    <>
      <div className="ptree-heads">
        <span className="lbl" style={{ width: P.w }}>
          {m.names[col].long} · <span className="d">{t0 ? timeOf(t0.g.start, c.t.timeZone) : ''}</span>
        </span>
        {nextName && <span className="lbl">{nextName === 'Medal games' ? 'Medals' : nextName}</span>}
      </div>
      <div className="ptree" style={{ height: height + 8 }}>
        <Connectors m={m} pos={pos} xOf={xOf} w={P.w} width={P.x2 + P.w} height={height + 8} />
        {[...pos.entries()].map(([id, p]) => {
          const v = m.views.get(id);
          if (!v) return null;
          const next = p.col === 1;
          return <Node key={id} v={v} state={m.state(v)} x={xOf(id)} y={p.y} w={P.w} sub onOpen={() => (next ? onNext() : onOpen(id))} className={next ? 'peek' : ''} />;
        })}
      </div>
    </>
  );
}

function PrevResults({ m, col }: { m: Model; col: number }) {
  const vs = m.s.upper[col].map((id) => m.views.get(id)).filter(Boolean) as GameView[];
  const done = vs.every((v) => v.status === 'final' || v.status === 'notPlayed');
  return (
    <section className="pb-sect">
      <span className="lbl">
        {m.names[col].long} · {done ? 'final' : 'so far'}
      </span>
      <div className="card prev-grid">
        {vs.map((v) => {
          const w = winnerSide(v);
          const order: (0 | 1)[] = w === 1 ? [1, 0] : [0, 1];
          return (
            <div key={v.g.id} className="prev-cell">
              <span className="d prev-code">{v.g.code?.replace(/[[\]]/g, '') ?? m.title(v.g.id)}</span>
              {order.map((i, k) => (
                <span key={i} className={`prev-row${k === 0 && w !== undefined ? ' won' : ''}`}>
                  <span>{v.sides[i].team ? withoutTag(v.sides[i].team!) : (v.sides[i].label ?? '—')}</span>
                  <b className="d">{scoreText(v, i)}</b>
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LowerGame({ v, m, onOpen }: { v: GameView; m: Model; onOpen: () => void }) {
  const c = useT();
  const feeds = feedsOf(c.view, v.g.id);
  const code = v.g.code?.replace(/[[\]]/g, '');
  const t = m.title(v.g.id);
  const firstLower = m.s.lower[0]?.includes(v.g.id);
  const name = firstLower && !m.s.decides.get(v.g.id) && t !== 'Game to go' ? `${m.lowerLabel} semi` : t === 'Game to go' && code ? `Game to go [${code}]` : t;
  const ifreq = v.status === 'ifRequired' || v.g.conditional;
  const status =
    v.status === 'live' || v.status === 'finishing' ? (
      <LiveTag />
    ) : v.status === 'final' ? (
      <span className="tag final sm">Final</span>
    ) : v.status === 'notPlayed' ? (
      <span className="tag struck sm">Not played</span>
    ) : ifreq ? (
      <span className="tag dashed sm">If required</span>
    ) : (
      <span className="tag quiet sm">{timeOf(v.g.start, c.t.timeZone)}</span>
    );
  const subOf = (i: 0 | 1) => {
    const s = v.sides[i];
    if (!s.team) return s.possible.length ? possibleText(s.possible) : '';
    for (const x of m.s.inputs.get(v.g.id) ?? []) {
      const src = m.views.get(x.game);
      const sw = src && winnerSide(src);
      if (!src || sw === undefined) continue;
      const taken = src.sides[x.take === 'winner' ? sw : ((1 - sw) as 0 | 1)].team;
      if (taken === s.team) return `${x.take === 'loser' ? 'lost' : 'won'} ${src.g.code?.replace(/[[\]]/g, '') ?? m.title(x.game)}`;
    }
    return '';
  };
  const w = winnerSide(v);
  return (
    <section className="lg">
      <div className="lg-head">
        <b>{name}</b>
        <span className="d lg-when">
          {timeOf(v.g.start, c.t.timeZone)}
          {v.g.pitch.label ? ` · P${v.g.pitch.label}` : ''}
        </span>
        <span style={{ flex: 1 }} />
        {status}
      </div>
      <button className={`card lg-card${ifreq && v.status !== 'final' ? ' ifreq' : ''}${v.result?.hypothetical ? ' hyp' : ''}`} onClick={onOpen}>
        {([0, 1] as const).map((i) => {
          const s = v.sides[i];
          return (
            <span key={i} className={`lg-row${w === i ? ' won' : ''}${w !== undefined && w !== i ? ' lost' : ''}`}>
              {s.team ? (
                <TeamName name={s.team} division={v.g.division} bold={w === i} />
              ) : (
                <span className="lg-open">
                  <span className="dot ring" />
                  <i>{s.label ?? 'To be decided'}</i>
                </span>
              )}
              <span className="lg-sub">{subOf(i)}</span>
              <b className="d lg-score">{scoreText(v, i)}</b>
            </span>
          );
        })}
        {(feeds.winner || feeds.loser || ifreq) && (
          <span className="lg-feed">
            {ifreq && !feeds.winner && !feeds.loser
              ? 'Only played if the TD needs it; shown as “not played” otherwise.'
              : [feeds.winner && `Winner → ${feeds.winner}`, feeds.loser && `loser → ${feeds.loser}`].filter(Boolean).join(' · ')}
          </span>
        )}
      </button>
    </section>
  );
}

// ---------------------------------------------------------------- places

interface PlaceRow {
  place: number;
  rel: number;
  team?: string;
  from: string;
  badge?: 'Q' | 'q' | 'GTG';
  mine: boolean;
}

function usePlaces(board: Board, m: Model): PlaceRow[] {
  const c = useT();
  const div = board.division;
  const f = c.view.format.divisions[divKey(div)];
  const all = c.view.places.get(divKey(div)) ?? [];
  const min = all.length ? Math.min(...all.map((p) => p.place)) : 1;
  const quals = f?.qualification;
  return all
    .filter((p) => board.positions.includes(p.place))
    .map((p) => {
      const rel = p.place - min + 1;
      const src = f?.places?.[p.place]?.source;
      const game = src?.kind === 'gameResult' ? m.views.get(src.game) : undefined;
      let from = p.label ?? 'To be decided';
      if (src?.kind === 'gameResult') {
        const t = m.title(src.game);
        from = `${src.take === 'winner' ? 'Winner' : 'Loser'} ${/^(Final|Game to go)$/.test(t) ? t.toLowerCase() : t}`;
      }
      const qi = quals?.findIndex((q) => rel >= q.from && rel <= q.to) ?? -1;
      const gtg = game && (game.g.conditional || game.g.isGameToGo) && game.status !== 'final' && src?.kind === 'gameResult' && src.take === 'winner';
      const badge: PlaceRow['badge'] = gtg ? 'GTG' : qi === 0 ? 'Q' : qi > 0 ? 'q' : undefined;
      return { place: p.place, rel, team: p.team, from, badge, mine: Boolean(p.team && c.isFollowed(p.team, div)) };
    });
}

function PlacesList({ rows, division, variant }: { rows: PlaceRow[]; division?: string; variant?: 'tiles' }) {
  if (!rows.length) return null;
  return (
    <ol className={variant === 'tiles' ? 'place-tiles' : 'card list place-list'}>
      {rows.map((r) => (
        <li key={r.place} className={`place-row${r.mine ? ' mine-row' : ''}`}>
          <b className="d place">{ordinal(r.rel)}</b>
          {r.team ? <TeamName name={r.team} division={division} bold={r.mine} /> : <span className="place-from">{r.from}</span>}
          <span style={{ flex: 1 }} />
          {r.badge ? <span className={`qbadge${r.badge === 'Q' ? ' solid' : r.badge === 'GTG' ? ' gtg' : ''}`}>{r.badge}</span> : variant === 'tiles' ? <span className="muted">–</span> : null}
        </li>
      ))}
    </ol>
  );
}

function QualLegend({ board, rows }: { board?: Board; rows?: PlaceRow[] }) {
  const c = useT();
  const quals = board ? c.view.format.divisions[divKey(board.division)]?.qualification : undefined;
  const gtg = rows?.some((r) => r.badge === 'GTG');
  if (!quals?.length && !gtg) return null;
  return (
    <div className="qual-legend">
      {quals?.map((q, i) => (
        <span key={q.label}>
          <span className={`qbadge${i === 0 ? ' solid' : ''}`}>{i === 0 ? 'Q' : 'q'}</span>
          {q.label}
        </span>
      ))}
      {gtg && (
        <span>
          <span className="qbadge gtg">GTG</span>Game to go
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- basic level and final standings

/** Basic level: placement games grouped by day and time. */
function FinalsList({ divisions }: { divisions: (string | undefined)[] }) {
  const c = useT();
  const open = useOpenGame();
  return (
    <>
      {divisions.map((d) => {
        const games = c.view.games.filter((v) => v.g.stage === 'placement' && v.g.division === d && !v.g.unscheduled);
        if (!games.length) return null;
        const byDay = new Map<string, GameView[]>();
        for (const v of games) byDay.set(v.g.day, [...(byDay.get(v.g.day) ?? []), v]);
        return (
          <section key={d ?? ''} className="section">
            {divisions.length > 1 && (
              <div className="section-head">
                <h2>Finals & placings{d ? ` · ${d}` : ''}</h2>
              </div>
            )}
            <p className="context">Bracket order follows the TD’s sheet; these games are shown as listed.</p>
            {[...byDay.entries()].map(([day, vs]) => (
              <div key={day} className="stack" style={{ gap: 8 }}>
                <span className="lbl">{dateLabel(c.t.days.find((x) => x.name === day)?.date ?? '') || day}</span>
                <div className="card list">
                  {vs.map((v) => (
                    <GameRow key={v.g.id} v={v} showTime onOpen={() => open(v.g.id)} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </>
  );
}

/** Final standings: the sheet's, else the engine's (R5), place by place. */
export function FinalStandings({ quiet }: { quiet?: boolean } = {}) {
  const c = useT();
  const sections = finalSections(c.view, c.inDiv);
  if (!sections.length) return quiet ? null : <Empty title="No final standings yet" body="They appear when the sheet lists them or the brackets are decided." />;
  const notPlayed = c.view.games.filter((v) => v.g.stage === 'placement' && v.status === 'notPlayed' && c.inDiv(v.g.division));
  return (
    <>
      {sections.map((s) => {
        const min = Math.min(...s.rows.map((r) => r.place));
        const quals = c.view.format.divisions[divKey(s.division)]?.qualification;
        return (
          <section key={s.title} className="section">
            {(sections.length > 1 || s.sub) && (
              <div className="section-head">
                <h2>{s.title || 'Final standings'}</h2>
                {s.sub && <span className="sub">{s.sub}</span>}
              </div>
            )}
            <ol className="card list standings">
              {s.rows.map((r) => {
                const rel = r.place - min + 1;
                const qi = quals?.findIndex((x) => rel >= x.from && rel <= x.to) ?? -1;
                const mine = r.team && c.isFollowed(r.team, r.division);
                return (
                  <li key={`${r.place}-${r.team ?? r.label}`} className={`standing-row${mine ? ' mine-row' : ''}`}>
                    <b className="d place">{ordinal(rel)}</b>
                    {r.team ? (
                      <TeamName name={r.team} division={r.division} bold={Boolean(mine)} />
                    ) : (
                      <span className="place-open">
                        <i>{r.label ?? 'To be decided'}</i>
                        {r.possible && r.possible.length > 0 && <span className="small muted">{r.possible.length} possible</span>}
                      </span>
                    )}
                    <span style={{ flex: 1 }} />
                    {qi >= 0 && <span className={`qbadge${qi === 0 ? ' solid' : ''}`}>{qi === 0 ? 'Q' : 'q'}</span>}
                  </li>
                );
              })}
            </ol>
            {quals?.length ? (
              <div className="qual-legend">
                {quals.map((q, i) => (
                  <span key={q.label}>
                    <span className={`qbadge${i === 0 ? ' solid' : ''}`}>{i === 0 ? 'Q' : 'q'}</span>
                    {q.label}: {ordinal(q.from)}
                    {q.to > q.from ? `–${ordinal(q.to)}` : ''}
                  </span>
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
      {notPlayed.length > 0 && (
        <div className="np-note">
          <span className="np-badge">{notPlayed[0].g.code?.replace(/[[\]]/g, '') || 'GTG'}</span>
          <span>{notPlayed.length === 1 ? 'One game wasn’t played' : `${notPlayed.length} games weren’t played`}, so those places come from the earlier results.</span>
        </div>
      )}
    </>
  );
}

export function StandingsScreen(_: ScreenProps) {
  return (
    <>
      <PageHead title="Final standings" />
      <FinalStandings />
    </>
  );
}
