import { useEffect, useState } from "react";
import { patchMeta } from "../lib/api";
import { today } from "../lib/model";
import { href } from "../lib/router";
import { useStore } from "../lib/store";
import type { Card, Stage } from "../types";
import { AREAS, CARD_TYPES, PRIORITIES, STAGES, STAGE_LABEL } from "../types";
import { MarkdownDoc } from "./MarkdownDoc";
import { PriorityBars, StageDot, Tag, TypeGlyph } from "./atoms";

function buildPrompt(c: Card): string {
  const refs = Array.isArray(c.meta.refs) ? (c.meta.refs as unknown[]).map(String) : [];
  const lines = [
    "Implement this EquityWise card. Read CLAUDE.md and the referenced files first, follow the repo's conventions, and do not start a dev server while building.",
    "",
    `## ${c.title}`,
    `Type: ${c.type} · Priority: ${c.priority}${c.area.length ? ` · Area: ${c.area.join(", ")}` : ""}${c.plan ? ` · Plan: docs/planning/${c.plan}.md${c.phase != null ? ` phase ${c.phase}` : ""}` : ""}`,
    `Card file: ${c.path}`,
  ];
  if (c.body.trim()) lines.push("", c.body.trim());
  if (refs.length) {
    lines.push("", "### Files / references");
    for (const r of refs) lines.push(`- ${r}`);
  }
  lines.push("", "When done, run the relevant tests (`pnpm test`) and typecheck (`pnpm typecheck`).");
  return lines.join("\n");
}

export function CardDrawer({ card, onClose }: { card: Card; onClose: () => void }) {
  const { cards, plans, reload, toast } = useStore();
  const [c, setC] = useState(card);
  useEffect(() => setC(card), [card]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(patch: Record<string, unknown>) {
    try {
      await patchMeta(c.path, { ...patch, updated: today() });
      reload();
    } catch {
      toast("Could not save — check the file");
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(buildPrompt(c));
      toast("Prompt copied — paste it into Claude Code");
    } catch {
      toast("Copy failed — clipboard blocked");
    }
  }

  const plan = plans.find((p) => p.slug === c.plan);
  const blocks = cards.filter((x) => x.blockedBy.includes(c.id));

  return (
    <div
      className="scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="drawer">
        <div className="drawer-head">
          <TypeGlyph type={c.type} />
          <span className="mono muted">{c.id}</span>
          <span className="pill neutral">
            <StageDot stage={c.stage} /> {STAGE_LABEL[c.stage]}
          </span>
          <PriorityBars p={c.priority} />
          <span className="spacer" />
          <button type="button" className="close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="drawer-body">
          <h2 className="drawer-title">{c.title}</h2>
          <p className="drawer-path mono">{c.path}</p>

          <div className="form" style={{ margin: "12px 0" }}>
            <span className="k">Stage</span>
            <select className="field" value={c.stage} onChange={(e) => save({ stage: e.target.value as Stage, stage_since: today(), ...(e.target.value === "done" ? { done_at: today() } : {}) })}>
              {STAGES.map((s) => (
                <option key={s} value={s}>{STAGE_LABEL[s]}</option>
              ))}
            </select>
            <span className="k">Type</span>
            <select className="field" value={c.type} onChange={(e) => save({ type: e.target.value })}>
              {CARD_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <span className="k">Priority</span>
            <select className="field" value={c.priority} onChange={(e) => save({ priority: e.target.value })}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <span className="k">Area</span>
            <span className="row-actions">
              {AREAS.map((a) => (
                <button
                  type="button"
                  key={a}
                  className={`chip${c.area.includes(a) ? " on" : ""}`}
                  onClick={() => save({ area: c.area.includes(a) ? c.area.filter((x) => x !== a) : [...c.area, a] })}
                >
                  {a}
                </button>
              ))}
            </span>
            <span className="k">Plan</span>
            <select className="field" value={c.plan} onChange={(e) => save({ plan: e.target.value || null })}>
              <option value="">—</option>
              {plans.map((p) => (
                <option key={p.slug} value={p.slug}>{p.name}</option>
              ))}
            </select>
            <span className="k">Created</span>
            <span className="mono">{c.created} <span className="muted">· in {STAGE_LABEL[c.stage]} since {c.stageSince}</span></span>
            {c.blockedBy.length > 0 && (
              <>
                <span className="k">Blocked by</span>
                <span>{c.blockedBy.map((b) => <Tag key={b}>{b}</Tag>)}</span>
              </>
            )}
            {blocks.length > 0 && (
              <>
                <span className="k">Blocks</span>
                <span>{blocks.map((b) => <Tag key={b.id}>{b.id} {b.title}</Tag>)}</span>
              </>
            )}
            {c.why && (
              <>
                <span className="k">Why</span>
                <span>{c.why}</span>
              </>
            )}
            {c.supersededBy && (
              <>
                <span className="k">Superseded by</span>
                <span className="mono">{c.supersededBy}</span>
              </>
            )}
          </div>

          {plan && (
            <p style={{ fontSize: 13 }}>
              ▤ <a href={href("plan", plan.slug)} onClick={onClose}>{plan.name}</a>
              {c.phase != null && <span className="muted"> · phase {c.phase} of {plan.phasesTotal}</span>}
            </p>
          )}

          <div className="drawer-md">
            <MarkdownDoc content={c.body} showToc={false} />
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
