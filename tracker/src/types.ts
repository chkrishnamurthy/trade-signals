export interface FileNode {
  type: "file";
  name: string;
  path: string;
  title: string;
  meta: Record<string, unknown>;
  mtime: string;
  body?: string;
}
export interface DirNode {
  type: "dir";
  name: string;
  path: string;
  children: TreeNode[];
}
export type TreeNode = FileNode | DirNode;

export type ListRoot = "issues" | "planning" | "journal";

// ---------------------------------------------------------------- cards (issues/)

export const STAGES = ["inbox", "ideas", "next", "now", "review", "done", "dropped"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = {
  inbox: "Inbox",
  ideas: "Ideas",
  next: "Next",
  now: "Now",
  review: "Review",
  done: "Done",
  dropped: "Dropped",
};
/** Work-in-progress cap on the Now column — the whole point of the board. */
export const WIP_LIMIT = 3;
/** Days a card may sit in Now before the weekly review asks "kill or keep?". */
export const WIP_MAX_AGE_DAYS = 7;

export const CARD_TYPES = ["idea", "bug", "feature", "chore", "plan-phase"] as const;
export type CardType = (typeof CARD_TYPES)[number];
export const CARD_TYPE_GLYPH: Record<CardType, string> = {
  idea: "I",
  bug: "B",
  feature: "F",
  chore: "C",
  "plan-phase": "P",
};

export const PRIORITIES = ["urgent", "high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const AREAS = ["provider", "worker", "web", "core", "db", "mobile", "ops", "docs"] as const;

export interface Card {
  path: string;
  id: string;
  title: string;
  type: CardType;
  stage: Stage;
  priority: Priority;
  area: string[];
  plan: string; // planning doc slug, or ""
  phase: number | null;
  created: string; // YYYY-MM-DD or ""
  updated: string;
  stageSince: string; // date the card entered its current stage
  doneAt: string;
  blockedBy: string[]; // card ids
  supersededBy: string;
  why: string;
  source: string;
  tier: string;
  body: string;
  meta: Record<string, unknown>;
}

// ---------------------------------------------------------------- plans (docs/planning/)

export const PLAN_STATUSES = [
  "draft",
  "approved",
  "in-progress",
  "done",
  "superseded",
  "dropped",
  "reference",
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export const HORIZONS = ["now", "next", "later", "none"] as const;
export type Horizon = (typeof HORIZONS)[number];

export interface Plan {
  path: string;
  slug: string;
  title: string; // the doc's H1
  name: string; // short name for cards and graph nodes (frontmatter `name`, else title)
  status: PlanStatus;
  horizon: Horizon;
  summary: string;
  created: string;
  updated: string;
  owner: string;
  board: string; // card id
  phasesTotal: number;
  phasesDone: number;
  phaseNames: string[];
  area: string[];
  blockedBy: string[]; // plan slugs
  supersedes: string[];
  supersededBy: string;
  confidence: number; // 0–3
  mtime: string;
  body: string;
  meta: Record<string, unknown>;
}

// ---------------------------------------------------------------- journal (docs/journal/)

export interface JournalEntry {
  path: string;
  date: string;
  shipped: string[];
  decided: string[];
  parked: string[];
  tomorrow: string;
  body: string;
}

export interface Commit {
  hash: string;
  date: string;
  subject: string;
}
