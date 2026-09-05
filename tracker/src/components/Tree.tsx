import { useState } from "react";
import type { TreeNode } from "../types";

function prettyDir(name: string): string {
  if (!name) return "Project";
  return name
    .replace(/[-_]/g, " ")
    .replace(/\//g, " / ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function DirBranch({
  node,
  activePath,
  onSelect,
  depth,
}: {
  node: Extract<TreeNode, { type: "dir" }>;
  activePath: string | null;
  onSelect: (path: string) => void;
  depth: number;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="tree-branch">
      <button
        type="button"
        className="tree-dir"
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={`chev${open ? " open" : ""}`} aria-hidden>
          ▸
        </span>
        <span className="tree-dir-name">{prettyDir(node.name)}</span>
        <span className="tree-count">{node.children.length}</span>
      </button>
      {open && (
        <div className="tree-children">
          {node.children.map((c) =>
            c.type === "dir" ? (
              <DirBranch
                key={c.path}
                node={c}
                activePath={activePath}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ) : (
              <button
                type="button"
                key={c.path}
                className={`tree-file${activePath === c.path ? " active" : ""}`}
                style={{ paddingLeft: 8 + (depth + 1) * 12 + 14 }}
                onClick={() => onSelect(c.path)}
                title={c.path}
              >
                {c.title}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function Tree({
  nodes,
  activePath,
  onSelect,
}: {
  nodes: TreeNode[];
  activePath: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <nav className="tree" aria-label="Documentation">
      {nodes.map((n) =>
        n.type === "dir" ? (
          <DirBranch key={n.path || n.name} node={n} activePath={activePath} onSelect={onSelect} depth={0} />
        ) : (
          <button
            type="button"
            key={n.path}
            className={`tree-file${activePath === n.path ? " active" : ""}`}
            style={{ paddingLeft: 22 }}
            onClick={() => onSelect(n.path)}
            title={n.path}
          >
            {n.title}
          </button>
        ),
      )}
    </nav>
  );
}
