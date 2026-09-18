import { execFile } from "node:child_process";
import type { Dirent } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import react from "@vitejs/plugin-react";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const execFileP = promisify(execFile);

/**
 * Content roots — the Markdown folders that are the source of truth. Nothing is
 * hand-listed; the tracker discovers files on every request.
 *
 *   docs/            the documentation tree (reader)
 *   docs/planning/   plan docs; frontmatter carries lifecycle status + phases
 *   docs/journal/    one file per day: shipped / decided / parked / tomorrow
 *   issues/          one file per board card (idea, bug, feature, chore, plan-phase)
 */
const ROOTS = {
  docs: "docs",
  planning: "docs/planning",
  journal: "docs/journal",
  issues: "issues",
} as const;
type RootKey = keyof typeof ROOTS;
// Repo-root Markdown files surfaced inside the Docs tree under "Project".
const PROJECT_DOCS = ["CLAUDE.md", "README.md"];
// Roots the tracker is allowed to write to. Never anything else.
const WRITABLE: RootKey[] = ["issues", "planning", "journal"];

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
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1] as string;
    let raw = (m[2] ?? "").trim();
    // A quoted scalar keeps everything inside the quotes (so "#23" survives);
    // an unquoted one drops a trailing ` # comment`.
    const q = /^(["'])(.*)\1\s*(?:#.*)?$/.exec(raw);
    if (q) raw = `${q[1]}${q[2]}${q[1]}`;
    else raw = raw.replace(/\s+#.*$/, "");
    if (raw === "") {
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

function yamlScalar(v: unknown): string {
  const s = String(v);
  // Quote anything YAML would otherwise reinterpret (numbers, dates, colons, #).
  if (/^[\d.]+$/.test(s) || /[:#]/.test(s) || /^(true|false|null|~)$/i.test(s) || s === "") {
    return JSON.stringify(s);
  }
  return s;
}

function serializeFrontmatter(meta: Record<string, unknown>, body: string): string {
  const lines: string[] = ["---"];
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map((x) => yamlScalar(x)).join(", ")}]`);
    } else if (typeof v === "number") {
      lines.push(`${k}: ${v}`);
    } else if (String(v) !== "") {
      lines.push(`${k}: ${yamlScalar(v)}`);
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
  mtime: string;
  body?: string;
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

async function fileNode(abs: string, name: string, withBody = false): Promise<FileNode> {
  const relPath = relative(repoRoot, abs).split(sep).join("/");
  let content = "";
  let mtime = "";
  try {
    content = await readFile(abs, "utf8");
    mtime = (await stat(abs)).mtime.toISOString();
  } catch {
    /* unreadable */
  }
  const { meta, body } = parseFrontmatter(content);
  const node: FileNode = {
    type: "file",
    name,
    path: relPath,
    title: titleFrom(content, meta, name),
    meta,
    mtime,
  };
  if (withBody) node.body = body;
  return node;
}

async function buildTree(absDir: string, withBody = false): Promise<TreeNode[]> {
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
      const children = await buildTree(abs, withBody);
      if (children.length) {
        dirs.push({
          type: "dir",
          name: entry.name,
          path: relative(repoRoot, abs).split(sep).join("/"),
          children,
        });
      }
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      files.push(await fileNode(abs, entry.name, withBody));
    }
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.title.localeCompare(b.title));
  return [...dirs, ...files];
}

function flatten(nodes: TreeNode[]): FileNode[] {
  const out: FileNode[] = [];
  for (const n of nodes) {
    if (n.type === "file") out.push(n);
    else out.push(...flatten(n.children));
  }
  return out;
}

/** A flat list of one root's files (folder README indexes excluded). */
async function listRoot(root: RootKey, withBody: boolean): Promise<FileNode[]> {
  const tree = await buildTree(resolve(repoRoot, ROOTS[root]), withBody);
  return flatten(tree).filter((f) => f.name.toLowerCase() !== "readme.md");
}

// ---------------------------------------------------------------- safety

function rootOf(rel: string): RootKey | null {
  const posix = rel.split(sep).join("/");
  // Most specific first: docs/planning before docs.
  const order: RootKey[] = ["planning", "journal", "issues", "docs"];
  for (const key of order) if (posix.startsWith(`${ROOTS[key]}/`)) return key;
  return null;
}

function safeContentPath(relPath: string, mustBeWritable = false): string | null {
  if (!relPath) return null;
  const abs = resolve(repoRoot, relPath);
  const rel = relative(repoRoot, abs);
  if (rel.startsWith("..") || resolve(repoRoot, rel) !== abs) return null;
  if (extname(abs).toLowerCase() !== ".md") return null;
  const segs = rel.split(sep);
  if (segs.some((s) => SKIP_DIRS.has(s))) return null;
  const root = rootOf(rel);
  if (!root) return PROJECT_DOCS.includes(rel) && !mustBeWritable ? abs : null;
  if (mustBeWritable && !WRITABLE.includes(root)) return null;
  return abs;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

// ---------------------------------------------------------------- git (read-only)

interface Commit {
  hash: string;
  date: string; // YYYY-MM-DD
  subject: string;
}

async function gitLog(args: string[]): Promise<Commit[]> {
  try {
    const { stdout } = await execFileP(
      "git",
      ["log", "--date=short", "--format=%h%x09%ad%x09%s", ...args],
      { cwd: repoRoot, maxBuffer: 4 * 1024 * 1024 },
    );
    return stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash = "", date = "", ...rest] = line.split("\t");
        return { hash, date, subject: rest.join("\t") };
      });
  } catch {
    return [];
  }
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

type Res = Parameters<Connect.NextHandleFunction>[1];
function json(res: Res, data: unknown, code = 200) {
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
          // Docs tree (reader).
          if (path === "/api/content/docs" && req.method === "GET") {
            const tree = await buildTree(resolve(repoRoot, ROOTS.docs));
            const project: FileNode[] = [];
            for (const name of PROJECT_DOCS) {
              const node = await fileNode(resolve(repoRoot, name), name);
              project.push({ ...node, title: name });
            }
            json(res, {
              root: "docs",
              tree: [{ type: "dir", name: "Project", path: "", children: project }, ...tree],
            });
            return;
          }

          // Flat lists of the structured roots. Cards and decisions ship with
          // their body (short); plans and journal entries too, since the views
          // need summaries and sections without a second round-trip.
          const lm = /^\/api\/list\/(issues|planning|journal)$/.exec(path);
          if (lm && req.method === "GET") {
            const root = lm[1] as RootKey;
            json(res, { root, files: await listRoot(root, true) });
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

          // Patch a file's frontmatter. Body preserved. `null` removes a key.
          if (path === "/api/meta" && req.method === "PATCH") {
            const abs = safeContentPath(params.get("path") ?? "", true);
            if (!abs) return json(res, { error: "bad path" }, 400);
            const patch = JSON.parse(await readBody(req)) as Record<string, unknown>;
            const { meta, body } = parseFrontmatter(await readFile(abs, "utf8"));
            const next: Record<string, unknown> = { ...meta };
            for (const [k, v] of Object.entries(patch)) {
              if (v === null) delete next[k];
              else next[k] = v;
            }
            await writeFile(abs, serializeFrontmatter(next, body), "utf8");
            return json(res, { ok: true, meta: next });
          }

          // Create (or, with overwrite, replace) a Markdown file in a writable root.
          if (path === "/api/file" && req.method === "POST") {
            const input = JSON.parse(await readBody(req)) as {
              path: string;
              meta: Record<string, unknown>;
              body: string;
              overwrite?: boolean;
            };
            const abs = safeContentPath(input.path ?? "", true);
            if (!abs) return json(res, { error: "bad path" }, 400);
            let exists = false;
            try {
              await stat(abs);
              exists = true;
            } catch {
              /* new file */
            }
            if (exists && !input.overwrite) return json(res, { error: "exists" }, 409);
            await mkdir(dirname(abs), { recursive: true });
            await writeFile(abs, serializeFrontmatter(input.meta ?? {}, input.body ?? ""), "utf8");
            return json(res, { ok: true, path: input.path });
          }

          // Next free card id (EW-nnn) — derived from the files, never stored.
          if (path === "/api/next-id" && req.method === "GET") {
            const cards = await listRoot("issues", false);
            let max = 100;
            for (const c of cards) {
              const m = /^EW-(\d+)$/.exec(String(c.meta.id ?? ""));
              if (m) max = Math.max(max, Number(m[1]));
            }
            return json(res, { id: `EW-${max + 1}` });
          }

          // Slug helper so the client names files the same way the server would.
          if (path === "/api/slug" && req.method === "GET") {
            return json(res, { slug: slugify(params.get("title") ?? "") });
          }

          // Git history, read-only. ?days=N for the recent log, ?path= for one file.
          if (path === "/api/git/log" && req.method === "GET") {
            const days = Math.min(Math.max(Number(params.get("days") ?? "56"), 1), 400);
            const file = params.get("path");
            const args = [`--since=${days} days ago`];
            if (file) {
              const abs = safeContentPath(file);
              if (!abs) return json(res, { error: "bad path" }, 400);
              args.push("--follow", "--", relative(repoRoot, abs));
            }
            return json(res, { commits: await gitLog(args) });
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
