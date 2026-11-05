import { useMemo, useState, type ReactNode } from 'react';
import type { TCtx } from '../ctx';
import { useT } from '../ctx';
import { useOverlay as useOverlayHook, type useOverlay } from '../overlay';
import { foldName, regionTag, withoutTag } from '../../extract/names';
import { parseTime } from '../../sheets/cells';
import { store } from '../../store/app';
import { teamKey } from '../../store/settings';
import { PitchBadge, scoreText, stageText } from '../parts';
import { navigate, tHref } from '../router';
import { initials, timeOf } from '../fmt';
import { IChevronLeft, IClock, ISearch } from '../icons';
import type { GameView } from '../../engine/view';
import type { Team } from '../../model/types';
import { GameDetail } from './GameDetail';

/** Fuzzy score: all query letters in order ("lboro 2" ~ "Loughborough 2"); word-prefix hits score higher. */
export function fuzzyScore(query: string, target: string): number {
  const q = foldName(query);
  const t = foldName(target);
  if (!q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  const words = target.toLowerCase().split(/[\s()]+/).filter(Boolean);
  const qWords = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (qWords.every((qw) => words.some((w) => foldName(w).startsWith(foldName(qw))))) return 70;
  if (t.includes(q)) return 60;
  // subsequence, numbers must match exactly
  const qNums: string[] = query.match(/\d+/g) ?? [];
  const tNums: string[] = target.match(/\d+/g) ?? [];
  if (qNums.some((n) => !tNums.includes(n))) return 0;
  const qLetters = foldName(query.replace(/\d+/g, ''));
  let i = 0;
  for (const ch of foldName(target.replace(/\d+/g, ''))) if (ch === qLetters[i]) i++;
  return i === qLetters.length && qLetters.length >= 2 ? 40 : 0;
}

export function searchAll(c: TCtx, query: string): { teams: Team[]; games: GameView[] } {
  const q = query.trim();
  if (!q) return { teams: [], games: [] };
  const teams = c.t.teams
    .map((t) => ({ t, s: Math.max(fuzzyScore(q, t.name), fuzzyScore(q, t.club) - 5) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 8)
    .map((x) => x.t);
  let games: GameView[] = [];
  const pitch = /^(?:pitch|p)\s*(\w+)$/i.exec(q);
  const time = /^\d{1,2}[:.]\d{2}$/.test(q) ? parseTime(q) : undefined;
  const code = q.replace(/\s+/g, '').toLowerCase();
  const all = c.view.games.filter((v) => !v.g.unscheduled);
  if (pitch) games = all.filter((v) => v.g.pitch.label.toLowerCase() === pitch[1].toLowerCase());
  else if (time !== undefined) games = all.filter((v) => timeOf(v.g.start, c.t.timeZone) === `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}`);
  else games = all.filter((v) => v.g.code && v.g.code.replace(/[[\]\s]/g, '').toLowerCase() === code.replace(/[[\]]/g, ''));
  if (!games.length && teams.length === 1) games = all.filter((v) => v.sides.some((s) => s.team === teams[0].name)).slice(0, 6);
  // Prefer upcoming games
  games.sort((a, b) => Number(a.status === 'final') - Number(b.status === 'final') || a.g.start - b.g.start);
  return { teams, games: games.slice(0, 12) };
}

/** Highlight the first case-insensitive match of the query in a label. */
export function Hl({ text, q }: { text: string; q: string }) {
  const i = q.trim() ? text.toLowerCase().indexOf(q.trim().toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  const n = q.trim().length;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + n)}</mark>
      {text.slice(i + n)}
    </>
  );
}

function SearchPanel() {
  const c = useT();
  const overlay = useOverlayHook();
  const [q, setQ] = useState('');
  const res = useMemo(() => searchAll(c, q), [c, q]);
  const [recents, setRecents] = useState(store.app.recentSearches ?? []);
  const [allGames, setAllGames] = useState(false);
  const [game, setGame] = useState<string | undefined>();
  const remember = () => {
    if (q.trim()) store.setApp({ recentSearches: [q.trim(), ...recents.filter((r) => r !== q.trim())].slice(0, 6) });
  };
  const tz = c.t.timeZone;
  const today = c.view.games.find((v) => v.g.start >= c.view.clock)?.g.day;
  const when = (v: GameView) => `${v.g.day !== today ? `${v.g.day.slice(0, 3)} ` : ''}${timeOf(v.g.start, tz)}`;
  const opp = (v: GameView, team: string) => {
    const s = v.sides[0].team === team ? v.sides[1] : v.sides[0];
    return s.team ? withoutTag(s.team) : (s.label ?? 'TBC');
  };
  const teamLine = (t: Team): { text: string; live: boolean } => {
    const games = c.view.games.filter((v) => v.g.division === t.division && v.sides.some((s) => s.team === t.name) && !v.g.isBye);
    const live = games.find((v) => v.status === 'live' || v.status === 'finishing');
    if (live) {
      const i = live.sides[0].team === t.name ? 0 : 1;
      const sc = live.result ? ` · ${scoreText(live, i)}–${scoreText(live, (1 - i) as 0 | 1)}` : '';
      return { text: `Playing now${live.g.pitch.label ? ` · P${live.g.pitch.label}` : ''} vs ${opp(live, t.name)}${sc}`, live: true };
    }
    const next = games.find((v) => v.status === 'upcoming');
    if (next) return { text: `Next ${when(next)}${next.g.pitch.label ? ` · P${next.g.pitch.label}` : ''} vs ${opp(next, t.name)}`, live: false };
    const last = [...games].reverse().find((v) => v.result);
    if (last) {
      const i = last.sides[0].team === t.name ? 0 : 1;
      const o = last.result!.outcome;
      const r = o === 'D' ? 'D' : (o === 'A') === (i === 0) ? 'W' : 'L';
      return { text: `Last: ${r} ${scoreText(last, i)}–${scoreText(last, (1 - i) as 0 | 1)} vs ${opp(last, t.name)}`, live: false };
    }
    return { text: t.division ?? t.club, live: false };
  };
  const gameLine = (v: GameView) => {
    const sc = v.result ? `${scoreText(v, 0)}–${scoreText(v, 1)}` : '';
    const state = v.status === 'live' || v.status === 'finishing' ? `live ${sc}`.trim() : v.result ? `final ${sc}` : '';
    return [`${v.g.day.slice(0, 3)} ${timeOf(v.g.start, tz)}`, stageText(v), v.g.division && !c.division ? v.g.division : '', state].filter(Boolean).join(' · ');
  };
  const side = (v: GameView, i: 0 | 1) => withoutTag(v.sides[i].team ?? v.sides[i].label ?? 'TBC');

  if (game)
    return (
      <div className="search-detail">
        <button className="back-link" onClick={() => setGame(undefined)}>
          <IChevronLeft size={18} /> Back to results
        </button>
        <GameDetail id={game} />
      </div>
    );

  const first = c.view.games.find((v) => !v.g.unscheduled && v.g.code);
  const nextGame = c.view.games.find((v) => v.status === 'upcoming');
  const sampleTeam = c.followed[0] ? withoutTag(c.followed[0].split('::').pop()!) : c.t.teams[0]?.name;
  const tries = [...new Set([sampleTeam, first?.g.code?.replace(/[[\]]/g, ''), first?.g.pitch.label ? `pitch ${first.g.pitch.label}` : '', nextGame ? timeOf(nextGame.g.start, tz) : ''].filter((x): x is string => Boolean(x)))];
  const games = allGames ? res.games : res.games.slice(0, 5);
  let body: ReactNode;
  if (!q.trim()) {
    body = (
      <>
        {recents.length > 0 && (
          <section className="sr-sec">
            <div className="sr-head">
              <span className="lbl">Recent</span>
              <button
                className="link"
                onClick={() => {
                  store.setApp({ recentSearches: [] });
                  setRecents([]);
                }}
              >
                Clear
              </button>
            </div>
            {recents.map((r) => (
              <button key={r} className="sr-recent" onClick={() => setQ(r)}>
                <IClock size={18} /> {r}
              </button>
            ))}
          </section>
        )}
        <section className="sr-sec">
          <span className="lbl">Try</span>
          <div className="sr-tries">
            {tries.map((t) => (
              <button key={t} className="chip" onClick={() => setQ(t)}>
                {t}
              </button>
            ))}
          </div>
        </section>
      </>
    );
  } else if (!res.teams.length && !res.games.length) {
    body = (
      <div className="empty">
        <b>No results for “{q.trim()}”</b>
        <span>Try a team, a code like {first?.g.code ? `“${first.g.code.replace(/[[\]]/g, '')}”` : '“1v8”'}, a pitch or a time.</span>
      </div>
    );
  } else {
    body = (
      <>
        {res.teams.length > 0 && (
          <section className="sr-sec">
            <span className="lbl">Teams · {res.teams.length}</span>
            {res.teams.map((t) => {
              const line = teamLine(t);
              return (
                <button
                  key={teamKey(t.name, t.division)}
                  className="sr-row"
                  onClick={() => {
                    remember();
                    navigate(tHref(c.id, 'team', teamKey(t.name, t.division)));
                    overlay.closeSheet();
                  }}
                >
                  <span className="avatar d" style={{ borderColor: c.colorOf(t.name, t.division) }}>
                    {initials(t.name)}
                  </span>
                  <span className="sr-text">
                    <b>
                      <Hl text={withoutTag(t.name)} q={q} />
                      {regionTag(t.name) && <span className="region">{regionTag(t.name)}</span>}
                    </b>
                    <span>{line.text}</span>
                  </span>
                  {line.live && <span className="sr-live">LIVE</span>}
                  {!line.live && t.division && !c.division && <span className="sr-div">{t.division}</span>}
                </button>
              );
            })}
          </section>
        )}
        {res.games.length > 0 && (
          <section className="sr-sec">
            <span className="lbl">Games · {res.games.length}</span>
            {games.map((v) => (
              <button key={v.g.id} className="sr-row" onClick={() => (remember(), setGame(v.g.id))}>
                <PitchBadge label={v.g.pitch.label} />
                <span className="sr-text">
                  <b>
                    <Hl text={side(v, 0)} q={q} /> v <Hl text={side(v, 1)} q={q} />
                  </b>
                  <span>{gameLine(v)}</span>
                </span>
              </button>
            ))}
            {!allGames && res.games.length > games.length && (
              <button className="link sr-more" onClick={() => setAllGames(true)}>
                Show all {res.games.length} games
              </button>
            )}
          </section>
        )}
      </>
    );
  }
  return (
    <div className="search">
      <div className="sr-bar">
        <label className="sr-field">
          <ISearch size={20} />
          <input
            autoFocus
            placeholder="Team, game code, pitch or time"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setAllGames(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && remember()}
            aria-label="Search"
          />
        </label>
        <button className="link sr-cancel" onClick={overlay.closeSheet}>
          Cancel
        </button>
      </div>
      <div className="sr-body">{body}</div>
    </div>
  );
}

/** Search: palette on desktop (Ctrl/⌘K or /), full-screen on mobile (SpecSearch). */
export function openSearch(overlay: ReturnType<typeof useOverlay>, _c: TCtx) {
  overlay.openSheet(<SearchPanel />, { title: 'Search', palette: true });
}
