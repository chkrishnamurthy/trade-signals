import { useEffect, useState } from "react";
import { loadDoc } from "../lib/api";
import type { FileNode } from "../types";
import { issuePriority, issueTier, issueType } from "../types";
import { MarkdownDoc, stripFrontmatter } from "./MarkdownDoc";

function buildPrompt(file: FileNode, body: string): string {
  const m = file.meta;
  const refs = Array.isArray(m.refs) ? (m.refs as unknown[]).map(String) : [];
  const lines = [
    "Implement this EquityWise issue. Read CLAUDE.md and the referenced files first, follow the repo's conventions, and do not start a dev server while building.",
    "",
    `## ${file.title}`,
    `Type: ${issueType(m)} · Priority: ${issuePriority(m)}${issueTier(m) ? ` · Tier: ${issueTier(m)}` : ""}`,
    `Source file: ${file.path}`,
  ];
  const clean = stripFrontmatter(body).trim();
  if (clean) lines.push("", clean);
  if (refs.length) {
    lines.push("", "### Files / references");
    for (const r of refs) lines.push(`- ${r}`);
  }
  lines.push("", "When done, run the relevant tests (`pnpm test`) and typecheck (`pnpm typecheck`).");
  return lines.join("\n");
}

export function IssueDetail({
  file,
  onClose,
  onToast,
}: {
  file: FileNode;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const [body, setBody] = useState("");

  useEffect(() => {
    loadDoc(file.path)
      .then(setBody)
      .catch(() => setBody("_Could not load this issue._"));
  }, [file.path]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(buildPrompt(file, body));
      onToast("Prompt copied — paste it into Claude Code");
    } catch {
      onToast("Copy failed — clipboard blocked");
    }
  }

  return (
    <div
      className="scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="drawer">
        <div className="drawer-head">
          <span className={`badge type-${issueType(file.meta)}`}>{issueType(file.meta)}</span>
          {issueTier(file.meta) && <span className="badge muted">tier {issueTier(file.meta)}</span>}
          <span className={`badge pri-${issuePriority(file.meta)}`}>{issuePriority(file.meta)}</span>
          <button type="button" className="close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="drawer-body">
          <h2 className="drawer-title">{file.title}</h2>
          <p className="drawer-path mono">{file.path}</p>
          <div className="drawer-md">
            <MarkdownDoc content={body} showToc={false} />
          </div>
          <div className="drawer-actions">
            <button type="button" className="btn-claude" onClick={copyPrompt}>
              ⌘ Implement with Claude
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
