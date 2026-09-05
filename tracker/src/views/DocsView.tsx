import { useEffect, useMemo, useState } from "react";
import { MarkdownDoc } from "../components/MarkdownDoc";
import { Tree } from "../components/Tree";
import { loadDoc, loadTree } from "../lib/api";
import type { FileNode, TreeNode } from "../types";

function firstFile(nodes: TreeNode[]): FileNode | null {
  for (const n of nodes) {
    if (n.type === "file") return n;
    const f = firstFile(n.children);
    if (f) return f;
  }
  return null;
}

export function DocsView() {
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadTree("docs")
      .then((t) => {
        setTree(t);
        const f = firstFile(t);
        if (f) setActivePath(f.path);
      })
      .catch(() => setTree([]));
  }, []);

  useEffect(() => {
    if (!activePath) return;
    setLoading(true);
    loadDoc(activePath)
      .then(setContent)
      .catch(() => setContent("_Could not load this document._"))
      .finally(() => setLoading(false));
  }, [activePath]);

  const crumbs = useMemo(() => (activePath ? activePath.split("/") : []), [activePath]);

  if (tree === null) return <p className="empty">Loading…</p>;

  return (
    <div className="split">
      <aside className="nav-pane">
        <div className="nav-pane-head">Documentation</div>
        <Tree nodes={tree} activePath={activePath} onSelect={setActivePath} />
      </aside>
      <section className="read-pane">
        {activePath && (
          <div className="crumbs">
            {crumbs.map((c, i) => (
              <span key={i}>
                {i > 0 && <span className="sep">/</span>}
                <span className={i === crumbs.length - 1 ? "cur" : ""}>{c}</span>
              </span>
            ))}
          </div>
        )}
        {loading ? <p className="empty">Loading…</p> : <MarkdownDoc content={content} />}
      </section>
    </div>
  );
}
