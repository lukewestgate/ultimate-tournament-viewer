import { useT } from './ctx';
import { useOverlay } from './overlay';
import { navigate, tHref } from './router';
import { store } from '../store/app';
import { processWorkbook } from '../store/pipeline';
import { aiSetup } from '../mapping/ai';
import { readingCounts } from '../mapping/issues';
import type { Rules } from '../model/types';
import { AiSteps, AiTask, UsageLine } from './AiTask';
import { ChangeList, type ChangeItem } from './components';

const points = (r?: Rules) => (r ? `${r.points.win} · ${r.points.draw} · ${r.points.loss}` : '–');

/** Fix with AI: runs the AI mapper, then the rules and format jobs, and lists what would change. Never applies silently. */
export function FixWithAiRun() {
  const c = useT();
  const overlay = useOverlay();
  return (
    <AiTask
      typical="Usually 1–3 minutes: the AI looks around the sheet and tests its reading before answering."
      slowAfter={240_000}
      run={({ call, onProgress }) => {
        const wb = c.rt.workbook;
        if (!wb) return Promise.resolve({ before: { games: 0, withTeams: 0, teams: 0, days: 0, divisions: 0, pools: 0, problems: [], aliases: 0 }, better: false, usage: { promptTokens: 0, completionTokens: 0, cost: 0 }, attempts: 0, steps: [], rulesFromAi: false, error: 'The sheet isn’t loaded yet. Wait for it to open, then try again.', errorKind: 'reply' as const });
        return aiSetup({ wb, current: c.p.mapping, format: c.p.format, id: c.id, title: c.t.title, call, onProgress });
      }}
      done={(p, { ms }) => {
        const wb = c.rt.workbook;
        // Counted the same way as everywhere else, so the numbers match the Reading page.
        const now = readingCounts(c.t);
        const next = p.mapping && wb ? processWorkbook(c.id, wb, { mapping: p.mapping, format: p.format }) : undefined;
        const after = next ? readingCounts(next.tournament) : undefined;
        const items: ChangeItem[] = [];
        if (after) {
          const LABEL: [keyof typeof now, string][] = [['games', 'Games'], ['teams', 'Teams'], ['divisions', 'Divisions'], ['pools', 'Pool tables'], ['days', 'Days']];
          for (const [k, label] of LABEL) if (after[k] !== now[k]) items.push({ kind: after[k] > now[k] ? 'add' : 'remove', text: `${label}: ${now[k]} → ${after[k]}` });
        }
        if (p.after && p.after.aliases !== p.before.aliases) items.push({ kind: 'fix', text: `Merged team names: ${p.before.aliases} → ${p.after.aliases}` });
        if (p.after && p.after.problems.length !== p.before.problems.length)
          items.push({ kind: p.after.problems.length < p.before.problems.length ? 'fix' : 'remove', text: `Likely-wrong problems: ${p.before.problems.length} → ${p.after.problems.length}` });
        if (p.rulesFromAi) items.push({ kind: 'fix', text: `Points read from the sheet’s rules: ${points(p.mapping?.rules)}`, sub: `Was ${points(c.t.rules)}` });
        if (p.slots?.filled) items.push({ kind: 'add', text: `Worked out ${p.slots.filled} of ${p.slots.asked} unknown next-opponent slots`, sub: 'Marked “from AI” in How teams progress until the sheet confirms them' });
        const verdict = !items.length ? ['quiet', 'Same as the current reading'] : p.better || p.rulesFromAi || p.slots?.filled ? ['win', 'Better than the current reading'] : ['warn', 'Not better than the current reading'];
        const left = p.after?.problems ?? [];
        return (
          <div className="stack">
            {p.stopped && <p className="ai-retry small">{p.stopped === 'cancelled' ? 'Stopped early. This is the best reading the AI had tried so far.' : 'The AI couldn’t finish, but here’s the best reading it had tried.'}</p>}
            <span className={`tag ${verdict[0]}`} style={{ alignSelf: 'flex-start' }}>
              {verdict[1]}
            </span>
            <ChangeList items={items} empty="The AI read the sheet the same way." />
            {left.length > 0 && (
              <p className="note">
                {left.length > 2 ? `${left.length} likely-wrong problems would still be left. They’ll stay on the Reading page.` : `Still likely wrong: ${left.join('; ')}.`}
              </p>
            )}
            {(p.steps.length > 0 || p.mapping?.notes?.length) && (
              <details className="small">
                <summary>What the AI did</summary>
                {p.steps.length > 0 && <AiSteps steps={p.steps} />}
                {p.mapping?.notes?.length ? (
                  <ul className="small">
                    {p.mapping.notes.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                ) : null}
              </details>
            )}
            <UsageLine usage={p.usage} ms={ms} />
            <div className="row-btns">
              <button className="btn" onClick={() => overlay.closeSheet()}>
                Discard
              </button>
              {p.mapping && (
                <button
                  className="btn"
                  onClick={() => {
                    // Kept until used or discarded, so it can be checked game by game against the current reading.
                    store.update(c.id, { proposal: { at: Date.now(), label: 'AI suggestion', mapping: p.mapping, format: p.format } });
                    overlay.closeSheet();
                    navigate(tHref(c.id, 'review', 'proposal'));
                  }}
                >
                  Compare in detail
                </button>
              )}
              <button
                className="btn primary"
                disabled={!p.mapping}
                onClick={() => {
                  store.runtime(c.id).setMapping(p.mapping, p.format, 'Before AI changes');
                  store.update(c.id, { proposal: undefined });
                  overlay.closeSheet();
                  overlay.toast('Using the AI’s reading. The one before is in History.');
                }}
              >
                Use
              </button>
            </div>
          </div>
        );
      }}
    />
  );
}
