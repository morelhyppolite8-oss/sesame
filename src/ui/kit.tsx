import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { goBack } from '../state/router';
import { useUI } from '../state/ui';
import { Icon, type IconName } from './Icon';

const ease = [0.22, 1, 0.36, 1] as const;

// ─── Boutons ──────────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  icon,
  full,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: IconName; full?: boolean }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-gold text-gold-ink border-gold hover:brightness-105',
    secondary: 'bg-transparent text-ink border-line-strong hover:border-gold',
    ghost: 'bg-transparent text-gold border-transparent',
    danger: 'bg-transparent text-negative border-line-strong hover:border-negative',
  };
  return (
    <button
      type="button"
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full border px-5 text-[0.9375rem] font-medium tracking-wide transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 ${styles[variant]} ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-muted transition hover:text-ink active:scale-95 ${className}`}
      {...rest}
    >
      <Icon name={icon} size={21} />
    </button>
  );
}

// ─── Mise en page ─────────────────────────────────────────────────────

export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main className={`mx-auto w-full max-w-xl px-5 pb-36 md:max-w-2xl ${className}`}>{children}</main>;
}

export function PageHeader({
  title,
  eyebrow,
  back,
  backTo,
  actions,
}: {
  title: string;
  eyebrow?: string;
  back?: boolean;
  backTo?: string;
  actions?: ReactNode;
}) {
  const { discreet, toggleDiscreet } = useUI();
  return (
    <header className="safe-top mb-6 flex items-end justify-between gap-3 pt-3">
      <div className="flex min-w-0 items-center gap-1">
        {back && (
          <IconButton icon="back" label="Retour" className="-ml-3" onClick={() => goBack(backTo ?? '/')} />
        )}
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
          <h1 className="truncate font-serif text-[2rem] leading-tight font-medium text-ink">{title}</h1>
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        {actions}
        <IconButton
          icon={discreet ? 'eyeOff' : 'eye'}
          label={discreet ? 'Afficher les montants' : 'Masquer les montants'}
          aria-pressed={discreet}
          onClick={toggleDiscreet}
          className="-mr-2"
        />
      </div>
    </header>
  );
}

export function Card({ children, className = '', as: As = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <As className={`card p-5 ${className}`}>{children}</As>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-9 mb-3 flex items-center justify-between px-1">
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  );
}

export function Divider({ className = '' }: { className?: string }) {
  return <hr className={`border-0 border-t border-line ${className}`} />;
}

export function Row({
  title,
  subtitle,
  right,
  onClick,
  icon,
  className = '',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  icon?: IconName;
  className?: string;
}) {
  const content = (
    <>
      {icon && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-gold">
          <Icon name={icon} size={18} />
        </span>
      )}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[0.9375rem] text-ink">{title}</span>
        {subtitle && <span className="mt-0.5 block text-[0.8125rem] text-muted">{subtitle}</span>}
      </span>
      {right !== undefined && <span className="shrink-0 text-right">{right}</span>}
      {onClick && <Icon name="chevronRight" size={16} className="shrink-0 text-faint" />}
    </>
  );
  const base = `flex w-full min-h-14 items-center gap-3 py-3 ${className}`;
  return onClick ? (
    <button type="button" className={`${base} transition active:opacity-70`} onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className={base}>{content}</div>
  );
}

// ─── Progression ──────────────────────────────────────────────────────

export function ProgressBar({ value, max, tone = 'gold', label, height = 4 }: { value: number; max: number; tone?: 'gold' | 'ink' | 'negative'; label: string; height?: number }) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const reduced = useReducedMotion();
  const colors = { gold: 'bg-gold', ink: 'bg-ink/70', negative: 'bg-negative' };
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      className="w-full overflow-hidden rounded-full bg-line"
      style={{ height }}
    >
      <motion.div
        className={`h-full rounded-full ${colors[tone]}`}
        initial={{ width: reduced ? `${ratio * 100}%` : 0 }}
        animate={{ width: `${ratio * 100}%` }}
        transition={{ duration: 1.1, ease }}
      />
    </div>
  );
}

export function Ring({ value, size = 96, stroke = 3, children, label }: { value: number; size?: number; stroke?: number; children?: ReactNode; label: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const reduced = useReducedMotion();
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-strong)" strokeWidth={1} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--gold)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduced ? c * (1 - value) : c }}
          animate={{ strokeDashoffset: c * (1 - Math.min(1, Math.max(0, value))) }}
          transition={{ duration: 1.4, ease }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

/** Célébration sobre : un fin trait doré qui se dessine. */
export function GoldLine({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 24" className={`h-6 w-full ${className}`} aria-hidden="true" preserveAspectRatio="none">
      <motion.path
        d="M2 12 C 60 12, 80 4, 120 12 S 190 20, 238 12"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="1.2"
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.8, ease }}
      />
      <motion.circle
        cx="238"
        cy="12"
        r="2"
        fill="var(--gold)"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.7, duration: 0.4 }}
      />
    </svg>
  );
}

// ─── États vides ──────────────────────────────────────────────────────

export function EmptyState({ title, body, action, icon = 'sparkle' }: { title: string; body: string; action?: ReactNode; icon?: IconName }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="relative mb-5 flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-line" />
        <span className="absolute inset-2 rounded-full border border-gold/30" />
        <Icon name={icon} size={22} className="text-gold" />
      </div>
      <p className="font-serif text-xl text-ink">{title}</p>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ─── Feuille modale ───────────────────────────────────────────────────

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // La fonction de fermeture change à chaque rendu : on garde la dernière dans une référence,
  // pour que la gestion du focus ne se relance qu'à l'ouverture et à la fermeture (sinon le focus
  // serait volé au champ en cours de saisie).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    const previous = document.activeElement as HTMLElement | null;
    window.setTimeout(() => panel.current?.focus(), 50);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center">
          <motion.div
            className="absolute inset-0 bg-overlay backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="safe-bottom relative max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[1.75rem] border border-line-strong bg-surface px-5 pt-3 pb-6 outline-none md:rounded-[1.75rem]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.45, ease }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong md:hidden" />
            <div className="mb-4 flex items-center justify-between">
              <h2 id={titleId} className="font-serif text-2xl text-ink">
                {title}
              </h2>
              <IconButton icon="x" label="Fermer" onClick={onClose} className="-mr-2" />
            </div>
            <div className="pb-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ─── Champs ───────────────────────────────────────────────────────────

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-1.5 block text-[0.8125rem] text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-faint">{hint}</p>}
    </div>
  );
}

export const inputClass =
  'w-full min-h-12 rounded-xl border border-line-strong bg-bg px-4 text-[1rem] text-ink placeholder:text-faint focus:border-gold focus:outline-none';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={`${inputClass} appearance-none pr-10 ${props.className ?? ''}`} />
      <Icon name="chevronDown" size={16} className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted" />
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 py-2">
      <label htmlFor={id} className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[0.8125rem] text-muted">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-13 shrink-0 rounded-full border transition ${checked ? 'border-gold bg-gold' : 'border-line-strong bg-raised'}`}
      >
        <motion.span
          className={`absolute top-1 left-1 h-5.5 w-5.5 rounded-full ${checked ? 'bg-gold-ink' : 'bg-muted'}`}
          animate={{ x: checked ? 20 : 0 }}
          transition={{ duration: 0.25, ease }}
        />
      </button>
    </div>
  );
}

/** Case « fait » ronde, 44 px de zone tactile. */
export function CheckCircle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex h-11 w-11 shrink-0 items-center justify-center"
    >
      <span className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${checked ? 'border-gold bg-gold text-gold-ink' : 'border-line-strong text-transparent'}`}>
        <motion.span initial={false} animate={{ scale: checked ? 1 : 0.4, opacity: checked ? 1 : 0 }} transition={{ duration: 0.25, ease }}>
          <Icon name="check" size={16} strokeWidth={2} />
        </motion.span>
      </span>
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full border border-line-strong p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`relative min-h-10 flex-1 rounded-full px-2 text-sm whitespace-nowrap transition ${value === o.value ? 'text-gold-ink' : 'text-muted'}`}
        >
          {value === o.value && (
            <motion.span layoutId={`seg-${label}`} className="absolute inset-0 rounded-full bg-gold" transition={{ duration: 0.3, ease }} />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'gold' | 'negative' | 'positive' }) {
  const tones = {
    muted: 'border-line-strong text-muted',
    gold: 'border-gold/40 text-gold',
    negative: 'border-negative/40 text-negative',
    positive: 'border-positive/40 text-positive',
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.75rem] ${tones[tone]}`}>{children}</span>;
}
