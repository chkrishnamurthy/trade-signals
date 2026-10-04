'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangleIcon, CheckIcon, InfoIcon, XIcon } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * A minimal, self-contained toast system.
 *
 * Built in-house rather than pulled from a library: the app already owns its UI
 * kit, and a personal tool does not need swipe gestures and a portal manager to
 * say "that didn't save". It exists so that fire-and-forget mutations — reorder,
 * remove, add-to-another-list — can report a failure instead of failing in
 * silence, which is the whole reason it was added.
 *
 * Tone mirrors `Alert`: `warning` and `destructive` carry real meaning about
 * whether an action succeeded, so they are not interchangeable decoration.
 */

export type ToastVariant = 'default' | 'success' | 'warning' | 'destructive';

export interface ToastOptions {
  readonly title: string;
  readonly description?: string;
  readonly variant?: ToastVariant;
  /** Milliseconds before auto-dismiss. `0` keeps it until dismissed by hand. */
  readonly duration?: number;
}

interface ToastRecord extends ToastOptions {
  readonly id: string;
  readonly variant: ToastVariant;
}

interface ToastContextValue {
  readonly toast: (options: ToastOptions) => string;
  readonly dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** At most this many at once — the oldest is dropped rather than piling up. */
const MAX_TOASTS = 4;
const DEFAULT_DURATION = 5000;
/** A failure lingers a little longer, since it usually asks the user to retry. */
const FAILURE_DURATION = 7000;

const toastVariants = cva(
  'pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm shadow-elevated animate-in fade-in slide-in-from-bottom-2 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:translate-y-0.5',
  {
    variants: {
      variant: {
        default: 'border-border bg-surface text-foreground [&>svg]:text-info',
        success: 'border-bullish-line bg-bullish-soft text-foreground [&>svg]:text-bullish',
        warning: 'border-warning-line bg-warning-soft text-warning-foreground [&>svg]:text-warning',
        destructive:
          'border-destructive-line bg-destructive-soft text-destructive [&>svg]:text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

const ICON: Record<ToastVariant, typeof InfoIcon> = {
  default: InfoIcon,
  success: CheckIcon,
  warning: AlertTriangleIcon,
  destructive: AlertTriangleIcon,
};

/**
 * Provides the toast context and renders the viewport.
 *
 * Wraps the app in the root layout. `children` is server-rendered and passed
 * through untouched — only the provider itself is a client component.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastRecord[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const seq = useRef(0);

  const dismiss = useCallback((id: string) => {
    const handle = timers.current.get(id);
    if (handle !== undefined) {
      clearTimeout(handle);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions): string => {
      seq.current += 1;
      const id = `toast-${seq.current}`;
      const variant = options.variant ?? 'default';
      const record: ToastRecord = { ...options, id, variant };

      // Newest at the top, capped — a burst of failures must not fill the screen.
      setToasts((current) => [record, ...current].slice(0, MAX_TOASTS));

      const duration =
        options.duration ?? (variant === 'destructive' ? FAILURE_DURATION : DEFAULT_DURATION);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  // Clear every pending timer if the provider ever unmounts.
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const handle of map.values()) clearTimeout(handle);
      map.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:w-full sm:max-w-sm"
        aria-live="polite"
      >
        {toasts.map((entry) => {
          const Icon = ICON[entry.variant];
          return (
            <div
              key={entry.id}
              role={entry.variant === 'destructive' ? 'alert' : 'status'}
              className={toastVariants({ variant: entry.variant })}
            >
              <Icon aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-medium tracking-tight">{entry.title}</p>
                {entry.description !== undefined && (
                  <p className="mt-0.5 text-xs opacity-90">{entry.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(entry.id)}
                aria-label="Dismiss"
                className="-mr-1 -mt-0.5 shrink-0 rounded-sm p-0.5 opacity-70 transition-opacity hover:opacity-100"
              >
                <XIcon className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * The toast handle: `toast()` to raise one, `dismiss()` to close it early.
 *
 * Throws if used outside the provider — a toast that silently does nothing
 * would reintroduce exactly the silent-failure bug this was added to fix.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (context === null) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export type { ToastContextValue };
export { toastVariants };
export type ToastVariantProps = VariantProps<typeof toastVariants>;
