import { useEffect, useMemo, useState } from "react";
import { MarkdownDoc } from "../components/MarkdownDoc";
import { Tree } from "../components/Tree";
import { loadDoc, loadTree } from "../lib/api";
import { navigate } from "../lib/router";
import type { FileNode, TreeNode } from "../types";

function firstFile(nodes: TreeNode[]): FileNode | null {
  for (const n of nodes) {
    if (n.type === "file") return n;
    const f = firstFile(n.children);
    if (f) return f;
  }
  return null;
}

export function DocsView({ path }: { path: string }) {
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const activePath = path || null;

  useEffect(() => {
    loadTree()
      .then((t) => {
        setTree(t);
        if (!path) {
          const f = firstFile(t);
          if (f) navigate("docs", f.path);
        }
      })
      .catch(() => setTree([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        <Tree nodes={tree} activePath={activePath} onSelect={(p) => navigate("docs", p)} />
      </aside>
      <section className="read-pane">
        {activePath && (
          <div className="crumbs">
            {crumbs.map((c, i) => (
              <span key={`${c}-${i}`}>
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
