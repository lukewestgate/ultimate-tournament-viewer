import { useEffect, useState } from 'react';
import { parseSheetLink, sourceKey } from '../../sheets/links';
import { FETCH_ERROR_TEXT } from '../../sheets/fetch';
import { store, useRuntime } from '../../store/app';
import { problemsOnly } from '../../extract/quality';
import { TournamentProvider, useT } from '../ctx';
import { SubPage } from '../Shell';
import { href, navigate, tHref } from '../router';
import { ErrorNextStep } from '../App';
import { dateLabel, plural } from '../fmt';
import { IWarn } from '../icons';
import { useOverlay } from '../overlay';
import { TeamPicker } from '../TeamPicker';
import { FixOptions } from '../components';
import { useOpenAi, addKey } from '../FixWithAi';
import { readingCounts } from '../../mapping/issues';

/** Paste field with validation as you type, and a paste button where allowed. */
export function AddForm({ onSubmit }: { onSubmit?: (id: string) => void }) {
  const [text, setText] = useState('');
  const src = parseSheetLink(text);
  const state = !text.trim() ? 'empty' : src ? 'valid' : 'invalid';
  const submit = () => {
    if (!src) return;
    const id = sourceKey(src);
    if (onSubmit) onSubmit(id);
    else {
      store.add(id);
      navigate(`${href({ name: 'add' })}?id=${encodeURIComponent(id)}`);
    }
  };
  return (
    <form
      className="stack add-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="fieldset">
        Google Sheets link
        <div className="paste-row">
          <input
            className="field"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={state === 'invalid'}
            aria-describedby="link-help"
          />
          {'clipboard' in navigator && 'readText' in navigator.clipboard && (
            <button type="button" className="btn" onClick={async () => setText((await navigator.clipboard.readText().catch(() => '')) || text)}>
              Paste
            </button>
          )}
        </div>
      </label>
      <span id="link-help" className={`small ${state === 'invalid' ? 'err' : 'muted'}`}>
        {state === 'invalid'
          ? 'That doesn’t look like a Google Sheets link.'
          : state === 'valid'
            ? src?.kind === 'publish'
              ? 'Published sheet link. Updates can lag the live sheet by a few minutes.'
              : 'Looks good.'
            : 'The sheet must be shared as “Anyone with the link”, Viewer.'}
      </span>
      <button className="btn primary" type="submit" disabled={state !== 'valid'}>
        Add tournament
      </button>
    </form>
  );
}

/** Add tournament (spec §9.4): paste, progress, preview, errors with one next step. */
export function Add() {
  const [id, setId] = useState<string | undefined>(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('id') ?? undefined);
  useEffect(() => {
    const on = () => setId(new URLSearchParams(location.hash.split('?')[1] ?? '').get('id') ?? undefined);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return (
    <SubPage title="Add tournament" back={href({ name: 'home' })}>
      {!id ? (
        <>
          <p className="lead">Paste the link to the tournament’s Google Sheet. Everything stays on this device.</p>
          <section className="card set-pad">
            <AddForm />
          </section>
        </>
      ) : (
        <TournamentProvider id={id} fallback={() => <Progress id={id} />}>
          <Preview />
        </TournamentProvider>
      )}
    </SubPage>
  );
}

function Progress({ id }: { id: string }) {
  const rt = useRuntime(id)!;
  if (rt.phase === 'error' && rt.error) {
    return (
      <div className="card pad stack">
        <h2>{FETCH_ERROR_TEXT[rt.error.kind]}</h2>
        <ErrorNextStep id={id} kind={rt.error.kind} />
        <a className="btn" href={href({ name: 'add' })} onClick={() => store.remove(id)}>
          Try a different link
        </a>
      </div>
    );
  }
  const steps: [string, string][] = [
    ['opening', 'Opening sheet'],
    ['reading', 'Reading tabs'],
    ['finding', 'Finding games'],
  ];
  const at = Math.max(0, steps.findIndex(([s]) => s === rt.step));
  return (
    <div className="card pad" aria-busy="true">
      <ol className="steps">
        {steps.map(([s, label], i) => (
          <li key={s} className={i < at ? 'done' : i === at ? 'on' : ''}>
            {label}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Preview() {
  const c = useT();
  const overlay = useOverlay();
  const t = c.t;
  const problems = problemsOnly(c.p.problems);
  const openAi = useOpenAi();
  if (!t.games.length) {
    return (
      <div className="card pad stack">
        <h2>No games found</h2>
        <p className="muted">We opened “{t.title}” but couldn’t find the games.</p>
        <FixOptions hasKey={Boolean(store.app.aiKey)} noGames onAi={openAi} onMap={() => navigate(tHref(c.id, 'manual'))} onAddKey={addKey} />
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="card pad stack preview">
        <h2>{t.title}</h2>
        <dl className="kv">
          <dt>Games</dt>
          <dd>{readingCounts(t).games}</dd>
          <dt>Days</dt>
          <dd>
            {t.days.map((d) => `${dateLabel(d.date)}${d.dateSource === 'guessed' ? ' (guessed)' : ''}`).join(', ')}
          </dd>
          {t.divisions.length > 0 && (
            <>
              <dt>Divisions</dt>
              <dd>{t.divisions.map((d) => d.name).join(', ')}</dd>
            </>
          )}
          <dt>Teams</dt>
          <dd>{t.teams.length}</dd>
          <dt>Pool tables</dt>
          <dd>{t.pools.length ? plural(t.pools.length, 'pool') : 'None'}</dd>
        </dl>
        {problems.length > 0 && (
          <div className="warnbox">
            <IWarn size={18} />
            <div>
              <b>This may be read wrongly</b>
              <ul>
                {problems.slice(0, 4).map((p) => (
                  <li key={p.text}>{p.text}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {problems.length > 0 && <FixOptions hasKey={Boolean(store.app.aiKey)} onAi={openAi} onMap={() => navigate(tHref(c.id, 'manual'))} onAddKey={addKey} />}
        <a className="btn primary block big" href={tHref(c.id)}>
          Open
        </a>
        <div className="two-btns">
          <button className="btn" onClick={() => overlay.openSheet(<TeamPicker compact />, { title: 'Pick your team(s)' })}>
            Pick your team(s)
          </button>
          <a className="btn" href={tHref(c.id, 'review')}>
            Check the reading
          </a>
        </div>
      </div>
    </div>
  );
}

