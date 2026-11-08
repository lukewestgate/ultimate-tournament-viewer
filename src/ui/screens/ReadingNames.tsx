import { useState } from 'react';
import { useT } from '../ctx';
import { SubPage } from '../Shell';
import { tHref } from '../router';
import { useOverlay } from '../overlay';
import { editMapping, editWithUndo } from '../mappingEdit';
import { mergeSuggestions } from '../../extract/quality';
import type { Corrections } from '../../mapping/types';
import { IChevronRight } from '../icons';
import { dateLabel } from '../fmt';
import { Stepper } from '../components';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** Names, dates & times: corrections to what the sheet says. Each day's date and game length lead; running late is folded away. */
export function NamesPage() {
  const c = useT();
  const overlay = useOverlay();
  const t = c.t;
  const m = c.p.mapping;
  const corr = (fn: (x: Corrections) => Corrections) => editMapping(c, (x) => ({ ...x, corrections: fn(x.corrections) }));
  const corrUndo = (text: string, fn: (x: Corrections) => Corrections) => editWithUndo(c, overlay.toast, text, (x) => ({ ...x, corrections: fn(x.corrections) }));
  const merges = mergeSuggestions(t, m.corrections.rejectedMerges);
  const aliases = Object.entries(m.corrections.aliases);
  const nTeams = Object.keys(m.corrections.teamDivisions ?? {}).length;
  const nGames = Object.keys(m.corrections.gameDivisions ?? {}).length;
  const nIgnored = m.corrections.ignoreRows?.length ?? 0;
  const overrides = [nTeams && `${plural(nTeams, 'team')} moved to another division`, nGames && `${plural(nGames, 'game')} put in a division`, nIgnored && `${plural(nIgnored, 'row')} ignored`].filter((x): x is string => Boolean(x));
  const late = t.timing.filter((x) => x.delayMins);
  return (
    <SubPage title="Names, dates & times" sub={t.title} back={tHref(c.id, 'settings')}>
      <span className="lbl-head">Days</span>
      <section className="card set-list">
        {t.days.map((d) => {
          const tm = t.timing.find((x) => x.day === d.name);
          return (
            <div key={d.name}>
              <div className="set-row">
                <span className="set-label">
                  <b>{d.name}</b>
                  <small>{d.dateSource === 'guessed' ? 'Date guessed' : d.dateSource === 'user' ? 'Date set by you' : 'From the sheet'}</small>
                </span>
                <label className={`date-pill${d.dateSource === 'guessed' ? ' guessed' : ''}`}>
                  {dateLabel(d.date)}
                  <input type="date" value={d.date} aria-label={`${d.name} date`} onChange={(e) => e.target.value && corrUndo(`${d.name} is ${dateLabel(e.target.value)}.`, (x) => ({ ...x, dates: { ...x.dates, [d.name]: e.target.value } }))} />
                </label>
              </div>
              {tm && (
                <div className="set-row">
                  <span>Game length</span>
                  <Stepper
                    label="Game length"
                    value={`${tm.gameMins} min`}
                    onMinus={() => corr((x) => ({ ...x, gameLength: { ...x.gameLength, [d.name]: Math.max(5, tm.gameMins - 1) } }))}
                    onPlus={() => corr((x) => ({ ...x, gameLength: { ...x.gameLength, [d.name]: tm.gameMins + 1 } }))}
                  />
                </div>
              )}
            </div>
          );
        })}
      </section>

      <span className="lbl-head">Names</span>
      <section className="card set-list">
        <label className="set-row">
          <span>Title</span>
          <input className="inline-field" defaultValue={m.corrections.title ?? t.title} onBlur={(e) => e.target.value !== t.title && corr((x) => ({ ...x, title: e.target.value || undefined }))} />
        </label>
        {t.divisions.length > 0 && (
          <details className="rd-fold">
            <summary className="set-row nav">
              <span className="set-label">
                Divisions<small>{t.divisions.map((d) => d.name).join(', ')}</small>
              </span>
              <IChevronRight size={18} className="chev" />
            </summary>
            <div className="rd-fold-body">
              {t.divisions.map((d) => (
                <label key={d.name} className="rd-mini">
                  <span className="muted">{d.code ? `Sheet says “${d.code}”` : d.name}</span>
                  <input
                    className="field inline-field"
                    defaultValue={d.name}
                    onBlur={(e) => e.target.value && e.target.value !== d.name && corr((x) => ({ ...x, divisionNames: { ...x.divisionNames, [d.name]: e.target.value } }))}
                  />
                </label>
              ))}
            </div>
          </details>
        )}
        <details className="rd-fold" open={merges.length > 0}>
          <summary className="set-row nav">
            <span className="set-label">
              Team names<small>{merges.length ? `${plural(merges.length, 'likely duplicate')}` : aliases.length ? `${aliases.length} merged` : 'No likely duplicates'}</small>
            </span>
            <IChevronRight size={18} className="chev" />
          </summary>
          <div className="rd-fold-body">
            {merges.map((s) => (
              <div key={`${s.merge}|${s.keep}`} className="merge">
                <p>
                  “{s.merge}” may be “{s.keep}”{s.division ? ` (${s.division})` : ''}.
                </p>
                <div className="row-btns">
                  <button className="btn small primary" onClick={() => corrUndo(`Merged into “${s.keep}”.`, (x) => ({ ...x, aliases: { ...x.aliases, [s.merge]: s.keep } }))}>
                    Merge
                  </button>
                  <button className="btn small" onClick={() => corrUndo('Kept as two teams.', (x) => ({ ...x, rejectedMerges: [...(x.rejectedMerges ?? []), [s.keep, s.merge].sort().join('|')] }))}>
                    Not the same
                  </button>
                </div>
              </div>
            ))}
            {aliases.length > 0 && (
              <span className="small muted">
                Merged: {aliases.map(([a, b]) => `${a} → ${b}`).join(' · ')}.{' '}
                <button className="link" onClick={() => corrUndo('Merges undone.', (x) => ({ ...x, aliases: {} }))}>
                  Undo all
                </button>
              </span>
            )}
            <ManualMerge />
          </div>
        </details>
        {overrides.length > 0 && (
          <div className="set-row">
            <span className="small muted">
              {overrides.join(' · ')}.{' '}
              <button className="link" onClick={() => corrUndo('Moves undone.', (x) => ({ ...x, teamDivisions: undefined, gameDivisions: undefined, ignoreRows: undefined }))}>
                Undo
              </button>
            </span>
          </div>
        )}
      </section>

      <span className="lbl-head">Rarely needed</span>
      <section className="card set-list">
        <details className="rd-fold" open={late.length > 0}>
          <summary className="set-row nav">
            <span className="set-label">
              Running late<small>{late.length ? late.map((x) => `${x.day.slice(0, 3)} +${x.delayMins} min`).join(' · ') : 'Everything on time'}</small>
            </span>
            <IChevronRight size={18} className="chev" />
          </summary>
          <div className="rd-fold-body">
            <span className="small muted">Shifts every later game that day. For when the sheet isn’t being updated.</span>
            {t.days.map((d) => {
              const mins = t.timing.find((x) => x.day === d.name)?.delayMins ?? 0;
              return (
                <div key={d.name} className="rd-mini">
                  <span>{d.name}</span>
                  <Stepper
                    label="Delay"
                    value={mins ? `+${mins} min` : 'On time'}
                    amber={mins > 0}
                    onMinus={() => corr((x) => ({ ...x, delays: { ...x.delays, [d.name]: Math.max(0, (x.delays[d.name] ?? 0) - 5) } }))}
                    onPlus={() => corr((x) => ({ ...x, delays: { ...x.delays, [d.name]: (x.delays[d.name] ?? 0) + 5 } }))}
                  />
                </div>
              );
            })}
          </div>
        </details>
      </section>
    </SubPage>
  );
}

function ManualMerge() {
  const c = useT();
  const overlay = useOverlay();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const names = [...new Set(c.t.teams.map((t) => t.name))].sort((x, y) => x.localeCompare(y));
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
        <button className="btn" disabled={!a || !b || a === b} onClick={() => editWithUndo(c, overlay.toast, `Merged into “${b}”.`, (x) => ({ ...x, corrections: { ...x.corrections, aliases: { ...x.corrections.aliases, [a]: b } } }))}>
          Merge
        </button>
      </div>
    </details>
  );
}
