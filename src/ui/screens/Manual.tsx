import { useMemo, useState } from 'react';
import { useT } from '../ctx';
import { useOverlay } from '../overlay';
import { Empty, Seg } from '../parts';
import { navigate, tHref } from '../router';
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
import { AiRun } from './Settings';
import { timeOf } from '../fmt';
import type { ScreenProps } from './index';

type Target = 'list' | 'grid' | 'pool' | 'seeding' | 'info';
const MAX_ROWS = 200;
const MAX_COLS = 40;

/** Manual mapping (spec §6.5): tap a sheet preview to say where things are. */
export function Manual(_: ScreenProps) {
  const c = useT();
  const overlay = useOverlay();
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
  return (
    <div className="manual">
      <div className="home-head">
        <h1 style={{ fontSize: 22 }}>Map the sheet</h1>
        <span style={{ flex: 1 }} />
        <button className="btn small" onClick={() => navigate(tHref(c.id, 'settings'))}>
          Cancel
        </button>
        <button
          className="btn small primary"
          onClick={() => {
            store.runtime(c.id).setMapping({ ...draft, mode: 'manual' });
            overlay.toast('Saved.');
            navigate(tHref(c.id, 'settings'));
          }}
        >
          Save
        </button>
      </div>
      <div className="chips tab-chips" role="tablist" aria-label="Tabs">
        {visible.map((t) => (
          <button key={t.name} role="tab" aria-selected={t.name === tabName} className={`chip${t.name === tabName ? ' on' : ''}`} onClick={() => (setTabName(t.name), setPoolHeader(undefined), setSeedStep({}))}>
            {t.name}
            {c.p.hints[t.name] && <span className="chip-hint"> · {c.p.hints[t.name]}</span>}
          </button>
        ))}
      </div>
      {hidden.length > 0 && (
        <details className="small">
          <summary>{hidden.length} hidden tabs</summary>
          <div className="row-btns" style={{ marginTop: 6 }}>
            {hidden.map((t) => (
              <button key={t.name} className={`chip${t.name === tabName ? ' on' : ''}`} onClick={() => setTabName(t.name)}>
                {t.name}
              </button>
            ))}
          </div>
        </details>
      )}
      <Seg<Target>
        label="What to map"
        value={target}
        options={[
          { value: 'list', label: 'Games (list)' },
          { value: 'grid', label: 'Games (grid)' },
          { value: 'pool', label: 'Pool table' },
          { value: 'seeding', label: 'Seeding' },
          { value: 'info', label: 'Info' },
        ]}
        onChange={(v) => (setTarget(v), setPoolHeader(undefined), setSeedStep({}))}
      />
      <p className="hint small">{hint[target]}</p>
      {target === 'info' ? (
        <div className="card pad stack">
          {visible.map((t) => (
            <label key={t.name} className="toggle">
              <input type="checkbox" checked={draft.info.includes(t.name)} onChange={(e) => setDraft({ ...draft, info: e.target.checked ? [...draft.info, t.name] : draft.info.filter((x) => x !== t.name) })} />
              {t.name}
            </label>
          ))}
        </div>
      ) : (
        <div className="sheet-preview card" role="grid" aria-label={`Preview of ${tabName}`}>
          <table>
            <thead>
              <tr>
                <th />
                {Array.from({ length: cols }, (_, ci) => {
                  const role = roles.cols.get(ci);
                  return (
                    <th key={ci} style={role ? { boxShadow: `inset 0 -3px 0 ${ROLE_COLOR[role] ?? 'var(--ink3)'}` } : undefined}>
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
      )}
      <div className="grid2">
        <section className="card pad stack">
          <span className="lbl">Game sources (earlier sources win)</span>
          {draft.games.map((g, i) => (
            <div key={i} className="src-row">
              <b>{g.tab}</b>
              <span className="muted small">{g.kind}</span>
              {g.kind === 'grid' &&
                g.blocks.map((b, bi) => (
                  <input key={bi} className="field mini-field" value={b.pitch} aria-label={`Pitch name for block ${bi + 1}`} onChange={(e) => setDraft(setGridPitch(draft, g.tab, bi, e.target.value))} />
                ))}
              {g.kind === 'list' && g.cols.day === undefined && (
                <input className="field mini-field" placeholder="Fixed day" defaultValue={g.fixedDay} onBlur={(e) => setDraft(setFixed(draft, i, { fixedDay: e.target.value || undefined }))} aria-label="Fixed day" />
              )}
              <span style={{ flex: 1 }} />
              <button className="ib" aria-label="Move up" onClick={() => setDraft(moveSource(draft, i, -1))}>
                ↑
              </button>
              <button className="ib" aria-label="Move down" onClick={() => setDraft(moveSource(draft, i, 1))}>
                ↓
              </button>
              <button className="ib" aria-label="Remove source" onClick={() => setDraft(removeSource(draft, i))}>
                ×
              </button>
            </div>
          ))}
          {!draft.games.length && <span className="muted small">None yet: map a games list or grid above.</span>}
          {draft.pools.length > 0 && <span className="lbl">Pool tables</span>}
          {draft.pools.map((p, i) => (
            <div key={i} className="src-row">
              <input className="field mini-field" value={p.name} aria-label="Pool name" onChange={(e) => setDraft({ ...draft, pools: draft.pools.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <span className="muted small">
                {p.tab} rows {p.headerRow + 1}–{p.lastRow + 1}
              </span>
              <span style={{ flex: 1 }} />
              <button className="ib" aria-label="Remove pool" onClick={() => setDraft(removePool(draft, i))}>
                ×
              </button>
            </div>
          ))}
          {draft.seeding.length > 0 && <span className="lbl">Seeding</span>}
          {draft.seeding.map((s, i) => (
            <div key={i} className="src-row">
              <span>
                {s.label ?? 'Seeds'} · {s.tab} rows {s.firstRow + 1}–{s.lastRow + 1}
              </span>
              <span style={{ flex: 1 }} />
              <button className="ib" aria-label="Remove seeding" onClick={() => setDraft({ ...draft, seeding: draft.seeding.filter((_, j) => j !== i) })}>
                ×
              </button>
            </div>
          ))}
          <div className="row-btns">
            <button className="btn small" onClick={() => setDraft(detectMapping(wb).mapping)}>
              Start over (Auto)
            </button>
            <button className="btn small" onClick={() => (store.app.aiKey ? overlay.openSheet(<AiRun />, { title: 'Improve with AI' }) : overlay.toast('Add an OpenRouter key in App settings first.'))}>
              Improve with AI
            </button>
            <button
              className="btn small"
              onClick={async () => {
                store.runtime(c.id).setMapping({ ...draft, mode: 'manual' });
                await copyOrShare(await shareLink(c), c.t.title, overlay.toast);
              }}
            >
              Share link with this mapping
            </button>
            <a className="btn small" href={tHref(c.id, 'settings')}>
              Corrections
            </a>
          </div>
        </section>
        <section className="card pad stack live-preview" aria-live="polite">
          <span className="lbl">What the app reads</span>
          {preview && 'error' in preview ? (
            <span className="err small">{preview.error}</span>
          ) : preview ? (
            <>
              <span>
                {preview.t.games.length} games · {preview.t.teams.length} teams · {preview.t.days.length} days · {preview.t.divisions.length} divisions · {preview.t.pools.length} pools
              </span>
              {preview.problems.map((p) => (
                <span key={p.text} className="small err">
                  {p.text}
                </span>
              ))}
              <ol className="small preview-games">
                {preview.t.games.slice(0, 6).map((g) => (
                  <li key={g.id}>
                    {g.day.slice(0, 3)} {timeOf(g.start, preview.t.timeZone)} P{g.pitch.label} · {g.teams[0] ?? g.slots[0] ?? '?'} v {g.teams[1] ?? g.slots[1] ?? '?'}
                    {g.scores[0] !== undefined ? ` ${g.scores[0]}–${g.scores[1]}` : ''}
                  </li>
                ))}
              </ol>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
