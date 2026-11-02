import { useEffect, useState } from 'react';
import { useStore } from '../../store/app';
import { idbDel, idbUsage } from '../../store/db';
import { DEFAULT_MODEL, testKey } from '../../mapping/ai';
import { Seg, Section } from '../parts';
import { href } from '../router';
import { IChevronLeft } from '../icons';
import type { Theme } from '../../store/settings';
import { useOverlay } from '../overlay';

/** App settings (spec §9.14). */
export function AppSettings() {
  const s = useStore();
  const overlay = useOverlay();
  const [key, setKey] = useState(s.app.aiKey ?? '');
  const [model, setModel] = useState(s.app.aiModel ?? '');
  const [test, setTest] = useState<{ ok: boolean; message: string } | 'testing' | undefined>();
  const [usage, setUsage] = useState<{ key: string; bytes: number }[]>([]);
  useEffect(() => {
    void idbUsage().then(setUsage).catch(() => setUsage([]));
  }, []);
  const saved = s.saved();
  const total = usage.reduce((n, u) => n + u.bytes, 0);
  return (
    <div className="page">
      <div className="home-head">
        <a className="ib" href={href({ name: 'home' })} onClick={(e) => { if (history.length > 1) { e.preventDefault(); history.back(); } }} aria-label="Back">
          <IChevronLeft />
        </a>
        <h1>App settings</h1>
      </div>
      <Section title="Theme">
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
      </Section>
      <Section title="AI help">
        <div className="card pad stack">
          <p className="small muted" style={{ margin: 0 }}>
            Optional. With your own <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">OpenRouter</a> key, AI can work out sheets the app can’t read on its own. The key is stored only on this device and sent only to OpenRouter, with
            the first rows of the sheet. AI only ever suggests where things are; you choose whether to use it.
          </p>
          <label className="fieldset">
            OpenRouter key
            <input className="field" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-or-…" />
          </label>
          <label className="fieldset">
            Model
            <input className="field" value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODEL} />
          </label>
          <div className="row-btns">
            <button className="btn primary" onClick={() => (s.setApp({ aiKey: key.trim() || undefined, aiModel: model.trim() || undefined }), overlay.toast('Saved.'))}>
              Save
            </button>
            <button
              className="btn"
              disabled={!key.trim() || test === 'testing'}
              onClick={async () => {
                setTest('testing');
                setTest(await testKey({ key: key.trim(), model: model.trim() || undefined }));
              }}
            >
              {test === 'testing' ? 'Testing…' : 'Test key'}
            </button>
            {s.app.aiKey && (
              <button className="btn danger" onClick={() => (s.setApp({ aiKey: undefined }), setKey(''))}>
                Remove key
              </button>
            )}
          </div>
          {test && test !== 'testing' && <span className={test.ok ? 'small' : 'small err'}>{test.message}</span>}
        </div>
      </Section>
      <Section title="Saved data" sub={`${(total / 1024).toFixed(0)} KB`}>
        <div className="card list">
          {saved.map((t) => {
            const u = usage.find((x) => x.key === `wb:${t.id}`);
            return (
              <div key={t.id} className="row">
                <span style={{ flex: 1, minWidth: 0 }}>{t.summary?.title ?? t.id}</span>
                <span className="muted small">{u ? `${(u.bytes / 1024).toFixed(0)} KB` : 'not cached'}</span>
                {u && (
                  <button
                    className="btn small"
                    onClick={async () => {
                      await idbDel(`wb:${t.id}`);
                      setUsage(await idbUsage());
                      overlay.toast('Cache cleared. It will download again next time.');
                    }}
                  >
                    Clear cache
                  </button>
                )}
              </div>
            );
          })}
          {!saved.length && <div className="row muted">Nothing saved yet.</div>}
        </div>
      </Section>
      <Section title="About">
        <div className="card pad small stack">
          <span>Ultimate Tournament Viewer · v2.0</span>
          <span className="muted">Unofficial. Not affiliated with UK Ultimate. Reads public Google Sheets in your browser; no accounts and no server. Your data stays on this device.</span>
        </div>
      </Section>
    </div>
  );
}
