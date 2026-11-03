import { useMemo, useState } from 'react';
import { useT } from '../ctx';
import { useOverlay } from '../overlay';
import { Empty, Seg } from '../parts';
import { navigate, tHref } from '../router';
import { SubPage } from '../Shell';
import { store } from '../../store/app';
import { cell, colName, findTab, width } from '../../sheets/workbook';
import type { Mapping } from '../../mapping/types';
import { detectMapping } from '../../mapping/detect';
import { extract } from '../../extract/extract';
import { qualityCheck, problemsOnly } from '../../extract/quality';
import {
  GRID_ROLES,
  LIST_ROLES,
  POOL_ROLES,
  ROLE_COLOR,
  ROLE_LABEL,
  assignGridRole,
  assignListRole,
  assignPoolRole,
  moveSource,
  removePool,
  removeSource,
  rolesOnTab,
  setFixed,
  setGridPitch,
  setGridSeparator,
  setListHeader,
  setSeeding,
} from '../../mapping/manual';
import { shareLink, copyOrShare } from '../mappingEdit';
import { useOpenAi } from '../AiCta';
import { timeOf } from '../fmt';
import type { ScreenProps } from './index';

type Target = 'list' | 'grid' | 'pool' | 'seeding' | 'info';
const MAX_ROWS = 200;
const MAX_COLS = 40;

/** Manual mapping (spec §6.5): tap a sheet preview to say where things are. */
export function Manual(_: ScreenProps) {
  const c = useT();
  const overlay = useOverlay();
  const openAi = useOpenAi();
  const wb = c.rt.workbook;
  const [draft, setDraft] = useState<Mapping>(() => JSON.parse(JSON.stringify(c.p.mapping)));
  const visible = wb?.tabs.filter((t) => !t.hidden) ?? [];
  const hidden = wb?.tabs.filter((t) => t.hidden) ?? [];
  const [tabName, setTabName] = useState(() => draft.games[0]?.tab ?? visible[0]?.name ?? '');
  const [target, setTarget] = useState<Target>(() => (draft.games.find((g) => g.tab === tabName)?.kind ?? 'list') as Target);
  const [seedStep, setSeedStep] = useState<{ first?: { r: number; c: number }; last?: number }>({});
  const [poolHeader, setPoolHeader] = useState<number | undefined>();
  const preview = useMemo(() => {
    if (!wb) return undefined;
    try {
      const t = extract(wb, draft, { id: c.id, sheetUrl: '' });
      return { t, problems: problemsOnly(qualityCheck(t, draft, wb)) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [wb, draft, c.id]);
  if (!wb) return <Empty title="The sheet isn’t loaded yet" />;
  const tab = findTab(wb, tabName);
  const roles = rolesOnTab(draft, tabName);
  const listSrc = draft.games.find((g) => g.kind === 'list' && g.tab === tabName);

  const palette = (title: string, options: readonly string[], onPick: (role: string | null) => void, current?: string) =>
    overlay.openSheet(
      <div className="role-palette">
        {options.map((r) => (
          <button
            key={r}
            className={`role${current === r ? ' on' : ''}`}
            style={{ borderColor: ROLE_COLOR[r] ?? 'var(--ink3)' }}
            onClick={() => {
              onPick(r);
              overlay.closeSheet();
            }}
          >
            <span className="dot" style={{ background: ROLE_COLOR[r] ?? 'var(--ink3)' }} />
            {ROLE_LABEL[r] ?? r}
          </button>
        ))}
        {current && (
          <button
            className="role"
            onClick={() => {
              onPick(null);
              overlay.closeSheet();
            }}
          >
            Clear
          </button>
        )}
      </div>,
      { title },
    );

  const onCell = (r: number, col: number) => {
    const text = cell(tab!, r, col);
    const cur = roles.cols.get(col);
    if (target === 'list') {
      const header = listSrc?.kind === 'list' ? listSrc.headerRow : undefined;
      if (header === undefined) {
        setDraft(setListHeader(draft, tabName, r));
        return;
      }
      palette(`Column ${colName(col)}${text ? ` · “${text.slice(0, 24)}”` : ''}`, LIST_ROLES, (role) => setDraft(assignListRole(draft, tabName, header, col, role as never)), cur);
    } else if (target === 'grid') {
      const grid = draft.games.find((g) => g.kind === 'grid' && g.tab === tabName);
      if (!grid || /^(v|vs|:)$/i.test(text.trim())) {
        setDraft(setGridSeparator(draft, wb, tabName, r, col));
        return;
      }
      palette(`Column ${colName(col)} in a pitch block`, GRID_ROLES, (role) => setDraft(assignGridRole(draft, tabName, col, role as never)), cur);
    } else if (target === 'pool') {
      if (poolHeader === undefined) {
        setPoolHeader(r);
        return;
      }
      palette(`Pool table column ${colName(col)}`, POOL_ROLES, (role) => setDraft(assignPoolRole(draft, wb, tabName, poolHeader, col, role as never)), cur);
    } else if (target === 'seeding') {
      if (!seedStep.first) setSeedStep({ first: { r, c: col } });
      else if (seedStep.last === undefined) setSeedStep({ ...seedStep, last: r });
      else {
        setDraft(setSeeding(draft, tabName, seedStep.first, seedStep.last, col, cell(tab!, seedStep.first.r - 1, col) || undefined));
        setSeedStep({});
        overlay.toast('Seeding added.');
      }
    }
  };

  const hint: Record<Target, string> = {
    list: listSrc ? 'Tap a cell to give its column a role (Time, Team 1, Score 1…). Tap a row number to move the header row.' : 'Tap the header row of the game list.',
    grid: draft.games.some((g) => g.kind === 'grid' && g.tab === tabName) ? 'Tap the cells of one pitch block to label them (team, score, slot, time), or a shared time column.' : 'Tap a separator (“v”) cell of one pitch block.',
    pool: poolHeader === undefined ? 'Tap the header row of a pool table.' : 'Tap the team column, then the stat columns (W, L, Pts…). Tap a row number for another table.',
    seeding: !seedStep.first ? 'Tap the first seed number.' : seedStep.last === undefined ? 'Tap the last seed number.' : 'Tap a cell in the team column.',
    info: 'Choose which tabs hold rules and format text.',
  };

  const rows = Math.min(MAX_ROWS, tab?.rows.length ?? 0);
  const cols = Math.min(MAX_COLS, tab ? width(tab) : 0);
  const inUse = (name: string) => draft.games.some((g) => g.tab === name) || draft.pools.some((p) => p.tab === name) || draft.seeding.some((s) => s.tab === name) || draft.info.includes(name);
  const pickTab = (name: string) => {
    setTabName(name);
    setPoolHeader(undefined);
    setSeedStep({});
  };
  const save = () => {
    store.runtime(c.id).setMapping({ ...draft, mode: 'manual' });
    overlay.toast('Saved.');
    navigate(tHref(c.id, 'settings'));
  };
  const question: Record<Target, string> = {
    list: 'Which tab has the games?',
    grid: 'Which tab has the games?',
    pool: 'Which tab has the pool tables?',
    seeding: 'Which tab has the seeding?',
    info: 'Which tabs hold rules and format text?',
  };
  return (
    <SubPage
      title="Edit how it’s read"
      sub={c.t.title}
      back={tHref(c.id, 'settings')}
      wide
      action={
        <button className="btn small primary" onClick={save}>
          Save
        </button>
      }
    >
      <Seg<Target>
        label="What to map"
        className="scroll-seg"
        value={target}
        options={[
          { value: 'list', label: 'Games (list)' },
          { value: 'grid', label: 'Games (grid)' },
          { value: 'pool', label: 'Pool tables' },
          { value: 'seeding', label: 'Seeding' },
          { value: 'info', label: 'Rules text' },
        ]}
        onChange={(v) => (setTarget(v), setPoolHeader(undefined), setSeedStep({}))}
      />
      <div className="man-grid">
        <div className="man-main">
          <p className="man-q">{question[target]} We’ve marked what we found automatically.</p>
          <section className="card set-list man-tabs" role="radiogroup" aria-label="Tabs">
            {visible.map((t) =>
              target === 'info' ? (
                <label key={t.name} className="set-row man-tab">
                  <input type="checkbox" checked={draft.info.includes(t.name)} onChange={(e) => setDraft({ ...draft, info: e.target.checked ? [...draft.info, t.name] : draft.info.filter((x) => x !== t.name) })} />
                  <span className="set-label">
                    <b>{t.name}</b>
                    {c.p.hints[t.name] && <small>Looks like: {c.p.hints[t.name].toLowerCase()}</small>}
                  </span>
                </label>
              ) : (
                <label key={t.name} className={`set-row man-tab${t.name === tabName ? ' on' : ''}`}>
                  <input type="radio" name="tab" checked={t.name === tabName} onChange={() => pickTab(t.name)} />
                  <span className="set-label">
                    <b>{t.name}</b>
                    {c.p.hints[t.name] && <small>Looks like: {c.p.hints[t.name].toLowerCase()}</small>}
                  </span>
                  {inUse(t.name) && <span className="tag win sm">in use</span>}
                </label>
              ),
            )}
          </section>
          {hidden.length > 0 && (
            <details className="man-hidden">
              <summary>Hidden tabs · {hidden.length}</summary>
              <div className="sr-tries">
                {hidden.map((t) => (
                  <button key={t.name} className={`chip${t.name === tabName ? ' on' : ''}`} onClick={() => pickTab(t.name)}>
                    {t.name}
                  </button>
                ))}
              </div>
            </details>
          )}
          {target !== 'info' && (
            <section className="card man-sheet">
              <div className="man-hint">
                <b>{tabName}</b> · {hint[target]}
              </div>
              <div className="sheet-preview" role="grid" aria-label={`Preview of ${tabName}`}>
                <table>
                  <thead>
                    <tr>
                      <th />
                      {Array.from({ length: cols }, (_, ci) => {
                        const role = roles.cols.get(ci);
                        return (
                          <th key={ci} style={role ? { boxShadow: `inset 0 3px 0 ${ROLE_COLOR[role] ?? 'var(--ink3)'}` } : undefined}>
                            {colName(ci)}
                            {role && <span className="role-tag">{ROLE_LABEL[role] ?? role}</span>}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: rows }, (_, r) => (
                      <tr key={r} className={roles.header === r || poolHeader === r ? 'hdr-row-m' : ''}>
                        <th>
                          <button
                            className="row-num"
                            aria-label={`Use row ${r + 1} as the header`}
                            onClick={() => (target === 'pool' ? setPoolHeader(r) : target === 'list' ? setDraft(setListHeader(draft, tabName, r)) : undefined)}
                          >
                            {r + 1}
                          </button>
                        </th>
                        {Array.from({ length: cols }, (_, ci) => {
                          const role = roles.cols.get(ci);
                          const sel = (seedStep.first?.r === r && seedStep.first?.c === ci) || (seedStep.last === r && seedStep.first?.c === ci);
                          return (
                            <td
                              key={ci}
                              onClick={() => onCell(r, ci)}
                              className={sel ? 'sel' : ''}
                              style={role ? { background: `color-mix(in srgb, ${ROLE_COLOR[role] ?? '#5F6774'} 18%, transparent)` } : undefined}
                            >
                              {cell(tab!, r, ci).slice(0, 30)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <span className="lbl-head">Sources of games</span>
          <section className="card set-list">
            {draft.games.map((g, i) => (
              <div key={i} className="set-row man-src">
                <span className="set-label">
                  <b>
                    {g.kind === 'grid' ? 'Grid' : 'List'} · {g.tab}
                  </b>
                  {g.kind === 'grid' && (
                    <span className="man-pitches">
                      {g.blocks.map((b, bi) => (
                        <input key={bi} className="field mini-field" value={b.pitch} aria-label={`Pitch name for block ${bi + 1}`} onChange={(e) => setDraft(setGridPitch(draft, g.tab, bi, e.target.value))} />
                      ))}
                    </span>
                  )}
                  {g.kind === 'list' && g.cols.day === undefined && (
                    <input className="field mini-field" placeholder="Fixed day" defaultValue={g.fixedDay} onBlur={(e) => setDraft(setFixed(draft, i, { fixedDay: e.target.value || undefined }))} aria-label="Fixed day" />
                  )}
                </span>
                <span className="tb-btns">
                  <button className="ib" aria-label="Move up" disabled={i === 0} onClick={() => setDraft(moveSource(draft, i, -1))}>
                    ↑
                  </button>
                  <button className="ib" aria-label="Move down" disabled={i === draft.games.length - 1} onClick={() => setDraft(moveSource(draft, i, 1))}>
                    ↓
                  </button>
                  <button className="ib" aria-label="Remove source" onClick={() => setDraft(removeSource(draft, i))}>
                    ×
                  </button>
                </span>
              </div>
            ))}
            {!draft.games.length && <div className="set-row muted small">None yet: pick Games (list) or Games (grid) and tap the sheet.</div>}
          </section>
          <span className="small muted">If two sources list a game at the same time and pitch, the higher one wins.</span>

          {draft.pools.length > 0 && (
            <>
              <span className="lbl-head">Pool tables</span>
              <section className="card set-list">
                {draft.pools.map((p, i) => (
                  <div key={i} className="set-row">
                    <input className="field mini-field" value={p.name} aria-label="Pool name" onChange={(e) => setDraft({ ...draft, pools: draft.pools.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                    <span className="small muted">
                      {p.tab} rows {p.headerRow + 1}–{p.lastRow + 1}
                    </span>
                    <button className="ib" aria-label="Remove pool" onClick={() => setDraft(removePool(draft, i))}>
                      ×
                    </button>
                  </div>
                ))}
              </section>
            </>
          )}
          {draft.seeding.length > 0 && (
            <>
              <span className="lbl-head">Seeding</span>
              <section className="card set-list">
                {draft.seeding.map((s, i) => (
                  <div key={i} className="set-row">
                    <span>
                      {s.label ?? 'Seeds'} · {s.tab} rows {s.firstRow + 1}–{s.lastRow + 1}
                    </span>
                    <button className="ib" aria-label="Remove seeding" onClick={() => setDraft({ ...draft, seeding: draft.seeding.filter((_, j) => j !== i) })}>
                      ×
                    </button>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>

        <aside className="man-side" aria-live="polite">
          <section className="card set-pad">
            <div className="card-title">
              <b>What we read</b>
              <span className="small muted">updates as you tap</span>
            </div>
            {preview && 'error' in preview ? (
              <span className="err small">{preview.error}</span>
            ) : preview ? (
              <>
                <div className="man-stats">
                  {[
                    [preview.t.games.length, 'games'],
                    [preview.t.teams.length, 'teams'],
                    [preview.t.days.length, 'days'],
                    [preview.t.divisions.length, 'divisions'],
                  ].map(([n, l]) => (
                    <div key={l} className="man-stat">
                      <b className="d">{n}</b>
                      <span>{l}</span>
                    </div>
                  ))}
                </div>
                {preview.problems.length > 0 && (
                  <div className="warn-card">
                    <b>
                      {preview.problems.length} problem{preview.problems.length === 1 ? '' : 's'}
                    </b>
                    {preview.problems.map((p) => (
                      <span key={p.text}>{p.text}</span>
                    ))}
                  </div>
                )}
                <span className="lbl">First games</span>
                <div className="man-games">
                  {preview.t.games.slice(0, 6).map((g) => (
                    <div key={g.id} className="man-game">
                      <b className="d">
                        {g.day.slice(0, 3)} {timeOf(g.start, preview.t.timeZone)}
                      </b>
                      <span>
                        {g.teams[0] ?? g.slots[0] ?? '—'} {g.scores[0] !== undefined ? `${g.scores[0]}–${g.scores[1]}` : 'v'} {g.teams[1] ?? g.slots[1] ?? '—'}
                      </span>
                      <span className="muted">{!g.teams[0] || !g.teams[1] ? 'missing' : g.pitch.label ? `P${g.pitch.label}` : ''}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </section>
          <div className="two-btns">
            <a className="btn" href={tHref(c.id, 'settings')}>
              Corrections
            </a>
            <button className="btn violet-text" onClick={openAi}>
              Improve with AI
            </button>
          </div>
          <div className="two-btns">
            <button className="btn" onClick={() => setDraft(detectMapping(wb).mapping)}>
              Start over
            </button>
            <button
              className="btn"
              onClick={async () => {
                store.runtime(c.id).setMapping({ ...draft, mode: 'manual' });
                await copyOrShare(await shareLink(c), c.t.title, overlay.toast);
              }}
            >
              Share link
            </button>
          </div>
        </aside>
      </div>
    </SubPage>
  );
}
