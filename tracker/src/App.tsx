import { useEffect, useState } from "react";
import { DocsView } from "./views/DocsView";
import { FeaturesView } from "./views/FeaturesView";
import { IssuesView } from "./views/IssuesView";
import type { RootKey } from "./types";

const TABS: Array<{ id: RootKey; label: string }> = [
  { id: "docs", label: "Docs" },
  { id: "features", label: "Features" },
  { id: "issues", label: "Issues" },
];

const THEME_KEY = "ew-tracker-theme";

export function App() {
  const [tab, setTab] = useState<RootKey>("docs");
  const [toast, setToast] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark" | null>(() => {
    try {
      const v = localStorage.getItem(THEME_KEY);
      return v === "light" || v === "dark" ? v : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
    try {
      if (theme) localStorage.setItem(THEME_KEY, theme);
      else localStorage.removeItem(THEME_KEY);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(h);
  }, [toast]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark">EquityWise</span>
          <span className="sub">tracker</span>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              type="button"
              key={t.id}
              className={`tab${tab === t.id ? " active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="spacer" />
        <button
          type="button"
          className="icon-btn"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title="Toggle theme"
        >
          {theme === "dark" ? "☀ Light" : "☾ Dark"}
        </button>
      </header>

      <main className={`content${tab === "docs" || tab === "features" ? " flush" : ""}`}>
        {tab === "docs" && <DocsView />}
        {tab === "features" && <FeaturesView />}
        {tab === "issues" && <IssuesView onToast={setToast} />}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
