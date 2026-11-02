import { useT } from './ctx';
import { useOverlay } from './overlay';
import { parseTeamKey } from '../store/settings';
import { withoutTag } from '../extract/names';
import { plural } from './fmt';

/** Competition picker: two levels (group → competition), counts, followed teams marked; remembered per tournament. */
export function DivisionPicker() {
  const c = useT();
  const overlay = useOverlay();
  const groups = new Map<string, string[]>();
  for (const d of c.t.divisions) groups.set(d.group ?? d.name, [...(groups.get(d.group ?? d.name) ?? []), d.name]);
  const followed = c.followed.map(parseTeamKey);
  const pick = (d: string | undefined) => {
    c.setDivision(d);
    overlay.closeSheet();
  };
  const games = (d?: string) => c.t.games.filter((g) => !g.unscheduled && !g.isBye && (!d || g.division === d)).length;
  return (
    <div className="dpick">
      <p className="dpick-meta small muted">
        {plural(c.t.divisions.length, 'competition')} · {plural(c.t.teams.length, 'team')}
      </p>
      <button className={`dpick-row all${!c.division ? ' on' : ''}`} onClick={() => pick(undefined)}>
        <b>All competitions</b>
        <span className="d muted">{games()} games</span>
      </button>
      {[...groups.entries()].map(([g, ds]) => (
        <div key={g} className="dpick-group">
          {(ds.length > 1 || groups.size > 1) && (
            <div className="dpick-head">
              <span className="lbl">{g}</span>
            </div>
          )}
          {ds.map((d) => {
            const mine = followed.filter((f) => f.division === d);
            return (
              <button key={d} className={`dpick-row${c.division === d ? ' on' : ''}`} onClick={() => pick(d)} role="radio" aria-checked={c.division === d}>
                <span className="radio" aria-hidden="true" />
                <span className="dpick-name">{d}</span>
                {mine.length > 0 && <span className="dpick-mine">★ {withoutTag(mine[0].name)}</span>}
                <span className="d muted">{plural(c.t.teams.filter((t) => t.division === d).length, 'team')}</span>
              </button>
            );
          })}
        </div>
      ))}
      {c.t.divisions.some((d) => d.code) && <p className="small muted dpick-note">Competition names come from the sheet; codes like “{c.t.divisions.find((d) => d.code)?.code}” are named from the seeding tab.</p>}
    </div>
  );
}
