import type {
  Card,
  CardType,
  FileNode,
  Horizon,
  JournalEntry,
  Plan,
  PlanStatus,
  Priority,
  Stage,
} from "../types";
import {
  CARD_TYPES,
  HORIZONS,
  PLAN_STATUSES,
  PRIORITIES,
  STAGES,
} from "../types";

const str = (m: Record<string, unknown>, k: string): string => {
  const v = m[k];
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
};
const list = (m: Record<string, unknown>, k: string): string[] => {
  const v = m[k];
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v.trim()) return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
};
const num = (m: Record<string, unknown>, k: string): number | null => {
  const v = str(m, k);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const oneOf = <T extends string>(v: string, all: readonly T[], fallback: T): T =>
  (all as readonly string[]).includes(v) ? (v as T) : fallback;

export function slugOf(path: string): string {
  return (path.split("/").pop() ?? "").replace(/\.md$/i, "");
}

/** Today's date as YYYY-MM-DD in the viewer's local time. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysBetween(from: string, to = today()): number {
  if (!from) return 0;
  const a = Date.parse(`${from}T00:00:00`);
  const b = Date.parse(`${to}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

// ---------------------------------------------------------------- cards

/** Old tracker `status` values map onto the new stage lifecycle. */
const LEGACY_STAGE: Record<string, Stage> = {
  backlog: "ideas",
  todo: "next",
  "in-progress": "now",
  done: "done",
};
const LEGACY_TYPE: Record<string, CardType> = { issue: "feature", task: "feature" };

export function toCard(f: FileNode): Card {
  const m = f.meta;
  const rawStage = str(m, "stage") || str(m, "status");
  const stage = oneOf(rawStage, STAGES, LEGACY_STAGE[rawStage] ?? "inbox");
  const rawType = str(m, "type");
  const type = oneOf(rawType, CARD_TYPES, LEGACY_TYPE[rawType] ?? "idea");
  const created = str(m, "created") || f.mtime.slice(0, 10);
  return {
    path: f.path,
    id: str(m, "id") || slugOf(f.path),
    title: f.title,
    type,
    stage,
    priority: oneOf(str(m, "priority"), PRIORITIES, "medium") as Priority,
    area: list(m, "area"),
    plan: str(m, "plan"),
    phase: num(m, "phase"),
    created,
    updated: str(m, "updated") || f.mtime.slice(0, 10),
    stageSince: str(m, "stage_since") || str(m, "updated") || created,
    doneAt: str(m, "done_at"),
    blockedBy: list(m, "blocked_by"),
    supersededBy: str(m, "superseded_by"),
    why: str(m, "why"),
    source: str(m, "source"),
    tier: str(m, "tier"),
    body: f.body ?? "",
    meta: m,
  };
}

export function cardAge(c: Card): number {
  return daysBetween(c.created);
}
export function cardStageAge(c: Card): number {
  return daysBetween(c.stageSince);
}

// ---------------------------------------------------------------- plans

export function toPlan(f: FileNode): Plan {
  const m = f.meta;
  const body = f.body ?? "";
  const summary =
    str(m, "summary") ||
    body
      .split("\n")
      .find((l) => l.trim() && !l.startsWith("#") && !l.startsWith(">") && !l.startsWith("**"))
      ?.trim()
      .slice(0, 200) ||
    "";
  return {
    path: f.path,
    slug: slugOf(f.path),
    title: f.title,
    name: str(m, "name") || f.title,
    status: oneOf(str(m, "status"), PLAN_STATUSES, "draft") as PlanStatus,
    horizon: oneOf(str(m, "horizon"), HORIZONS, "none") as Horizon,
    summary,
    created: str(m, "created"),
    updated: str(m, "updated") || f.mtime.slice(0, 10),
    owner: str(m, "owner"),
    board: str(m, "board"),
    phasesTotal: num(m, "phases_total") ?? 0,
    phasesDone: num(m, "phases_done") ?? 0,
    phaseNames: list(m, "phase_names"),
    area: list(m, "area"),
    blockedBy: list(m, "blocked_by"),
    supersedes: list(m, "supersedes"),
    supersededBy: str(m, "superseded_by"),
    confidence: Math.max(0, Math.min(3, num(m, "confidence") ?? 0)),
    mtime: f.mtime,
    body,
    meta: m,
  };
}

export type PlanHealth =
  | { kind: "ok"; label: string }
  | { kind: "info"; label: string }
  | { kind: "warn"; label: string }
  | { kind: "crit"; label: string };

/** Computed, never typed: the weekly-review checklist for one plan. */
export function planHealth(p: Plan, cards: Card[]): PlanHealth {
  const idle = daysBetween(p.updated);
  const hasCard = !!p.board && cards.some((c) => c.id === p.board);
  switch (p.status) {
    case "in-progress":
      if (p.phasesTotal > 0 && p.phasesDone >= p.phasesTotal) return { kind: "info", label: "all phases done — close?" };
      if (idle >= 7) return { kind: "warn", label: `untouched ${idle}d` };
      if (!hasCard) return { kind: "crit", label: "no board card" };
      return { kind: "ok", label: "active" };
    case "draft":
      if (p.supersededBy) return { kind: "crit", label: "mark superseded?" };
      if (idle >= 14) return { kind: "warn", label: `${idle}d no activity` };
      if (!hasCard) return { kind: "crit", label: "no board card" };
      return { kind: "ok", label: "draft" };
    case "approved":
      return hasCard ? { kind: "info", label: "waiting" } : { kind: "crit", label: "no board card" };
    case "done":
      return { kind: "ok", label: "ok" };
    case "reference":
      return idle >= 21 ? { kind: "warn", label: `stale ${idle}d` } : { kind: "ok", label: "—" };
    default:
      return { kind: "ok", label: "archived" };
  }
}

// ---------------------------------------------------------------- journal

function section(body: string, heading: string): string[] {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, "im");
  const m = re.exec(body);
  if (!m) return [];
  const rest = body.slice(m.index + m[0].length);
  const end = rest.search(/^##\s+/m);
  const block = end >= 0 ? rest.slice(0, end) : rest;
  return block
    .split("\n")
    .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
    .filter((l) => l && !l.startsWith("<!--"));
}

export function toJournal(f: FileNode): JournalEntry {
  const body = f.body ?? "";
  return {
    path: f.path,
    date: str(f.meta, "date") || slugOf(f.path),
    shipped: section(body, "Shipped"),
    decided: section(body, "Decided"),
    parked: section(body, "Parked"),
    tomorrow: section(body, "Tomorrow").join(" "),
    body,
  };
}

export function journalBody(e: {
  shipped: string;
  decided: string;
  parked: string;
  tomorrow: string;
}): string {
  const lines = (s: string) =>
    s
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => `- ${l.replace(/^[-*]\s+/, "")}`)
      .join("\n");
  return [
    "## Shipped",
    lines(e.shipped) || "- —",
    "",
    "## Decided",
    lines(e.decided) || "- —",
    "",
    "## Parked",
    lines(e.parked) || "- —",
    "",
    "## Tomorrow",
    e.tomorrow.trim() || "—",
    "",
  ].join("\n");
}

