import { useState, type ReactNode } from 'react';
import { useT } from '../ctx';
import { Seg } from '../parts';
import { SubPage } from '../Shell';
import { navigate, href, tHref } from '../router';
import { useOverlay } from '../overlay';
import { store } from '../../store/app';
import { editFormat, editMapping, shareLink, copyOrShare } from '../mappingEdit';
import { mergeSuggestions } from '../../extract/quality';
import { pointsDiffPreset, ukuPreset, TIEBREAK_LABEL, ALL_TIEBREAKS, UNCOMPUTABLE } from '../../engine/rulesPresets';
import { divKey, type EngineLevel, type Rules } from '../../model/types';
import { improveMapping, aiRules, aiFormat, type AiProposal } from '../../mapping/ai';
import { teamKey } from '../../store/settings';
import { IChevronRight, IChevronDown } from '../icons';
import { dateLabel } from '../fmt';
import type { ScreenProps } from './index';

const MODE_TEXT = { auto: 'Read automatically', ai: 'Fixed by AI', manual: 'Fixed by you' };
const LEVEL_TAG: Record<EngineLevel, string> = { full: 'Full', partial: 'Partial', basic: 'Basic' };
const LEVEL_CLASS: Record<EngineLevel, string> = { full: 'win', partial: 'soon', basic: 'quiet' };
const SOURCE_TEXT = { preset: 'preset', sheet: 'read from the sheet', ai: 'read by AI', user: 'set by you' };

/** Tournament settings: "How this sheet is read" (spec §9.13; SpecSettings #1). */
export function Settings({ arg }: ScreenProps) {
  const c = useT();
  if (arg === 'rules') return <RulesPage />;
  return <SettingsPage key={c.id} />;
}

function SettingsPage() {
  const c = useT();
  const overlay = useOverlay();
  const t = c.t;
  const m = c.p.mapping;
  const problems = c.p.problems.filter((p) => p.severity === 'problem');
  const merges = mergeSuggestions(t, m.corrections.rejectedMerges);
  const corr = (fn: (x: typeof m.corrections) => typeof m.corrections) => editMapping(c, (x) => ({ ...x, corrections: fn(x.corrections) }));
  const sources = m.games.map((g) => g.tab);
  const kinds = [...new Set(m.games.map((g) => (g.kind === 'list' ? 'a list' : 'a grid')))];
  const r = t.rules;
  const presetName = r.preset === 'uku' ? 'UKU' : r.preset === 'pointsDiff' ? 'Points and difference' : 'Custom';
  const divs = t.divisions.length ? t.divisions.map((d) => d.name) : [undefined];
  const aliases = Object.entries(m.corrections.aliases);
  return (
    <SubPage title="How this sheet is read" sub={t.title}>
      <section className="card set-summary">
        <div className="set-tags">
          <span className={`tag sm ${m.mode === 'auto' ? 'quiet' : m.mode === 'ai' ? 'if-soft' : 'soon'}`}>{MODE_TEXT[m.mode]}</span>
          {Object.entries(c.view.levels).map(([d, l]) => (
            <span key={d} className={`tag sm ${LEVEL_CLASS[l]}`}>
              {d ? `${d} · ` : ''}
              {LEVEL_TAG[l]}
            </span>
          ))}
        </div>
        <p>
          <b className="d big-num">{t.games.length}</b> <b>games</b> from {kinds.join(' and ') || 'nowhere yet'}
          {sources.length ? ' on ' : ''}
          {sources.map((s, i) => (
            <span key={s}>
              {i ? ', ' : ''}
              <i>{s}</i>
            </span>
          ))}{' '}
          · {t.teams.length} teams · {t.pools.length} pool tables · {t.days.length} {t.days.length === 1 ? 'day' : 'days'}
        </p>
      </section>

      {problems.length > 0 && (
        <section className="warn-card">
          <b>
            {problems.length} possible problem{problems.length === 1 ? '' : 's'}
          </b>
          {problems.map((p) => (
            <span key={p.text}>{p.text}</span>
          ))}
        </section>
      )}

      <span className="lbl-head">Quick corrections</span>
      <section className="card set-list">
        {t.days.map((d) => (
          <div key={d.name} className="set-row">
            <span>{d.name}</span>
            <label className={`date-pill${d.dateSource === 'guessed' ? ' guessed' : ''}`}>
              {d.dateSource === 'guessed' ? 'Guessed · ' : ''}
              {dateLabel(d.date).replace(/^\w+ /, '') || d.date}
              <input type="date" value={d.date} aria-label={`${d.name} date`} onChange={(e) => e.target.value && corr((x) => ({ ...x, dates: { ...x.dates, [d.name]: e.target.value } }))} />
            </label>
          </div>
        ))}
        {t.days.map((d) => {
          const tm = t.timing.find((x) => x.day === d.name);
          if (!tm) return null;
          return (
            <div key={`len-${d.name}`} className="set-row">
              <span>Game length{t.days.length > 1 ? ` · ${d.name.slice(0, 3)}` : ''}</span>
              <Stepper value={`${tm.gameMins} min`} onMinus={() => corr((x) => ({ ...x, gameLength: { ...x.gameLength, [d.name]: Math.max(5, tm.gameMins - 1) } }))} onPlus={() => corr((x) => ({ ...x, gameLength: { ...x.gameLength, [d.name]: tm.gameMins + 1 } }))} />
            </div>
          );
        })}
        {t.days.map((d) => {
          const tm = t.timing.find((x) => x.day === d.name);
          const late = tm?.delayMins ?? 0;
          return (
            <div key={`late-${d.name}`} className="set-row">
              <span className="set-label">
                Running late · {d.name.slice(0, 3)}
                <small>Shifts every later game that day</small>
              </span>
              <Stepper
                value={late ? `+${late} min` : 'On time'}
                amber={late > 0}
                onMinus={() => corr((x) => ({ ...x, delays: { ...x.delays, [d.name]: Math.max(0, (x.delays[d.name] ?? 0) - 5) } }))}
                onPlus={() => corr((x) => ({ ...x, delays: { ...x.delays, [d.name]: (x.delays[d.name] ?? 0) + 5 } }))}
              />
              {late > 0 && (
                <button className="link" onClick={() => corr((x) => ({ ...x, delays: { ...x.delays, [d.name]: 0 } }))}>
                  Reset
                </button>
              )}
            </div>
          );
        })}
        {t.divisions.map((d) => (
          <label key={d.name} className="set-row">
            <span>Division{d.code ? ` “${d.code}”` : ''}</span>
            <input
              className="inline-field"
              defaultValue={d.name}
              onBlur={(e) => e.target.value && e.target.value !== d.name && corr((x) => ({ ...x, divisionNames: { ...x.divisionNames, [d.name]: e.target.value } }))}
            />
          </label>
        ))}
        <label className="set-row">
          <span>Title</span>
          <input className="inline-field" defaultValue={m.corrections.title ?? t.title} onBlur={(e) => e.target.value !== t.title && corr((x) => ({ ...x, title: e.target.value || undefined }))} />
        </label>
      </section>

      <span className="lbl-head">Team names</span>
      <section className="card set-pad">
        {merges.length === 0 && <span className="small muted">No likely duplicates.</span>}
        {merges.slice(0, 3).map((s) => (
          <div key={`${s.merge}|${s.keep}`} className="merge">
            <p>
              <b>Same team?</b> “{s.merge}” may be “{s.keep}”{s.division ? ` (${s.division})` : ''}.
            </p>
            <div className="merge-btns">
              <button className="btn primary" onClick={() => corr((x) => ({ ...x, aliases: { ...x.aliases, [s.merge]: s.keep } }))}>
                Merge into “{s.keep}”
              </button>
              <button className="btn" onClick={() => corr((x) => ({ ...x, rejectedMerges: [...(x.rejectedMerges ?? []), [s.keep, s.merge].sort().join('|')] }))}>
                Not the same
              </button>
            </div>
          </div>
        ))}
        {merges.length > 3 && <span className="small muted">{merges.length - 3} more suggestions after these.</span>}
        {aliases.length > 0 && (
          <span className="small muted">
            {aliases.length} merge{aliases.length === 1 ? '' : 's'} made: {aliases.map(([a, b]) => `${a} → ${b}`).join(' · ')}.{' '}
            <button className="link" onClick={() => corr((x) => ({ ...x, aliases: {} }))}>
              Undo
            </button>
          </span>
        )}
        <ManualMerge />
      </section>

      <span className="lbl-head">Points & tie-breaks</span>
      <section className="card set-list">
        <a className="set-row nav" href={tHref(c.id, 'settings', 'rules')}>
          <span className="set-label">
            <b>{presetName}</b>
            <small>
              {r.points.win} · {r.points.draw} · {r.points.loss} · {SOURCE_TEXT[r.source]}
            </small>
          </span>
          <IChevronRight size={18} />
        </a>
      </section>

      <span className="lbl-head">Where data is in the sheet</span>
      <section className="card set-list">
        <a className="set-row nav" href={tHref(c.id, 'manual')}>
          <span>Edit manually</span>
          <IChevronRight size={18} />
        </a>
        <AiButton />
        <button
          className="set-row nav"
          onClick={() => {
            store.runtime(c.id).setMapping(undefined);
            overlay.toast('Read again automatically.');
          }}
        >
          <span>Start over</span>
          <small className="muted">forgets your fixes</small>
        </button>
        {Object.keys(c.view.levels).map((d) => (
          <label key={d} className="set-row">
            <span>Override level{d ? ` · ${d}` : ''}</span>
            <select
              className="mini-select field"
              value={m.engineLevel?.[d] ?? ''}
              onChange={(e) => editMapping(c, (x) => ({ ...x, engineLevel: { ...(x.engineLevel ?? {}), [d]: (e.target.value || undefined) as EngineLevel } }))}
            >
              <option value="">Automatic</option>
              <option value="full">Full</option>
              <option value="partial">Partial</option>
              <option value="basic">Basic</option>
            </select>
          </label>
        ))}
      </section>

      <span className="lbl-head">How teams progress</span>
      <section className="card set-list">
        {Object.entries(c.view.levels).map(([d, l]) => (
          <div key={d} className="set-row">
            <span>{d || 'Format'}</span>
            <span className={`tag sm ${LEVEL_CLASS[l]}`}>{l === 'full' ? 'Full · all known' : l === 'partial' ? 'Partial · some unknown' : 'Basic · not known'}</span>
          </div>
        ))}
        <a className="set-row nav" href={tHref(c.id, 'format')}>
          <span>Edit format</span>
          <IChevronRight size={18} />
        </a>
        <div className="set-row btns">
          <button
            className="btn"
            onClick={() => {
              editFormat(c, () => undefined);
              overlay.toast('Format worked out again.');
            }}
          >
            Work it out again
          </button>
          <AiFormatButton />
        </div>
        {divs.map((d) => (
          <QualRow key={d ?? ''} division={d} />
        ))}
      </section>

      <button className="btn primary block big" onClick={async () => copyOrShare(await shareLink(c), t.title, overlay.toast)}>
        Share link{m.mode !== 'auto' ? ' with these fixes' : ''}
      </button>
      <button
        className="btn block danger-text"
        onClick={() => {
          const removed = store.remove(c.id);
          navigate(href({ name: 'home' }));
          overlay.toast('Removed from your list.', removed ? { label: 'Undo', run: () => store.restore(removed) } : undefined);
        }}
      >
        Remove from my tournaments
      </button>
    </SubPage>
  );
}

function QualRow({ division }: { division?: string }) {
  const c = useT();
  const [edit, setEdit] = useState(false);
  const q = c.view.format.divisions[divKey(division)]?.qualification ?? [];
  const text = q.map((x) => `${x.label}: ${x.from}-${x.to}`).join(', ');
  return (
    <div className="set-row wrap">
      <button className="set-row-btn" onClick={() => setEdit(!edit)} aria-expanded={edit}>
        <span>Qualification places{division && c.t.divisions.length > 1 ? ` · ${division}` : ''}</span>
        <span className="muted">{text || 'None'}</span>
        <IChevronDown size={16} className={`chev${edit ? ' up' : ''}`} />
      </button>
      {edit && (
        <label className="fieldset">
          <span className="small muted">e.g. “Div 1: 1-4, Div 2: 5-7”</span>
          <input
            className="field"
            defaultValue={text}
            autoFocus
            onBlur={(e) => {
              const parsed = e.target.value
                .split(',')
                .map((p) => /^\s*(.+?)\s*:\s*(\d+)\s*[-–]\s*(\d+)\s*$/.exec(p))
                .filter((x): x is RegExpExecArray => Boolean(x))
                .map((x) => ({ label: x[1], from: Number(x[2]), to: Number(x[3]) }));
              editFormat(c, (f) => {
                f.divisions[divKey(division)] ??= { sources: {} };
                f.divisions[divKey(division)].qualification = parsed;
                return f;
              });
            }}
          />
        </label>
      )}
    </div>
  );
}

function Stepper({ value, onMinus, onPlus, amber }: { value: ReactNode; onMinus: () => void; onPlus: () => void; amber?: boolean }) {
  return (
    <div className={`stepper${amber ? ' amber' : ''}`}>
      <button className="ib" aria-label="Less" onClick={onMinus}>
        −
      </button>
      <output className="d step-val">{value}</output>
      <button className="ib" aria-label="More" onClick={onPlus}>
        +
      </button>
    </div>
  );
}

function ManualMerge() {
  const c = useT();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const names = c.t.teams.map((t) => t.name);
  return (
    <details className="manual-merge">
      <summary className="small">Merge two names by hand</summary>
      <div className="row-btns" style={{ marginTop: 8 }}>
        <select className="field" value={a} onChange={(e) => setA(e.target.value)} aria-label="Name to merge">
          <option value="">Merge…</option>
          {names.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <select className="field" value={b} onChange={(e) => setB(e.target.value)} aria-label="Into">
          <option value="">into…</option>
          {names.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <button className="btn" disabled={!a || !b || a === b} onClick={() => editMapping(c, (x) => ({ ...x, corrections: { ...x.corrections, aliases: { ...x.corrections.aliases, [a]: b } } }))}>
          Merge
        </button>
      </div>
    </details>
  );
}

/** Points & tie-breaks (SpecSettings #2). */
function RulesPage() {
  const c = useT();
  const overlay = useOverlay();
  const r = c.t.rules;
  const set = (next: Rules) => editMapping(c, (x) => ({ ...x, rules: { ...next, source: 'user' } }));
  const move = (i: number, d: -1 | 1) => {
    const tbs = [...r.tiebreaks];
    const j = i + d;
    if (j < 0 || j >= tbs.length) return;
    [tbs[i], tbs[j]] = [tbs[j], tbs[i]];
    set({ ...r, tiebreaks: tbs, preset: 'custom' });
  };
  const unused = ALL_TIEBREAKS.filter((x) => !r.tiebreaks.includes(x));
  const [busy, setBusy] = useState(false);
  return (
    <SubPage title="Points & tie-breaks" sub={c.t.title} back={tHref(c.id, 'settings')}>
      <p className="set-note">
        <span className="tag quiet sm">{{ preset: 'Preset', sheet: 'From the sheet', ai: 'From AI', user: 'Set by you' }[r.source]}</span> Changes below become “Set by you”.
      </p>
      <Seg
        label="Preset"
        value={r.preset ?? 'custom'}
        options={[
          { value: 'uku', label: 'UKU' },
          { value: 'pointsDiff', label: 'Points & diff.' },
          { value: 'custom', label: 'Custom' },
        ]}
        onChange={(v) => (v === 'uku' ? set(ukuPreset()) : v === 'pointsDiff' ? set(pointsDiffPreset()) : set({ ...r, preset: 'custom' }))}
      />
      <span className="lbl-head">Points</span>
      <section className="card set-list">
        {(['win', 'draw', 'loss'] as const).map((k) => (
          <div key={k} className="set-row">
            <span>{k[0].toUpperCase() + k.slice(1)}</span>
            <Stepper value={r.points[k]} onMinus={() => set({ ...r, points: { ...r.points, [k]: Math.max(0, r.points[k] - 1) }, preset: 'custom' })} onPlus={() => set({ ...r, points: { ...r.points, [k]: Math.min(10, r.points[k] + 1) }, preset: 'custom' })} />
          </div>
        ))}
        <label className="set-row">
          <span>Draws in pools</span>
          <input type="checkbox" role="switch" className="switch" checked={r.drawsAllowed.pool} onChange={(e) => set({ ...r, drawsAllowed: { ...r.drawsAllowed, pool: e.target.checked } })} />
        </label>
        <label className="set-row">
          <span>Draws in placement games</span>
          <input type="checkbox" role="switch" className="switch" checked={r.drawsAllowed.placement} onChange={(e) => set({ ...r, drawsAllowed: { ...r.drawsAllowed, placement: e.target.checked } })} />
        </label>
      </section>
      <span className="lbl-head">Tie-breaks · in order</span>
      <section className="card set-list">
        {r.tiebreaks.map((tb, i) => (
          <div key={tb} className="set-row tb">
            <b className="d tb-n">{i + 1}</b>
            <span className="tb-label">{TIEBREAK_LABEL[tb]}</span>
            {UNCOMPUTABLE.includes(tb) && <span className="tag outline sm dashed">at the field</span>}
            <span className="tb-btns">
              <button className="ib" aria-label={`Move ${TIEBREAK_LABEL[tb]} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button className="ib" aria-label={`Move ${TIEBREAK_LABEL[tb]} down`} disabled={i === r.tiebreaks.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button className="ib" aria-label={`Remove ${TIEBREAK_LABEL[tb]}`} onClick={() => set({ ...r, tiebreaks: r.tiebreaks.filter((x) => x !== tb), preset: 'custom' })}>
                ×
              </button>
            </span>
          </div>
        ))}
        {unused.length > 0 && (
          <label className="set-row add-tb">
            <span>+ Add a tie-break</span>
            <select value="" onChange={(e) => e.target.value && set({ ...r, tiebreaks: [...r.tiebreaks, e.target.value as (typeof unused)[number]], preset: 'custom' })} aria-label="Add a tie-break">
              <option value="">Add a tie-break…</option>
              {unused.map((u) => (
                <option key={u} value={u}>
                  {TIEBREAK_LABEL[u]}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>
      <div className="two-btns">
        <button className="btn" onClick={() => editMapping(c, (x) => ({ ...x, rules: undefined }))}>
          Read from sheet
        </button>
        <button
          className="btn violet-text"
          disabled={busy}
          onClick={async () => {
            const key = store.app.aiKey;
            if (!key) return overlay.toast('Add an OpenRouter key in App settings first.');
            setBusy(true);
            const res = await aiRules({ key, model: store.app.aiModel }, c.t.info.flatMap((s) => [s.title, ...s.lines]).join('\n'));
            setBusy(false);
            if (res.rules) {
              editMapping(c, (x) => ({ ...x, rules: res.rules }));
              overlay.toast('Rules read by AI.');
            } else overlay.toast(res.error ?? 'AI couldn’t read the rules.');
          }}
        >
          {busy ? 'Asking AI…' : 'Ask AI'}
        </button>
      </div>
    </SubPage>
  );
}

function AiButton() {
  const overlay = useOverlay();
  return (
    <button
      className="set-row nav violet-text"
      onClick={() => {
        if (!store.app.aiKey) return overlay.toast('Add an OpenRouter key in App settings first.');
        overlay.openSheet(<AiRun />, { title: 'Improve with AI' });
      }}
    >
      <span>Improve with AI</span>
      <IChevronRight size={18} />
    </button>
  );
}

/** Runs the AI mapper and shows the before/after comparison; never applies silently. */
export function AiRun() {
  const c = useT();
  const overlay = useOverlay();
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const [p, setP] = useState<AiProposal | undefined>();
  const run = async () => {
    setState('running');
    const wb = c.rt.workbook!;
    const res = await improveMapping({ wb, current: c.p.mapping, id: c.id, title: c.t.title, call: { key: store.app.aiKey!, model: store.app.aiModel } });
    setP(res);
    setState('done');
  };
  if (state === 'idle')
    return (
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          The first rows of each visible tab and the current reading are sent to OpenRouter with your key. Only a description of where things are comes back; you choose whether to use it. Usually well under a cent.
        </p>
        <button className="btn violet" onClick={run}>
          Ask AI
        </button>
      </div>
    );
  if (state === 'running')
    return (
      <div className="center-page" style={{ minHeight: 160 }}>
        <div className="spinner" />
        <span className="muted">Asking AI…</span>
      </div>
    );
  if (!p) return null;
  if (p.error && !p.mapping) return <p className="err">{p.error}</p>;
  const row = (label: string, a: string | number, b: string | number) => (
    <tr>
      <th scope="row">{label}</th>
      <td>{a}</td>
      <td>{b}</td>
    </tr>
  );
  return (
    <div className="stack">
      <span className={`tag ${p.better ? 'win' : 'warn'}`} style={{ alignSelf: 'flex-start' }}>
        {p.better ? 'Better than the current reading' : 'Not better than the current reading'}
      </span>
      <table className="cmp">
        <thead>
          <tr>
            <th />
            <th>Now</th>
            <th>With AI</th>
          </tr>
        </thead>
        <tbody>
          {row('Games', p.before.games, p.after?.games ?? '–')}
          {row('With both teams', p.before.withTeams, p.after?.withTeams ?? '–')}
          {row('Teams', p.before.teams, p.after?.teams ?? '–')}
          {row('Merged names', p.before.aliases, p.after?.aliases ?? '–')}
          {row('Divisions', p.before.divisions, p.after?.divisions ?? '–')}
          {row('Problems', p.before.problems.length, p.after?.problems.length ?? '–')}
        </tbody>
      </table>
      {p.mapping?.notes?.length ? <ul className="small">{p.mapping.notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
      <span className="small muted">
        {p.usage.promptTokens + p.usage.completionTokens} tokens · about ${p.usage.cost.toFixed(4)}
      </span>
      <div className="two-btns">
        <button className="btn" onClick={() => overlay.closeSheet()}>
          Discard
        </button>
        <button
          className="btn primary"
          disabled={!p.mapping}
          onClick={() => {
            store.runtime(c.id).setMapping(p.mapping);
            overlay.closeSheet();
            overlay.toast('Using the AI’s reading.');
          }}
        >
          Use
        </button>
      </div>
    </div>
  );
}

function AiFormatButton() {
  const c = useT();
  const overlay = useOverlay();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn violet-text"
      disabled={busy}
      onClick={async () => {
        if (!store.app.aiKey) return overlay.toast('Add an OpenRouter key in App settings first.');
        setBusy(true);
        const wb = c.rt.workbook;
        const formulas: string[] = [];
        for (const tab of wb?.tabs ?? []) for (const [k, f] of Object.entries(tab.formulas ?? {})) if (/rank|vlookup|index|match/i.test(f)) formulas.push(`${tab.name}!${k}: =${f}`.slice(0, 200));
        const formatText = c.t.info.map((s) => [s.title, ...s.lines].join('\n')).join('\n');
        const res = await aiFormat({ key: store.app.aiKey, model: store.app.aiModel }, c.t, c.p.format, formulas, formatText);
        setBusy(false);
        if (res.format && res.filled) {
          editFormat(c, () => res.format);
          overlay.toast(`AI filled ${res.filled} unknown slots. Check them in the format editor.`);
        } else overlay.toast(res.error ?? 'Nothing left for AI to fill.');
      }}
    >
      {busy ? 'Asking AI…' : 'Ask AI'}
    </button>
  );
}

export { teamKey };
