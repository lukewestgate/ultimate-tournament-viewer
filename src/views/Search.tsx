import { useEffect, useMemo, useRef, useState } from 'react';
import { GameRow } from '../components/game';
import { Icons } from '../components/icons';
import { clubColor, initials } from '../engine/clubs';
import { mayPlay, teamSide } from '../engine/resolve';
import { useApp } from '../state/app';
import { navigate } from '../state/router';

const ALIASES: Record<string, string> = {
  lboro: 'loughborough',
  lufbra: 'loughborough',
  shef: 'sheffield',
  sheff: 'sheffield',
  notts: 'nottingham',
  nott: 'nottingham',
  uol: 'leeds',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9: ]/g, ' ').replace(/\s+/g, ' ').trim();

export function SearchOverlay() {
  const { searchOpen, setSearchOpen, t, r, status } = useApp();
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>(() => JSON.parse(localStorage.getItem('utv:recent') ?? '[]'));
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!searchOpen) return;
    setQ('');
    setTimeout(() => input.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSearchOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen, setSearchOpen]);

  const results = useMemo(() => {
    const query = norm(q);
    if (!query) return { teams: [], games: [] };
    const tokens = query.split(' ').map((w) => ALIASES[w] ?? w);
    const teams = t.seeds
      .map((s) => s.team)
      .filter((name) => {
        const words = norm(name).split(' ');
        return tokens.every((tok) => words.some((w) => w.startsWith(tok)) || (/^[a-z]\d+$/.test(tok) && initials(name).toLowerCase() === tok));
      });
    let games = r.games.filter(() => false);
    const pitch = /^(?:pitch|p)\s*(\d+)$/.exec(query);
    const time = /^(\d{1,2}):?(\d{2})$/.exec(query);
    if (pitch) games = r.games.filter((x) => x.game.pitch === Number(pitch[1]) && status(x) !== 'final');
    else if (time) {
      const hhmm = `${time[1].padStart(2, '0')}:${time[2]}`;
      games = r.games.filter((x) => x.game.time === hhmm);
    } else {
      const compact = query.replace(/\s/g, '');
      games = r.games.filter((x) => x.game.code.toLowerCase() === compact || (compact.length >= 2 && x.game.code.toLowerCase().startsWith(compact)));
      if (teams.length === 1) {
        const tm = teams[0];
        games = [...games, ...r.games.filter((x) => (teamSide(x, tm) || mayPlay(x, tm)) && status(x) !== 'final')];
      }
    }
    return { teams, games: [...new Set(games)].slice(0, 30) };
  }, [q, t, r, status]);

  if (!searchOpen) return null;

  const goTeam = (team: string) => {
    const next = [team, ...recent.filter((x) => x !== team)].slice(0, 5);
    setRecent(next);
    localStorage.setItem('utv:recent', JSON.stringify(next));
    setSearchOpen(false);
    navigate('team', team);
  };

  const teamRow = (team: string) => {
    const next = r.games.find((x) => teamSide(x, team) && status(x) !== 'final' && status(x) !== 'awaiting');
    const opp = next && (teamSide(next, team) === 'lo' ? next.hi : next.lo);
    return (
      <button key={team} className="lrow" onClick={() => goTeam(team)}>
        <span className="avatar" style={{ width: 32, height: 32, fontSize: 14, borderColor: clubColor(team) }}>
          {initials(team)}
        </span>
        <span className="grow col">
          <b style={{ fontSize: 15 }}>{team}</b>
          {next && (
            <span className="cap" style={{ fontWeight: 500 }}>
              Next {next.game.day.slice(0, 3)} {next.game.time} · P{next.game.pitch} vs {opp!.teams.length === 1 ? opp!.teams[0] : opp!.label}
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <div className="search" onClick={() => setSearchOpen(false)}>
      <div className="search-panel" onClick={(e) => e.stopPropagation()}>
        <div className="search-bar">
          <button className="ib" aria-label="Close search" onClick={() => setSearchOpen(false)}>
            {Icons.back}
          </button>
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Teams, games (1v8), pitch 2, 14:10" aria-label="Search" enterKeyHint="search" />
          {q && (
            <button className="ib" aria-label="Clear" onClick={() => setQ('')}>
              {Icons.close}
            </button>
          )}
        </div>
        <div className="search-body">
          {!q && recent.length > 0 && (
            <section className="section">
              <span className="lbl">Recent</span>
              <div className="card list">{recent.filter((x) => t.seeds.some((s) => s.team === x)).map(teamRow)}</div>
            </section>
          )}
          {!q && (
            <div className="muted" style={{ fontSize: 13 }}>
              Try “shef”, “1v8”, “pitch 3” or “14:10”.
            </div>
          )}
          {results.teams.length > 0 && (
            <section className="section">
              <span className="lbl">Teams</span>
              <div className="card list">{results.teams.map(teamRow)}</div>
            </section>
          )}
          {results.games.length > 0 && (
            <section className="section" onClick={() => setSearchOpen(false)}>
              <span className="lbl">Games</span>
              <div className="card list">
                {results.games.map((x) => (
                  <GameRow key={x.game.id} rg={x} meta={`${x.game.day.slice(0, 3)} ${x.game.time}`} />
                ))}
              </div>
            </section>
          )}
          {q && !results.teams.length && !results.games.length && (
            <div className="card empty">
              <b>No matches</b>
              <span>Search by team, game code, pitch or time.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
