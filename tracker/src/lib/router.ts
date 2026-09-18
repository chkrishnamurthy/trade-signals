import { useEffect, useState } from "react";

export type View =
  | "board"
  | "journal"
  | "roadmap"
  | "deps"
  | "registry"
  | "plan"
  | "heatmap"
  | "docs";

export interface Route {
  view: View;
  arg: string; // plan slug, doc path, card id — view-specific
}

const VIEWS: View[] = [
  "board",
  "journal",
  "roadmap",
  "deps",
  "registry",
  "plan",
  "heatmap",
  "docs",
];

export function parseHash(hash: string): Route {
  const [, view = "board", ...rest] = hash.replace(/^#/, "").split("/");
  const v = (VIEWS as string[]).includes(view) ? (view as View) : "board";
  return { view: v, arg: decodeURIComponent(rest.join("/")) };
}

export function href(view: View, arg = ""): string {
  return `#/${view}${arg ? `/${encodeURIComponent(arg).replace(/%2F/g, "/")}` : ""}`;
}

export function navigate(view: View, arg = ""): void {
  window.location.hash = href(view, arg);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
