import { AnimatePresence, LayoutGroup, motion, MotionConfig } from 'framer-motion';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { reviewToPropose, updateSettings } from './db/actions';
import { monthLabel, ofMonth } from './engine/dates';
import { Home } from './screens/Home';
import { LockScreen } from './screens/Lock';
import { Onboarding } from './screens/Onboarding';
import { DataProvider, useData, useDataStatus } from './state/data';
import { match, navigate, navigationDirection, useLocation, type Location } from './state/router';
import { UIProvider } from './state/ui';
import { Icon, type IconName } from './ui/Icon';
import { Button, Sheet } from './ui/kit';

const Month = lazy(() => import('./screens/Month'));
const NewIncome = lazy(() => import('./screens/NewIncome'));
const Split = lazy(() => import('./screens/Split'));
const Transfers = lazy(() => import('./screens/Transfers'));
const Review = lazy(() => import('./screens/Review'));
const Provisions = lazy(() => import('./screens/Provisions'));
const UseProvision = lazy(() => import('./screens/UseProvision'));
const Goals = lazy(() => import('./screens/Goals'));
const Wealth = lazy(() => import('./screens/Wealth'));
const Projection = lazy(() => import('./screens/Projection'));
const Retrospective = lazy(() => import('./screens/Retrospective'));
const RevolutImport = lazy(() => import('./screens/RevolutImport'));
const Settings = lazy(() => import('./screens/settings/Settings'));
const Subscriptions = lazy(() => import('./screens/Subscriptions'));
const Calendar = lazy(() => import('./screens/Calendar'));
const Forecast = lazy(() => import('./screens/Forecast'));

function resolve(loc: Location): ReactNode {
  const { path } = loc;
  let p: Record<string, string> | null;
  if (path === '/') return <Home />;
  if (path === '/mois') return <Month />;
  if ((p = match('/mois/:month', path))) return <Month month={p.month} />;
  if (path === '/encaissement') return <NewIncome query={loc.query} />;
  if ((p = match('/repartition/:id', path))) return <Split receiptId={p.id} />;
  if (path === '/virements') return <Transfers />;
  if ((p = match('/revue/:month', path))) return <Review month={p.month} />;
  if (path === '/provisions') return <Provisions />;
  if (path === '/provisions/utiliser') return <UseProvision query={loc.query} />;
  if (path === '/objectifs') return <Goals />;
  if (path === '/patrimoine') return <Wealth />;
  if (path === '/patrimoine/projection') return <Projection />;
  if ((p = match('/patrimoine/retrospective/:year', path))) return <Retrospective year={Number(p.year)} />;
  if (path === '/import') return <RevolutImport query={loc.query} />;
  if (path === '/previsions') return <Forecast query={loc.query} />;
  if (path === '/abonnements') return <Subscriptions query={loc.query} />;
  if (path === '/calendrier') return <Calendar query={loc.query} />;
  if ((p = match('/calendrier/:month', path))) return <Calendar month={p.month} query={loc.query} />;
  if (path === '/reglages') return <Settings />;
  if ((p = match('/reglages/:section', path))) return <Settings section={p.section} />;
  return <Home />;
}

const TABS: { path: string; label: string; icon: IconName }[] = [
  { path: '/', label: 'Accueil', icon: 'home' },
  { path: '/mois', label: 'Mois', icon: 'month' },
  { path: '/objectifs', label: 'Objectifs', icon: 'target' },
  { path: '/patrimoine', label: 'Patrimoine', icon: 'wealth' },
  { path: '/reglages', label: 'Réglages', icon: 'settings' },
];

const FULLSCREEN = ['/encaissement', '/revue/'];

function activeTab(path: string): string {
  if (path === '/') return '/';
  if (path.startsWith('/mois') || path.startsWith('/virements') || path.startsWith('/repartition') || path.startsWith('/calendrier') || path.startsWith('/abonnements') || path.startsWith('/previsions')) return '/mois';
  if (path.startsWith('/objectifs') || path.startsWith('/provisions')) return '/objectifs';
  if (path.startsWith('/patrimoine')) return '/patrimoine';
  if (path.startsWith('/reglages') || path.startsWith('/import')) return '/reglages';
  return '/';
}

function TabBar({ path }: { path: string }) {
  const active = activeTab(path);
  const [menu, setMenu] = useState(false);
  let pressTimer = 0;
  return (
    <>
      <nav
        aria-label="Navigation principale"
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/85 backdrop-blur-xl"
      >
        <div className="relative mx-auto grid max-w-xl grid-cols-5 px-2">
          {TABS.map((t) => {
            const on = active === t.path;
            return (
              <a
                key={t.path}
                href={`#${t.path}`}
                aria-current={on ? 'page' : undefined}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] tracking-wide transition ${on ? 'text-gold' : 'text-muted hover:text-ink'}`}
              >
                {on && <motion.span layoutId="tab-dot" className="absolute top-0 h-px w-8 bg-gold" transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} />}
                <Icon name={t.icon} size={22} strokeWidth={on ? 1.6 : 1.3} />
                {t.label}
              </a>
            );
          })}
        </div>
      </nav>
      <button
        type="button"
        aria-label="Nouvel encaissement"
        title="Nouvel encaissement (appui long : autres actions)"
        onClick={() => navigate('/encaissement')}
        onPointerDown={() => {
          pressTimer = window.setTimeout(() => setMenu(true), 500);
        }}
        onPointerUp={() => window.clearTimeout(pressTimer)}
        onPointerLeave={() => window.clearTimeout(pressTimer)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu(true);
        }}
        className="fixed left-1/2 z-30 flex h-15 w-15 -translate-x-1/2 items-center justify-center rounded-full border border-gold/60 bg-gold text-gold-ink shadow-[0_10px_30px_-10px_rgba(201,169,110,0.6)] transition active:scale-95"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4.75rem)' }}
      >
        <Icon name="plus" size={26} strokeWidth={1.6} />
      </button>
      <Sheet open={menu} onClose={() => setMenu(false)} title="Actions rapides">
        <div className="grid gap-3">
          <Button icon="plus" full onClick={() => { setMenu(false); navigate('/encaissement'); }}>Nouvel encaissement</Button>
          <Button icon="umbrella" variant="secondary" full onClick={() => { setMenu(false); navigate('/provisions/utiliser'); }}>Utiliser une provision</Button>
        </div>
      </Sheet>
    </>
  );
}

function ReviewPrompt() {
  const [month, setMonth] = useState<string | null>(null);
  useEffect(() => {
    reviewToPropose().then(setMonth).catch(() => undefined);
  }, []);
  const close = () => {
    if (month) updateSettings({ reviewPromptedFor: month });
    setMonth(null);
  };
  return (
    <Sheet open={month !== null} onClose={close} title="Un nouveau mois commence">
      {month && (
        <>
          <p className="mb-6 text-[0.9375rem] leading-relaxed text-muted">
            La revue {ofMonth(month)} est prête. Dix minutes pour faire le point sur {monthLabel(month)}, décider du sort des reliquats et préparer la suite.
          </p>
          <div className="grid gap-3">
            <Button full onClick={() => { close(); navigate(`/revue/${month}`); }}>Commencer la revue</Button>
            <Button full variant="secondary" onClick={close}>Plus tard</Button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function Shell() {
  const loc = useLocation();
  const { snap } = useData();
  const [locked, setLocked] = useState(() => Boolean(snap.settings.pinHash));

  // Thème.
  useEffect(() => {
    const theme = snap.settings.theme;
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'ivory' ? '#F7F4EE' : '#0B0B0C');
    try {
      localStorage.setItem('hyppo-theme', theme);
    } catch {
      /* stockage indisponible */
    }
  }, [snap.settings.theme]);

  // Verrouillage après une minute en arrière-plan ; montants floutés dans le sélecteur d'applis.
  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        document.documentElement.classList.add('shielded');
      } else {
        document.documentElement.classList.remove('shielded');
        if (snap.settings.pinHash && hiddenAt && Date.now() - hiddenAt > 60_000) setLocked(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [snap.settings.pinHash]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.path]);

  if (!snap.settings.onboarded) return <Onboarding />;
  if (locked && snap.settings.pinHash) return <LockScreen onUnlock={() => setLocked(false)} />;

  const fullscreen = FULLSCREEN.some((p) => loc.path.startsWith(p));
  const dir = navigationDirection();
  return (
    <LayoutGroup>
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-gold focus:px-4 focus:py-2 focus:text-gold-ink">
        Aller au contenu
      </a>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={loc.path.startsWith('/calendrier') ? '/calendrier' : loc.path}
          id="contenu"
          initial={{ opacity: 0, x: 14 * dir }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 * dir }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <Suspense fallback={<div className="min-h-dvh" />}>{resolve(loc)}</Suspense>
        </motion.div>
      </AnimatePresence>
      {!fullscreen && <TabBar path={loc.path} />}
      <ReviewPrompt />
    </LayoutGroup>
  );
}

function Gate() {
  const status = useDataStatus();
  if (status !== 'ready') return <div className="min-h-dvh bg-bg" />;
  return <Shell />;
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <UIProvider>
        <DataProvider>
          <Gate />
        </DataProvider>
      </UIProvider>
    </MotionConfig>
  );
}
