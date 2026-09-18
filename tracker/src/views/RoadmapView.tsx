import { useMemo, useState } from "react";
import { Bar, Pill, StageDot, Tag, TypeGlyph } from "../components/atoms";
import { patchMeta } from "../lib/api";
import { href } from "../lib/router";
import { useStore } from "../lib/store";
import type { Horizon, Plan } from "../types";

const LANES: Array<{ h: Horizon; title: string; when: string }> = [
  { h: "now", title: "Now", when: "this week" },
  { h: "next", title: "Next", when: "this month" },
  { h: "later", title: "Later", when: "someday · unscheduled" },
];

function stageOf(p: Plan): "backlog" | "todo" | "doing" | "review" | "done" | "dropped" {
  if (p.status === "done") return "done";
  if (p.status === "superseded" || p.status === "dropped") return "dropped";
  if (p.status === "in-progress") return p.phasesTotal > 0 && p.phasesDone >= p.phasesTotal ? "review" : "doing";
  if (p.status === "approved") return "todo";
  return "backlog";
}

export function RoadmapView() {
  const { plans, cards, reload, toast } = useStore();
  const [mode, setMode] = useState<"lanes" | "table">("lanes");
  const live = useMemo(
    () => plans.filter((p) => !["superseded", "dropped", "reference"].includes(p.status)),
    [plans],
  );
  const unplaced = live.filter((p) => p.horizon === "none" && p.status !== "done");

  async function move(p: Plan, h: Horizon) {
    try {
      await patchMeta(p.path, { horizon: h });
      reload();
    } catch {
      toast("Could not save horizon");
    }
  }

  function blockers(p: Plan): Plan[] {
    return p.blockedBy.map((s) => plans.find((x) => x.slug === s)).filter((x): x is Plan => !!x && x.status !== "done");
  }

  function PlanCard({ p, dim }: { p: Plan; dim?: boolean }) {
    const st = stageOf(p);
    const card = cards.find((c) => c.id === p.board);
    const bl = blockers(p);
    return (
      <div className={`rc${dim ? " dim" : ""}`}>
        <div className="t">
          <TypeGlyph type="plan-phase" />
          <a href={href("plan", p.slug)} style={{ color: "inherit", textDecoration: "none" }}>{p.name}</a>
          <span className={`st ${st}`} />
        </div>
        {p.summary && <div className="sub">{p.summary}</div>}
        {p.phasesTotal > 0 && (
          <div className="row">
            <Bar pct={(p.phasesDone / p.phasesTotal) * 100} />
            <span className="n">{p.phasesDone} of {p.phasesTotal} phases</span>
          </div>
        )}
        <div className="foot">
          {card?.priority === "urgent" && <Pill kind="crit">Urgent</Pill>}
          {p.area.map((a) => <Tag key={a}>{a}</Tag>)}
          {bl.length > 0 && <span className="blk">⛔ after {bl.map((b) => b.name).join(", ")}</span>}
          <span className={`conf c${p.confidence}`} title={`confidence ${p.confidence}/3`} style={{ marginLeft: "auto" }}><i /><i /><i /></span>
          <select className="field" style={{ width: "auto", padding: "1px 4px", fontSize: 11 }} value={p.horizon} onChange={(e) => move(p, e.target.value as Horizon)} title="Move horizon">
            <option value="now">Now</option>
            <option value="next">Next</option>
            <option value="later">Later</option>
            <option value="none">—</option>
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="v-roadmap">
      <div className="ph">
        <div>
          <div className="eyebrow">Plans · 4</div>
          <h1>Roadmap</h1>
          <p>One card per plan, three horizons, no fake dates. <b>Now</b> is this week, <b>Next</b> this month, <b>Later</b> someday. Looked at weekly.</p>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <span className="seg">
            <span className={mode === "lanes" ? "on" : ""} onClick={() => setMode("lanes")}>Horizons</span>
            <span className={mode === "table" ? "on" : ""} onClick={() => setMode("table")}>Table</span>
          </span>
        </div>
      </div>

      {mode === "lanes" ? (
        <div className="lanes">
          {LANES.map((l) => {
            const items = live.filter((p) => p.horizon === l.h);
            return (
              <section className="lane" key={l.h}>
                <header><h2>{l.title}</h2><span className="w">{l.when}</span><span className="cnt">{items.length}</span></header>
                {items.map((p) => <PlanCard key={p.slug} p={p} dim={l.h === "later"} />)}
                {items.length === 0 && <div className="muted" style={{ fontSize: 12, padding: 6 }}>—</div>}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="tw">
          <table className="grid">
            <thead><tr><th>Horizon</th><th>Plan</th><th>Status</th><th>Phases</th><th>Blocked by</th><th>Areas</th><th>Confidence</th></tr></thead>
            <tbody>
              {[...live].sort((a, b) => ["now", "next", "later", "none"].indexOf(a.horizon) - ["now", "next", "later", "none"].indexOf(b.horizon)).map((p) => (
                <tr key={p.slug}>
                  <td className="mono">{p.horizon}</td>
                  <td><a href={href("plan", p.slug)}>{p.name}</a></td>
                  <td><StageDot stage={stageOf(p) === "doing" ? "now" : stageOf(p) === "done" ? "done" : stageOf(p) === "todo" ? "next" : "ideas"} /> {p.status}</td>
                  <td className="mono">{p.phasesTotal ? `${p.phasesDone}/${p.phasesTotal}` : "—"}</td>
                  <td>{blockers(p).map((b) => b.name).join(", ") || "—"}</td>
                  <td>{p.area.map((a) => <Tag key={a}>{a}</Tag>)}</td>
                  <td className="mono">{p.confidence}/3</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {unplaced.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>No horizon yet · {unplaced.length}</div>
          <div className="row-actions">
            {unplaced.map((p) => (
              <span key={p.slug} className="chip">
                {p.name}
                <button type="button" className="btn ghost sm" onClick={() => move(p, "later")}>→ Later</button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
