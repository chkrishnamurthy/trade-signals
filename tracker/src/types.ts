export interface FileNode {
  type: "file";
  name: string;
  path: string;
  title: string;
  meta: Record<string, unknown>;
}
export interface DirNode {
  type: "dir";
  name: string;
  path: string;
  children: TreeNode[];
}
export type TreeNode = FileNode | DirNode;

export type RootKey = "docs" | "features" | "issues";

// ---- issue model (derived from frontmatter, all fields best-effort) ----

export const ISSUE_COLUMNS = ["backlog", "todo", "in-progress", "done"] as const;
export type IssueStatus = (typeof ISSUE_COLUMNS)[number];
export const ISSUE_COLUMN_LABEL: Record<IssueStatus, string> = {
  backlog: "Backlog",
  todo: "To Do",
  "in-progress": "In Progress",
  done: "Done",
};

export const ISSUE_TYPES = ["issue", "bug", "task"] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

function str(meta: Record<string, unknown>, key: string): string {
  const v = meta[key];
  return typeof v === "string" ? v : "";
}

export function issueStatus(meta: Record<string, unknown>): IssueStatus {
  const raw = str(meta, "status").toLowerCase().replace(/[\s_]+/g, "-");
  return (ISSUE_COLUMNS as readonly string[]).includes(raw) ? (raw as IssueStatus) : "backlog";
}

export function issueType(meta: Record<string, unknown>): IssueType {
  const raw = str(meta, "type").toLowerCase();
  return (ISSUE_TYPES as readonly string[]).includes(raw) ? (raw as IssueType) : "task";
}

export function issuePriority(meta: Record<string, unknown>): "high" | "medium" | "low" {
  const raw = str(meta, "priority").toLowerCase();
  return raw === "high" || raw === "low" ? raw : raw === "medium" ? "medium" : "medium";
}

export function issueTier(meta: Record<string, unknown>): string {
  return str(meta, "tier");
}
