import { useEffect, useMemo, useState } from "react";
import { MarkdownDoc } from "../components/MarkdownDoc";
import { Bar, Pill, StageDot, Tag, TypeGlyph } from "../components/atoms";
import { gitLog, patchMeta } from "../lib/api";
import { planHealth, today } from "../lib/model";
import { href, navigate } from "../lib/router";
import { useStore } from "../lib/store";
import type { Commit, Plan, PlanStatus } from "../types";
import { PLAN_STATUSES } from "../types";

function PlanPicker({ plans }: { plans: Plan[] }) {
  const order: PlanStatus[] = ["in-progress", "approved", "draft", "done", "reference", "superseded", "dropped"];
  return (
    <div className="v-plan">
      <div className="ph"><div><div className="eyebrow">Plans · 6</div><h1>Plan detail</h1><p>Pick a plan. Each one gets its header, phase stepper, reader and history on one page.</p></div></div>
      <div className="steps" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
        {[...plans].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status)).map((p) => (
          <div key={p.slug} className={`step${p.status === "done" ? " done" : p.status === "in-progress" ? " doing" : ""}`} onClick={() => navigate("plan", p.slug)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && navigate("plan", p.slug)} style={{ cursor: "pointer" }}>
            <div className="n">{p.status}{p.phasesTotal ? ` · ${p.phasesDone}/${p.phasesTotal}` : ""}</div>
            <div className="t">{p.name}</div>
            <div className="s">{p.slug}.md</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlanView({ slug }: { slug: string }) {
  const { plans, cards, reload, toast } = useStore();
  const plan = plans.find((p) => p.slug === slug);
  const [commits, setCommits] = useState<Commit[]>([]);
  useEffect(() => {
    if (!plan) return;
    gitLog({ days: 365, path: plan.path }).then(setCommits).catch(() => setCommits([]));
  }, [plan?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  const linked = useMemo(() => cards.filter((c) => c.plan === slug).sort((a, b) => (a.phase ?? 99) - (b.phase ?? 99)), [cards, slug]);

  if (!slug || !plan) return <PlanPicker plans={plans} />;

  const health = planHealth(plan, cards);
  const blockedBy = plan.blockedBy.map((s) => plans.find((p) => p.slug === s)).filter((x): x is Plan => !!x);
  const blocks = plans.filter((p) => p.blockedBy.includes(plan.slug));
  const phases = Array.from({ length: plan.phasesTotal }, (_, i) => i);
  const phaseName = (i: number) => plan.phaseNames[i] ?? `Phase ${i}`;

  async function save(patch: Record<string, unknown>) {
    try {
      await patchMeta(plan!.path, { ...patch, updated: today() });
      reload();
    } catch {
      toast("Could not update the plan header");
    }
  }

  return (
    <div className="v-plan">
      <div className="ph">
        <div>
          <div className="eyebrow">Plans · 6 · <a href={href("registry")}>Registry</a> / {plan.slug}.md</div>
          <h1>{plan.title}</h1>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <a className="btn" href={href("docs", plan.path)}>Open in reader</a>
          {plan.status === "in-progress" && plan.phasesDone < plan.phasesTotal && (
            <button type="button" className="btn primary" onClick={() => save({ phases_done: plan.phasesDone + 1 })}>Mark phase {plan.phasesDone} done</button>
          )}
          {plan.status === "in-progress" && plan.phasesTotal > 0 && plan.phasesDone >= plan.phasesTotal && (
            <button type="button" className="btn primary" onClick={() => save({ status: "done" })}>Close plan → done</button>
          )}
        </div>
      </div>

      <section className="hdr">
        <div className="meta">
          <select className="field" style={{ width: "auto" }} value={plan.status} onChange={(e) => save({ status: e.target.value })}>
            {PLAN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {health.kind === "ok" ? <Pill kind="good">{health.label}</Pill> : health.kind === "info" ? <Pill kind="info">{health.label}</Pill> : health.kind === "warn" ? <Pill kind="warn">⚠ {health.label}</Pill> : <Pill kind="crit">✕ {health.label}</Pill>}
          {plan.area.map((a) => <Tag key={a}>{a}</Tag>)}
          <span className="muted" style={{ fontSize: 12 }}>
            {plan.board && <>· board <span className="mono">{plan.board}</span> </>}
            {plan.horizon !== "none" && <>· horizon <span className="mono">{plan.horizon}</span></>}
          </span>
        </div>
        {plan.summary && <p className="muted" style={{ margin: "0 0 4px", maxWidth: "80ch" }}>{plan.summary}</p>}
        <div className="kv">
          <span><span className="k">Created</span><span className="mono">{plan.created || "—"}</span></span>
          <span><span className="k">Updated</span><span className="mono">{plan.updated}</span></span>
          <span><span className="k">Blocked by</span>{blockedBy.length ? blockedBy.map((b) => <a key={b.slug} href={href("plan", b.slug)}>{b.name}{b.status === "done" ? " ✓" : ""} </a>) : "—"}</span>
          <span><span className="k">Blocks</span>{blocks.length ? blocks.map((b) => <a key={b.slug} href={href("plan", b.slug)}>{b.name} </a>) : "—"}</span>
          <span><span className="k">Doc size</span><span className="mono">{plan.body.split("\n").length} lines · {plan.body.split("\n").filter((l) => /^##\s/.test(l)).length} sections</span></span>
          <span><span className="k">Confidence</span><span className="mono">{plan.confidence}/3</span></span>
        </div>
      </section>

      {plan.phasesTotal > 0 && (
        <div className="steps" style={{ gridTemplateColumns: `repeat(${Math.min(plan.phasesTotal, 7)},1fr)` }}>
          {phases.map((i) => {
            const card = linked.find((c) => c.phase === i);
            const state = i < plan.phasesDone ? "done" : i === plan.phasesDone && plan.status === "in-progress" ? "doing" : "";
            return (
              <div key={i} className={`step ${state}`}>
                <div className="n">Phase {i}</div>
                <div className="t">{phaseName(i)}</div>
                <div className="s">{state === "done" ? "done" : state === "doing" ? "in progress" : card ? card.stage : "pending"}{card ? ` · ${card.id}` : ""}</div>
              </div>
            );
          })}
        </div>
      )}

      <div className="cols">
        <div>
          {linked.length > 0 && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginBottom: 8 }}>Board cards · {linked.length}</h2>
              <ul className="cl">
                {linked.map((c) => (
                  <li key={c.id}>
                    <StageDot stage={c.stage} />
                    <span><TypeGlyph type={c.type} /> {c.title}{c.phase != null && <span className="muted"> · phase {c.phase}</span>}</span>
                    <span className="who">{c.id} · {c.stage}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="doc">
            <MarkdownDoc content={plan.body} />
          </div>
        </div>
        <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {plan.phasesTotal > 0 && (
            <div className="hill">
              <div className="eyebrow" style={{ marginBottom: 6 }}>Progress</div>
              <Bar pct={(plan.phasesDone / plan.phasesTotal) * 100} />
              <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>{plan.phasesDone} of {plan.phasesTotal} phases done. Bump with "Mark phase done" above; it writes <span className="mono">phases_done</span> back to the doc.</p>
            </div>
          )}
          <div className="panel">
            <div className="eyebrow" style={{ marginBottom: 8 }}>File history</div>
            <div className="act">
              {commits.slice(0, 8).map((c) => (
                <div className="e" key={c.hash}><span className="d">{c.date.slice(5)}</span><span>{c.subject}</span></div>
              ))}
              {commits.length === 0 && <span className="muted">No commits yet (or uncommitted).</span>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
