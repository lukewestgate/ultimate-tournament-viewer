import { useMemo, useState } from 'react';
import type { TCtx } from '../ctx';
import { useT } from '../ctx';
import { useOverlay as useOverlayHook, type useOverlay } from '../overlay';
import { foldName } from '../../extract/names';
import { parseTime } from '../../sheets/cells';
import { store } from '../../store/app';
import { teamKey } from '../../store/settings';
import { GameRow, TeamName } from '../parts';
import { navigate, tHref } from '../router';
import { timeOf } from '../fmt';
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

function SearchPanel() {
  const c = useT();
  const overlay = useOverlayHook();
  const [q, setQ] = useState('');
  const res = useMemo(() => searchAll(c, q), [c, q]);
  const recents = store.app.recentSearches ?? [];
  const remember = () => {
    if (q.trim()) store.setApp({ recentSearches: [q.trim(), ...recents.filter((r) => r !== q.trim())].slice(0, 6) });
  };
  const [game, setGame] = useState<string | undefined>();
  if (game) return (
    <div className="stack">
      <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => setGame(undefined)}>
        ← Back to search
      </button>
      <GameDetail id={game} />
    </div>
  );
  return (
    <div className="stack search">
      <input className="field" autoFocus placeholder="Team, game code, “pitch 2”, “14:10”" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      {!q && recents.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <span className="lbl">Recent</span>
          <div className="row-btns">
            {recents.map((r) => (
              <button key={r} className="chip" onClick={() => setQ(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
      )}
      {res.teams.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <span className="lbl">Teams</span>
          <div className="card list">
            {res.teams.map((t) => (
              <button
                key={teamKey(t.name, t.division)}
                className="search-row"
                onClick={() => {
                  remember();
                  navigate(tHref(c.id, 'team', teamKey(t.name, t.division)));
                  overlay.closeSheet();
                }}
              >
                <TeamName name={t.name} division={t.division} plain />
                <span className="muted small">{t.division}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {res.games.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <span className="lbl">Games</span>
          <div className="card list">
            {res.games.map((v) => (
              <GameRow key={v.g.id} v={v} showTime showDay onOpen={() => (remember(), setGame(v.g.id))} />
            ))}
          </div>
        </div>
      )}
      {q && !res.teams.length && !res.games.length && (
        <div className="empty">
          <b>No results</b>
          <span>Try part of a team name, a game code like “8v9”, “pitch 2” or a time.</span>
        </div>
      )}
    </div>
  );
}

/** Search: palette on desktop (Ctrl/⌘K), sheet on mobile. */
export function openSearch(overlay: ReturnType<typeof useOverlay>, _c: TCtx) {
  overlay.openSheet(<SearchPanel />, { title: 'Search', wide: true });
}
