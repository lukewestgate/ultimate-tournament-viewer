import { useEffect, useState } from 'react';
import { useStore } from '../../store/app';
import { idbDel, idbUsage } from '../../store/db';
import { DEFAULT_MODEL, testKey, type KeyCheck } from '../../mapping/ai';
import { adminCall } from '../../store/featured';
import { ICheck } from '../icons';
import { Seg } from '../parts';
import { SubPage } from '../Shell';
import type { Theme } from '../../store/settings';
import { useOverlay } from '../overlay';

const kb = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** App settings (spec §9.14; SpecSettings #3). */
export function AppSettings() {
  const s = useStore();
  const overlay = useOverlay();
  const [key, setKey] = useState(s.app.aiKey ?? '');
  const [editKey, setEditKey] = useState(!s.app.aiKey);
  const [model, setModel] = useState(s.app.aiModel ?? '');
  const [test, setTest] = useState<KeyCheck | 'testing' | undefined>();
  const [testMs, setTestMs] = useState(0);
  const [usage, setUsage] = useState<{ key: string; bytes: number }[]>([]);
  useEffect(() => {
    if (test !== 'testing') return;
    const t0 = Date.now();
    const id = setInterval(() => setTestMs(Date.now() - t0), 250);
    return () => clearInterval(id);
  }, [test]);
  useEffect(() => {
    void idbUsage().then(setUsage).catch(() => setUsage([]));
  }, []);
  const saved = s.saved();
  const total = usage.reduce((n, u) => n + u.bytes, 0);
  const masked = s.app.aiKey ? `${s.app.aiKey.slice(0, 5)}••••••••${s.app.aiKey.slice(-4)}` : '';
  const save = (next: { aiKey?: string; aiModel?: string }) => {
    s.setApp(next);
    overlay.toast('Saved.');
  };
  return (
    <SubPage title="App settings" back="#/">
      <span className="lbl-head">Theme</span>
      <Seg<Theme>
        label="Theme"
        value={s.app.theme}
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        onChange={(v) => s.setApp({ theme: v })}
      />

      <span className="lbl-head">AI helper</span>
      <section className="card set-pad">
        <label className="fieldset">
          OpenRouter key
          {editKey ? (
            <input className="field" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} onBlur={() => key.trim() && key.trim() !== s.app.aiKey && save({ aiKey: key.trim() })} placeholder="sk-or-…" />
          ) : (
            <span className="key-box">
              <span className="d">{masked}</span>
              <button className="btn small" onClick={() => setEditKey(true)}>
                Change
              </button>
            </span>
          )}
        </label>
        <label className="fieldset">
          Model
          <input className="field" value={model} onChange={(e) => setModel(e.target.value)} onBlur={() => model.trim() !== (s.app.aiModel ?? '') && save({ aiModel: model.trim() || undefined })} placeholder={`Recommended default (${DEFAULT_MODEL})`} />
        </label>
        <div className="key-test">
          <button
            className="btn"
            disabled={!key.trim() || test === 'testing'}
            onClick={async () => {
              if (key.trim() !== s.app.aiKey) s.setApp({ aiKey: key.trim() });
              if (model.trim() !== (s.app.aiModel ?? '')) s.setApp({ aiModel: model.trim() || undefined });
              setTestMs(0);
              setTest('testing');
              setTest(await testKey({ key: key.trim(), model: model.trim() || undefined }));
            }}
          >
            {test === 'testing' ? `Testing… ${Math.floor(testMs / 1000)} s` : 'Test key'}
          </button>
          {test && test !== 'testing' && <span className={test.ok ? 'ok-text' : 'err small'}>{test.ok ? 'Everything works' : 'Not working yet'}</span>}
          <span style={{ flex: 1 }} />
          {s.app.aiKey && (
            <button
              className="link danger-link"
              onClick={() => {
                s.setApp({ aiKey: undefined });
                setKey('');
                setEditKey(true);
                setTest(undefined);
              }}
            >
              Remove key
            </button>
          )}
        </div>
        {test && test !== 'testing' && (
          <ul className="key-checks" aria-live="polite">
            {test.lines.map((l) => (
              <li key={l.text} className={l.ok ? 'ok' : 'bad'}>
                <span className="kc-mark" aria-hidden="true">
                  {l.ok ? <ICheck size={13} /> : '!'}
                </span>
                {l.text}
              </li>
            ))}
          </ul>
        )}
        <span className="small muted">
          Optional. Your key stays on this device and is only sent to{' '}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
            OpenRouter
          </a>
          , when you ask for AI help. AI only ever suggests where things are; you choose whether to use it.
        </span>
      </section>

      <span className="lbl-head">Saved data · {kb(total)}</span>
      <section className="card set-list">
        {saved.map((t) => {
          const u = usage.find((x) => x.key === `wb:${t.id}`);
          return (
            <div key={t.id} className="set-row">
              <span className="set-label">
                <b>{t.summary?.title ?? t.id}</b>
                <small className="d">{u ? kb(u.bytes) : 'not cached'}</small>
              </span>
              {u && (
                <button
                  className="btn small"
                  onClick={async () => {
                    await idbDel(`wb:${t.id}`);
                    setUsage(await idbUsage());
                    overlay.toast('Copy cleared. It will download again next time.');
                  }}
                >
                  Clear copy
                </button>
              )}
            </div>
          );
        })}
        {!saved.length && <div className="set-row muted">Nothing saved yet.</div>}
      </section>
      <span className="small muted">Clearing a copy keeps your fixes and followed teams; the sheet is downloaded again next time.</span>

      <AdminAccess />

      <span className="lbl-head">About</span>
      <section className="card set-pad">
        <span className="small">
          Unofficial, community-made viewer for ultimate tournaments. Not affiliated with UK Ultimate. Reads public Google Sheets in your browser: no accounts and no server. Version 2.0.
        </span>
      </section>
    </SubPage>
  );
}

/** Where the featured sheet's script is. With both filled in, tournaments can be published from How this sheet is read. */
function AdminAccess() {
  const s = useStore();
  const [url, setUrl] = useState(s.app.adminUrl ?? '');
  const [key, setKey] = useState(s.app.adminKey ?? '');
  const [test, setTest] = useState<string | undefined>();
  const save = () => s.setApp({ adminUrl: url.trim() || undefined, adminKey: key.trim() || undefined });
  return (
    <details className="card pad dev">
      <summary>Admin</summary>
      <div className="stack" style={{ marginTop: 10 }}>
        <label className="fieldset">
          Script URL
          <input className="field" inputMode="url" autoComplete="off" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={save} placeholder="https://script.google.com/macros/s/…/exec" />
        </label>
        <label className="fieldset">
          Admin key
          <input className="field" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} onBlur={save} />
        </label>
        <div className="key-test">
          <button
            className="btn"
            disabled={!url.trim() || !key.trim() || test === 'Testing…'}
            onClick={async () => {
              save();
              setTest('Testing…');
              setTest(await adminCall({ url: url.trim(), key: key.trim() }, { action: 'ping' }).then(() => 'Everything works', (e: Error) => e.message));
            }}
          >
            Test
          </button>
          {test && <span className="small">{test}</span>}
        </div>
        <span className="small muted">Stays on this device. Only needed to publish featured tournaments.</span>
      </div>
    </details>
  );
}
