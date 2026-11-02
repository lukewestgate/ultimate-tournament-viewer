import { useMemo, useState } from 'react';
import { buildBoards, type Board } from '../../engine/bracket';
import type { GameView } from '../../engine/view';
import { divKey } from '../../model/types';
import { parseTeamKey } from '../../store/settings';
import { withoutTag } from '../../extract/names';
import { useT } from '../ctx';
import { dateLabel, ordinal, plural, timeOf } from '../fmt';
import { Empty, GameRow, Seg, Side, StatusTag, scoreText, winnerSide, TeamName, possibleText } from '../parts';
import { PageHead } from '../Shell';
import { feedsOf } from '../outlook';
import { IStar } from '../icons';
import { useOpenGame } from './GameDetail';
import type { ScreenProps } from './index';

/** Brackets / Finals & placings (spec §9.10; LargeTabs, SpecInfo, SpecOutdoorComponents). */
export function Brackets(_: ScreenProps) {
  const c = useT();
  const boards = useMemo(() => buildBoards(c.t, c.view.format).filter((b) => c.inDiv(b.division)), [c.t, c.view.format, c.division]); // eslint-disable-line react-hooks/exhaustive-deps
  const placement = c.view.games.filter((v) => v.g.stage === 'placement' && c.inDiv(v.g.division) && !v.g.unscheduled);
  const divs = c.t.divisions.length ? c.t.divisions.map((d) => d.name).filter((d) => c.inDiv(d)) : [undefined];
  const basicDivs = divs.filter((d) => c.view.levels[divKey(d)] === 'basic');
  const allBasic = basicDivs.length === divs.length;
  const [tab, setTab] = useState<string>('0');
  const title = `${allBasic ? 'Finals & placings' : 'Brackets'}${c.division ? ` · ${c.division}` : ''}`;
  if (!placement.length && !c.t.finalStandings?.length)
    return (
      <>
        <PageHead title={title} />
        <Empty title="No brackets yet" body="Placement games appear once the sheet lists them." />
      </>
    );
  const multiDiv = !c.division && c.t.divisions.length > 1;
  const tabs = [...boards.map((b, i) => ({ value: String(i), label: multiDiv ? `${b.division ?? ''} ${b.title}`.trim() : b.title })), { value: 'standings', label: 'Standings' }];
  const board = boards[Number(tab)];
  return (
    <>
      <PageHead title={title} />
      {boards.length > 0 && <Seg label="Bracket" value={tab} options={tabs} onChange={setTab} className={`board-seg${tabs.length > 4 ? ' scroll' : ''}`} />}
      {tab === 'standings' || !boards.length ? <FinalStandings /> : board && <BoardView key={tab} board={board} />}
      {basicDivs.length > 0 && tab !== 'standings' && <FinalsList divisions={basicDivs} />}
    </>
  );
}

const ROUND_NAMES = ['Final', 'Semi-finals', 'Quarter-finals'];

function BoardView({ board }: { board: Board }) {
  const c = useT();
  const open = useOpenGame();
  const div = divKey(board.division);
  const followed = c.followed.map(parseTeamKey).filter((f) => (f.division ?? '') === (board.division ?? ''));
  const primary = c.primary ? parseTeamKey(c.primary) : undefined;
  const [hl, setHl] = useState<string | undefined>(primary && (primary.division ?? '') === (board.division ?? '') ? primary.name : followed[0]?.name);
  const rounds = board.rounds.map((ids) => ids.map((id) => c.view.byId.get(id)!).filter(Boolean)).filter((r) => r.length);
  const onPath = (v: GameView) => Boolean(hl) && v.sides.some((s) => s.team === hl || (!s.team && s.possible.includes(hl!)));
  const allPlaces = c.view.places.get(div) ?? [];
  const places = allPlaces.filter((p) => board.positions.includes(p.place));
  const quals = c.view.format.divisions[div]?.qualification;
  const minPos = Math.min(...allPlaces.map((p) => p.place));
  const level = c.view.levels[div];
  const size = board.to - board.from + 1;
  const knockout = rounds.length === Math.log2(size) && rounds.length <= 3;
  const roundName = (i: number) => (knockout ? ROUND_NAMES[rounds.length - 1 - i] : i === rounds.length - 1 && rounds[i].length === 1 ? 'Final round' : `Round ${i + 1}`);
  const days = [...new Set(rounds.flat().map((v) => v.g.day))];
  const desc = [days.join(' and '), `places ${ordinal(board.from)}–${ordinal(board.to)}`, plural(rounds.length, 'round')].filter(Boolean).join(' · ');
  const hlTeam = hl ? withoutTag(hl) : undefined;
  const levelTag = <span className={`tag sm ${level === 'full' ? 'win' : 'warn'}`}>{level === 'full' ? 'Full' : 'Partly known'}</span>;
  return (
    <div className="board">
      {followed.length > 0 && (
        <div className="board-tools">
          <label className={`path-pill${hl ? ' on' : ''}`}>
            <IStar size={14} filled={Boolean(hl)} />
            <span>{hlTeam ? `${hlTeam} path` : 'Highlight a team'}</span>
            <select value={hl ?? ''} onChange={(e) => setHl(e.target.value || undefined)} aria-label="Highlight a team’s path">
              <option value="">No highlight</option>
              {followed.map((f) => (
                <option key={f.name} value={f.name}>
                  {withoutTag(f.name)}
                </option>
              ))}
            </select>
          </label>
          <span style={{ flex: 1 }} />
          {levelTag}
        </div>
      )}
      <div className="board-desc">
        <p className="context">
          {desc[0].toUpperCase() + desc.slice(1)}.{level === 'partial' ? ' Some slots show the sheet’s own text until the earlier games finish.' : ''}
        </p>
        {!followed.length && levelTag}
      </div>
      <ol className="bracket" aria-label={`Bracket ${board.title}`}>
        {rounds.map((games, i) => (
          <li key={i} className="br-round">
            <h3 className="round-title">
              <span className="lbl">{roundName(i)}</span>
              <span className="d">
                {games[0].g.day.slice(0, 3)} {timeOf(games[0].g.start, c.t.timeZone)}
              </span>
            </h3>
            <ol className="round-games">
              {games.map((v) => (
                <li key={v.g.id}>
                  <BracketNode v={v} oneDay={days.length === 1} state={!hl ? '' : onPath(v) ? 'path' : 'dim'} hl={hl} onOpen={() => open(v.g.id)} />
                </li>
              ))}
            </ol>
          </li>
        ))}
        {places.length > 0 && (
          <li className="br-round br-places">
            <h3 className="round-title">
              <span className="lbl">Places</span>
            </h3>
            <ol className="card list place-list">
              {places.map((p) => {
                const rel = p.place - minPos + 1;
                const qi = quals?.findIndex((x) => rel >= x.from && rel <= x.to) ?? -1;
                const mine = p.team && c.isFollowed(p.team, board.division);
                return (
                  <li key={p.place} className={`place-row${mine || (hl && p.team === hl) ? ' mine-row' : ''}`}>
                    <b className="d place">{ordinal(rel)}</b>
                    {p.team ? (
                      <TeamName name={p.team} division={board.division} bold={Boolean(mine)} />
                    ) : (
                      <span className="place-open">
                        <i>{p.label ?? 'To be decided'}</i>
                        {p.possible.length > 0 && <span className="small muted">{p.possible.length <= 2 ? possibleText(p.possible) : `${p.possible.length} possible`}</span>}
                      </span>
                    )}
                    <span style={{ flex: 1 }} />
                    {qi >= 0 && <span className={`qbadge${qi === 0 ? ' solid' : ''}`}>{qi === 0 ? 'Q' : 'q'}</span>}
                  </li>
                );
              })}
            </ol>
          </li>
        )}
      </ol>
      <QualLegend quals={quals} />
    </div>
  );
}

function BracketNode({ v, state, hl, onOpen, oneDay }: { v: GameView; state: '' | 'path' | 'dim'; hl?: string; onOpen: () => void; oneDay?: boolean }) {
  const c = useT();
  const w = winnerSide(v);
  const feeds = feedsOf(c.view, v.g.id);
  const known = hl && v.sides.some((s) => s.team === hl);
  const cls = ['bnode', state === 'path' ? (known ? 'path known' : 'path') : state, v.hypothetical ? 'hyp' : '', v.status === 'ifRequired' ? 'ifreq' : '', v.status === 'notPlayed' ? 'np' : '', v.status === 'live' ? 'live' : ''].filter(Boolean).join(' ');
  return (
    <button className={cls} onClick={onOpen}>
      <span className="bn-head">
        <span className="bn-when">
          {oneDay ? '' : `${v.g.day.slice(0, 3)} `}
          {timeOf(v.g.start, c.t.timeZone)}
          {v.g.pitch.label ? ` · P${v.g.pitch.label}` : ''}
        </span>
        <span style={{ flex: 1 }} />
        {v.status !== 'upcoming' && <StatusTag v={v} />}
        {v.g.code && <span className="bn-code">{v.g.code.replace(/[[\]]/g, '')}</span>}
      </span>
      {([0, 1] as const).map((i) => (
        <span key={i} className={`bn-side${w === i ? ' won' : ''}${w !== undefined && w !== i ? ' lost' : ''}${hl && v.sides[i].team === hl ? ' hl' : ''}`}>
          <Side side={v.sides[i]} division={v.g.division} bold={w === i} />
          {v.result && <b className="d bn-score">{scoreText(v, i)}</b>}
        </span>
      ))}
      {(feeds.winner || feeds.loser) && (
        <span className="bn-foot">
          {feeds.winner && `Winner → ${feeds.winner}`}
          {feeds.winner && feeds.loser && ' · '}
          {feeds.loser && `${feeds.winner ? 'loser' : 'Loser'} → ${feeds.loser}`}
        </span>
      )}
    </button>
  );
}

function QualLegend({ quals }: { quals?: { label: string; from: number; to: number }[] }) {
  if (!quals?.length) return null;
  return (
    <div className="qual-legend">
      {quals.map((q, i) => (
        <span key={q.label}>
          <span className={`qbadge${i === 0 ? ' solid' : ''}`}>{i === 0 ? 'Q' : 'q'}</span>
          {q.label}: {ordinal(q.from)}
          {q.to > q.from ? `–${ordinal(q.to)}` : ''}
        </span>
      ))}
    </div>
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
            {divisions.length > 1 || d ? (
              <div className="section-head">
                <h2>Finals & placings{d ? ` · ${d}` : ''}</h2>
              </div>
            ) : null}
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

interface StandingRow {
  place: number;
  team?: string;
  division?: string;
  label?: string;
  possible?: string[];
}

/** Final standings: the sheet's, else the engine's (R5). */
export function FinalStandings() {
  const c = useT();
  const sheet = (c.t.finalStandings ?? []).filter((s) => c.inDiv(s.division) && s.team);
  const sections: { title: string; sub?: string; division?: string; rows: StandingRow[] }[] = [];
  if (sheet.length) {
    const by = new Map<string, typeof sheet>();
    for (const s of sheet) by.set(s.section ?? s.division ?? '', [...(by.get(s.section ?? s.division ?? '') ?? []), s]);
    for (const [title, list] of by) sections.push({ title, division: list[0].division, rows: list.map((s) => ({ place: s.place, team: s.team, division: s.division })) });
  } else {
    for (const [d, list] of c.view.places) {
      if (!c.inDiv(d || undefined)) continue;
      sections.push({ title: d, sub: 'Projected from the brackets', division: d || undefined, rows: list.map((p) => ({ ...p, division: d || undefined })) });
    }
  }
  if (!sections.length) return <Empty title="No final standings yet" body="They appear when the sheet lists them or the brackets are decided." />;
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
            <QualLegend quals={quals} />
          </section>
        );
      })}
      {notPlayed.length > 0 && (
        <div className="np-note">
          <span className="np-badge">{notPlayed[0].g.code?.replace(/[[\]]/g, '') || 'GTG'}</span>
          <span>
            {notPlayed.length === 1 ? 'One game wasn’t played' : `${notPlayed.length} games weren’t played`}, so those places come from the earlier results.
          </span>
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
