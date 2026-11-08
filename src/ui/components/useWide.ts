import { useEffect, useState } from 'react';

/** True from 900px wide, the app's desktop breakpoint. Follows resizes. */
export function useWide(): boolean {
  const q = '(min-width: 900px)';
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setOn(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return on;
}
