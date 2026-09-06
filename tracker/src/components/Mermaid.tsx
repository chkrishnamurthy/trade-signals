import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

/**
 * Renders a Mermaid diagram from its source text.
 *
 * `react-markdown` has no Mermaid support, so `MarkdownDoc` routes ```mermaid
 * fences here instead of letting them fall through to a highlighted code block.
 * The diagram re-renders when the app theme flips (the tracker toggles
 * `data-theme` on <html>; with no attribute it follows the OS).
 */

let counter = 0;

function currentTheme(): "dark" | "default" {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark") return "dark";
  if (attr === "light") return "default";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "default";
}

export function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "default">(() => currentTheme());

  // Follow theme changes (explicit toggle → data-theme; system → media query).
  useEffect(() => {
    const update = () => setTheme(currentTheme());
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", update);
    return () => {
      mo.disconnect();
      mq?.removeEventListener?.("change", update);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const id = `mmd-${(counter += 1)}`;
    mermaid.initialize({
      startOnLoad: false,
      theme,
      securityLevel: "strict",
      fontFamily: "inherit",
    });
    mermaid
      .render(id, chart)
      .then(({ svg }) => {
        if (cancelled) return;
        setError(null);
        if (ref.current) ref.current.innerHTML = svg;
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "diagram error");
      });
    return () => {
      cancelled = true;
    };
  }, [chart, theme]);

  if (error) {
    // Never blow up the page on a malformed diagram — show the source instead.
    return <pre className="mermaid-error">{`Diagram failed to render: ${error}\n\n${chart}`}</pre>;
  }
  return <div className="mermaid-diagram" ref={ref} role="img" aria-label="diagram" />;
}
