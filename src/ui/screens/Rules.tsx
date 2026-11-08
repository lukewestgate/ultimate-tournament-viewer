import { useT } from '../ctx';
import { Seg } from '../parts';
import { SubPage } from '../Shell';
import { tHref } from '../router';
import { useOverlay } from '../overlay';
import { editMapping, editWithUndo } from '../mappingEdit';
import { pointsDiffPreset, ukuPreset, TIEBREAK_LABEL, ALL_TIEBREAKS, UNCOMPUTABLE } from '../../engine/rulesPresets';
import type { Rules } from '../../model/types';
import { IChevronDown, IClose } from '../icons';
import { Stepper } from '../components';

const SOURCE = { preset: 'Preset', sheet: 'From the sheet', ai: 'From AI', user: 'Set by you' };

/** Points & tie-breaks. Every change applies at once and becomes “Set by you”. */
export function RulesPage() {
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
  return (
    <SubPage title="Points & tie-breaks" sub={c.t.title} back={tHref(c.id, 'settings')}>
      <p className="set-note">
        <span className="tag quiet sm">{SOURCE[r.source]}</span> Changes here become “Set by you”.
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
            <Stepper
              label={`${k} points`}
              value={r.points[k]}
              onMinus={() => set({ ...r, points: { ...r.points, [k]: Math.max(0, r.points[k] - 1) }, preset: 'custom' })}
              onPlus={() => set({ ...r, points: { ...r.points, [k]: Math.min(10, r.points[k] + 1) }, preset: 'custom' })}
            />
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
          <div key={tb} className="tb-row">
            <b className="tb-n">{i + 1}</b>
            <span className="tb-label">{TIEBREAK_LABEL[tb]}</span>
            {UNCOMPUTABLE.includes(tb) && <span className="tag outline sm dashed">at the field</span>}
            <button className="ib" aria-label={`Move ${TIEBREAK_LABEL[tb]} up`} disabled={i === 0} onClick={() => move(i, -1)}>
              <IChevronDown size={20} className="rot180" />
            </button>
            <button className="ib" aria-label={`Move ${TIEBREAK_LABEL[tb]} down`} disabled={i === r.tiebreaks.length - 1} onClick={() => move(i, 1)}>
              <IChevronDown size={20} />
            </button>
            <button
              className="ib"
              aria-label={`Remove ${TIEBREAK_LABEL[tb]}`}
              onClick={() => editWithUndo(c, overlay.toast, `Removed “${TIEBREAK_LABEL[tb]}”.`, (x) => ({ ...x, rules: { ...r, tiebreaks: r.tiebreaks.filter((y) => y !== tb), preset: 'custom', source: 'user' } }))}
            >
              <IClose size={18} />
            </button>
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
      <button className="btn" onClick={() => editWithUndo(c, overlay.toast, 'Read again from the sheet.', (x) => ({ ...x, rules: undefined }))}>
        Read again from the sheet
      </button>
    </SubPage>
  );
}
