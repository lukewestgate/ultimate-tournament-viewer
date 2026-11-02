import { useState } from 'react';
import { useT } from '../ctx';
import { IStar } from '../icons';
import { Empty, Section, TeamName } from '../parts';
import { foldName } from '../../extract/names';
import { teamKey } from '../../store/settings';
import type { Team } from '../../model/types';
import type { ScreenProps } from './index';

/** Teams list (spec §9.8): grouped by division (when showing All), then club, with follow toggles. */
export function Teams(_: ScreenProps) {
  const c = useT();
  const [q, setQ] = useState('');
  const f = foldName(q);
  const teams = c.t.teams.filter((t) => c.inDiv(t.division) && (!f || foldName(t.name).includes(f) || foldName(t.club).includes(f)));
  const following = c.t.teams.filter((t) => c.isFollowed(t.name, t.division));
  const byDiv = new Map<string, Team[]>();
  for (const t of teams) byDiv.set(t.division ?? '', [...(byDiv.get(t.division ?? '') ?? []), t]);
  return (
    <>
      <input className="field" placeholder="Find a team or club" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a team or club" />
      {following.length > 0 && !q && (
        <Section title="Following">
          <div className="card list">
            {following.map((t) => (
              <Row key={teamKey(t.name, t.division)} t={t} showDiv />
            ))}
          </div>
        </Section>
      )}
      {!teams.length && <Empty title="Team not found" body="Check the spelling, or try the club name." />}
      {[...byDiv.entries()].map(([div, list]) => {
        const clubs = new Map<string, Team[]>();
        for (const t of list) clubs.set(t.club, [...(clubs.get(t.club) ?? []), t]);
        const sorted = [...clubs.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        return (
          <Section key={div} title={div || 'Teams'} sub={`${list.length} teams`}>
            <div className="card list">
              {sorted.map(([club, ts]) =>
                ts.length > 1 ? (
                  <div key={club} className="club-group">
                    <div className="lbl club-name">{club}</div>
                    {ts.sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
                      <Row key={teamKey(t.name, t.division)} t={t} />
                    ))}
                  </div>
                ) : (
                  <Row key={teamKey(ts[0].name, ts[0].division)} t={ts[0]} />
                ),
              )}
            </div>
          </Section>
        );
      })}
    </>
  );
}

function Row({ t, showDiv }: { t: Team; showDiv?: boolean }) {
  const c = useT();
  const on = c.isFollowed(t.name, t.division);
  const k = teamKey(t.name, t.division);
  const st = [...c.view.standings.values()].reverse().find((s) => s.pool.division === t.division && s.rows.some((r) => r.team === t.name));
  const rank = st?.rows.find((r) => r.team === t.name)?.rank;
  return (
    <div className="follow-row">
      <TeamName name={t.name} division={t.division} />
      <span className="muted small" style={{ marginLeft: 'auto', textAlign: 'right' }}>
        {showDiv && t.division ? `${t.division} · ` : ''}
        {t.seed !== undefined ? `Seed ${t.seed}` : ''}
        {rank ? `${t.seed !== undefined ? ' · ' : ''}${rank}${['st', 'nd', 'rd'][rank - 1] ?? 'th'} Pool ${st!.pool.name}` : ''}
      </span>
      {on && c.primary === k && <span className="tag primary">PRIMARY</span>}
      <button className={`ib star${on ? ' on' : ''}`} aria-pressed={on} aria-label={on ? `Unfollow ${t.name}` : `Follow ${t.name}`} onClick={() => c.toggleFollow(t.name, t.division)}>
        <IStar filled={on} />
      </button>
    </div>
  );
}
