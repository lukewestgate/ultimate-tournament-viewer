import { useT } from '../ctx';
import { Seg, Side } from '../parts';
import type { Hypo } from '../../engine/scenario';
import { withoutTag } from '../../extract/names';

const CAP = 25;

/** What-if controls for one game (spec §10.2). */
export function WhatIfControls({ id }: { id: string }) {
  const c = useT();
  const v = c.view.byId.get(id);
  if (!v || v.g.isBye) return null;
  const h = c.scenario[id];
  const real = v.result && !v.result.hypothetical;
  const [a, b] = v.sides;
  const nameA = withoutTag(a.team ?? a.label ?? 'Team 1');
  const nameB = withoutTag(b.team ?? b.label ?? 'Team 2');
  const set = (next: Hypo | undefined) => {
    const s = { ...c.scenario };
    if (next) s[id] = next;
    else delete s[id];
    c.setScenario(s);
  };
  if (real && !h?.override) {
    return (
      <div className="wi card pad stack">
        <span className="lbl">What-if</span>
        <span className="small muted">This game has a real result, which stays fixed.</span>
        <label className="toggle">
          <input type="checkbox" onChange={(e) => e.target.checked && set({ outcome: v.result!.outcome === 'A' ? 'B' : 'A', override: true })} />
          Override the real result
        </label>
      </div>
    );
  }
  const isPool = v.g.stage !== 'placement';
  const draws = isPool ? c.t.rules.drawsAllowed.pool : c.t.rules.drawsAllowed.placement;
  const outcome = h?.outcome ?? '';
  const sa = h?.sa;
  const sb = h?.sb;
  const setScore = (na: number, nb: number) => {
    const o = na > nb ? 'A' : nb > na ? 'B' : 'D';
    if (o === 'D' && !draws) return;
    set({ outcome: o, sa: na, sb: nb, override: h?.override });
  };
  return (
    <div className="wi card pad stack">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span className="lbl">What-if{h?.override ? ' · overriding the real result' : ''}</span>
        <span style={{ flex: 1 }} />
        {h && (
          <button className="btn small" onClick={() => set(undefined)}>
            Clear
          </button>
        )}
      </div>
      {isPool ? (
        <Seg
          label="Result"
          value={outcome}
          options={[
            { value: 'A', label: `${nameA} win` },
            ...(draws ? [{ value: 'D', label: 'Draw' }] : []),
            { value: 'B', label: `${nameB} win` },
          ]}
          onChange={(o) => set({ outcome: o as Hypo['outcome'], override: h?.override })}
        />
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          <span className="small muted">Tap a team to make it the winner.</span>
          {([0, 1] as const).map((i) => {
            const on = (i === 0 && outcome === 'A') || (i === 1 && outcome === 'B');
            return (
              <button key={i} className={`wi-team${on ? ' on' : ''}`} aria-pressed={on} onClick={() => set({ outcome: i === 0 ? 'A' : 'B', override: h?.override })}>
                <Side side={v.sides[i]} division={v.g.division} plain />
                {on && <span className="tag if">IF W</span>}
              </button>
            );
          })}
        </div>
      )}
      <div className="stack" style={{ gap: 6 }}>
        <span className="small muted">Exact score {isPool ? '(matters for difference and points-scored tie-breaks)' : '(optional; shown in the bracket)'}</span>
        <div className="steppers">
          <Stepper label={nameA} value={sa} onChange={(n) => setScore(n, sb ?? 0)} />
          <span className="muted">–</span>
          <Stepper label={nameB} value={sb} onChange={(n) => setScore(sa ?? 0, n)} />
        </div>
        {h && sa === undefined && <span className="small muted">Result only: tie-breaks that need scores show “depends on scores”.</span>}
      </div>
      {real && (
        <label className="toggle">
          <input type="checkbox" checked={Boolean(h?.override)} onChange={(e) => !e.target.checked && set(undefined)} />
          Override the real result
        </label>
      )}
    </div>
  );
}

function Stepper({ label, value, onChange }: { label: string; value?: number; onChange: (n: number) => void }) {
  const v = value ?? 0;
  return (
    <div className="stepper" role="group" aria-label={`${label} score`}>
      <button className="ib" aria-label={`${label} minus`} onClick={() => onChange(Math.max(0, v - 1))}>
        −
      </button>
      <input
        className="d"
        inputMode="numeric"
        value={value ?? ''}
        placeholder="–"
        aria-label={`${label} score`}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ''));
          if (!Number.isNaN(n)) onChange(Math.min(CAP, n));
        }}
      />
      <button className="ib" aria-label={`${label} plus`} onClick={() => onChange(Math.min(CAP, v + 1))}>
        +
      </button>
    </div>
  );
}
