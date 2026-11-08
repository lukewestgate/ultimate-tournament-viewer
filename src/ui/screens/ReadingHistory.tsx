import { useT } from '../ctx';
import { SubPage } from '../Shell';
import { navigate, tHref } from '../router';
import { useOverlay } from '../overlay';
import { store } from '../../store/app';
import type { SavedReading } from '../../store/settings';

const when = (at: number) => new Date(at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** History: earlier readings (kept by AI, mapping and Start over), each to compare with or go back to. */
export function HistoryPage() {
  const c = useT();
  const overlay = useOverlay();
  const s = c.settings;
  const goBack = (saved: SavedReading | undefined, label: string) => {
    store.runtime(c.id).setMapping(saved?.mapping, saved?.format, 'Before going back');
    overlay.toast(`Back to “${label}”. The reading you left is in History.`);
    navigate(tHref(c.id, 'settings'));
  };
  const rows: { key: string; label: string; at?: number; saved?: SavedReading }[] = [
    ...(s.history ?? []).map((h, i) => ({ key: `h${i}`, label: h.label, at: h.at, saved: h })),
    ...(c.p.mapping.mode !== 'auto' ? [{ key: 'auto', label: 'Read automatically' }] : []),
  ];
  return (
    <SubPage title="History" sub={c.t.title} back={tHref(c.id, 'settings')}>
      <p className="small muted" style={{ margin: 0 }}>
        Every big change (Fix with AI, Map it yourself, Start over) keeps the reading before it. Compare with one to see what differs, or go back to it.
      </p>
      {s.proposal && (
        <section className="card set-pad">
          <div className="card-title">
            <b>AI suggestion, not used yet</b>
            <span className="small muted">{when(s.proposal.at)}</span>
          </div>
          <div className="row-btns">
            <a className="btn small" href={tHref(c.id, 'review', 'proposal')}>
              Compare
            </a>
            <button
              className="btn small primary"
              onClick={() => {
                store.runtime(c.id).setMapping(s.proposal!.mapping, s.proposal!.format, 'Before AI changes');
                store.update(c.id, { proposal: undefined });
                overlay.toast('Using the AI’s reading.');
              }}
            >
              Use
            </button>
            <button className="btn small" onClick={() => (store.update(c.id, { proposal: undefined }), overlay.toast('AI suggestion discarded.'))}>
              Discard
            </button>
          </div>
        </section>
      )}
      {rows.length > 0 ? (
        <section className="card glist">
          {rows.map((x) => (
            <div key={x.key} className="grow-row rd-hist">
              <span className="grow-label">
                {x.label}
                {x.at && <small>{when(x.at)}</small>}
              </span>
              <a className="btn small" href={tHref(c.id, 'review', x.key)}>
                Compare
              </a>
              <button className="btn small" onClick={() => goBack(x.saved, x.label)}>
                Go back
              </button>
            </div>
          ))}
        </section>
      ) : (
        !s.proposal && <div className="empty">Nothing yet. Earlier readings appear here after a big change.</div>
      )}
    </SubPage>
  );
}
