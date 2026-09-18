import { useEffect, useState } from "react";
import { navigate, useRoute, type View } from "./lib/router";
import { StoreProvider, useStore } from "./lib/store";
import { BoardView } from "./views/BoardView";
import { DepsView } from "./views/DepsView";
import { DocsView } from "./views/DocsView";
import { HeatmapView } from "./views/HeatmapView";
import { JournalView } from "./views/JournalView";
import { PlanView } from "./views/PlanView";
import { RegistryView } from "./views/RegistryView";
import { RoadmapView } from "./views/RoadmapView";

const THEME_KEY = "ew-tracker-theme";
const RAIL_KEY = "ew-tracker-rail";

const NAV: Array<{ group: string; items: Array<{ view: View; n: string; label: string }> }> = [
  {
    group: "Work",
    items: [
      { view: "board", n: "1", label: "Board" },
      { view: "journal", n: "2", label: "Journal" },
    ],
  },
  {
    group: "Plans",
    items: [
      { view: "registry", n: "3", label: "Registry" },
      { view: "roadmap", n: "4", label: "Roadmap" },
      { view: "deps", n: "5", label: "Dependencies" },
      { view: "plan", n: "6", label: "Plan detail" },
    ],
  },
  { group: "Insight", items: [{ view: "heatmap", n: "7", label: "Heatmap" }] },
  { group: "Read", items: [{ view: "docs", n: "8", label: "Docs" }] },
];

function Rail({ active }: { active: View }) {
  const { cards } = useStore();
  const inbox = cards.filter((c) => c.stage === "inbox").length;
  const now = cards.filter((c) => c.stage === "now").length;
  return (
    <nav className="rail" aria-label="Views">
      {NAV.map((g) => (
        <div key={g.group}>
          <div className="grp eyebrow">{g.group}</div>
          {g.items.map((it) => (
            <button
              type="button"
              key={it.view}
              className={active === it.view ? "on" : ""}
              onClick={() => navigate(it.view)}
            >
              <span className="n">{it.n}</span>
              {it.label}
              {it.view === "board" && <span className={`cnt${inbox > 5 ? " hot" : ""}`}>{inbox > 0 ? `${inbox} in · ` : ""}{now}/3</span>}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

function Shell() {
  const route = useRoute();
  const { loading, error } = useStore();
  const [railOpen, setRailOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(RAIL_KEY) !== "closed";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(RAIL_KEY, railOpen ? "open" : "closed");
    } catch {
      /* ignore */
    }
  }, [railOpen]);
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

  // Keyboard: 1–9 jump to views when focus is not in a field.
  useEffect(() => {
    const keyToView: Record<string, View> = {
      "1": "board",
      "2": "journal",
      "3": "registry",
      "4": "roadmap",
      "5": "deps",
      "6": "plan",
      "7": "heatmap",
      "8": "docs",
    };
    function on(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "[") {
        setRailOpen((o) => !o);
        return;
      }
      const v = keyToView[e.key];
      if (v) navigate(v);
    }
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const label = NAV.flatMap((g) => g.items).find((i) => i.view === route.view)?.label ?? "";
  const flush = route.view === "docs";

  return (
    <div className={`shell${railOpen ? "" : " rail-closed"}`}>
      <header className="topbar">
        <button
          type="button"
          className="btn sm rail-toggle"
          onClick={() => setRailOpen((o) => !o)}
          aria-label={railOpen ? "Hide navigation" : "Show navigation"}
          title="Toggle navigation ( [ )"
        >
          {railOpen ? "◧" : "☰"}
        </button>
        <span className="brand">
          <i />
          EquityWise Tracker
        </span>
        <span className="crumb">/ {label}</span>
        <span className="grow" />
        {loading && <span className="muted mono" style={{ fontSize: 12 }}>loading…</span>}
        {error && <span className="pill crit">{error}</span>}
        <button
          type="button"
          className="btn sm theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title="Toggle theme"
        >
          {theme === "dark" ? "☀ Light" : "☾ Dark"}
        </button>
      </header>
      {railOpen && <Rail active={route.view} />}
      <main className={`main${flush ? " flush" : ""}`}>
        {route.view === "board" && <BoardView />}
        {route.view === "journal" && <JournalView />}
        {route.view === "roadmap" && <RoadmapView />}
        {route.view === "deps" && <DepsView />}
        {route.view === "registry" && <RegistryView />}
        {route.view === "plan" && <PlanView slug={route.arg} />}
        {route.view === "heatmap" && <HeatmapView />}
        {route.view === "docs" && <DocsView path={route.arg} />}
      </main>
    </div>
  );
}

export function App() {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(h);
  }, [toast]);
  return (
    <div className="app">
      <StoreProvider onToast={setToast}>
        <Shell />
      </StoreProvider>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
