import { store, useStore } from '../store/app';
import { isOnToday, tournamentStatus } from '../store/launch';
import { dateRange, fallbackTitle } from './fmt';
import { useOverlay } from './overlay';
import { href, navigate, tHref } from './router';
import { ICheck, IList, IPlus, ISettings } from './icons';
import { useT } from './ctx';

/** Tournament switcher (spec §9.3): current, others (live first), add, all, settings. */
export function Switcher() {
  useStore();
  const c = useT();
  const overlay = useOverlay();
  const now = Date.now();
  const saved = store.saved();
  const others = saved.filter((s) => s.id !== c.id).sort((a, b) => Number(isOnToday(b.summary, now)) - Number(isOnToday(a.summary, now)) || (b.lastOpened ?? 0) - (a.lastOpened ?? 0));
  const go = (to: string) => {
    overlay.closeSheet();
    navigate(to);
  };
  const statusOf = (s: (typeof saved)[number]) => {
    const status = tournamentStatus(s.summary, now);
    if (!s.summary) return 'Not opened yet';
    if (s.summary?.error) return "Can't load";
    if (isOnToday(s.summary, now) && status !== 'completed') return 'On today';
    if (status === 'guessed') return 'Dates not confirmed';
    return status === 'completed' ? 'Completed' : dateRange(s.summary?.days.map((d) => d.date) ?? []);
  };
  return (
    <div className="switcher">
      <div className="sw-row current">
        <ICheck size={18} />
        <div className="sw-text">
          <b>{c.t.title}</b>
          <span className="muted">{dateRange(c.t.days.map((d) => d.date))}</span>
        </div>
      </div>
      {others.map((s) => (
        <button key={s.id} className="sw-row" onClick={() => go(tHref(s.id))}>
          {isOnToday(s.summary, now) ? <i className="li" /> : <span style={{ width: 18 }} />}
          <div className="sw-text">
            <b>{s.summary?.title ?? fallbackTitle(s.id)}</b>
            <span className="muted">{statusOf(s)}</span>
          </div>
        </button>
      ))}
      <div className="sw-actions">
        <button className="sw-row action" onClick={() => go(href({ name: 'add' }))}>
          <IPlus size={18} /> <b>Add tournament</b>
        </button>
        <button className="sw-row action" onClick={() => go(href({ name: 'home' }))}>
          <IList size={18} /> <b>All tournaments</b>
        </button>
        <button className="sw-row action" onClick={() => go(tHref(c.id, 'settings'))}>
          <ISettings size={18} /> <b>Reading</b>
        </button>
      </div>
    </div>
  );
}
