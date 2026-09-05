import type { Dirent } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

// The three content roots that are the source of truth. Nothing is hand-listed.
const CONTENT_ROOTS = { docs: "docs", features: "features", issues: "issues" } as const;
type RootKey = keyof typeof CONTENT_ROOTS;
// Repo-root Markdown files surfaced inside the Docs tree under "Project".
const PROJECT_DOCS = ["CLAUDE.md", "README.md"];

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "out",
  "coverage",
  ".turbo",
  ".vite",
  "tracker",
]);

// ---------------------------------------------------------------- frontmatter

interface Parsed {
  meta: Record<string, unknown>;
  body: string;
}

/** Minimal YAML-frontmatter parser: scalars, inline `[a, b]`, and block lists. */
function parseFrontmatter(content: string): Parsed {
  if (!content.startsWith("---")) return { meta: {}, body: content };
  const rest = content.slice(3).replace(/^\r?\n/, "");
  const end = rest.search(/\r?\n---\r?\n/);
  const endAlt = rest.startsWith("---\n") || rest.startsWith("---\r\n") ? 0 : -1;
  let block: string;
  let body: string;
  if (end >= 0) {
    block = rest.slice(0, end);
    body = rest.slice(end).replace(/^\r?\n---\r?\n?/, "");
  } else if (endAlt === 0) {
    block = "";
    body = rest.replace(/^---\r?\n?/, "");
  } else {
    return { meta: {}, body: content };
  }

  const meta: Record<string, unknown> = {};
  const lines = block.split(/\r?\n/);
  let i = 0;
  const strip = (v: string) => v.trim().replace(/^["']|["']$/g, "");
  while (i < lines.length) {
    const line = lines[i] ?? "";
    i++;
    if (!line.trim()) continue;
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1] as string;
    const raw = (m[2] ?? "").trim();
    if (raw === "") {
      // possible block list
      const list: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i] ?? "")) {
        list.push(strip((lines[i] as string).replace(/^\s*-\s+/, "")));
        i++;
      }
      meta[key] = list;
    } else if (raw.startsWith("[") && raw.endsWith("]")) {
      meta[key] = raw
        .slice(1, -1)
        .split(",")
        .map((s) => strip(s))
        .filter(Boolean);
    } else {
      meta[key] = strip(raw);
    }
  }
  return { meta, body };
}

function serializeFrontmatter(meta: Record<string, unknown>, body: string): string {
  const lines: string[] = ["---"];
  for (const [k, v] of Object.entries(meta)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${item}`);
    } else if (v !== undefined && v !== null && v !== "") {
      const needsQuote = /^[\d.]+$/.test(String(v)) && k === "tier";
      lines.push(`${k}: ${needsQuote ? `"${v}"` : v}`);
    }
  }
  lines.push("---", "");
  return `${lines.join("\n")}\n${body.replace(/^\n+/, "")}`;
}

// ---------------------------------------------------------------- discovery

interface FileNode {
  type: "file";
  name: string;
  path: string; // repo-relative POSIX
  title: string;
  meta: Record<string, unknown>;
}
interface DirNode {
  type: "dir";
  name: string;
  path: string;
  children: TreeNode[];
}
type TreeNode = FileNode | DirNode;

function titleFrom(content: string, meta: Record<string, unknown>, name: string): string {
  if (typeof meta.title === "string" && meta.title.trim()) return meta.title.trim();
  for (const line of content.split("\n").slice(0, 80)) {
    const m = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (m?.[1]) return m[1].replace(/[`*_]/g, "").trim();
  }
  return name.replace(/\.md$/i, "");
}

async function fileNode(abs: string, name: string): Promise<FileNode> {
  const relPath = relative(repoRoot, abs).split(sep).join("/");
  let content = "";
  try {
    content = await readFile(abs, "utf8");
  } catch {
    /* unreadable */
  }
  const { meta } = parseFrontmatter(content);
  return { type: "file", name, path: relPath, title: titleFrom(content, meta, name), meta };
}

async function buildTree(absDir: string): Promise<TreeNode[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const dirs: DirNode[] = [];
  const files: FileNode[] = [];
  for (const entry of entries) {
    const abs = resolve(absDir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      const children = await buildTree(abs);
      if (children.length) {
        dirs.push({
          type: "dir",
          name: entry.name,
          path: relative(repoRoot, abs).split(sep).join("/"),
          children,
        });
      }
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      files.push(await fileNode(abs, entry.name));
    }
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.title.localeCompare(b.title));
  return [...dirs, ...files];
}

/** Flatten a tree to its files (for Features/Issues, which are lists not trees). */
function flatten(nodes: TreeNode[]): FileNode[] {
  const out: FileNode[] = [];
  for (const n of nodes) {
    if (n.type === "file") out.push(n);
    else out.push(...flatten(n.children));
  }
  return out;
}

// ---------------------------------------------------------------- safety

function safeContentPath(relPath: string): string | null {
  if (!relPath) return null;
  const abs = resolve(repoRoot, relPath);
  const rel = relative(repoRoot, abs);
  if (rel.startsWith("..") || resolve(repoRoot, rel) !== abs) return null;
  if (extname(abs).toLowerCase() !== ".md") return null;
  const segs = rel.split(sep);
  if (segs.some((s) => SKIP_DIRS.has(s))) return null;
  const top = segs[0] ?? "";
  const allowed =
    top === "docs" || top === "features" || top === "issues" || PROJECT_DOCS.includes(rel);
  return allowed ? abs : null;
}

// ---------------------------------------------------------------- generation

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

interface GenIssue {
  title: string;
  type: string;
  status: string;
  priority: string;
  tier: string;
  body: string;
}

/**
 * Derive issue files from the real backlog doc (docs/planning/pending-features.md).
 * Deterministic — parses its `### N.N Title` tier headings — so it is a projection
 * of real project data, never invented content.
 */
async function issuesFromBacklog(): Promise<GenIssue[]> {
  let doc = "";
  try {
    doc = await readFile(resolve(repoRoot, "docs/planning/pending-features.md"), "utf8");
  } catch {
    return [];
  }
  const lines = doc.split("\n");
  const out: GenIssue[] = [];
  let cur: { tier: string; title: string; done: boolean; body: string[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const major = cur.tier.split(".")[0] ?? "";
    const status = cur.done ? "done" : major === "1" ? "todo" : "backlog";
    const type = major === "2" ? "issue" : major === "1" ? "task" : major >= "3" ? "task" : "task";
    const priority = cur.done ? "low" : major === "1" ? "high" : major === "2" ? "medium" : "low";
    out.push({
      title: cur.title,
      type,
      status,
      priority,
      tier: cur.tier,
      body: cur.body.join("\n").trim(),
    });
    cur = null;
  };
  for (const line of lines) {
    const h = /^###\s+(\d[\w.]*)\s+(.+?)\s*$/.exec(line);
    if (h) {
      flush();
      const rawTitle = (h[2] as string).replace(/—\s*DONE\s*$/i, "").trim();
      cur = {
        tier: h[1] as string,
        title: rawTitle,
        done: /DONE/i.test(h[2] as string),
        body: [],
      };
      continue;
    }
    if (/^##\s+/.test(line)) flush();
    else if (cur) cur.body.push(line);
  }
  flush();
  return out;
}

// ---------------------------------------------------------------- middleware

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((res, rej) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => res(raw));
    req.on("error", rej);
  });
}

function json(res: Parameters<Connect.NextHandleFunction>[1], data: unknown, code = 200) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(data));
}

function trackerApi(): Plugin {
  return {
    name: "equitywise-tracker-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? "";
        const [path, queryString] = rawUrl.split("?");
        if (!path?.startsWith("/api/")) return next();
        const params = new URLSearchParams(queryString ?? "");

        try {
          // Content tree for a root.
          const cm = /^\/api\/content\/(docs|features|issues)$/.exec(path);
          if (cm && req.method === "GET") {
            const root = cm[1] as RootKey;
            const tree = await buildTree(resolve(repoRoot, CONTENT_ROOTS[root]));
            if (root === "docs") {
              const project: FileNode[] = [];
              for (const name of PROJECT_DOCS) {
                const node = await fileNode(resolve(repoRoot, name), name);
                project.push({ ...node, title: name }); // known by filename
              }
              const projectDir: DirNode = {
                type: "dir",
                name: "Project",
                path: "",
                children: project,
              };
              json(res, { root, tree: [projectDir, ...tree] });
            } else {
              // Features/Issues are lists; drop the folder README indexes.
              const files = flatten(tree).filter((f) => f.name.toLowerCase() !== "readme.md");
              json(res, { root, files });
            }
            return;
          }

          // Raw markdown of one file.
          if (path === "/api/doc" && req.method === "GET") {
            const abs = safeContentPath(params.get("path") ?? "");
            if (!abs) return json(res, { error: "bad path" }, 400);
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end(await readFile(abs, "utf8"));
            return;
          }

          // Update an issue's frontmatter (e.g. status on drag). Body preserved.
          if (path === "/api/issue" && req.method === "PATCH") {
            const abs = safeContentPath(params.get("path") ?? "");
            if (!abs || !relative(repoRoot, abs).startsWith("issues/")) {
              return json(res, { error: "bad path" }, 400);
            }
            const patch = JSON.parse(await readBody(req)) as Record<string, unknown>;
            const { meta, body } = parseFrontmatter(await readFile(abs, "utf8"));
            await writeFile(abs, serializeFrontmatter({ ...meta, ...patch }, body), "utf8");
            return json(res, { ok: true });
          }

          // Generate issue files from the backlog doc.
          if (path === "/api/issues/generate" && req.method === "POST") {
            const issuesDir = resolve(repoRoot, "issues");
            await mkdir(issuesDir, { recursive: true });
            const existing = flatten(await buildTree(issuesDir)).map((f) => f.name.toLowerCase());
            const derived = await issuesFromBacklog();
            let created = 0;
            for (const it of derived) {
              const fname = `${slugify(it.title)}.md`;
              if (!fname || existing.includes(fname.toLowerCase())) continue;
              const meta: Record<string, unknown> = {
                title: it.title,
                type: it.type,
                status: it.status,
                priority: it.priority,
                tier: it.tier,
                source: "docs/planning/pending-features.md",
              };
              const body = it.body || `_Generated from the backlog. See ${meta.source}._`;
              await writeFile(resolve(issuesDir, fname), serializeFrontmatter(meta, body), "utf8");
              created++;
            }
            return json(res, { created, total: derived.length });
          }

          json(res, { error: "not found" }, 404);
        } catch (err) {
          json(res, { error: err instanceof Error ? err.message : "error" }, 500);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), trackerApi()],
  server: { port: 4321, strictPort: false },
});
