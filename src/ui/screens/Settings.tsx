import { useState } from 'react';
import { useT } from '../ctx';
import { Section, Seg } from '../parts';
import { navigate, href, tHref } from '../router';
import { useOverlay } from '../overlay';
import { store } from '../../store/app';
import { editFormat, editMapping, shareLink, copyOrShare } from '../mappingEdit';
import { mergeSuggestions } from '../../extract/quality';
import { pointsDiffPreset, ukuPreset, TIEBREAK_LABEL, ALL_TIEBREAKS, UNCOMPUTABLE } from '../../engine/rulesPresets';
import { divKey, type EngineLevel, type Rules } from '../../model/types';
import { improveMapping, aiRules, aiFormat, type AiProposal } from '../../mapping/ai';
import { teamKey } from '../../store/settings';
import { IWarn } from '../icons';
import type { ScreenProps } from './index';

const MODE_TEXT = { auto: 'Read automatically', ai: 'Fixed by AI', manual: 'Fixed by you' };
const LEVEL_TEXT: Record<EngineLevel, string> = { full: 'Full: brackets, paths and what-if work', partial: 'Partial: some future games can’t be predicted', basic: 'Basic: shows what the sheet says' };

/** Tournament settings: "How this sheet is read" (spec §9.13). */
export function Settings(_: ScreenProps) {
  const c = useT();
  const overlay = useOverlay();
  const t = c.t;
  const m = c.p.mapping;
  const problems = c.p.problems;
  const merges = mergeSuggestions(t, m.corrections.rejectedMerges);
  return (
    <div className="settings">
      <h1 style={{ fontSize: 24 }}>How this sheet is read</h1>
      <Section title="Summary">
        <div className="card pad stack">
          <span className="tag quiet" style={{ alignSelf: 'flex-start' }}>{MODE_TEXT[m.mode]}</span>
          <dl className="kv">
            <dt>Games from</dt>
            <dd>{m.games.map((g) => `${g.tab} (${g.kind === 'list' ? 'list' : 'grid'})`).join(', ') || 'nowhere yet'}</dd>
            <dt>Counts</dt>
            <dd>
              {t.games.length} games · {t.teams.length} teams · {t.days.length} days · {t.pools.length} pools
            </dd>
            {t.divisions.length > 0 && (
              <>
                <dt>Divisions</dt>
                <dd>{t.divisions.map((d) => d.name).join(', ')}</dd>
              </>
            )}
            <dt>Format</dt>
            <dd>
              {Object.entries(c.view.levels).map(([d, l]) => (
                <div key={d}>
                  {d ? `${d}: ` : ''}
                  {LEVEL_TEXT[l]}
                </div>
              ))}
            </dd>
          </dl>
        </div>
      </Section>

      {problems.length > 0 && (
        <Section title="Problems">
          <div className="card pad stack">
            {problems.map((p) => (
              <div key={p.text} className={`problem ${p.severity}`}>
                {p.severity === 'problem' && <IWarn size={16} />}
                <span>{p.text}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Quick corrections">
        <div className="card pad stack">
          <label className="fieldset">
            Title
            <input className="field" defaultValue={m.corrections.title ?? t.title} onBlur={(e) => e.target.value !== t.title && editMapping(c, (x) => ({ ...x, corrections: { ...x.corrections, title: e.target.value || undefined } }))} />
          </label>
          <span className="lbl">Days</span>
          {t.days.map((d) => {
            const tm = t.timing.find((x) => x.day === d.name);
            return (
              <div key={d.name} className="day-row">
                <b>{d.name}</b>
                <input
                  type="date"
                  className="field"
                  value={d.date}
                  aria-label={`${d.name} date`}
                  onChange={(e) => e.target.value && editMapping(c, (x) => ({ ...x, corrections: { ...x.corrections, dates: { ...x.corrections.dates, [d.name]: e.target.value } } }))}
                />
                {d.dateSource === 'guessed' && <span className="tag warn">guessed</span>}
                <label className="mini">
                  Game length
                  <input
                    type="number"
                    className="field"
                    min={5}
                    max={180}
                    defaultValue={tm?.gameMins}
                    onBlur={(e) => Number(e.target.value) && editMapping(c, (x) => ({ ...x, corrections: { ...x.corrections, gameLength: { ...x.corrections.gameLength, [d.name]: Number(e.target.value) } } }))}
                  />
                </label>
                <div className="delay">
                  <span className="small">{tm?.delayMins ? `Running ${tm.delayMins} min late` : 'On time'}</span>
                  <button className="btn small" onClick={() => editMapping(c, (x) => ({ ...x, corrections: { ...x.corrections, delays: { ...x.corrections.delays, [d.name]: Math.max(0, (x.corrections.delays[d.name] ?? 0) - 5) } } }))}>
                    −5
                  </button>
                  <button className="btn small" onClick={() => editMapping(c, (x) => ({ ...x, corrections: { ...x.corrections, delays: { ...x.corrections.delays, [d.name]: (x.corrections.delays[d.name] ?? 0) + 5 } } }))}>
                    +5
                  </button>
                  {tm?.delayMins ? (
                    <button className="btn small" onClick={() => editMapping(c, (x) => ({ ...x, corrections: { ...x.corrections, delays: { ...x.corrections.delays, [d.name]: 0 } } }))}>
                      Reset
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {t.divisions.length > 0 && (
            <>
              <span className="lbl">Division names</span>
              {t.divisions.map((d) => (
                <label key={d.name} className="fieldset">
                  {d.code ? `Code ${d.code}` : 'Division'}
                  <input
                    className="field"
                    defaultValue={d.name}
                    onBlur={(e) => e.target.value && e.target.value !== d.name && editMapping(c, (x) => ({ ...x, corrections: { ...x.corrections, divisionNames: { ...x.corrections.divisionNames, [d.name]: e.target.value } } }))}
                  />
                </label>
              ))}
            </>
          )}
          <span className="lbl">Team names</span>
          {merges.length === 0 && <span className="small muted">No likely duplicates.</span>}
          {merges.map((s) => (
            <div key={`${s.merge}|${s.keep}`} className="merge-row">
              <span>
                “{s.merge}” may be “{s.keep}”{s.division ? ` (${s.division})` : ''}
              </span>
              <span style={{ flex: 1 }} />
              <button className="btn small primary" onClick={() => editMapping(c, (x) => ({ ...x, corrections: { ...x.corrections, aliases: { ...x.corrections.aliases, [s.merge]: s.keep } } }))}>
                Merge
              </button>
              <button className="btn small" onClick={() => editMapping(c, (x) => ({ ...x, corrections: { ...x.corrections, rejectedMerges: [...(x.corrections.rejectedMerges ?? []), [s.keep, s.merge].sort().join('|')] } }))}>
                Keep apart
              </button>
            </div>
          ))}
          <ManualMerge />
          {Object.keys(m.corrections.aliases).length > 0 && (
            <div className="small muted">
              Merged: {Object.entries(m.corrections.aliases).map(([a, b]) => `${a} → ${b}`).join(', ')}{' '}
              <button className="btn small" onClick={() => editMapping(c, (x) => ({ ...x, corrections: { ...x.corrections, aliases: {} } }))}>
                Undo merges
              </button>
            </div>
          )}
        </div>
      </Section>

      <RulesEditor />

      <Section title="Reading the sheet">
        <div className="card pad stack">
          <div className="row-btns">
            <button
              className="btn"
              onClick={() => {
                store.runtime(c.id).setMapping(undefined);
                overlay.toast('Read again automatically.');
              }}
            >
              Start over (Auto)
            </button>
            <AiButton />
            <a className="btn" href={tHref(c.id, 'manual')}>
              Edit manually
            </a>
          </div>
          {Object.keys(c.view.levels).map((d) => (
            <label key={d} className="fieldset">
              Engine level{d ? ` · ${d}` : ''}
              <select
                className="field"
                value={m.engineLevel?.[d] ?? ''}
                onChange={(e) => editMapping(c, (x) => ({ ...x, engineLevel: { ...(x.engineLevel ?? {}), [d]: (e.target.value || undefined) as EngineLevel } }))}
              >
                <option value="">Automatic ({c.view.levels[d]})</option>
                <option value="full">Full</option>
                <option value="partial">Partial</option>
                <option value="basic">Basic (show what the sheet says)</option>
              </select>
            </label>
          ))}
        </div>
      </Section>

      <Section title="Format">
        <div className="card pad stack">
          <span className="small muted">How teams move through the tournament. The app works without it; it’s used for possible opponents, brackets and paths.</span>
          <div className="row-btns">
            <button
              className="btn"
              onClick={() => {
                editFormat(c, () => undefined);
                overlay.toast('Format worked out again.');
              }}
            >
              Work it out again (Auto)
            </button>
            <AiFormatButton />
            <a className="btn" href={tHref(c.id, 'format')}>
              Edit format
            </a>
          </div>
          <span className="lbl">Qualification places</span>
          {(t.divisions.length ? t.divisions.map((d) => d.name) : [undefined]).map((d) => {
            const q = c.view.format.divisions[divKey(d)]?.qualification ?? [];
            return (
              <label key={d ?? ''} className="fieldset">
                {d ?? 'Places'} <span className="small muted">e.g. “Div 1: 1-4, Div 2: 5-7”</span>
                <input
                  className="field"
                  defaultValue={q.map((x) => `${x.label}: ${x.from}-${x.to}`).join(', ')}
                  onBlur={(e) => {
                    const parsed = e.target.value
                      .split(',')
                      .map((p) => /^\s*(.+?)\s*:\s*(\d+)\s*[-–]\s*(\d+)\s*$/.exec(p))
                      .filter((x): x is RegExpExecArray => Boolean(x))
                      .map((x) => ({ label: x[1], from: Number(x[2]), to: Number(x[3]) }));
                    editFormat(c, (f) => {
                      f.divisions[divKey(d)] ??= { sources: {} };
                      f.divisions[divKey(d)].qualification = parsed;
                      return f;
                    });
                  }}
                />
              </label>
            );
          })}
        </div>
      </Section>

      <Section title="Sharing">
        <div className="card pad stack">
          <span className="small muted">The link opens this tournament for anyone. If you fixed how the sheet is read, the link carries that too.</span>
          <button className="btn" onClick={async () => copyOrShare(await shareLink(c), t.title, overlay.toast)}>
            Share link
          </button>
        </div>
      </Section>
      <button
        className="btn danger"
        onClick={() => {
          const removed = store.remove(c.id);
          navigate(href({ name: 'home' }));
          overlay.toast('Removed from your list.', removed ? { label: 'Undo', run: () => store.restore(removed) } : undefined);
        }}
      >
        Remove tournament
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
    <details>
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

function RulesEditor() {
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
    <Section title="Rules" right={<span className="tag quiet">{{ preset: 'Preset', sheet: 'From the sheet', ai: 'From AI', user: 'Set by you' }[r.source]}</span>}>
      <div className="card pad stack">
        <Seg
          label="Preset"
          value={r.preset ?? 'custom'}
          options={[
            { value: 'uku', label: 'UKU' },
            { value: 'pointsDiff', label: 'Points & difference' },
            { value: 'custom', label: 'Custom' },
          ]}
          onChange={(v) => v === 'uku' ? set(ukuPreset()) : v === 'pointsDiff' ? set(pointsDiffPreset()) : set({ ...r, preset: 'custom' })}
        />
        <div className="points-row">
          {(['win', 'draw', 'loss'] as const).map((k) => (
            <label key={k} className="mini">
              {k[0].toUpperCase() + k.slice(1)}
              <input type="number" className="field" min={0} max={10} value={r.points[k]} onChange={(e) => set({ ...r, points: { ...r.points, [k]: Number(e.target.value) }, preset: 'custom' })} />
            </label>
          ))}
        </div>
        <span className="lbl">Tie-breaks, in order</span>
        <ol className="tb-list">
          {r.tiebreaks.map((tb, i) => (
            <li key={tb}>
              <span>
                {TIEBREAK_LABEL[tb]}
                {UNCOMPUTABLE.includes(tb) && <span className="small muted"> · decided at the field</span>}
              </span>
              <span style={{ flex: 1 }} />
              <button className="ib" aria-label={`Move ${TIEBREAK_LABEL[tb]} up`} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button className="ib" aria-label={`Move ${TIEBREAK_LABEL[tb]} down`} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button className="ib" aria-label={`Remove ${TIEBREAK_LABEL[tb]}`} onClick={() => set({ ...r, tiebreaks: r.tiebreaks.filter((x) => x !== tb), preset: 'custom' })}>
                ×
              </button>
            </li>
          ))}
        </ol>
        {unused.length > 0 && (
          <select className="field" value="" onChange={(e) => e.target.value && set({ ...r, tiebreaks: [...r.tiebreaks, e.target.value as typeof unused[number]], preset: 'custom' })} aria-label="Add a tie-break">
            <option value="">Add a tie-break…</option>
            {unused.map((u) => (
              <option key={u} value={u}>
                {TIEBREAK_LABEL[u]}
              </option>
            ))}
          </select>
        )}
        <label className="toggle">
          <input type="checkbox" checked={r.drawsAllowed.pool} onChange={(e) => set({ ...r, drawsAllowed: { ...r.drawsAllowed, pool: e.target.checked } })} /> Draws allowed in pools
        </label>
        <label className="toggle">
          <input type="checkbox" checked={r.drawsAllowed.placement} onChange={(e) => set({ ...r, drawsAllowed: { ...r.drawsAllowed, placement: e.target.checked } })} /> Draws allowed in placement games
        </label>
        <div className="row-btns">
          <button className="btn" onClick={() => editMapping(c, (x) => ({ ...x, rules: undefined }))}>
            Read from sheet
          </button>
          <button
            className="btn"
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
      </div>
    </Section>
  );
}

function AiButton() {
  const overlay = useOverlay();
  return (
    <button
      className="btn"
      onClick={() => {
        if (!store.app.aiKey) return overlay.toast('Add an OpenRouter key in App settings first.');
        overlay.openSheet(<AiRun />, { title: 'Improve with AI' });
      }}
    >
      Improve with AI
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
        <button className="btn primary" onClick={run}>
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
      <div className="row-btns">
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
        <button className="btn" onClick={() => overlay.closeSheet()}>
          Discard
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
      className="btn"
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
