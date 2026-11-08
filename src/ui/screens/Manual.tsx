import { useMemo, useState, type ReactNode } from 'react';
import { useT } from '../ctx';
import { useOverlay } from '../overlay';
import { Empty, Seg } from '../parts';
import { goUp, tHref } from '../router';
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
import { useOpenAi } from '../FixWithAi';
import { timeOf } from '../fmt';
import type { ScreenProps } from './index';
import { readingCounts } from '../../mapping/issues';
import { StepTabs, TapList, SheetGrid, LiveBar, type StepState } from '../components';
import { IChevronDown, IClose } from '../icons';
import '../styles/reading.css';

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

  const rows = Math.min(MAX_ROWS, tab?.rows.length ?? 0);
  const cols = Math.min(MAX_COLS, tab ? width(tab) : 0);
  const inUse = (name: string) => draft.games.some((g) => g.tab === name) || draft.pools.some((p) => p.tab === name) || draft.seeding.some((s) => s.tab === name) || draft.info.includes(name);
  const pickTab = (name: string) => {
    setTabName(name);
    setPoolHeader(undefined);
    setSeedStep({});
  };
  const save = () => {
    const s = store.get(c.id);
    const before = { mapping: s?.mapping, format: s?.format };
    store.runtime(c.id).setMapping({ ...draft, mode: 'manual' }, undefined, 'Before your mapping');
    overlay.toast('Saved. The reading before is in History.', { label: 'Undo', run: () => store.runtime(c.id).setMapping(before.mapping, before.format) });
    goUp(tHref(c.id, 'settings'), tHref(c.id, 'settings'));
  };
  const has = (r: string) => [...roles.cols.values()].includes(r);
  const gridSrc = draft.games.some((g) => g.kind === 'grid' && g.tab === tabName);
  const poolOnTab = draft.pools.some((x) => x.tab === tabName);
  const seedOnTab = draft.seeding.some((x) => x.tab === tabName);
  // Each tap is done, the one to do now, or still to come.
  const seq = (items: [ReactNode, boolean][]) => items.map(([text, done], i) => ({ text, state: (done ? 'done' : items.slice(0, i).every(([, d]) => d) ? 'now' : 'todo') as 'done' | 'now' | 'todo' }));
  const tabPick: [ReactNode, boolean] = [
    <>
      Pick the tab
      <select className="pick-select man-tab-pick" value={tabName} onChange={(e) => pickTab(e.target.value)} aria-label="Tab">
        {[...visible, ...hidden].map((t) => (
          <option key={t.name} value={t.name}>
            {t.name}
            {t.hidden ? ' (hidden)' : ''}
            {c.p.hints[t.name] ? ` · looks like ${c.p.hints[t.name].toLowerCase()}` : ''}
            {inUse(t.name) ? ' · in use' : ''}
          </option>
        ))}
      </select>
    </>,
    true,
  ];
  const taps: Record<Target, [ReactNode, boolean][]> = {
    list: [tabPick, ['Tap the header row of the game list', Boolean(listSrc)], ['Tap the Time column, then each team column', has('time') && has('team1') && has('team2')], ['Tap the other columns: day, pitch, scores (optional)', has('day') || has('pitch') || has('score1')]],
    grid: [tabPick, ['Tap a “v” between two teams in one pitch block', gridSrc], ['Tap that block’s cells to label them: teams, scores, time', gridSrc && roles.cols.size > 0]],
    pool: [tabPick, ['Tap the header row of a pool table', poolHeader !== undefined || poolOnTab], ['Tap the team column, then each stat column (W, L, Pts…)', poolOnTab], ['Tap another table’s header row to add it (optional)', draft.pools.filter((x) => x.tab === tabName).length > 1]],
    seeding: [tabPick, ['Tap the first seed number', Boolean(seedStep.first) || seedOnTab], ['Tap the last seed number', seedStep.last !== undefined || seedOnTab], ['Tap a cell in the team column', seedOnTab]],
    info: [['Tick each tab that holds rules or format text', draft.info.length > 0]],
  };
  type Step = 'games' | 'pool' | 'seeding' | 'info';
  const step: Step = target === 'list' || target === 'grid' ? 'games' : target;
  const steps: { key: Step; label: string; state: StepState }[] = [
    { key: 'games', label: 'Games', state: draft.games.length ? 'done' : 'warn' },
    { key: 'pool', label: 'Pool tables', state: draft.pools.length ? 'done' : 'todo' },
    { key: 'seeding', label: 'Seeding', state: draft.seeding.length ? 'done' : 'todo' },
    { key: 'info', label: 'Rules text', state: draft.info.length ? 'done' : 'todo' },
  ];
  const pickStep = (k: Step) => {
    const next: Target = k === 'games' ? ((draft.games.find((g) => g.tab === tabName)?.kind ?? 'list') as Target) : k;
    setTarget(next);
    setPoolHeader(undefined);
    setSeedStep({});
  };
  const counts = preview && 't' in preview && preview.t ? readingCounts(preview.t) : undefined;
  return (
    <SubPage
      title="Map it yourself"
      sub={c.t.title}
      back={tHref(c.id, 'settings')}
      wide
      action={
        <button className="btn small primary" onClick={save}>
          Save
        </button>
      }
    >
      <StepTabs label="What to map" steps={steps} current={step} onPick={pickStep} />
      {step === 'games' && <Seg<Target> label="How the games are laid out" value={target} options={[{ value: 'list', label: 'A list, one game per row' }, { value: 'grid', label: 'A grid of times × pitches' }]} onChange={(v) => (setTarget(v), setPoolHeader(undefined))} />}
      {target === 'info' ? (
        <section className="card set-list man-tabs">
          <div className="pad">
            <TapList items={seq(taps.info)} />
          </div>
          {visible.map((t) => (
            <label key={t.name} className="set-row man-tab">
              <input type="checkbox" checked={draft.info.includes(t.name)} onChange={(e) => setDraft({ ...draft, info: e.target.checked ? [...draft.info, t.name] : draft.info.filter((x) => x !== t.name) })} />
              <span className="set-label">
                <b>{t.name}</b>
                {c.p.hints[t.name] && <small>Looks like: {c.p.hints[t.name].toLowerCase()}</small>}
              </span>
            </label>
          ))}
        </section>
      ) : (
        <section className="card man-sheet">
          <div className="pad">
            <TapList items={seq(taps[target])} />
          </div>
          {tab && (
            <SheetGrid
              label={`Preview of ${tabName}`}
              rows={rows}
              cols={cols}
              text={(r, ci) => cell(tab, r, ci)}
              col={(ci) => {
                const role = roles.cols.get(ci);
                return { name: colName(ci), role: role ? (ROLE_LABEL[role] ?? role) : undefined, color: role ? (ROLE_COLOR[role] ?? 'var(--ink3)') : undefined };
              }}
              isHeader={(r) => roles.header === r || poolHeader === r}
              tint={(_, ci) => {
                const role = roles.cols.get(ci);
                return role ? (ROLE_COLOR[role] ?? '#5F6774') : undefined;
              }}
              selected={(r, ci) => (seedStep.first?.r === r && seedStep.first?.c === ci) || (seedStep.last === r && seedStep.first?.c === ci)}
              onCell={onCell}
              onRow={(r) => (target === 'pool' ? setPoolHeader(r) : target === 'list' ? setDraft(setListHeader(draft, tabName, r)) : undefined)}
              rowLabel={(r) => `Use row ${r + 1} as the header`}
            />
          )}
        </section>
      )}

      {step === 'games' && (
        <>
          <span className="lbl-head">Where games are read from</span>
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
                    <IChevronDown size={20} className="rot180" />
                  </button>
                  <button className="ib" aria-label="Move down" disabled={i === draft.games.length - 1} onClick={() => setDraft(moveSource(draft, i, 1))}>
                    <IChevronDown size={20} />
                  </button>
                  <button className="ib" aria-label="Remove source" onClick={() => setDraft(removeSource(draft, i))}>
                    <IClose size={18} />
                  </button>
                </span>
              </div>
            ))}
            {!draft.games.length && <div className="set-row muted small">None yet. Follow the steps above.</div>}
          </section>
          {draft.games.length > 1 && <span className="small muted">If two sources list a game at the same time and pitch, the higher one wins.</span>}
        </>
      )}
      {step === 'pool' && draft.pools.length > 0 && (
        <>
          <span className="lbl-head">Pool tables read</span>
          <section className="card set-list">
            {draft.pools.map((x, i) => (
              <div key={i} className="set-row">
                <input className="field mini-field" value={x.name} aria-label="Pool name" onChange={(e) => setDraft({ ...draft, pools: draft.pools.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) })} />
                <span className="small muted">
                  {x.tab} rows {x.headerRow + 1}–{x.lastRow + 1}
                </span>
                <button className="ib" aria-label="Remove pool" onClick={() => setDraft(removePool(draft, i))}>
                  <IClose size={18} />
                </button>
              </div>
            ))}
          </section>
        </>
      )}
      {step === 'seeding' && draft.seeding.length > 0 && (
        <>
          <span className="lbl-head">Seeding read</span>
          <section className="card set-list">
            {draft.seeding.map((x, i) => (
              <div key={i} className="set-row">
                <span>
                  {x.label ?? 'Seeds'} · {x.tab} rows {x.firstRow + 1}–{x.lastRow + 1}
                </span>
                <button className="ib" aria-label="Remove seeding" onClick={() => setDraft({ ...draft, seeding: draft.seeding.filter((_, j) => j !== i) })}>
                  <IClose size={18} />
                </button>
              </div>
            ))}
          </section>
        </>
      )}

      {preview && 'error' in preview && <p className="err small">{preview.error}</p>}
      {counts && preview && 't' in preview && preview.t && preview.t.games.length > 0 && (
        <details className="card man-first">
          <summary className="set-row nav">
            <span>First games read</span>
          </summary>
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
        </details>
      )}
      <p className="small muted man-foot">
        {store.app.aiKey && (
          <>
            Stuck?{' '}
            <button className="link-btn violet-text" onClick={openAi}>
              Fix with AI
            </button>{' '}
            can do this for you. ·{' '}
          </>
        )}
        <button className="link-btn" onClick={() => setDraft(detectMapping(wb).mapping)}>
          Start over from what was found automatically
        </button>
      </p>

      <LiveBar
        action={
          <button className="btn small" onClick={save}>
            Save
          </button>
        }
      >
        {counts ? (
          <>
            Read so far: <b>{counts.games}</b> games · <b>{counts.teams}</b> teams · <b>{counts.pools}</b> pool tables
            {preview && 'problems' in preview && preview.problems && preview.problems.length > 0 && ` · ${preview.problems.length} likely wrong`}
          </>
        ) : (
          'Nothing read yet'
        )}
      </LiveBar>
    </SubPage>
  );
}
