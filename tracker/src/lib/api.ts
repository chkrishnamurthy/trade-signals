import type { Commit, FileNode, ListRoot, TreeNode } from "../types";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return (await res.json()) as T;
}

export async function loadTree(): Promise<TreeNode[]> {
  return (await get<{ tree: TreeNode[] }>("/api/content/docs")).tree;
}

export async function loadList(root: ListRoot): Promise<FileNode[]> {
  return (await get<{ files: FileNode[] }>(`/api/list/${root}`)).files;
}

export async function loadDoc(path: string): Promise<string> {
  const res = await fetch(`/api/doc?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`load doc ${path}: ${res.status}`);
  return await res.text();
}

/** Patch frontmatter keys. Pass `null` to remove a key. */
export async function patchMeta(path: string, patch: Record<string, unknown>): Promise<void> {
  const res = await fetch(`/api/meta?path=${encodeURIComponent(path)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`patch ${path}: ${res.status}`);
}

export async function createFile(
  path: string,
  meta: Record<string, unknown>,
  body: string,
  overwrite = false,
): Promise<void> {
  const res = await fetch("/api/file", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, meta, body, overwrite }),
  });
  if (res.status === 409) throw new Error("exists");
  if (!res.ok) throw new Error(`create ${path}: ${res.status}`);
}

export async function nextId(): Promise<string> {
  return (await get<{ id: string }>("/api/next-id")).id;
}

export async function slugFor(title: string): Promise<string> {
  return (await get<{ slug: string }>(`/api/slug?title=${encodeURIComponent(title)}`)).slug;
}

export async function gitLog(opts: { days?: number; path?: string } = {}): Promise<Commit[]> {
  const q = new URLSearchParams();
  if (opts.days) q.set("days", String(opts.days));
  if (opts.path) q.set("path", opts.path);
  return (await get<{ commits: Commit[] }>(`/api/git/log?${q.toString()}`)).commits;
}
