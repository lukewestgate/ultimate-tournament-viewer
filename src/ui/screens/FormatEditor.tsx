import { useState } from 'react';
import { useT } from '../ctx';
import { useOverlay } from '../overlay';
import { Section, Seg } from '../parts';
import { divKey, type Format, type Source, type SourceEntry } from '../../model/types';
import { futureSlotKeys, gameKey, inferFormat, poolSlotKey } from '../../format/infer';
import { validateFormat } from '../../format/validate';
import { buildBoards } from '../../engine/bracket';
import { pathsAhead } from '../../engine/view';
import { editFormat } from '../mappingEdit';
import { timeOf, ordinal } from '../fmt';
import { withoutTag } from '../../extract/names';
import type { ScreenProps } from './index';

const ORIGIN: Record<SourceEntry['origin'], string> = { template: 'from template', table: 'from a table', label: 'from label', convention: 'from code', ai: 'from AI', user: 'set by you' };

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

/** Format editor (spec §6.7): future games with each side's source, pool slots, places, preview. */
export function FormatEditor(_: ScreenProps) {
  const c = useT();
  const overlay = useOverlay();
  const divs = c.t.divisions.length ? c.t.divisions.map((d) => d.name) : [undefined];
  const [div, setDiv] = useState<string | undefined>(c.division ?? divs[0]);
  const f = c.view.format.divisions[divKey(div)] ?? { sources: {} };
  const gameName = (id: string) => {
    const g = c.t.games.find((x) => x.id === id);
    return g ? (g.code?.replace(/[[\]]/g, '') ?? `${g.day.slice(0, 3)} ${g.time} P${g.pitch.label}`) : id;
  };
  const errors = validateFormat(c.t, c.view.format);
  const keys = futureSlotKeys(c.t, div);
  const known = keys.filter((k) => f.sources[k] && f.sources[k].source.kind !== 'unknown').length;
  const setSource = (key: string, source: Source | undefined) =>
    editFormat(c, (fm: Format) => {
      fm.divisions[divKey(div)] ??= { sources: {} };
      if (source) fm.divisions[divKey(div)].sources[key] = { source, origin: 'user', status: 'unverified' };
      else delete fm.divisions[divKey(div)].sources[key];
      return fm;
    });
  const pick = (key: string, title: string) => overlay.openSheet(<SourcePicker division={div} current={f.sources[key]?.source} onPick={(s) => (setSource(key, s), overlay.closeSheet())} />, { title });
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
  const row = (key: string, label: string) => {
    const e = f.sources[key];
    const check = c.view.checks.get(key);
    return (
      <button key={key} className="fmt-side" onClick={() => pick(key, label)}>
        <span className="fmt-label">{label}</span>
        <b>{describeSource(e?.source, gameName)}</b>
        <span className="tag quiet">{e ? ORIGIN[e.origin] : 'unknown'}</span>
        {check === 'confirmed' && <span className="tag win">✓ Matches sheet</span>}
        {check === 'doubtful' && <span className="tag warn">⚠ Sheet disagrees</span>}
        {e && !check && e.source.kind !== 'unknown' && <span className="tag outline">Not checked yet</span>}
      </button>
    );
  };
  return (
    <div className="settings">
      <h1 style={{ fontSize: 24 }}>Format</h1>
      {divs.length > 1 && <Seg label="Division" value={div ?? ''} options={divs.map((d) => ({ value: d ?? '', label: d ?? 'All' }))} onChange={(v) => setDiv(v || undefined)} />}
      <div className="card pad stack">
        <span>
          {known} of {keys.length} future slots have a known source · <b>{c.view.levels[divKey(div)]}</b>
        </span>
        <label className="fieldset">
          Start from a template
          <select className="field" value="" onChange={(e) => e.target.value && applyTemplate(e.target.value)}>
            <option value="">Choose…</option>
            {TEMPLATES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {errors.length > 0 && (
          <div className="warnbox">
            <div>
              <b>Check these</b>
              <ul>
                {errors.slice(0, 8).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
      {powerPools.length > 0 && (
        <Section title="Pool slots">
          <div className="card list">
            {powerPools.flatMap((p) => p.slots.map((s) => row(poolSlotKey(p.name, s.slot), `Pool ${p.name} · ${s.slot}`)))}
          </div>
        </Section>
      )}
      <Section title="Future games">
        {games.length === 0 && <span className="muted">No placement games in this division.</span>}
        {[...new Set(games.map((g) => g.start))].map((start) => (
          <div key={start} className="stack" style={{ gap: 6 }}>
            <span className="lbl">
              {games.find((g) => g.start === start)!.day} {timeOf(start, c.t.timeZone)}
            </span>
            <div className="card list">
              {games
                .filter((g) => g.start === start)
                .flatMap((g) => [row(gameKey(g.id, 0), `${gameName(g.id)} · side 1`), row(gameKey(g.id, 1), `${gameName(g.id)} · side 2`)])}
            </div>
          </div>
        ))}
      </Section>
      {Object.keys(f.places ?? {}).length > 0 && (
        <Section title="Final places">
          <div className="card pad small stack">
            {Object.entries(f.places ?? {}).map(([n, e]) => (
              <span key={n}>
                Place {n}: {describeSource(e.source, gameName)}
              </span>
            ))}
          </div>
        </Section>
      )}
      <Section title="Preview">
        <div className="card pad stack">
          <span className="small">
            {boards.length ? `Brackets: ${boards.map((b) => `${b.title} (${b.rounds.length} rounds)`).join(', ')}` : 'No bracket can be drawn from this format.'}
          </span>
          <label className="fieldset">
            Check a team’s paths
            <select className="field" value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">Choose a team…</option>
              {c.t.teams.filter((t) => t.division === div).map((t) => (
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
        </div>
      </Section>
    </div>
  );
}

function SourcePicker({ division, current, onPick }: { division?: string; current?: Source; onPick: (s: Source | undefined) => void }) {
  const c = useT();
  const [kind, setKind] = useState<Source['kind']>(current?.kind ?? 'gameResult');
  const [game, setGame] = useState(current?.kind === 'gameResult' ? current.game : '');
  const [take, setTake] = useState<'winner' | 'loser'>(current?.kind === 'gameResult' ? current.take : 'winner');
  const [pool, setPool] = useState(current?.kind === 'poolFinish' ? current.pool : c.t.pools.find((p) => p.division === division)?.name ?? '');
  const [place, setPlace] = useState(current?.kind === 'poolFinish' || current?.kind === 'rankedFinish' ? current.place : 1);
  const [rank, setRank] = useState(current?.kind === 'rankedFinish' ? current.rank : 1);
  const [seed, setSeed] = useState(current?.kind === 'seed' ? current.seed : 1);
  const [team, setTeam] = useState(current?.kind === 'team' ? current.team : '');
  const [label, setLabel] = useState(current?.kind === 'unknown' ? current.label : 'Decided on the day');
  const games = c.t.games.filter((g) => g.division === division && g.stage !== 'pool' && !g.isBye);
  const pools = c.t.pools.filter((p) => p.division === division);
  const build = (): Source | undefined => {
    switch (kind) {
      case 'gameResult':
        return game ? { kind, game, take } : undefined;
      case 'poolFinish':
        return pool ? { kind, pool, place } : undefined;
      case 'rankedFinish':
        return { kind, pools: pools.filter((p) => p.stage === 'pool').map((p) => p.name), place, rank };
      case 'seed':
        return { kind, seed };
      case 'team':
        return team ? { kind, team } : undefined;
      default:
        return { kind: 'unknown', label };
    }
  };
  return (
    <div className="stack">
      <select className="field" value={kind} onChange={(e) => setKind(e.target.value as Source['kind'])} aria-label="Source type">
        <option value="gameResult">Winner / loser of a game</option>
        <option value="poolFinish">Place in a pool</option>
        <option value="rankedFinish">Nth best place across pools</option>
        <option value="seed">Seed</option>
        <option value="team">A fixed team</option>
        <option value="unknown">Decided on the day</option>
      </select>
      {kind === 'gameResult' && (
        <>
          <Seg label="Take" value={take} options={[{ value: 'winner', label: 'Winner' }, { value: 'loser', label: 'Loser' }]} onChange={setTake} />
          <select className="field" value={game} onChange={(e) => setGame(e.target.value)} aria-label="Game">
            <option value="">Choose a game…</option>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.day.slice(0, 3)} {g.time} P{g.pitch.label} {g.code ?? ''}
              </option>
            ))}
          </select>
        </>
      )}
      {(kind === 'poolFinish' || kind === 'rankedFinish') && (
        <label className="mini">
          Place
          <input type="number" className="field" min={1} value={place} onChange={(e) => setPlace(Number(e.target.value))} />
        </label>
      )}
      {kind === 'poolFinish' && (
        <select className="field" value={pool} onChange={(e) => setPool(e.target.value)} aria-label="Pool">
          {pools.map((p) => (
            <option key={p.name}>{p.name}</option>
          ))}
        </select>
      )}
      {kind === 'rankedFinish' && (
        <label className="mini">
          Rank among them
          <input type="number" className="field" min={1} value={rank} onChange={(e) => setRank(Number(e.target.value))} />
        </label>
      )}
      {kind === 'seed' && (
        <label className="mini">
          Seed
          <input type="number" className="field" min={1} value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
        </label>
      )}
      {kind === 'team' && (
        <select className="field" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
          <option value="">Choose a team…</option>
          {c.t.teams.filter((t) => t.division === division).map((t) => (
            <option key={t.name}>{t.name}</option>
          ))}
        </select>
      )}
      {kind === 'unknown' && <input className="field" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Label" />}
      <div className="row-btns">
        <button className="btn primary" disabled={!build()} onClick={() => onPick(build())}>
          Use
        </button>
        <button className="btn" onClick={() => onPick(undefined)}>
          Back to automatic
        </button>
      </div>
    </div>
  );
}
