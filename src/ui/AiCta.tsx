import { store } from '../store/app';
import { href, navigate } from './router';
import { useOverlay } from './overlay';
import { ISparkle } from './icons';

/**
 * Opens Improve with AI and starts it straight away; without a key, goes to App settings to add one. The tap is the
 * go-ahead to send the sheet, so there's no second "Ask AI" step. The AI sheet loads on first use.
 */
export function useOpenAi(): () => void {
  const overlay = useOverlay();
  return () => {
    if (!store.app.aiKey) {
      overlay.toast('Add an OpenRouter key first, then come back to this sheet.');
      navigate(href({ name: 'appSettings' }));
      return;
    }
    void import('./screens/Settings').then((m) => overlay.openSheet(<m.AiRun autoStart />, { title: 'Improve with AI' }));
  };
}

/** The one-tap AI card: what AI can do for this sheet, and the button. More prominent when the reading has problems. */
export function AiCta({ problems = 0, noGames = false }: { problems?: number; noGames?: boolean }) {
  const open = useOpenAi();
  const hasKey = Boolean(store.app.aiKey);
  const urgent = noGames || problems > 0;
  const text = noGames
    ? 'AI can look through the sheet, find the games, pool tables and seeding, and test its reading before you use it.'
    : problems
      ? 'AI can look through the whole sheet, fix what’s read wrongly, read the rules and work out how teams progress. You see the result before anything changes.'
      : 'AI can double-check the reading against the whole sheet, read the rules and work out how teams progress. You see the result before anything changes.';
  return (
    <section className="ai-cta">
      <span className="ai-cta-head">
        <ISparkle size={18} /> {urgent ? 'Let AI read this sheet' : 'Check it with AI'}
      </span>
      <p>
        {text}
        {!hasKey && ' It needs an OpenRouter key, added once in App settings.'}
      </p>
      <p className="small">The sheet is sent to OpenRouter with your key. Usually a cent or two, and 1–3 minutes.</p>
      <button className={`btn ${urgent ? 'violet' : 'violet-text'}`} onClick={open}>
        {hasKey ? 'Improve with AI' : 'Set up AI'}
      </button>
    </section>
  );
}
