import { useState } from 'react';
import { useT } from './ctx';
import { ISearch, IStar } from './icons';
import { TeamName } from './parts';
import { teamKey } from '../store/settings';
import { foldName } from '../extract/names';

/** Pick followed teams: grouped by division, a star toggle per team, one primary. */
export function TeamPicker({ compact }: { compact?: boolean }) {
  const c = useT();
  const [q, setQ] = useState('');
  const groups = new Map<string, typeof c.t.teams>();
  const f = foldName(q);
  for (const team of c.t.teams) {
    if (f && !foldName(team.name).includes(f)) continue;
    const k = team.division ?? '';
    groups.set(k, [...(groups.get(k) ?? []), team]);
  }
  return (
    <div className="stack">
      {c.t.teams.length > 12 && (
        <label className="search-field boxed picker-search">
          <ISearch size={18} />
          <input placeholder={`Find a team (${c.t.teams.length})`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a team" />
        </label>
      )}
      {c.followed.length === 0 && <p className="small muted" style={{ margin: 0 }}>Star the teams you care about. The first one becomes your primary team.</p>}
      {[...groups.entries()].map(([div, teams]) => (
        <div key={div} className="stack" style={{ gap: 4 }}>
          {div && <div className="lbl">{div}</div>}
          <div className={`card list${compact ? ' flat' : ''}`}>
            {teams.map((team) => {
              const k = teamKey(team.name, team.division);
              const on = c.isFollowed(team.name, team.division);
              return (
                <div key={k} className="follow-row">
                  <TeamName name={team.name} division={team.division} plain />
                  <span style={{ flex: 1 }} />
                  {on && c.primary === k && <span className="tag primary sm">Primary</span>}
                  {on && c.primary !== k && (
                    <button className="btn small" onClick={() => c.setPrimary(k)}>
                      Make primary
                    </button>
                  )}
                  <button className={`ib star${on ? ' on' : ''}`} aria-pressed={on} aria-label={on ? `Unfollow ${team.name}` : `Follow ${team.name}`} onClick={() => c.toggleFollow(team.name, team.division)}>
                    <IStar filled={on} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
