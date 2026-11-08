import { useState } from 'react';
import { useT, type TCtx } from '../ctx';
import { SubPage } from '../Shell';
import { navigate, href, tHref } from '../router';
import { useOverlay } from '../overlay';
import { store } from '../../store/app';
import { adminCall, hasOwnReading } from '../../store/featured';
import { editWithUndo, featuredEntry, shareLink, copyOrShare } from '../mappingEdit';
import { buildIssues, checkKey, readingCounts, type Issue } from '../../mapping/issues';
import type { EngineLevel } from '../../model/types';
import { useOpenAi, addKey } from '../FixWithAi';
import { IChevronRight } from '../icons';
import { dateLabel } from '../fmt';
import { ReadingStatus, IssueList, FixOptions, type IssueItem } from '../components';
import type { ScreenProps } from './index';
import { RulesPage } from './Rules';
import { NamesPage } from './ReadingNames';
import { HistoryPage } from './ReadingHistory';
import '../styles/reading.css';

/** Reading: is the sheet read right, and if not, how to fix it (spec: Reading redesign brief). Sub-pages by `arg`. */
export function Reading({ arg }: ScreenProps) {
  const c = useT();
  if (arg === 'rules') return <RulesPage />;
  if (arg === 'names') return <NamesPage />;
  if (arg === 'history') return <HistoryPage />;
  return <ReadingPage key={c.id} />;
}

const listText = (xs: string[]) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/** How far predictions reach, in words: "Next opponents known for every game", "… not known yet in Uni Fans". */
export function predictText(levels: Record<string, EngineLevel>): string | undefined {
  const all = Object.entries(levels);
  if (!all.length) return undefined;
  const single = all.length === 1;
  const of = (l: EngineLevel) => all.filter(([, x]) => x === l).map(([d]) => d);
  const partial = of('partial');
  const basic = of('basic');
  if (!partial.length && !basic.length) return 'Next opponents known for every game';
  if (single) return basic.length ? 'Next opponents not known yet' : 'Next opponents known for most games';
  return [partial.length && `Next opponents known for most games in ${listText(partial)}`, basic.length && `${partial.length ? 'not' : 'Next opponents not'} known yet in ${listText(basic)}`].filter(Boolean).join('; ');
}

function useIssueActions(c: TCtx) {
  const overlay = useOverlay();
  const openAi = useOpenAi();
  const hasKey = Boolean(store.app.aiKey);
  const dismiss = (text: string) => {
    const before = c.settings.dismissed ?? [];
    store.update(c.id, { dismissed: [...before, checkKey(text)] });
    overlay.toast('Marked as right.', { label: 'Undo', run: () => store.update(c.id, { dismissed: before }) });
  };
  const right = (text: string) => (
    <button className="link-btn" onClick={() => dismiss(text)}>
      It’s right
    </button>
  );
  return (x: Issue): IssueItem => {
    const base = { key: x.key, bad: x.bad, text: x.text, sub: 'sub' in x ? x.sub : undefined };
    switch (x.kind) {
      case 'merge': {
        const { merge, keep } = x.merge;
        return {
          ...base,
          actions: (
            <>
              <button className="btn small primary" onClick={() => editWithUndo(c, overlay.toast, `Merged into “${keep}”.`, (y) => ({ ...y, corrections: { ...y.corrections, aliases: { ...y.corrections.aliases, [merge]: keep } } }))}>
                Merge
              </button>
              <button
                className="btn small"
                onClick={() => editWithUndo(c, overlay.toast, 'Kept as two teams.', (y) => ({ ...y, corrections: { ...y.corrections, rejectedMerges: [...(y.corrections.rejectedMerges ?? []), [keep, merge].sort().join('|')] } }))}
              >
                Not the same
              </button>
            </>
          ),
        };
      }
      case 'date': {
        const d = x.day;
        const set = (date: string) => editWithUndo(c, overlay.toast, `${d.name} is ${dateLabel(date)}.`, (y) => ({ ...y, corrections: { ...y.corrections, dates: { ...y.corrections.dates, [d.name]: date } } }));
        return {
          ...base,
          text: `${d.name}’s date was guessed: ${dateLabel(d.date)}`,
          actions: (
            <>
              <input type="date" defaultValue={d.date} aria-label={`${d.name}’s date`} onChange={(e) => e.target.value && set(e.target.value)} />
              <button className="link-btn" onClick={() => set(d.date)}>
                It’s right
              </button>
            </>
          ),
        };
      }
      case 'odd':
        return {
          ...base,
          actions: (
            <>
              <a className="btn small" href={tHref(c.id, 'review', `odd:${x.odd.text}`)}>
                {x.odd.refs.length === 1 ? 'See it' : x.odd.area === 'sheet' ? 'See where it’s read' : 'See them'}
              </a>
              {right(x.text)}
            </>
          ),
        };
      case 'problem':
        return {
          ...base,
          actions: (
            <>
              {hasKey ? (
                <button className="btn small violet-text" onClick={openAi}>
                  Fix with AI
                </button>
              ) : (
                <a className="btn small" href={tHref(c.id, 'manual')}>
                  Map it yourself
                </a>
              )}
              {right(x.text)}
            </>
          ),
        };
    }
  };
}

function ReadingPage() {
  const c = useT();
  const overlay = useOverlay();
  const openAi = useOpenAi();
  const t = c.t;
  const toItem = useIssueActions(c);
  const issues = buildIssues(t, c.p.mapping, c.p.problems, c.rt.workbook, c.settings.dismissed);
  const n = readingCounts(t);
  const noGames = n.games === 0;
  const bad = issues.filter((x) => x.bad).length;
  const predict = predictText(c.view.levels);
  const r = t.rules;
  const presetName = r.preset === 'uku' ? 'UKU' : r.preset === 'pointsDiff' ? 'Points & diff.' : 'Custom';
  const lens = [...new Set(t.timing.map((x) => x.gameMins))];
  const history = (c.settings.history?.length ?? 0) + (c.settings.proposal ? 1 : 0);
  const startOver = () => {
    const s = store.get(c.id);
    const before = { mapping: s?.mapping, format: s?.format };
    store.runtime(c.id).setMapping(undefined, undefined, 'Before starting over');
    overlay.toast('Read again automatically.', { label: 'Undo', run: () => store.runtime(c.id).setMapping(before.mapping, before.format) });
  };
  return (
    <SubPage title="Reading" sub={t.title} wide>
      <div className="rd-grid">
        <div className="rd-col">
          {noGames ? (
            <ReadingStatus tone="bad" title="Couldn’t find the games" detail={`We opened the sheet and found ${c.rt.workbook?.tabs.filter((x) => !x.hidden).length ?? 'its'} tabs, but none of them looks like a list or grid of games.`} />
          ) : (
            <ReadingStatus
              tone={issues.length ? 'warn' : 'ok'}
              title={issues.length ? `${issues.length} thing${issues.length === 1 ? '' : 's'} to check` : 'Looks right'}
              detail={issues.length > 3 ? `${bad} likely wrong · ${issues.length - bad} worth a look` : undefined}
              counts={[
                { label: 'games', value: n.games },
                { label: 'teams', value: n.teams },
                { label: n.divisions === 1 ? 'division' : 'divisions', value: n.divisions },
                { label: 'pool tables', value: n.pools },
                { label: n.days === 1 ? 'day' : 'days', value: n.days },
              ]}
              note={predict}
            />
          )}
          {!noGames && <IssueList items={issues.map(toItem)} />}
          {(noGames || issues.length > 0) && <FixOptions hasKey={Boolean(store.app.aiKey)} noGames={noGames} onAi={openAi} onMap={() => navigate(tHref(c.id, 'manual'))} onAddKey={addKey} />}
        </div>
        <div className="rd-col">
          {!noGames && (
            <section className="card glist">
              <NavRow href={tHref(c.id, 'review')} label="Browse what was read" value={`${n.games} games`} />
              <NavRow href={tHref(c.id, 'format')} label="How teams progress" sub={predict} />
              <NavRow href={tHref(c.id, 'settings', 'rules')} label="Points & tie-breaks" value={`${presetName} · ${r.points.win}·${r.points.draw}·${r.points.loss}`} />
              <NavRow href={tHref(c.id, 'settings', 'names')} label="Names, dates & times" value={[n.days && `${n.days} ${n.days === 1 ? 'day' : 'days'}`, lens.length === 1 && `${lens[0]}-min games`].filter(Boolean).join(' · ')} />
            </section>
          )}
          <section className="card glist">
            {!noGames && (
              <button className="grow-row" onClick={async () => copyOrShare(await shareLink(c), t.title, overlay.toast)}>
                <span className="grow-label">
                  Share link<small>{c.p.mapping.mode !== 'auto' ? 'With your fixes' : 'Opens this tournament'}</small>
                </span>
                <IChevronRight size={18} className="chev" />
              </button>
            )}
            {history > 0 && <NavRow href={tHref(c.id, 'settings', 'history')} label="History" sub="Earlier readings, to compare or go back to" value={String(history)} />}
          </section>
          <FeaturedReading />
          <FeaturedAdmin />
          <div className="rd-foot">
            {c.p.mapping.mode !== 'auto' && (
              <button className="link-btn" onClick={startOver}>
                Start over
              </button>
            )}
            <button
              className="link-btn danger-text"
              onClick={() => {
                const removed = store.remove(c.id);
                navigate(href({ name: 'home' }));
                overlay.toast('Removed from your list.', removed ? { label: 'Undo', run: () => store.restore(removed) } : undefined);
              }}
            >
              Remove from my tournaments
            </button>
          </div>
        </div>
      </div>
    </SubPage>
  );
}

function NavRow({ href: to, label, sub, value }: { href: string; label: string; sub?: string; value?: string }) {
  return (
    <a className="grow-row" href={to}>
      <span className="grow-label">
        {label}
        {sub && <small>{sub}</small>}
      </span>
      {value && <span className="grow-value">{value}</span>}
      <IChevronRight size={18} className="chev" />
    </a>
  );
}

/** Going back to the featured reading after changing this sheet's reading here. */
function FeaturedReading() {
  const c = useT();
  const overlay = useOverlay();
  const entry = store.featuredFor(c.id);
  const saved = store.get(c.id);
  if (!entry || !saved || !hasOwnReading(saved)) return null;
  return (
    <section className="card set-pad">
      <span className="small muted">This tournament is featured, with its own reading. You’ve changed yours here, so updates to the featured one don’t reach you.</span>
      <button
        className="btn"
        onClick={async () => {
          await store.takeFeatured(entry, true);
          overlay.toast('Using the featured reading.');
        }}
      >
        Use the featured reading
      </button>
    </section>
  );
}

/** Publish this tournament to everyone. Only there once the admin details are in App settings. */
function FeaturedAdmin() {
  const c = useT();
  const overlay = useOverlay();
  const [busy, setBusy] = useState(false);
  const { adminUrl: url, adminKey: key } = store.app;
  if (!url || !key) return null;
  const entry = store.featuredFor(c.id);
  const saved = store.get(c.id);
  const upToDate = entry && saved && !saved.ownReading && (saved.featuredM ?? '') === (entry.m ?? '');
  const run = async (work: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await work();
      overlay.toast(done);
    } catch (e) {
      overlay.toast(`Not saved. ${(e as Error).message}`);
    }
    setBusy(false);
  };
  const publish = () =>
    run(async () => {
      const next = await featuredEntry(c);
      await adminCall({ url, key }, { action: 'publish', entry: next });
      store.published(next);
    }, entry ? 'Featured tournament updated.' : 'Published to everyone.');
  const unpublish = () =>
    run(async () => {
      await adminCall({ url, key }, { action: 'remove', id: c.id });
      store.unpublished(c.id);
    }, 'Removed from featured.');
  return (
    <section className="card set-pad">
      <div className="card-title">
        <b>Featured</b>
        <span className={`tag sm ${!entry ? 'quiet' : upToDate ? 'final' : 'warn'}`}>{!entry ? 'Not featured' : upToDate ? 'Up to date' : 'Changes not published'}</span>
      </div>
      <span className="small muted">
        {entry ? 'Everyone sees this tournament on Home. Changes you make here stay private until you update it.' : 'Publish this tournament to show it on Home for everyone, with the reading you have here.'}
      </span>
      <div className="row-btns">
        <button className="btn primary" disabled={busy} onClick={publish}>
          {busy ? 'Saving…' : entry ? 'Update' : 'Publish'}
        </button>
        {entry && (
          <button className="btn danger-text" disabled={busy} onClick={unpublish}>
            Remove from featured
          </button>
        )}
      </div>
    </section>
  );
}
