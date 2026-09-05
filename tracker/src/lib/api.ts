import type { FileNode, RootKey, TreeNode } from "../types";

export async function loadTree(root: "docs"): Promise<TreeNode[]> {
  const res = await fetch(`/api/content/${root}`);
  if (!res.ok) throw new Error(`load ${root}: ${res.status}`);
  const data = (await res.json()) as { tree: TreeNode[] };
  return data.tree;
}

export async function loadList(root: Exclude<RootKey, "docs">): Promise<FileNode[]> {
  const res = await fetch(`/api/content/${root}`);
  if (!res.ok) throw new Error(`load ${root}: ${res.status}`);
  const data = (await res.json()) as { files: FileNode[] };
  return data.files;
}

export async function loadDoc(path: string): Promise<string> {
  const res = await fetch(`/api/doc?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`load doc ${path}: ${res.status}`);
  return await res.text();
}

export async function patchIssue(path: string, patch: Record<string, unknown>): Promise<void> {
  const res = await fetch(`/api/issue?path=${encodeURIComponent(path)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`patch issue: ${res.status}`);
}

export async function generateIssues(): Promise<{ created: number; total: number }> {
  const res = await fetch("/api/issues/generate", { method: "POST" });
  if (!res.ok) throw new Error(`generate: ${res.status}`);
  return (await res.json()) as { created: number; total: number };
}
