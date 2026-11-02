import { useT } from '../ctx';
import { Seg, Side } from '../parts';
import type { Hypo } from '../../engine/scenario';
import { withoutTag } from '../../extract/names';

const CAP = 25;

/** What-if controls for one game (spec §10.2; SpecGame #3, SpecComponents). */
export function WhatIfControls({ id, sheet }: { id: string; sheet?: boolean }) {
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
  const overrideToggle = (on: boolean) => (
    <label className="switch-row">
      <input
        className="switch"
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(e) => (e.target.checked ? set({ outcome: v.result!.outcome === 'A' ? 'B' : 'A', override: true }) : set(undefined))}
      />
      <span>Override the real result {on ? '(on)' : '(off)'}</span>
    </label>
  );
  if (real && !h?.override) {
    return (
      <div className={`wic${sheet ? ' in-sheet' : ' card pad'}`}>
        <span className="small muted">This game has a real result, which stays fixed.</span>
        {overrideToggle(false)}
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
    if (o === 'D' && !draws) {
      set({ outcome: h?.outcome ?? 'A', sa: na, sb: nb, override: h?.override });
      return;
    }
    set({ outcome: o, sa: na, sb: nb, override: h?.override });
  };
  return (
    <div className={`wic${sheet ? ' in-sheet' : ' card pad'}`}>
      {!sheet && (
        <div className="wic-head">
          <span className="lbl">What-if{h?.override ? ' · overriding the real result' : ''}</span>
          <span style={{ flex: 1 }} />
          {h && (
            <button className="btn small" onClick={() => set(undefined)}>
              Clear
            </button>
          )}
        </div>
      )}
      {isPool && (
        <Seg
          label="Result"
          className="violet"
          value={outcome}
          options={[
            { value: 'A', label: `${nameA} win` },
            ...(draws ? [{ value: 'D', label: 'Draw' }] : []),
            { value: 'B', label: `${nameB} win` },
          ]}
          onChange={(o) => set({ outcome: o as Hypo['outcome'], override: h?.override })}
        />
      )}
      {!isPool && <span className="small muted">Tap a team to make it the winner.</span>}
      <div className={`wic-teams${isPool ? '' : ' bracket'}`}>
        {([0, 1] as const).map((i) => {
          const won = (i === 0 && outcome === 'A') || (i === 1 && outcome === 'B');
          const name = <Side side={v.sides[i]} division={v.g.division} bold={won} />;
          return (
            <div key={i} className={`wic-team${won ? ' on' : ''}`}>
              {isPool ? (
                <span className="wic-name">{name}</span>
              ) : (
                <button className="wic-name" aria-pressed={won} onClick={() => set({ outcome: i === 0 ? 'A' : 'B', sa, sb, override: h?.override })}>
                  {name}
                  {won && <span className="tag if sm">IF W</span>}
                </button>
              )}
              <Stepper label={i === 0 ? nameA : nameB} value={i === 0 ? sa : sb} onChange={(n) => (i === 0 ? setScore(n, sb ?? 0) : setScore(sa ?? 0, n))} />
            </div>
          );
        })}
      </div>
      <span className="small muted">
        {isPool ? 'Score is optional. Without one, tie-breaks that need scores show “depends on scores”.' : 'Score is optional; it’s shown in the bracket.'}
      </span>
      {real && overrideToggle(true)}
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
