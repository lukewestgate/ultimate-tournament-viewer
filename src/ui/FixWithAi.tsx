import { store } from '../store/app';
import { href, navigate } from './router';
import { useOverlay } from './overlay';

/**
 * Opens Fix with AI and starts it straight away; without a key, goes to App settings to add one. The tap is the
 * go-ahead to send the sheet, so there's no second step. The AI code loads on first use.
 */
export function useOpenAi(): () => void {
  const overlay = useOverlay();
  return () => {
    if (!store.app.aiKey) {
      overlay.toast('Add an OpenRouter key first, then come back to this sheet.');
      navigate(href({ name: 'appSettings' }));
      return;
    }
    void import('./FixWithAiRun').then((m) => overlay.openSheet(<m.FixWithAiRun />, { title: 'Fix with AI' }));
  };
}

/** App settings, where the OpenRouter key is added. */
export const addKey = () => navigate(href({ name: 'appSettings' }));
