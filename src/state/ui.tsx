import { AnimatePresence, motion } from 'framer-motion';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// ─── Mode discret ─────────────────────────────────────────────────────

const DISCREET_KEY = 'hyppo-discreet';

function readDiscreet(): boolean {
  try {
    return localStorage.getItem(DISCREET_KEY) === '1';
  } catch {
    return false;
  }
}

interface UIContextValue {
  discreet: boolean;
  toggleDiscreet: () => void;
  toast: (message: string) => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [discreet, setDiscreet] = useState(readDiscreet);
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    document.documentElement.classList.toggle('discreet', discreet);
    try {
      localStorage.setItem(DISCREET_KEY, discreet ? '1' : '0');
    } catch {
      /* stockage indisponible */
    }
  }, [discreet]);

  const toggleDiscreet = useCallback(() => setDiscreet((d) => !d), []);

  // Geste : appui à deux doigts n'importe où.
  useEffect(() => {
    let start = 0;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) start = Date.now();
    };
    const onEnd = (e: TouchEvent) => {
      if (start && e.touches.length === 0 && Date.now() - start < 350) toggleDiscreet();
      if (e.touches.length === 0) start = 0;
    };
    const onMove = () => {
      start = 0;
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchmove', onMove);
    };
  }, [toggleDiscreet]);

  const toast = useCallback((message: string) => {
    const id = ++nextId.current;
    setToasts((t) => [...t.slice(-1), { id, message }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  return (
    <UIContext.Provider value={{ discreet, toggleDiscreet, toast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 6.5rem)' }}
        role="status"
        aria-live="polite"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-full border border-line-strong bg-raised px-4 py-2.5 text-sm text-ink shadow-lg"
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </UIContext.Provider>
  );
}

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('UIProvider manquant');
  return ctx;
}
