import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Shared helpers for the Foundations catalogue.
 *
 * Every swatch reads the token straight off the CSS custom property with
 * `var(--token)` and re-reads its *resolved* value whenever the `.dark` class on
 * <html> changes. That is the whole point of a Foundations story: it renders the
 * real token layer, so the catalogue physically cannot drift from `globals.css`.
 * Using `var(--x)` here is not a raw-colour literal — it references the token,
 * exactly as a component must.
 */
export function useResolvedVar(cssVar: string): [string, (el: HTMLElement | null) => void] {
  const [value, setValue] = useState('');
  const elRef = useRef<HTMLElement | null>(null);

  const read = useCallback(() => {
    if (elRef.current) {
      setValue(getComputedStyle(elRef.current).getPropertyValue(cssVar).trim());
    }
  }, [cssVar]);

  useEffect(() => {
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [read]);

  const setRef = useCallback(
    (el: HTMLElement | null) => {
      elRef.current = el;
      read();
    },
    [read],
  );
  return [value, setRef];
}

export function Swatch({ cssVar, label }: { cssVar: string; label?: string | undefined }) {
  const [value, setRef] = useResolvedVar(cssVar);
  return (
    <div ref={setRef} className="flex flex-col gap-1.5">
      <div
        className="h-14 w-full rounded-md border border-border"
        style={{ background: `var(${cssVar})` }}
      />
      <div className="flex flex-col">
        <span className="text-xs font-medium text-foreground">{label ?? cssVar}</span>
        <span className="text-2xs text-subtle-foreground">{cssVar}</span>
        <span className="text-3xs text-subtle-foreground tabular-nums">{value || '—'}</span>
      </div>
    </div>
  );
}

export function SwatchGrid({ title, vars }: { title: string; vars: [string, string?][] }) {
  return (
    <section className="mb-8">
      <h3 className="mb-3 text-sm font-semibold tracking-tight text-foreground">{title}</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {vars.map(([cssVar, label]) => (
          <Swatch key={cssVar} cssVar={cssVar} label={label} />
        ))}
      </div>
    </section>
  );
}

/** A framed page ground so swatches read against the real canvas in both themes. */
export function Ground({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background p-6 text-foreground">{children}</div>;
}
