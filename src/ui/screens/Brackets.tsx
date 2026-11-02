import { useMemo, useState } from 'react';
import { buildBoards, type Board } from '../../engine/bracket';
import type { GameView } from '../../engine/view';
import { divKey } from '../../model/types';
import { parseTeamKey } from '../../store/settings';
import { withoutTag } from '../../extract/names';
import { useT } from '../ctx';
import { dateLabel, ordinal, timeOf } from '../fmt';
import { Empty, GameRow, Seg, Side, StatusTag, scoreText, winnerSide, TeamName } from '../parts';
import { useOpenGame } from './GameDetail';
import type { ScreenProps } from './index';

/** Brackets / Finals & placings (spec §9.10). */
export function Brackets(_: ScreenProps) {
  const c = useT();
  const boards = useMemo(() => buildBoards(c.t, c.view.format).filter((b) => c.inDiv(b.division)), [c.t, c.view.format, c.division]); // eslint-disable-line react-hooks/exhaustive-deps
  const placement = c.view.games.filter((v) => v.g.stage === 'placement' && c.inDiv(v.g.division) && !v.g.unscheduled);
  const divs = c.t.divisions.length ? c.t.divisions.map((d) => d.name).filter((d) => c.inDiv(d)) : [undefined];
  const basicDivs = divs.filter((d) => c.view.levels[divKey(d)] === 'basic');
  const [tab, setTab] = useState<string>('0');
  if (!placement.length) return <Empty title="No brackets yet" body="Placement games appear once the sheet lists them." />;
  const tabs = [...boards.map((b, i) => ({ value: String(i), label: c.division || c.t.divisions.length < 2 ? b.title : `${b.division ?? ''} ${b.title}`.trim() })), { value: 'standings', label: 'Standings' }];
  const board = boards[Number(tab)];
  return (
    <>
      {boards.length > 0 && <Seg label="Bracket" value={tab} options={tabs} onChange={setTab} />}
      {tab === 'standings' ? <FinalStandings /> : board && <BoardView board={board} />}
      {basicDivs.length > 0 && tab !== 'standings' && <FinalsList divisions={basicDivs} />}
      {!boards.length && <FinalStandings />}
    </>
  );
}

function BoardView({ board }: { board: Board }) {
  const c = useT();
  const open = useOpenGame();
  const followed = c.followed.map(parseTeamKey).filter((f) => f.division === board.division);
  const [hl, setHl] = useState<string | undefined>(c.primary && parseTeamKey(c.primary).division === board.division ? parseTeamKey(c.primary).name : followed[0]?.name);
  const [round, setRound] = useState(0);
  const rounds = board.rounds.map((ids) => ids.map((id) => c.view.byId.get(id)!).filter(Boolean));
  const onPath = (v: GameView) => !hl || v.sides.some((s) => s.team === hl || (!s.team && s.possible.includes(hl)));
  const places = c.view.places.get(divKey(board.division))?.filter((p) => board.positions.includes(p.place));
  const quals = c.view.format.divisions[divKey(board.division)]?.qualification;
  const minPos = Math.min(...(c.view.places.get(divKey(board.division)) ?? []).map((p) => p.place));
  const level = c.view.levels[divKey(board.division)];
  const roundName = (i: number, n: number) => (n === 1 ? 'Final round' : i === rounds.length - 1 ? 'Last round' : `Round ${i + 1}`);
  return (
    <div className="stack">
      <div className="bracket-tools">
        {followed.length > 0 && (
          <select className="chip select" value={hl ?? ''} onChange={(e) => setHl(e.target.value || undefined)} aria-label="Highlight a team">
            <option value="">No highlight</option>
            {followed.map((f) => (
              <option key={f.name} value={f.name}>
                ★ {withoutTag(f.name)} path
              </option>
            ))}
          </select>
        )}
        <span className={`tag ${level === 'full' ? 'win' : 'warn'}`}>{level === 'full' ? 'Full' : 'Partial'}</span>
      </div>
      <div className="phone-only">
        <Seg label="Round" value={String(round)} options={rounds.map((r, i) => ({ value: String(i), label: roundName(i, r.length) }))} onChange={(v) => setRound(Number(v))} />
      </div>
      <ol className="bracket" aria-label={`Bracket ${board.title}`}>
        {rounds.map((games, i) => (
          <li key={i} className={`round${i === round ? ' cur' : ''}`}>
            <div className="lbl round-title">
              {roundName(i, games.length)} · {timeOf(games[0].g.start, c.t.timeZone)}
            </div>
            <ol className="round-games">
              {games.map((v) => (
                <li key={v.g.id}>
                  <BracketNode v={v} dim={!onPath(v)} hl={hl} onOpen={() => open(v.g.id)} />
                </li>
              ))}
            </ol>
          </li>
        ))}
        {places && places.length > 0 && (
          <li className="round places">
            <div className="lbl round-title">Places</div>
            <ol className="place-list">
              {places.map((p) => {
                const rel = p.place - minPos + 1;
                const q = quals?.find((x) => rel >= x.from && rel <= x.to);
                return (
                  <li key={p.place} className={hl && p.team === hl ? 'hl' : ''}>
                    <b className="d">{ordinal(rel)}</b>
                    {p.team ? <TeamName name={p.team} division={board.division} /> : <span className="muted small">{p.possible.length ? `${p.possible.length} possible` : p.label}</span>}
                    {q && <span className="tag quiet" title={q.label}>Q {q.label}</span>}
                  </li>
                );
              })}
            </ol>
          </li>
        )}
      </ol>
    </div>
  );
}

function BracketNode({ v, dim, hl, onOpen }: { v: GameView; dim: boolean; hl?: string; onOpen: () => void }) {
  const c = useT();
  const w = winnerSide(v);
  return (
    <button className={`bnode${dim ? ' dim' : ''}${v.hypothetical ? ' hyp' : ''}${v.status === 'ifRequired' ? ' ifreq' : ''}${v.status === 'notPlayed' ? ' np' : ''}`} onClick={onOpen}>
      <span className="bn-top">
        <span className="d">{timeOf(v.g.start, c.t.timeZone)}</span>
        {v.g.pitch.label && <span className="muted">P{v.g.pitch.label}</span>}
        <span className="muted">{v.g.code?.replace(/[[\]]/g, '')}</span>
        <span style={{ flex: 1 }} />
        <StatusTag v={v} />
      </span>
      {([0, 1] as const).map((i) => (
        <span key={i} className={`bn-side${w === i ? ' won' : ''}${hl && v.sides[i].team === hl ? ' hl' : ''}`}>
          <Side side={v.sides[i]} division={v.g.division} bold={w === i} plain />
          <b className="d">{scoreText(v, i)}</b>
        </span>
      ))}
    </button>
  );
}

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
            <div className="section-head">
              <h2>Finals & placings{d ? ` · ${d}` : ''}</h2>
            </div>
            <p className="small muted" style={{ margin: 0 }}>Bracket order follows the TD’s sheet; the app shows these games as listed.</p>
            {[...byDay.entries()].map(([day, vs]) => (
              <div key={day} className="stack" style={{ gap: 6 }}>
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

/** Final standings: the sheet's, else the engine's (R5). */
export function FinalStandings() {
  const c = useT();
  const sheet = (c.t.finalStandings ?? []).filter((s) => c.inDiv(s.division) && s.team);
  if (sheet.length) {
    const sections = new Map<string, typeof sheet>();
    for (const s of sheet) sections.set(s.section ?? s.division ?? '', [...(sections.get(s.section ?? s.division ?? '') ?? []), s]);
    return (
      <>
        {[...sections.entries()].map(([title, list]) => (
          <section key={title} className="section">
            <div className="section-head">
              <h2>{title || 'Final standings'}</h2>
            </div>
            <ol className="card list standings">
              {list.map((s) => (
                <li key={`${s.place}-${s.team}`} className={`row${c.isFollowed(s.team, s.division) ? ' mine-row' : ''}`}>
                  <b className="d place">{s.place}</b>
                  <TeamName name={s.team!} division={s.division} />
                </li>
              ))}
            </ol>
          </section>
        ))}
      </>
    );
  }
  const entries = [...c.view.places.entries()].filter(([d]) => c.inDiv(d || undefined));
  if (!entries.length) return <Empty title="No final standings yet" body="They appear when the sheet lists them or the brackets are decided." />;
  return (
    <>
      {entries.map(([d, list]) => {
        const min = Math.min(...list.map((p) => p.place));
        return (
          <section key={d} className="section">
            <div className="section-head">
              <h2>{d || 'Final standings'}</h2>
              <span className="sub">projected from the brackets</span>
            </div>
            <ol className="card list standings">
              {list.map((p) => (
                <li key={p.place} className="row">
                  <b className="d place">{p.place - min + 1}</b>
                  {p.team ? <TeamName name={p.team} division={d || undefined} /> : <span className="muted">{p.label} · {p.possible.length} possible</span>}
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </>
  );
}

export function StandingsScreen(_: ScreenProps) {
  return <FinalStandings />;
}
