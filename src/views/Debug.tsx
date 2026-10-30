import { useApp } from '../state/app';

export function DebugView() {
  const { feed, t, real, cfg } = useApp();
  return (
    <main className="page">
      <div className="page-head">
        <h1>Diagnostics</h1>
      </div>
      <div className="card prose">
        <h3>Tabs</h3>
        {Object.keys(cfg.tabs).map((k) => {
          const key = k as keyof typeof cfg.tabs;
          const at = feed.fetchedAt[key];
          return (
            <p key={k}>
              {k}: {feed.raw[key]?.length ?? 0} bytes · {at ? new Date(at).toLocaleTimeString('en-GB') : 'never'}
            </p>
          );
        })}
        <p>Feed error: {feed.error ?? 'none'}</p>
        <h3>Parsed</h3>
        <p>
          {t.games.length} games · {t.seeds.length} teams · pools {t.pools.map((p) => `${p.letter}(${p.stage})`).join(' ')}
        </p>
        <p>Dates: {JSON.stringify(t.dayDates)}</p>
        <h3>Warnings</h3>
        {t.warnings.length ? t.warnings.map((w, i) => <p key={i}>{w}</p>) : <p>None</p>}
        <h3>Engine vs sheet</h3>
        {real.mismatches.length ? real.mismatches.map((w, i) => <p key={i}>{w}</p>) : <p>No mismatches</p>}
        <h3>Testing</h3>
        <p>
          Add <code>?now=2026-10-31T10:12</code> to fake the clock, and <code>?demo</code> to simulate scores up to that time, e.g.{' '}
          <a href="?demo&now=2026-11-01T10:52#/brackets">Sunday 10:52 demo</a>.
        </p>
      </div>
    </main>
  );
}
