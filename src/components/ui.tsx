import type { ReactNode } from 'react';
import { clubColor } from '../engine/clubs';
import type { QualBadge } from '../engine/bracket';
import type { Side } from '../engine/resolve';
import { agoText } from '../engine/time';
import { useApp } from '../state/app';
import { Icons } from './icons';

export function Dot({ team, size }: { team?: string; size?: 'sm' | 'xs' }) {
  return <span className={`dot ${size ?? ''} ${team ? '' : 'hollow'}`} style={{ background: clubColor(team) }} aria-hidden="true" />;
}

export function Pitch({ n, size }: { n: number; size?: 'sm' | 'xl' }) {
  return (
    <span className={`pb ${size ?? ''}`} aria-label={`Pitch ${n}`}>
      P{n}
    </span>
  );
}

export function Live({ label = 'LIVE' }: { label?: string }) {
  return (
    <span className="live">
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

export function Badges({ list, full }: { list: QualBadge[]; full?: boolean }) {
  return (
    <>
      {list.map((b) => (
        <span key={b} className={`badge ${b}`} title={b === 'Q' ? 'Division 1 qualified' : b === 'q' ? 'Division 2 qualified' : 'Game to go'}>
          {full && b === 'Q' ? 'Q Div 1' : full && b === 'q' ? 'q Div 2' : b}
        </span>
      ))}
    </>
  );
}

export function WL({ r, wide }: { r?: 'W' | 'L' | 'D'; wide?: boolean }) {
  if (!r) return null;
  return <span className={`wl ${r} ${wide ? 'wide' : ''}`}>{r}</span>;
}

/** "Loughborough 3 or Loughborough 4", "1 of 4 teams" */
export function Possible({ teams, max = 3 }: { teams: string[]; max?: number }) {
  if (!teams.length) return null;
  if (teams.length > max) {
    return (
      <span className="possible">
        <span style={{ display: 'inline-flex' }}>
          {teams.slice(0, 3).map((t, i) => (
            <span key={t} className="dot xs" style={{ background: clubColor(t), marginLeft: i ? -3 : 0, boxShadow: '0 0 0 1.5px var(--surface)' }} />
          ))}
        </span>
        1 of {teams.length} teams
      </span>
    );
  }
  return (
    <span className="possible">
      {teams.map((t, i) => (
        <span key={t} className="row" style={{ gap: 6 }}>
          {i > 0 && <span>or</span>}
          <Dot team={t} size="xs" />
          {t}
        </span>
      ))}
    </span>
  );
}

export function sideName(s: Side): string {
  return s.teams.length === 1 ? s.teams[0] : s.label;
}

export function Freshness() {
  const { feed, now } = useApp();
  const at = feed.lastOk;
  const age = at ? Date.now() - at : Infinity;
  const stale = age > 10 * 60_000;
  return (
    <span className="row cap" style={{ gap: 6, fontWeight: 500 }}>
      <span className="dot" style={{ width: 6, height: 6, background: !at ? 'var(--ink3)' : stale ? 'var(--stale)' : 'var(--win)' }} />
      {feed.loading && !at ? 'Loading…' : at ? `Updated ${agoText(Math.max(0, age))}` : 'Not updated yet'}
      <span hidden>{now}</span>
    </span>
  );
}

export function Section({ title, aside, right, children }: { title: string; aside?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {aside && <span className="d">{aside}</span>}
        <span className="grow" />
        {right}
      </div>
      {children}
    </section>
  );
}

export function StarButton({ team }: { team: string }) {
  const { myTeam, setMyTeam } = useApp();
  const on = myTeam === team;
  return (
    <button className="star-btn" aria-pressed={on} onClick={() => setMyTeam(on ? undefined : team)}>
      {on ? Icons.star : Icons.starOutline}
      {on ? 'My team' : 'Set as my team'}
    </button>
  );
}
