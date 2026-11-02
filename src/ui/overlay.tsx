import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { IClose } from './icons';

interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

interface OverlayApi {
  toast: (text: string, action?: Toast['action']) => void;
  openSheet: (content: ReactNode, opts?: { title?: string; wide?: boolean }) => void;
  closeSheet: () => void;
}

const Ctx = createContext<OverlayApi>({ toast: () => {}, openSheet: () => {}, closeSheet: () => {} });
export const useOverlay = () => useContext(Ctx);

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sheet, setSheet] = useState<{ content: ReactNode; title?: string; wide?: boolean } | undefined>();
  const nextId = useRef(1);
  const toast = useCallback((text: string, action?: Toast['action']) => {
    const id = nextId.current++;
    setToasts((ts) => [...ts, { id, text, action }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), action ? 8000 : 4000);
  }, []);
  const openSheet = useCallback((content: ReactNode, opts?: { title?: string; wide?: boolean }) => setSheet({ content, ...opts }), []);
  const closeSheet = useCallback(() => setSheet(undefined), []);
  return (
    <Ctx.Provider value={{ toast, openSheet, closeSheet }}>
      {children}
      {sheet && <Sheet title={sheet.title} wide={sheet.wide} onClose={closeSheet}>{sheet.content}</Sheet>}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.text}</span>
            {t.action && (
              <button
                className="toast-btn"
                onClick={() => {
                  t.action!.run();
                  setToasts((ts) => ts.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/** Bottom sheet on phones, centred modal on desktop. */
export function Sheet({ title, wide, onClose, children }: { title?: string; wide?: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <div className={`sheet${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" aria-hidden="true" />
        <div className="sheet-head">
          {title && <h2>{title}</h2>}
          <span style={{ flex: 1 }} />
          <button className="ib" onClick={onClose} aria-label="Close">
            <IClose />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
