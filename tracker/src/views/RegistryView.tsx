import { useMemo, useState } from "react";
import { Bar, Pill, StageDot } from "../components/atoms";
import { patchMeta } from "../lib/api";
import { planHealth, today } from "../lib/model";
import { href } from "../lib/router";
import { useStore } from "../lib/store";
import type { PlanStatus } from "../types";
import { HORIZONS, PLAN_STATUSES } from "../types";

const STAGE_FOR: Record<PlanStatus, "inbox" | "ideas" | "next" | "now" | "review" | "done" | "dropped"> = {
  draft: "inbox",
  approved: "next",
  "in-progress": "now",
  done: "done",
  superseded: "dropped",
  dropped: "dropped",
  reference: "ideas",
};
const PILL_FOR: Record<PlanStatus, "good" | "warn" | "crit" | "info" | "violet" | "neutral"> = {
  draft: "neutral",
  approved: "info",
  "in-progress": "warn",
  done: "good",
  superseded: "neutral",
  dropped: "neutral",
  reference: "violet",
};

export function RegistryView() {
  const { plans, cards, reload, toast } = useStore();
  const [filter, setFilter] = useState<PlanStatus | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  async function save(slug: string, path: string, patch: Record<string, unknown>) {
    try {
      await patchMeta(path, { ...patch, updated: today() });
      toast(`${slug}: ${Object.entries(patch).map(([k, v]) => `${k} → ${String(v)}`).join(", ")}`);
      reload();
    } catch {
      toast("Could not update the plan header");
    }
  }
  const counts = useMemo(() => Object.fromEntries(PLAN_STATUSES.map((s) => [s, plans.filter((p) => p.status === s).length])), [plans]);
  const order: PlanStatus[] = ["in-progress", "approved", "draft", "done", "superseded", "dropped", "reference"];
  const rows = useMemo(
    () => [...plans].filter((p) => !filter || p.status === filter).sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || b.updated.localeCompare(a.updated)),
    [plans, filter], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const missing = plans.filter((p) => !p.meta.status);

  return (
    <div className="v-registry">
      <div className="ph">
        <div>
          <div className="eyebrow">Plans · 3</div>
          <h1>Plan registry</h1>
          <p>Every document under <span className="mono">docs/planning/</span> with its lifecycle state read from frontmatter. <b>Edit</b> on a row changes status, horizon and phases — it writes straight back to the doc. Health is computed, never typed.</p>
        </div>
      </div>

      <div className="strip">
        {PLAN_STATUSES.map((s) => (
          <div key={s} className={`s${filter === s ? " on" : ""}`} onClick={() => setFilter(filter === s ? null : s)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setFilter(filter === s ? null : s)}>
            <div className="l"><StageDot stage={STAGE_FOR[s]} />{s}</div>
            <div className="v">{counts[s]}</div>
          </div>
        ))}
      </div>
      <div className="lc"><span>draft</span><i>→</i><span>approved</span><i>→</i><span>in-progress</span><i>→</i><span>done</span> <span style={{ marginLeft: 10, borderRadius: 999 }}>superseded</span> <span style={{ borderRadius: 999 }}>dropped</span> <span style={{ borderRadius: 999 }}>reference</span></div>

      {missing.length > 0 && (
        <p className="pill warn" style={{ marginBottom: 10 }}>{missing.length} doc{missing.length > 1 ? "s" : ""} without frontmatter — shown as draft</p>
      )}

      <div className="tw">
        <table className="grid">
          <thead><tr><th>Status</th><th>Plan</th><th>Phases</th><th>Horizon</th><th>Created</th><th>Updated</th><th>Board</th><th>Health</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => {
              const h = planHealth(p, cards);
              const isEditing = editing === p.slug;
              return (
                <tr key={p.slug}>
                  <td>
                    {isEditing ? (
                      <select className="field" style={{ width: "auto" }} value={p.status} onChange={(e) => save(p.slug, p.path, { status: e.target.value })}>
                        {PLAN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <Pill kind={PILL_FOR[p.status]}><StageDot stage={STAGE_FOR[p.status]} />{p.status}</Pill>
                    )}
                  </td>
                  <td>
                    <div className="t"><a href={href("plan", p.slug)} style={{ color: "inherit", textDecoration: "none" }}>{p.name}</a> <span className="p">{p.slug}.md</span></div>
                    <div className="p">{p.summary.slice(0, 90)}{p.supersededBy ? ` → ${p.supersededBy}` : ""}</div>
                  </td>
                  <td>{p.phasesTotal ? <><span style={{ width: 90, display: "inline-block", verticalAlign: "middle" }}><Bar pct={(p.phasesDone / p.phasesTotal) * 100} kind={p.status === "in-progress" && h.kind === "warn" ? "warn" : undefined} /></span> <span className="mono muted">{p.phasesDone}/{p.phasesTotal}</span></> : <span className="mono muted">—</span>}</td>
                  <td className="mono">
                    {isEditing ? (
                      <select className="field" style={{ width: "auto" }} value={p.horizon} onChange={(e) => save(p.slug, p.path, { horizon: e.target.value })}>
                        {HORIZONS.map((hz) => <option key={hz} value={hz}>{hz === "none" ? "—" : hz}</option>)}
                      </select>
                    ) : (
                      p.horizon === "none" ? "—" : p.horizon
                    )}
                  </td>
                  <td className="mono">{p.created.slice(5) || "—"}</td>
                  <td className="mono">{p.updated.slice(5)}</td>
                  <td>{p.board ? <span className="mono">{p.board}</span> : "—"}</td>
                  <td>{h.kind === "ok" ? <Pill kind="good">{h.label}</Pill> : h.kind === "info" ? <Pill kind="info">{h.label}</Pill> : h.kind === "warn" ? <span className="stale">⚠ {h.label}</span> : <span className="dead">✕ {h.label}</span>}</td>
                  <td>
                    {isEditing ? (
                      <span className="row-actions">
                        {p.phasesTotal > 0 && p.phasesDone < p.phasesTotal && (
                          <button type="button" className="btn sm" onClick={() => save(p.slug, p.path, { phases_done: p.phasesDone + 1 })} title="Mark next phase done">+ phase</button>
                        )}
                        <button type="button" className="btn sm primary" onClick={() => setEditing(null)}>Done</button>
                      </span>
                    ) : (
                      <button type="button" className="btn ghost sm" style={{ whiteSpace: "nowrap" }} onClick={() => setEditing(p.slug)} title="Edit status, horizon, phases">✎ Edit</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="fm">{`---
status: in-progress        # ${PLAN_STATUSES.join(" | ")}
horizon: now               # now | next | later
created: 2026-09-17
updated: 2026-09-18
owner: krishna
board: EW-090              # the card that is this plan's handle on the board
phases_total: 7
phases_done: 2
area: [core, db]
blocked_by: [intraday-strategy-dhan-plan, dhan-provider-plan]
supersedes: []
confidence: 3              # 0–3, how sure you are this is the right thing
---`}</div>
      <p className="muted" style={{ fontSize: 12 }}>These lines drive this table, the roadmap lane, the dependency graph and the phase bars. There is nothing else to maintain.</p>
    </div>
  );
}
