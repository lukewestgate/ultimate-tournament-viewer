import { useEffect, useState } from 'react';
import { Section } from '../components/ui';
import { useApp, type ThemePref } from '../state/app';
import { href } from '../state/router';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
}

export function InfoView() {
  const { t, cfg, theme, setTheme, feed, refresh } = useApp();
  const h = t.header;
  const [bip, setBip] = useState<BIPEvent>();
  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault();
      setBip(e as BIPEvent);
    };
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);
  const dates = Object.entries(t.dayDates)
    .filter(([d]) => t.games.some((g) => g.day === d))
    .map(([d, iso]) => `${d} ${new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`);

  return (
    <main className="page">
      <div className="page-head">
        <h1>Info</h1>
      </div>
      <div className="col" style={{ gap: 4 }}>
        <b style={{ fontSize: 18 }}>{h.name ?? cfg.name}</b>
        <span className="muted">{dates.join(' · ')}</span>
      </div>

      <div className="facts">
        {h.rules.map((r) => (
          <div key={r.day} className="card fact">
            <span className="lbl">{r.day} games</span>
            <span className="d">{r.gameMins} min</span>
            <span className="cap">
              +{r.gapMins} min gap{r.cap ? ` · cap ${r.cap}` : ''}
            </span>
          </div>
        ))}
        {h.qualification.div1 > 0 && (
          <div className="card fact">
            <span className="lbl">Qualify</span>
            <span className="d">
              {h.qualification.div1} + {h.qualification.div2}
            </span>
            <span className="cap">Div 1 + Div 2 spots</span>
          </div>
        )}
      </div>

      {h.sotgFormUrl && (
        <a className="btn primary" href={h.sotgFormUrl} target="_blank" rel="noreferrer" style={{ height: 52, borderRadius: 14 }}>
          Submit Spirit of the Game scores
        </a>
      )}

      {h.format.length > 0 && (
        <Section title="Format">
          <div className="card prose">
            {h.format.map((l) => (
              <p key={l}>{l.replace(/^->\s*/, '→ ')}</p>
            ))}
          </div>
        </Section>
      )}

      <Section title="Rules">
        <div className="card prose">
          {h.sections.map((s, i) => (
            <div key={i} className="col" style={{ gap: 6 }}>
              {s.title && <h3>{s.title}</h3>}
              {s.lines.map((l, j) => (
                <p key={j}>{l}</p>
              ))}
            </div>
          ))}
        </div>
      </Section>

      {t.sotg.length > 0 && (
        <Section title="Spirit submissions">
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="stable">
              <thead>
                <tr className="lbl">
                  <th style={{ borderTop: 0 }}>Team</th>
                  <th style={{ borderTop: 0 }}>Submitted</th>
                  <th style={{ borderTop: 0 }}>Received</th>
                  <th style={{ borderTop: 0 }}>Played</th>
                </tr>
              </thead>
              <tbody>
                {t.sotg.map((s) => (
                  <tr key={s.team}>
                    <td>
                      <a href={href('team', s.team)}>{s.team}</a>
                    </td>
                    <td className="d" style={{ fontSize: 17, color: s.submitted < s.played ? 'var(--live)' : undefined }}>
                      {s.submitted}
                    </td>
                    <td className="d" style={{ fontSize: 17 }}>
                      {s.received}
                    </td>
                    <td className="d" style={{ fontSize: 17 }}>
                      {s.played}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section title="App">
        <div className="card prose">
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <b style={{ color: 'var(--ink)' }}>Theme</b>
            <div className="seg">
              {(['system', 'light', 'dark'] as ThemePref[]).map((x) => (
                <button key={x} aria-pressed={theme === x} onClick={() => setTheme(x)}>
                  {x[0].toUpperCase() + x.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {bip && (
            <button className="btn primary" onClick={() => bip.prompt().then(() => setBip(undefined))}>
              Install app
            </button>
          )}
          <p>
            This is an <b>unofficial</b>, community-made viewer. The tournament director’s{' '}
            <a href={cfg.sheetUrl} target="_blank" rel="noreferrer">
              published schedule
            </a>{' '}
            is always the source of truth.
          </p>
          <p>
            Data refreshes every minute while the app is open, but Google can take a few minutes to publish changes. Last
            refresh: {feed.lastOk ? new Date(feed.lastOk).toLocaleTimeString('en-GB') : 'never'}.{' '}
            <button className="tree-toggle" onClick={refresh}>
              Refresh now
            </button>
          </p>
          <p className="muted" style={{ fontSize: 12 }}>
            Pool tables use W = 2, D = 1 points with head-to-head tiebreakers; where the sheet shows a final ranking, it wins.{' '}
            <a href={href('debug')}>Diagnostics</a>
          </p>
        </div>
      </Section>
    </main>
  );
}
