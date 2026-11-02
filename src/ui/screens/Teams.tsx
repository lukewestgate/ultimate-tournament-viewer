import { useState } from 'react';
import { useT } from '../ctx';
import { IChevronDown, ISearch, IStar } from '../icons';
import { Empty } from '../parts';
import { PageHead } from '../Shell';
import { tHref } from '../router';
import { foldName, regionTag, withoutTag } from '../../extract/names';
import { teamKey } from '../../store/settings';
import type { Team } from '../../model/types';
import type { ScreenProps } from './index';

/** Teams (spec §9.8; LargeTabs): search first, following, then grouped by competition and club. */
export function Teams(_: ScreenProps) {
  const c = useT();
  const [q, setQ] = useState('');
  const f = foldName(q);
  const teams = c.t.teams.filter((t) => c.inDiv(t.division) && (!f || foldName(t.name).includes(f) || foldName(t.club).includes(f)));
  const following = c.t.teams.filter((t) => c.isFollowed(t.name, t.division));
  const byDiv = new Map<string, Team[]>();
  for (const t of teams) byDiv.set(t.division ?? '', [...(byDiv.get(t.division ?? '') ?? []), t]);
  const order = c.t.divisions.map((d) => d.name);
  const groups = [...byDiv.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  return (
    <>
      <PageHead title={c.division ? `Teams · ${c.division}` : 'Teams'} />
      <label className="search-field boxed">
        <ISearch size={18} />
        <input placeholder={`Find a team or club (${c.t.teams.filter((t) => c.inDiv(t.division)).length})`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a team or club" />
      </label>
      {following.length > 0 && !q && (
        <section className="tgroup">
          <div className="tgroup-head static">
            <span className="lbl">Following</span>
          </div>
          <div className="card list">
            {following.map((t) => (
              <Row key={teamKey(t.name, t.division)} t={t} showDiv />
            ))}
          </div>
        </section>
      )}
      {!teams.length && <Empty title="Team not found" body="Check the spelling, or try the club name." />}
      {groups.map(([div, list]) => (
        <Group key={div} div={div} list={list} open={groups.length === 1 || Boolean(q) || list.some((t) => c.isFollowed(t.name, t.division))} />
      ))}
    </>
  );
}

function Group({ div, list, open: initial }: { div: string; list: Team[]; open: boolean }) {
  const c = useT();
  const [open, setOpen] = useState(initial);
  const [all, setAll] = useState(list.length <= 12);
  const clubs = new Map<string, Team[]>();
  for (const t of list) clubs.set(t.club, [...(clubs.get(t.club) ?? []), t]);
  const sorted = [...clubs.entries()].sort((a, b) => a[0].localeCompare(b[0])).flatMap(([, ts]) => ts.sort((a, b) => a.name.localeCompare(b.name)));
  const shown = all ? sorted : sorted.slice(0, 6);
  return (
    <section className="tgroup">
      {div || c.t.divisions.length ? (
        <button className="tgroup-head" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="lbl">{div || 'Teams'}</span>
          <span style={{ flex: 1 }} />
          <span className="d tgroup-count">{list.length} teams</span>
          <IChevronDown size={14} className={`chev${open ? ' up' : ''}`} />
        </button>
      ) : null}
      {open && (
        <div className="card list">
          {shown.map((t, i) => (
            <Row key={teamKey(t.name, t.division)} t={t} clubStart={i === 0 || shown[i - 1].club !== t.club} sameClub={sorted.filter((x) => x.club === t.club).length > 1} />
          ))}
          {!all && (
            <button className="more-link" onClick={() => setAll(true)}>
              Show all {list.length}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Row({ t, showDiv }: { t: Team; showDiv?: boolean; clubStart?: boolean; sameClub?: boolean }) {
  const c = useT();
  const on = c.isFollowed(t.name, t.division);
  const k = teamKey(t.name, t.division);
  const st = [...c.view.standings.values()].reverse().find((s) => s.pool.division === t.division && s.rows.some((r) => r.team === t.name));
  const tag = regionTag(t.name);
  const right = showDiv && t.division ? t.division : st ? `Pool ${st.pool.name}` : t.seed !== undefined ? `Seed ${t.seed}` : '';
  return (
    <div className={`trow${on ? ' on' : ''}`}>
      <a className="trow-link" href={tHref(c.id, 'team', k)}>
        <span className="dot" style={{ background: c.colorOf(t.name, t.division) }} />
        <span className="trow-name">{tag ? withoutTag(t.name) : t.name}</span>
        {tag && <span className="region">{tag}</span>}
        {c.primary === k && <span className="tag primary">PRIMARY</span>}
        <span style={{ flex: 1 }} />
        <span className="trow-right">{right}</span>
      </a>
      <button className={`ib star${on ? ' on' : ''}`} aria-pressed={on} aria-label={on ? `Unfollow ${t.name}` : `Follow ${t.name}`} onClick={() => c.toggleFollow(t.name, t.division)}>
        <IStar filled={on} size={20} />
      </button>
    </div>
  );
}
