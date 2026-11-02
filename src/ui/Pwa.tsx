import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useOverlay } from './overlay';
import { store } from '../store/app';

/** New version prompt (never reloads mid-use) and a one-time iOS "Add to Home Screen" hint. */
export function PwaPrompts() {
  const overlay = useOverlay();
  const shown = useRef(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });
  useEffect(() => {
    if (needRefresh && !shown.current) {
      shown.current = true;
      overlay.toast('A new version is available.', { label: 'Reload', run: () => void updateServiceWorker(true) });
    }
  }, [needRefresh, overlay, updateServiceWorker]);
  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = (navigator as unknown as { standalone?: boolean }).standalone || window.matchMedia('(display-mode: standalone)').matches;
    if (ios && !standalone && !store.app.iosHintShown) {
      store.setApp({ iosHintShown: true });
      setTimeout(() => overlay.toast('Install: tap Share, then Add to Home Screen.'), 4000);
    }
  }, [overlay]);
  return null;
}
