import { useState } from 'react';
import { setFakeNow, useT, fakeOffset } from '../ctx';
import { SubPage } from '../Shell';
import { useOverlay } from '../overlay';
import { width } from '../../sheets/workbook';
import { validateFormat } from '../../format/validate';
import { IChevronRight, ICopy } from '../icons';
import type { ScreenProps } from './index';

/** Diagnostics (spec §9.15; SpecSettings #4): quiet, for the curious and for testing. */
export function Diagnostics(_: ScreenProps) {
  const c = useT();
  const overlay = useOverlay();
  const wb = c.rt.workbook;
  const raw = JSON.stringify({ mapping: c.p.mapping, format: c.p.format }, null, 2);
  const formatErrors = validateFormat(c.t, c.p.format);
  const [fake, setFake] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const disagreements = [...c.view.standings.values()].map((s) => s.disagreement).filter(Boolean) as string[];
  const mismatches = c.view.mismatches.filter((m) => !disagreements.includes(m));
  const warnings = [...c.t.warnings, ...c.p.problems.map((p) => p.text)];
  const fetchErrors = c.rt.fetchLog.filter((f) => !f.ok).length;
  const notes: { tag: string; kind: string; text: string }[] = [
    ...formatErrors.map((text) => ({ tag: 'Format', kind: 'warn', text })),
    ...mismatches.map((text) => ({ tag: 'Mismatch', kind: 'warn', text })),
    ...disagreements.map((text) => ({ tag: 'Rank', kind: 'quiet', text: `${text} The sheet’s order is shown.` })),
    ...warnings.map((text) => ({ tag: 'Warning', kind: 'quiet', text })),
  ];
  const copy = async (text: string, msg: string) => {
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    overlay.toast(msg);
  };
  return (
    <SubPage title="Diagnostics" sub={c.t.title}>
      <div className="diag-stats">
        <div className="card stat">
          <b className={`d${fetchErrors ? ' bad' : ''}`}>{fetchErrors}</b>
          <span>fetch errors</span>
        </div>
        <div className="card stat">
          <b className={`d${mismatches.length + formatErrors.length ? ' warn' : ''}`}>{mismatches.length + formatErrors.length}</b>
          <span>mismatches</span>
        </div>
        <div className="card stat">
          <b className="d">{warnings.length + disagreements.length}</b>
          <span>warnings</span>
        </div>
      </div>

      <span className="lbl-head">Tabs</span>
      <section className="card table-scroll">
        <table className="cmp diag-tabs">
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
                  <b>{t.name}</b>
                  {t.hidden ? <span className="muted"> · hidden</span> : ''}
                </td>
                <td className="mono">{t.gid ?? '–'}</td>
                <td className="d">
                  {t.rows.length}×{width(t)}
                </td>
                <td className="small muted">{c.p.hints[t.name] ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <span className="lbl-head">Notes</span>
      <section className="card set-list">
        {notes.length === 0 && <div className="set-row muted">Nothing to report; predictions agree with the sheet so far.</div>}
        {notes.map((n) => (
          <div key={n.tag + n.text} className="set-row note-row">
            <span className={`tag sm ${n.kind}`}>{n.tag}</span>
            <span className="small">{n.text}</span>
          </div>
        ))}
      </section>

      <span className="lbl-head">Fetches</span>
      <section className="card set-list">
        {c.rt.fetchLog.length === 0 && <div className="set-row small muted">No fetches yet (showing cached data).</div>}
        {c.rt.fetchLog.slice(-8).map((f, i) => (
          <div key={i} className="set-row small">
            <span className={f.ok ? '' : 'err'}>
              <span className="d">{new Date(f.at).toLocaleTimeString('en-GB')}</span> · {f.kind} · {f.ok ? 'ok' : `failed: ${f.error}`}
            </span>
            {f.bytes ? <span className="d muted">{(f.bytes / 1024).toFixed(0)} KB</span> : null}
          </div>
        ))}
      </section>

      <span className="lbl-head">Testing</span>
      <section className="card set-list">
        <button className="set-row nav" onClick={() => c.setReplayAt(Math.min(...c.t.games.filter((g) => !g.unscheduled).map((g) => g.start)))}>
          <span>Replay from the start</span>
          <IChevronRight size={18} />
        </button>
        <label className="set-row">
          <span className="set-label">
            Simulate future results
            <small>Marked SIM everywhere</small>
          </span>
          <input type="checkbox" role="switch" className="switch" checked={c.simulate} onChange={(e) => c.setSimulate(e.target.checked)} />
        </label>
        <div className="set-row">
          <span className="set-label">
            Fake the clock
            <small>Scores stay visible</small>
          </span>
          <input className="field mini-select" type="datetime-local" value={fake} onChange={(e) => setFake(e.target.value)} aria-label="Fake time" />
          {fakeOffset() !== 0 ? (
            <button className="link" onClick={() => setFakeNow(undefined)}>
              Real
            </button>
          ) : (
            <button className="link" disabled={!fake} onClick={() => setFakeNow(new Date(fake).getTime())}>
              Set
            </button>
          )}
        </div>
        <button className="set-row nav" onClick={() => copy(location.href, 'Link copied (includes replay time and what-if).')}>
          <span>Copy testing link</span>
          <ICopy size={16} />
        </button>
      </section>

      <section className="card set-pad">
        <div className="card-title">
          <b>Raw reading settings</b>
          <button className="btn small" onClick={() => copy(raw, 'Copied.')}>
            Copy
          </button>
        </div>
        <pre className={`raw${showRaw ? '' : ' short'}`} onClick={() => setShowRaw(true)}>
          {raw}
        </pre>
        {!showRaw && (
          <button className="link" onClick={() => setShowRaw(true)}>
            Show all
          </button>
        )}
      </section>
    </SubPage>
  );
}
