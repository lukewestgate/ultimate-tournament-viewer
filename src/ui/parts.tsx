import type { ReactNode } from 'react';
import type { GameView } from '../engine/view';
import type { SideRes } from '../engine/resolve';
import { STATUS_LABEL } from '../engine/status';
import { regionTag, withoutTag } from '../extract/names';
import { useT } from './ctx';
import { timeOf, until } from './fmt';
import { tHref } from './router';
import { teamKey } from '../store/settings';

export function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="dot" style={{ background: color, width: size, height: size }} aria-hidden="true" />;
}

/** Team name with club dot and a quiet region-tag chip. Links to the team page unless `plain`. */
export function TeamName({ name, division, bold, plain, size }: { name: string; division?: string; bold?: boolean; plain?: boolean; size?: number }) {
  const c = useT();
  const tag = regionTag(name);
  const followed = c.isFollowed(name, division);
  const inner = (
    <>
      <Dot color={c.colorOf(name, division)} size={size ?? 10} />
      <span className="tn-name" style={{ fontWeight: bold || followed ? 700 : undefined }}>
        {tag ? withoutTag(name) : name}
      </span>
      {tag && <span className="region">{tag}</span>}
      {followed && <span className="sr-only">(followed)</span>}
    </>
  );
  if (plain) return <span className="tn">{inner}</span>;
  return (
    <a className="tn" href={tHref(c.id, 'team', teamKey(name, division))} onClick={(e) => e.stopPropagation()}>
      {inner}
    </a>
  );
}

/** One side of a game: the team, or the slot label plus possible teams. */
export function Side({ side, division, bold, plain }: { side: SideRes; division?: string; bold?: boolean; plain?: boolean }) {
  if (side.team) return <TeamName name={side.team} division={division} bold={bold} plain={plain} />;
  const poss = side.possible;
  return (
    <span className="tn slot">
      <span className="dot hollow" aria-hidden="true" />
      <span className="slot-label">{side.label ?? 'TBC'}</span>
      {poss.length > 0 && poss.length <= 4 && <span className="possible">{poss.map((p) => withoutTag(p)).join(' / ')}</span>}
      {poss.length > 4 && <span className="possible">{poss.length} possible</span>}
    </span>
  );
}

export function PitchBadge({ label, big }: { label: string; big?: boolean }) {
  if (!label) return <span className={`pb muted-pb${big ? ' big' : ''}`}>–</span>;
  return (
    <span className={`pb${big ? ' big' : ''}`} aria-label={`Pitch ${label}`}>
      {/^\d/.test(label) ? `P${label}` : label}
    </span>
  );
}

export function LiveTag() {
  return (
    <span className="tag live">
      <i className="li" />
      LIVE
    </span>
  );
}

export function StatusTag({ v }: { v: GameView }) {
  const c = useT();
  if (v.simulated) return <span className="tag sim">SIM</span>;
  if (v.result?.hypothetical) return <span className="tag if">IF</span>;
  switch (v.status) {
    case 'live':
      return <LiveTag />;
    case 'upcoming':
      return v.g.start - c.view.clock < 30 * 60000 ? <span className="tag soon">{until(v.g.start, c.view.clock)}</span> : <span className="tag quiet">{timeOf(v.g.start, c.t.timeZone)}</span>;
    case 'final':
      return <span className="tag final">Final</span>;
    case 'ifRequired':
      return <span className="tag dashed">If required</span>;
    case 'notPlayed':
      return <span className="tag struck">Not played</span>;
    case 'awaiting':
      return <span className="tag outline">Awaiting result</span>;
    default:
      return <span className="tag quiet">{STATUS_LABEL[v.status]}</span>;
  }
}

/** Stage text: "Pool B", "8v9", "Placement". */
export function stageText(v: GameView): string {
  const g = v.g;
  if (g.pool) return /^[\p{L}\d]{1,3}$/u.test(g.pool) ? `Pool ${g.pool}` : g.pool;
  if (g.code) return g.code.replace(/[[\]]/g, '');
  return 'Placement';
}

export function scoreText(v: GameView, i: 0 | 1): string {
  const r = v.result;
  if (!r) return '';
  const s = i === 0 ? r.sa : r.sb;
  if (s !== undefined) return String(s);
  const o = r.outcome;
  if (o === 'D') return 'D';
  return (o === 'A') === (i === 0) ? 'W' : 'L';
}

export function winnerSide(v: GameView): 0 | 1 | undefined {
  const o = v.result?.outcome;
  return o === 'A' ? 0 : o === 'B' ? 1 : undefined;
}

/** Compact game row: pitch, both sides with scores, stage, status. */
export function GameRow({ v, showTime, showDay, onOpen, extra }: { v: GameView; showTime?: boolean; showDay?: boolean; onOpen?: () => void; extra?: ReactNode }) {
  const c = useT();
  const w = winnerSide(v);
  const mine = c.isFollowed(v.sides[0].team, v.g.division) || c.isFollowed(v.sides[1].team, v.g.division);
  const cls = ['grow', mine ? 'mine-row' : '', v.hypothetical ? 'hyp' : '', v.simulated ? 'simrow' : '', v.status === 'notPlayed' ? 'np' : '', v.status === 'ifRequired' ? 'ifreq' : '', c.rt.changed.has(v.g.id) && Date.now() - c.rt.changed.get(v.g.id)! < 60000 ? 'flash' : ''].join(' ');
  if (v.g.isBye) {
    const team = v.sides[0].team ?? v.sides[1].team;
    return (
      <div className="grow bye">
        {showTime && <span className="gtime d">{timeOf(v.g.start, c.t.timeZone)}</span>}
        <span className="pb muted-pb">–</span>
        <span className="gteams">{team ? <TeamName name={team} division={v.g.division} /> : null}</span>
        <span className="tag quiet">Bye</span>
      </div>
    );
  }
  return (
    <div className={cls} role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined} onClick={onOpen} onKeyDown={(e) => onOpen && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}>
      {showTime && (
        <span className="gtime d">
          {showDay && <span className="gday">{v.g.day.slice(0, 3)} </span>}
          {timeOf(v.g.start, c.t.timeZone)}
        </span>
      )}
      <PitchBadge label={v.g.pitch.label} />
      <div className="gteams">
        {([0, 1] as const).map((i) => (
          <div key={i} className={`gside${w === i ? ' won' : w !== undefined ? ' lost' : ''}`}>
            <Side side={v.sides[i]} division={v.g.division} bold={w === i} />
            <b className="gscore d">{scoreText(v, i)}</b>
          </div>
        ))}
      </div>
      <div className="gmeta">
        <span className="gstage">{stageText(v)}</span>
        <StatusTag v={v} />
        {extra}
      </div>
    </div>
  );
}

export function Empty({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {body && <span>{body}</span>}
      {children}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, sub, right, children, id }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="section" id={id}>
      <div className="section-head">
        <h2>{title}</h2>
        {sub && <span className="sub">{sub}</span>}
        <span style={{ flex: 1 }} />
        {right}
      </div>
      {children}
    </section>
  );
}
