import { useEffect, useState } from "react";
import { MarkdownDoc } from "../components/MarkdownDoc";
import { loadDoc, loadList } from "../lib/api";
import type { FileNode } from "../types";

function meta(f: FileNode, key: string): string {
  const v = f.meta[key];
  return typeof v === "string" ? v : "";
}

export function FeaturesView() {
  const [files, setFiles] = useState<FileNode[] | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadList("features")
      .then((f) => {
        setFiles(f);
        if (f[0]) setActivePath(f[0].path);
      })
      .catch(() => setFiles([]));
  }, []);

  useEffect(() => {
    if (!activePath) return;
    setLoading(true);
    loadDoc(activePath)
      .then(setContent)
      .catch(() => setContent("_Could not load this feature._"))
      .finally(() => setLoading(false));
  }, [activePath]);

  if (files === null) return <p className="empty">Loading…</p>;

  if (files.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon" aria-hidden>
          ✦
        </div>
        <h2>No features yet</h2>
        <p>
          Feature definitions are Markdown files under <code>features/</code>. Add a{" "}
          <code>.md</code> file with frontmatter (<code>title</code>, <code>status</code>,{" "}
          <code>area</code>) and it appears here automatically — nothing to configure.
        </p>
      </div>
    );
  }

  return (
    <div className="split">
      <aside className="nav-pane">
        <div className="nav-pane-head">
          Features <span className="pane-count">{files.length}</span>
        </div>
        <div className="feature-list">
          {files.map((f) => {
            const status = meta(f, "status");
            const area = meta(f, "area");
            return (
              <button
                type="button"
                key={f.path}
                className={`feature-item${activePath === f.path ? " active" : ""}`}
                onClick={() => setActivePath(f.path)}
              >
                <span className="fi-title">{f.title}</span>
                <span className="fi-meta">
                  {area && <span className="fi-area">{area}</span>}
                  {status && <span className={`fi-status s-${status.toLowerCase()}`}>{status}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </aside>
      <section className="read-pane">
        {loading ? <p className="empty">Loading…</p> : <MarkdownDoc content={content} />}
      </section>
    </div>
  );
}
