import { useState } from 'react';
import { setFakeNow, useT, fakeOffset } from '../ctx';
import { Section } from '../parts';
import { useOverlay } from '../overlay';
import { width } from '../../sheets/workbook';
import { validateFormat } from '../../format/validate';
import { ICopy } from '../icons';
import type { ScreenProps } from './index';

/** Diagnostics (spec §9.15): for the curious and for testing. */
export function Diagnostics(_: ScreenProps) {
  const c = useT();
  const overlay = useOverlay();
  const wb = c.rt.workbook;
  const raw = JSON.stringify({ mapping: c.p.mapping, format: c.p.format }, null, 2);
  const formatErrors = validateFormat(c.t, c.p.format);
  const [fake, setFake] = useState('');
  const disagreements = [...c.view.standings.values()].map((s) => s.disagreement).filter(Boolean) as string[];
  const mismatches = c.view.mismatches.filter((m) => !disagreements.includes(m));
  return (
    <div className="diag">
      <h1 style={{ fontSize: 24 }}>Diagnostics</h1>
      <Section title="Tabs">
        <div className="card table-scroll">
          <table className="cmp">
            <thead>
              <tr>
                <th>Tab</th>
                <th>gid</th>
                <th>Size</th>
                <th>Used for</th>
              </tr>
            </thead>
            <tbody>
              {wb?.tabs.map((t) => (
                <tr key={t.name} className={t.hidden ? 'muted' : ''}>
                  <td>
                    {t.name}
                    {t.hidden ? ' (hidden)' : ''}
                  </td>
                  <td>{t.gid ?? '–'}</td>
                  <td>
                    {t.rows.length}×{width(t)}
                  </td>
                  <td className="small">{c.p.hints[t.name] ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Fetches">
        <div className="card pad small stack">
          {c.rt.fetchLog.length === 0 && <span className="muted">No fetches yet (showing cached data).</span>}
          {c.rt.fetchLog.map((f, i) => (
            <span key={i} className={f.ok ? '' : 'err'}>
              {new Date(f.at).toLocaleTimeString('en-GB')} · {f.kind} · {f.ok ? 'ok' : `failed: ${f.error}`}
              {f.bytes ? ` · ${(f.bytes / 1024).toFixed(0)} KB` : ''}
            </span>
          ))}
        </div>
      </Section>
      <Section title="Reading warnings">
        <div className="card pad small stack">
          {[...c.t.warnings, ...c.p.problems.map((p) => p.text)].map((w) => (
            <span key={w}>{w}</span>
          ))}
          {!c.t.warnings.length && !c.p.problems.length && <span className="muted">None.</span>}
        </div>
      </Section>
      <Section title="Format checks">
        <div className="card pad small stack">
          {formatErrors.map((e) => (
            <span key={e} className="err">
              {e}
            </span>
          ))}
          {mismatches.map((m) => (
            <span key={m}>{m}</span>
          ))}
          {!formatErrors.length && !mismatches.length && <span className="muted">No problems; predictions agree with the sheet so far.</span>}
        </div>
      </Section>
      <Section title="Sheet rank vs computed rank">
        <div className="card pad small stack">
          {disagreements.map((d) => (
            <span key={d}>{d}</span>
          ))}
          {!disagreements.length && <span className="muted">No disagreements.</span>}
          {disagreements.length > 0 && <span className="muted">The sheet’s order is shown. A disagreement may mean the tie-break rules are set differently.</span>}
        </div>
      </Section>
      <Section title="Testing">
        <div className="card pad stack">
          <div className="row-btns">
            <button className="btn" onClick={() => c.setReplayAt(Math.min(...c.t.games.filter((g) => !g.unscheduled).map((g) => g.start)))}>
              Replay from the start
            </button>
            <button
              className="btn"
              onClick={async () => {
                await navigator.clipboard?.writeText(location.href).catch(() => undefined);
                overlay.toast('Link copied (includes replay time and what-if).');
              }}
            >
              Copy testing link
            </button>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={c.simulate} onChange={(e) => c.setSimulate(e.target.checked)} />
            Simulate future results (marked SIM)
          </label>
          <label className="fieldset">
            Fake the clock (scores stay visible)
            <div className="row-btns">
              <input className="field" type="datetime-local" value={fake} onChange={(e) => setFake(e.target.value)} style={{ maxWidth: 260 }} />
              <button className="btn" disabled={!fake} onClick={() => setFakeNow(new Date(fake).getTime())}>
                Set
              </button>
              {fakeOffset() !== 0 && (
                <button className="btn" onClick={() => setFakeNow(undefined)}>
                  Real clock
                </button>
              )}
            </div>
          </label>
        </div>
      </Section>
      <Section
        title="Mapping (raw)"
        right={
          <button className="btn small" onClick={async () => (await navigator.clipboard?.writeText(raw).catch(() => undefined), overlay.toast('Copied.'))}>
            <ICopy size={16} /> Copy
          </button>
        }
      >
        <pre className="raw">{raw}</pre>
      </Section>
    </div>
  );
}
