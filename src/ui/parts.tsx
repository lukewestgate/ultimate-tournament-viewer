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
export function TeamName({ name, division, bold, plain, size, short }: { name: string; division?: string; bold?: boolean; plain?: boolean; size?: number; short?: boolean }) {
  const c = useT();
  const tag = regionTag(name);
  const followed = c.isFollowed(name, division);
  const shown = short ? shortName(tag ? withoutTag(name) : name) : tag ? withoutTag(name) : name;
  const inner = (
    <>
      <Dot color={c.colorOf(name, division)} size={size ?? 10} />
      <span className="tn-name" style={{ fontWeight: bold || followed ? 700 : undefined }}>
        {shown}
      </span>
      {tag && !short && <span className="region">{tag}</span>}
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

const SHORT: [RegExp, string][] = [
  [/^Loughborough/i, 'Lboro'],
  [/^Sheffield/i, 'Sheff'],
  [/^Nottingham/i, 'Notts'],
  [/^Manchester/i, 'Manc'],
  [/^Birmingham/i, 'Brum'],
  [/^Newcastle/i, 'Newc'],
  [/^Edinburgh/i, 'Edin'],
  [/^Southampton/i, 'Soton'],
  [/^Cambridge/i, 'Camb'],
  [/^University of /i, ''],
];

/** Short form for tight grids: "Loughborough 1" -> "Lboro 1". */
export function shortName(name: string): string {
  for (const [re, s] of SHORT) if (re.test(name)) return name.replace(re, s).trim();
  return name;
}

/** "Loughborough 3 or Loughborough 4", "Leeds 1 · 3 others", "8 possible". */
export function possibleText(poss: string[]): string {
  if (!poss.length) return '';
  if (poss.length <= 2) return poss.map(withoutTag).join(' or ');
  if (poss.length <= 3) return poss.map(withoutTag).join(', ');
  return `${poss.length} possible`;
}

/** One side of a game: the team, or the slot label (italic) with the teams that could still be there. */
export function Side({ side, division, bold, plain, inline, short, size }: { side: SideRes; division?: string; bold?: boolean; plain?: boolean; inline?: boolean; short?: boolean; size?: number }) {
  if (side.team) return <TeamName name={side.team} division={division} bold={bold} plain={plain} short={short} size={size} />;
  const poss = possibleText(side.possible);
  return (
    <span className={`slot${inline ? ' inline' : ''}`}>
      <span className="slotdot" aria-hidden="true" />
      <span className="slot-text">
        <span className="slot-label">{side.label ?? 'TBC'}</span>
        {poss && <span className="possible">{poss}</span>}
      </span>
    </span>
  );
}

/** Plain-text name for a side ("Leeds 1", "Winner 8v9"). */
export const sideText = (s: SideRes) => (s.team ? withoutTag(s.team) : s.label ?? 'TBC');

export function PitchBadge({ label, big, size }: { label: string; big?: boolean; size?: 'sm' | 'big' | 'xl' }) {
  const cls = size ?? (big ? 'big' : '');
  if (!label) return <span className={`pb muted-pb ${cls}`}>–</span>;
  return (
    <span className={`pb ${cls}`} aria-label={`Pitch ${label}`}>
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
    case 'final': {
      const w = winnerSide(v);
      return <span className="tag final">Final{w === undefined && v.result?.outcome === 'D' ? ' · D' : ''}</span>;
    }
    case 'ifRequired':
      return <span className="tag dashed">If required</span>;
    case 'notPlayed':
      return <span className="tag struck">Not played</span>;
    case 'awaiting':
      return <span className="tag outline">Awaiting result</span>;
    case 'finishing':
      return <span className="tag quiet">Finishing</span>;
    default:
      return <span className="tag quiet">{STATUS_LABEL[v.status]}</span>;
  }
}

/** Small uppercase status for compact rows: LIVE, FINAL, CAP, … */
export function StatusText({ v }: { v: GameView }) {
  const c = useT();
  if (v.simulated) return <span className="tag sim sm">SIM</span>;
  if (v.result?.hypothetical) return <span className="tag if sm">IF</span>;
  const capAt = v.g.capMins ? v.g.end - v.g.capMins * 60000 : undefined;
  switch (v.status) {
    case 'live':
      return capAt && c.view.clock >= capAt ? <span className="tag cap sm">CAP</span> : <span className="tag live sm">LIVE</span>;
    case 'final':
      return <span className="tag final sm">FINAL</span>;
    case 'finishing':
      return <span className="status-text quiet">Finishing</span>;
    case 'awaiting':
      return <span className="status-text quiet">No score</span>;
    case 'ifRequired':
      return <span className="tag dashed sm">If required</span>;
    case 'notPlayed':
      return <span className="tag struck sm">Not played</span>;
    default:
      return null;
  }
}

/** Stage text: "Pool B", "8v9", "Placement". */
export function stageText(v: GameView): string {
  const g = v.g;
  if (g.pool) return /^[\p{L}\d]{1,3}$/u.test(g.pool) ? `Pool ${g.pool}` : g.pool;
  if (g.code) return g.code.replace(/[[\]]/g, '');
  if (g.slots[0] && g.slots[1]) return `${g.slots[0]}v${g.slots[1]}`;
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

export function isMine(c: ReturnType<typeof useT>, v: GameView) {
  return c.isFollowed(v.sides[0].team, v.g.division) || c.isFollowed(v.sides[1].team, v.g.division);
}

function rowClass(c: ReturnType<typeof useT>, v: GameView, base: string) {
  return [
    base,
    isMine(c, v) ? 'mine-row' : '',
    v.hypothetical ? 'hyp' : '',
    v.simulated ? 'simrow' : '',
    v.status === 'notPlayed' ? 'np' : '',
    v.status === 'ifRequired' ? 'ifreq' : '',
    c.rt.changed.has(v.g.id) && Date.now() - c.rt.changed.get(v.g.id)! < 60000 ? 'flash' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

const pressable = (onOpen?: () => void) =>
  onOpen
    ? {
        role: 'button',
        tabIndex: 0,
        onClick: onOpen,
        onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen()),
      }
    : {};

/** Compact game row with status: pitch, both sides with scores, stage, status (timelines, lists). */
export function GameRow({ v, showTime, showDay, onOpen, extra }: { v: GameView; showTime?: boolean; showDay?: boolean; onOpen?: () => void; extra?: ReactNode }) {
  const c = useT();
  const w = winnerSide(v);
  if (v.g.isBye) return <ByeRow v={v} showTime={showTime} />;
  return (
    <div className={rowClass(c, v, 'grow')} {...pressable(onOpen)}>
      {showTime && (
        <span className="gtime">
          {showDay && <span className="gday">{v.g.day.slice(0, 3)}</span>}
          <span className="d">{timeOf(v.g.start, c.t.timeZone)}</span>
        </span>
      )}
      <PitchBadge label={v.g.pitch.label} />
      <div className="gteams">
        {([0, 1] as const).map((i) => (
          <div key={i} className={`gside${w === i ? ' won' : w !== undefined ? ' lost' : ''}`}>
            <Side side={v.sides[i]} division={v.g.division} bold={w === i} inline />
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

export function ByeRow({ v, showTime }: { v: GameView; showTime?: boolean }) {
  const c = useT();
  const team = v.sides[0].team ?? v.sides[1].team;
  return (
    <div className="grow bye">
      {showTime && <span className="gtime d">{timeOf(v.g.start, c.t.timeZone)}</span>}
      <span className="pb muted-pb">–</span>
      <span className="gteams bye-text">
        {team ? <TeamName name={team} division={v.g.division} /> : null}
        <span className="muted">· bye</span>
      </span>
      <span className="gstage">{stageText(v)}</span>
    </div>
  );
}

/** "Up next" row: pitch badge, both teams on two lines, stage on the right. */
export function NextRow({ v, onOpen }: { v: GameView; onOpen?: () => void }) {
  const c = useT();
  if (v.g.isBye) return <ByeRow v={v} />;
  return (
    <div className={rowClass(c, v, 'nrow')} {...pressable(onOpen)}>
      <PitchBadge label={v.g.pitch.label} />
      <div className="nteams">
        {([0, 1] as const).map((i) => (
          <Side key={i} side={v.sides[i]} division={v.g.division} size={8} inline plain />
        ))}
      </div>
      <span className="nstage">
        {stageText(v)}
        {v.result?.hypothetical && <span className="tag if sm">IF</span>}
      </span>
    </div>
  );
}

/** "Just finished" row: pitch as plain text, teams with scores, winner bold and loser greyed. */
export function DoneRow({ v, onOpen }: { v: GameView; onOpen?: () => void }) {
  const c = useT();
  const w = winnerSide(v);
  const draw = v.result?.outcome === 'D';
  if (v.g.isBye) return <ByeRow v={v} />;
  return (
    <div className={rowClass(c, v, 'drow')} {...pressable(onOpen)}>
      <span className="pitch-text">{v.g.pitch.label ? `P${v.g.pitch.label}` : '–'}</span>
      <div className="dteams">
        {([0, 1] as const).map((i) => (
          <span key={i} className={`dside${w === i ? ' won' : w !== undefined ? ' lost' : draw ? ' drew' : ''}`}>
            <Side side={v.sides[i]} division={v.g.division} size={8} inline plain bold={w === i} />
            <b className="d">{scoreText(v, i)}</b>
          </span>
        ))}
      </div>
      <span className="dstage">
        {stageText(v)}
        {draw ? ' · Draw' : ''}
        {v.status === 'awaiting' && <span className="status-text quiet"> · no score</span>}
        {v.result?.hypothetical && <span className="tag if sm">IF</span>}
      </span>
    </div>
  );
}

/** Single-line row for grouped and dense lists: "P1 Leeds 1 v Durham 1   LIVE  9–7". */
export function LineRow({ v, onOpen, meta, right }: { v: GameView; onOpen?: () => void; meta?: ReactNode; right?: ReactNode }) {
  const c = useT();
  const w = winnerSide(v);
  if (v.g.isBye) return <ByeRow v={v} />;
  const name = (i: 0 | 1) => {
    const s = v.sides[i];
    const followed = s.team && c.isFollowed(s.team, v.g.division);
    return (
      <span className={`ln-name${w === i || followed ? ' strong' : ''}${!s.team ? ' slot-label' : ''}`}>
        {s.team ? withoutTag(s.team) : s.label ?? 'TBC'}
      </span>
    );
  };
  const hasScore = v.result && (v.result.sa !== undefined || v.result.outcome);
  return (
    <div className={rowClass(c, v, 'lrow')} {...pressable(onOpen)}>
      <PitchBadge label={v.g.pitch.label} />
      <span className="ln-main">
        <span className="ln-teams">
          {name(0)}
          <span className="ln-v"> v </span>
          {name(1)}
        </span>
        {meta && <span className="ln-meta">{meta}</span>}
      </span>
      {right}
      <StatusText v={v} />
      {hasScore && (
        <b className="ln-score d">
          {scoreText(v, 0)}–{scoreText(v, 1)}
        </b>
      )}
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

export function Seg<T extends string>({ value, options, onChange, label, className }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div className={`seg${className ? ` ${className}` : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, sub, right, children, id, className }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; id?: string; className?: string }) {
  return (
    <section className={`section${className ? ` ${className}` : ''}`} id={id}>
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
