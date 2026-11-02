import { useState, type ReactNode } from 'react';
import { useT } from '../ctx';
import { useOverlay } from '../overlay';
import { Seg } from '../parts';
import { SubPage } from '../Shell';
import { divKey, type Format, type Game, type Source, type SourceEntry } from '../../model/types';
import { futureSlotKeys, gameKey, inferFormat, poolSlotKey } from '../../format/infer';
import { validateFormat } from '../../format/validate';
import { buildBoards } from '../../engine/bracket';
import { pathsAhead } from '../../engine/view';
import { editFormat } from '../mappingEdit';
import { timeOf, ordinal } from '../fmt';
import { withoutTag } from '../../extract/names';
import { IChevronRight } from '../icons';
import type { ScreenProps } from './index';

const ORIGIN: Record<SourceEntry['origin'], string> = { template: 'from template', table: 'from table', label: 'from label', convention: 'from code', ai: 'from AI', user: 'set by you' };

export function describeSource(s: Source | undefined, gameName: (id: string) => string): string {
  if (!s) return 'Unknown';
  switch (s.kind) {
    case 'team':
      return withoutTag(s.team);
    case 'seed':
      return `Seed ${s.seed}`;
    case 'poolFinish':
      return `${ordinal(s.place)} in Pool ${s.pool}`;
    case 'rankedFinish':
      return `${ordinal(s.rank)} best ${ordinal(s.place)}-placed team`;
    case 'gameResult':
      return `${s.take === 'winner' ? 'Winner' : 'Loser'} of ${gameName(s.game)}`;
    default:
      return s.label || 'Decided on the day';
  }
}

const TEMPLATES = [
  { value: 'codes', label: 'From the game codes (pools → brackets, power pools, crossovers)' },
  { value: 'roundRobin', label: 'Round robin only' },
  { value: 'drawn', label: 'Rounds drawn on the day' },
];

/** Format editor (spec §6.7; SpecFormat): future games with each side's source, pool slots, places, preview. */
export function FormatEditor(_: ScreenProps) {
  const c = useT();
  const overlay = useOverlay();
  const divs = c.t.divisions.length ? c.t.divisions.map((d) => d.name) : [undefined];
  const [div, setDiv] = useState<string | undefined>(c.division ?? divs[0]);
  const [preview, setPreview] = useState(false);
  const f = c.view.format.divisions[divKey(div)] ?? { sources: {} };
  const gameName = (id: string) => {
    const g = c.t.games.find((x) => x.id === id);
    return g ? (g.code?.replace(/[[\]]/g, '') ?? `${g.day.slice(0, 3)} ${g.time} P${g.pitch.label}`) : id;
  };
  const errors = validateFormat(c.t, c.view.format);
  const keys = futureSlotKeys(c.t, div);
  const known = keys.filter((k) => f.sources[k] && f.sources[k].source.kind !== 'unknown').length;
  const level = c.view.levels[divKey(div)];
  const setSource = (key: string, source: Source | undefined) =>
    editFormat(c, (fm: Format) => {
      fm.divisions[divKey(div)] ??= { sources: {} };
      if (source) fm.divisions[divKey(div)].sources[key] = { source, origin: 'user', status: 'unverified' };
      else delete fm.divisions[divKey(div)].sources[key];
      return fm;
    });
  const pick = (key: string, title: string, sub: string) =>
    overlay.openSheet(<SourcePicker division={div} slotKey={key} title={title} sub={sub} current={f.sources[key]?.source} onPick={(s) => (setSource(key, s), overlay.closeSheet())} onCancel={overlay.closeSheet} />);
  const applyTemplate = (tpl: string) => {
    editFormat(c, () => {
      const base = inferFormat(c.t, undefined, { template: c.p.mapping.template });
      if (tpl === 'codes') return base;
      const dk = divKey(div);
      base.divisions[dk] ??= { sources: {} };
      if (tpl === 'roundRobin') base.divisions[dk].sources = {};
      if (tpl === 'drawn') for (const k of keys) base.divisions[dk].sources[k] = { source: { kind: 'unknown', label: 'Drawn on the day' }, origin: 'user', status: 'unverified' };
      return base;
    });
    overlay.toast('Template applied.');
  };
  const games = c.t.games.filter((g) => g.division === div && g.stage === 'placement' && !g.isBye);
  const powerPools = c.t.pools.filter((p) => p.division === div && p.stage === 'powerPool');
  const boards = buildBoards(c.t, c.view.format).filter((b) => b.division === div);
  const [team, setTeam] = useState('');
  const path = team ? pathsAhead(c.view, team, div, 3) : undefined;
  const places = Object.entries(f.places ?? {});
  const placeNums = places.map(([n]) => Number(n));
  const quals = f.qualification ?? [];
  const side = (key: string, title: string, sub: string, sheetText?: string) => {
    const e = f.sources[key];
    const check = c.view.checks.get(key);
    const unknown = !e || e.source.kind === 'unknown';
    return (
      <button key={key} className={`fmt-side${unknown ? ' unknown' : ''}`} onClick={() => pick(key, title, sub)}>
        <span className="fmt-side-text">
          <span className="fmt-source">{unknown ? `Not known${sheetText ? ` · sheet says “${sheetText}”` : ''}` : describeSource(e.source, gameName)}</span>
          <span className="fmt-tags">
            <Origin>{e ? ORIGIN[e.origin] : 'none'}</Origin>
            {unknown ? <span className="tag quiet sm">Unknown</span> : check === 'confirmed' ? <span className="tag win sm">✓ Matches sheet</span> : check === 'doubtful' ? <span className="tag warn sm">⚠ Sheet disagrees</span> : <span className="tag quiet sm">Not checked yet</span>}
          </span>
        </span>
        <IChevronRight size={16} />
      </button>
    );
  };
  const sub = (g: Game) => `${g.day.slice(0, 3)} ${timeOf(g.start, c.t.timeZone)}${g.pitch.label ? ` · Pitch ${g.pitch.label}` : ''}`;
  return (
    <SubPage title="How teams progress" sub={[c.t.title, div].filter(Boolean).join(' · ')}>
      {divs.length > 1 && <Seg label="Division" value={div ?? ''} options={divs.map((d) => ({ value: d ?? '', label: d ?? 'All' }))} onChange={(v) => setDiv(v || undefined)} className="scroll-seg" />}
      <section className="card fmt-level">
        <span className={`tag sm ${level === 'full' ? 'win' : level === 'partial' ? 'soon' : 'quiet'}`}>{level === 'full' ? 'Full' : level === 'partial' ? 'Partial' : 'Basic'}</span>
        <span>
          {known} of {keys.length} future slots known
        </span>
        <span className="fmt-bar" aria-hidden="true">
          <b style={{ width: `${keys.length ? (known / keys.length) * 100 : 0}%` }} />
        </span>
      </section>
      <label className="card set-row fmt-template">
        <b>Start from a template</b>
        <span className="muted small">optional</span>
        <select value="" onChange={(e) => e.target.value && applyTemplate(e.target.value)} aria-label="Start from a template">
          <option value="">Choose…</option>
          {TEMPLATES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {errors.length > 0 && (
        <section className="warn-card">
          <b>Check these</b>
          {errors.slice(0, 6).map((e) => (
            <span key={e}>{e}</span>
          ))}
        </section>
      )}
      {powerPools.length > 0 && (
        <>
          <span className="lbl-head">Pool slots</span>
          {powerPools.map((p) => (
            <section key={p.name} className="card fmt-game">
              <div className="fmt-game-head">
                <b>Pool {p.name}</b>
                <span className="muted">power pool</span>
              </div>
              {p.slots.map((s) => side(poolSlotKey(p.name, s.slot), `Pool ${p.name} · ${s.slot}`, 'Pool slot', s.team))}
            </section>
          ))}
        </>
      )}
      {games.length === 0 && <div className="empty">No placement games in this division.</div>}
      {[...new Set(games.map((g) => g.start))].map((start) => {
        const at = games.filter((g) => g.start === start);
        return (
          <div key={start} className="fmt-round">
            <span className="lbl-head">
              {at[0].day} · {timeOf(start, c.t.timeZone)}
            </span>
            {at.map((g) => {
              const name = gameName(g.id);
              return (
                <section key={g.id} className="card fmt-game">
                  <div className="fmt-game-head">
                    <b className="d">{timeOf(g.start, c.t.timeZone)}</b>
                    {g.pitch.label && <span className="muted">P{g.pitch.label}</span>}
                    <span style={{ flex: 1 }} />
                    <b className="d">{g.code?.replace(/[[\]]/g, '')}</b>
                  </div>
                  {side(gameKey(g.id, 0), `${name} · first team`, sub(g), g.labels?.[0] ?? g.teams[0])}
                  {side(gameKey(g.id, 1), `${name} · second team`, sub(g), g.labels?.[1] ?? g.teams[1])}
                </section>
              );
            })}
          </div>
        );
      })}
      <section className="card set-pad">
        <b>Final places & qualification</b>
        <span className="small muted">
          {placeNums.length ? `${ordinal(1)}–${ordinal(placeNums.length)} from the bracket` : 'No final places'} · {quals.length ? quals.map((q) => `${q.label}: ${ordinal(q.from)}–${ordinal(q.to)}`).join(', ') : 'no qualification places'}
        </span>
        {places.length > 0 && (
          <details className="small">
            <summary>Show places</summary>
            <ol className="fmt-places">
              {places.map(([n, e]) => (
                <li key={n}>
                  <b className="d">{ordinal(Number(n) - Math.min(...placeNums) + 1)}</b> {describeSource(e.source, gameName)}
                </li>
              ))}
            </ol>
          </details>
        )}
      </section>
      <button className="btn block big-outline" onClick={() => setPreview(!preview)} aria-expanded={preview}>
        {preview ? 'Hide preview' : 'Preview bracket and paths'}
      </button>
      {preview && (
        <section className="card set-pad">
          <span className="small">{boards.length ? `Brackets: ${boards.map((b) => `${b.title} (${b.rounds.length} rounds)`).join(', ')}` : 'No bracket can be drawn from this format.'}</span>
          <label className="fieldset">
            Check a team’s paths
            <select className="field" value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">Choose a team…</option>
              {c.t.teams
                .filter((t) => t.division === div)
                .map((t) => (
                  <option key={t.name}>{t.name}</option>
                ))}
            </select>
          </label>
          {team && !path && <span className="small muted">No placement game ahead for this team.</span>}
          {path && (
            <span className="small">
              Next: {gameName(path.game.g.id)} vs {path.opponents.map(withoutTag).join(' / ') || 'TBC'}
              {path.win && ` · win → ${'place' in path.win ? `${ordinal(path.win.place)}` : gameName(path.win.game.g.id)}`}
              {path.lose && ` · lose → ${'place' in path.lose ? `${ordinal(path.lose.place)}` : gameName(path.lose.game.g.id)}`}
            </span>
          )}
        </section>
      )}
    </SubPage>
  );
}

function Origin({ children }: { children: ReactNode }) {
  return <span className="tag outline sm">{children}</span>;
}

type Kind = 'winner' | 'loser' | 'poolFinish' | 'rankedFinish' | 'seed' | 'team' | 'unknown';

/** "Choosing where a team comes from" (SpecFormat #2). */
function SourcePicker({ division, slotKey, title, sub, current, onPick, onCancel }: { division?: string; slotKey: string; title: string; sub: string; current?: Source; onPick: (s: Source | undefined) => void; onCancel: () => void }) {
  const c = useT();
  const initKind: Kind = current?.kind === 'gameResult' ? current.take : ((current?.kind as Kind) ?? 'winner');
  const [kind, setKind] = useState<Kind>(initKind);
  const [game, setGame] = useState(current?.kind === 'gameResult' ? current.game : '');
  const [pool, setPool] = useState(current?.kind === 'poolFinish' ? current.pool : (c.t.pools.find((p) => p.division === division)?.name ?? ''));
  const [place, setPlace] = useState(current?.kind === 'poolFinish' || current?.kind === 'rankedFinish' ? current.place : 1);
  const [rank, setRank] = useState(current?.kind === 'rankedFinish' ? current.rank : 1);
  const [seed, setSeed] = useState(current?.kind === 'seed' ? current.seed : 1);
  const [team, setTeam] = useState(current?.kind === 'team' ? current.team : '');
  const games = c.t.games.filter((g) => g.division === division && g.stage !== 'pool' && !g.isBye);
  const pools = c.t.pools.filter((p) => p.division === division);
  const teams = c.t.teams.filter((t) => t.division === division);
  const maxPlace = Math.max(4, ...pools.map((p) => p.slots.length));
  const build = (): Source | undefined => {
    switch (kind) {
      case 'winner':
      case 'loser':
        return game ? { kind: 'gameResult', game, take: kind } : undefined;
      case 'poolFinish':
        return pool ? { kind, pool, place } : undefined;
      case 'rankedFinish':
        return { kind, pools: pools.filter((p) => p.stage === 'pool').map((p) => p.name), place, rank };
      case 'seed':
        return { kind, seed };
      case 'team':
        return team ? { kind, team } : undefined;
      default:
        return { kind: 'unknown', label: 'Decided on the day' };
    }
  };
  const built = build();
  const f = c.view.format.divisions[divKey(division)];
  const clash =
    built && (built.kind === 'gameResult' || built.kind === 'poolFinish') && JSON.stringify(built) !== JSON.stringify(current) && f
      ? Object.entries(f.sources).find(([k, e]) => k !== slotKey && JSON.stringify(e.source) === JSON.stringify(built))?.[0]
      : undefined;
  const clashName = clash ? (() => {
    const [kindKey, id] = clash.split(':');
    const g = kindKey === 'game' ? c.t.games.find((x) => x.id === id) : undefined;
    return g ? (g.code?.replace(/[[\]]/g, '') ?? 'another game') : `Pool ${id}`;
  })() : undefined;
  const nums = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  const gameSelect = (
    <select className="pick-select" value={game} onChange={(e) => setGame(e.target.value)} aria-label="Game" onClick={(e) => e.stopPropagation()}>
      <option value="">game</option>
      {games.map((g) => (
        <option key={g.id} value={g.id}>
          {g.code?.replace(/[[\]]/g, '') ?? `${g.day.slice(0, 3)} ${g.time} P${g.pitch.label}`}
        </option>
      ))}
    </select>
  );
  const opt = (k: Kind, body: ReactNode) => (
    <label className={`pick-row${kind === k ? ' on' : ''}`}>
      <input type="radio" name="src" checked={kind === k} onChange={() => setKind(k)} />
      {body}
    </label>
  );
  return (
    <div className="picker">
      <div className="picker-head">
        <h2>{title}</h2>
        <span className="muted small">{sub}</span>
      </div>
      <div className="pick-list">
        {opt('winner', <><span className="pick-text">Winner of</span>{kind === 'winner' && gameSelect}</>)}
        {opt('loser', <><span className="pick-text">Loser of</span>{kind === 'loser' && gameSelect}</>)}
        {opt(
          'poolFinish',
          <span className="pick-text inline">
            <select className="pick-select" value={place} onChange={(e) => (setPlace(Number(e.target.value)), setKind('poolFinish'))} aria-label="Place">
              {nums(maxPlace).map((n) => (
                <option key={n} value={n}>
                  {ordinal(n)}
                </option>
              ))}
            </select>
            in
            <select className="pick-select" value={pool} onChange={(e) => (setPool(e.target.value), setKind('poolFinish'))} aria-label="Pool">
              {pools.map((p) => (
                <option key={p.name} value={p.name}>
                  Pool {p.name}
                </option>
              ))}
            </select>
          </span>,
        )}
        {opt(
          'rankedFinish',
          <span className="pick-text inline">
            <select className="pick-select" value={rank} onChange={(e) => (setRank(Number(e.target.value)), setKind('rankedFinish'))} aria-label="Rank">
              {nums(4).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? 'Best' : `${ordinal(n)} best`}
                </option>
              ))}
            </select>
            <select className="pick-select" value={place} onChange={(e) => (setPlace(Number(e.target.value)), setKind('rankedFinish'))} aria-label="Place">
              {nums(maxPlace).map((n) => (
                <option key={n} value={n}>
                  {ordinal(n)}
                </option>
              ))}
            </select>
            across pools
          </span>,
        )}
        {opt(
          'seed',
          <>
            <span className="pick-text">Seed</span>
            <select className="pick-select" value={seed} onChange={(e) => (setSeed(Number(e.target.value)), setKind('seed'))} aria-label="Seed">
              {nums(Math.max(teams.length, 1)).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </>,
        )}
        {opt(
          'team',
          <>
            <span className="pick-text">A fixed team</span>
            <select className="pick-select" value={team} onChange={(e) => (setTeam(e.target.value), setKind('team'))} aria-label="Team">
              <option value="">team</option>
              {teams.map((t) => (
                <option key={t.name} value={t.name}>
                  {withoutTag(t.name)}
                </option>
              ))}
            </select>
          </>,
        )}
        {opt('unknown', <span className="pick-text">Decided on the day</span>)}
      </div>
      {clashName && <div className="warn-card small">This is already used by {clashName}. Each place can only feed one game.</div>}
      <div className="two-btns">
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary" disabled={!built} onClick={() => onPick(built)}>
          Use this
        </button>
      </div>
      {current && (
        <button className="link center-link" onClick={() => onPick(undefined)}>
          Back to automatic
        </button>
      )}
    </div>
  );
}
