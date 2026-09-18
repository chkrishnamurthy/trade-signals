import { useMemo, useState } from "react";
import { Pill } from "../components/atoms";
import { href, navigate } from "../lib/router";
import { useStore } from "../lib/store";
import type { Plan } from "../types";

const W = 168;
const H = 42;
const COL = 236;
const ROW = 62;

interface Node {
  p: Plan;
  layer: number;
  row: number;
  x: number;
  y: number;
}

/** Longest-path layering: a plan sits one column right of its deepest blocker. */
function layout(plans: Plan[]): { nodes: Node[]; width: number; height: number } {
  const bySlug = new Map(plans.map((p) => [p.slug, p]));
  const memo = new Map<string, number>();
  const depth = (slug: string, seen = new Set<string>()): number => {
    if (memo.has(slug)) return memo.get(slug) as number;
    if (seen.has(slug)) return 0;
    seen.add(slug);
    const p = bySlug.get(slug);
    const d = p ? Math.max(0, ...p.blockedBy.filter((b) => bySlug.has(b)).map((b) => depth(b, seen) + 1)) : 0;
    memo.set(slug, d);
    return d;
  };
  const layers = new Map<number, Plan[]>();
  for (const p of plans) {
    const l = depth(p.slug);
    layers.set(l, [...(layers.get(l) ?? []), p]);
  }
  const nodes: Node[] = [];
  let maxRows = 0;
  for (const [l, ps] of layers) {
    ps.sort((a, b) => a.name.localeCompare(b.name));
    maxRows = Math.max(maxRows, ps.length);
    ps.forEach((p, i) => nodes.push({ p, layer: l, row: i, x: 20 + l * COL, y: 40 + i * ROW }));
  }
  const cols = layers.size;
  return { nodes, width: 40 + cols * COL, height: 60 + maxRows * ROW };
}

export function DepsView() {
  const { plans } = useStore();
  const [hideDone, setHideDone] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);

  const live = useMemo(() => plans.filter((p) => !["superseded", "dropped", "reference"].includes(p.status) && (!hideDone || p.status !== "done")), [plans, hideDone]);
  const { nodes, width, height } = useMemo(() => layout(live), [live]);
  const pos = new Map(nodes.map((n) => [n.p.slug, n]));

  const blocks = (slug: string) => live.filter((p) => p.blockedBy.includes(slug));
  const hubs = [...live].map((p) => ({ p, n: blocks(p.slug).length })).filter((h) => h.n > 0).sort((a, b) => b.n - a.n);
  const free = live.filter((p) => p.blockedBy.filter((b) => pos.has(b)).length === 0 && p.status !== "done");

  const related = (slug: string): Set<string> => {
    const s = new Set<string>([slug]);
    const walkUp = (x: string) => pos.get(x)?.p.blockedBy.forEach((b) => { if (!s.has(b)) { s.add(b); walkUp(b); } });
    const walkDown = (x: string) => blocks(x).forEach((c) => { if (!s.has(c.slug)) { s.add(c.slug); walkDown(c.slug); } });
    walkUp(slug);
    walkDown(slug);
    return s;
  };
  const lit = focus ? related(focus) : null;

  return (
    <div className="v-deps">
      <div className="ph">
        <div>
          <div className="eyebrow">Plans · 5</div>
          <h1>Dependencies</h1>
          <p>What is blocked on what — generated from each plan's <span className="mono">blocked_by:</span> frontmatter. Click a plan to light up its chain.</p>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <button type="button" className={`chip${hideDone ? " on" : ""}`} onClick={() => setHideDone((v) => !v)}>hide done</button>
          {focus && <button type="button" className="chip on" onClick={() => setFocus(null)}>focus: {pos.get(focus)?.p.name} ✕</button>}
        </div>
      </div>

      <div className="gwrap">
        {nodes.length === 0 ? (
          <p className="muted">No plans with frontmatter yet.</p>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Dependency graph of plans" style={{ minWidth: Math.min(width, 900) }}>
            <defs>
              <marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z" fill="context-stroke" />
              </marker>
            </defs>
            {Array.from(new Set(nodes.map((n) => n.layer))).sort().map((l) => (
              <text key={l} className="gl" x={20 + l * COL} y={24}>{l === 0 ? "FOUNDATIONS" : `LAYER ${l}`}</text>
            ))}
            {nodes.flatMap((n) =>
              n.p.blockedBy.map((b) => {
                const src = pos.get(b);
                if (!src) return null;
                const x1 = src.x + W;
                const y1 = src.y + H / 2;
                const x2 = n.x;
                const y2 = n.y + H / 2;
                const dx = Math.max(30, (x2 - x1) / 2);
                const onPath = lit ? lit.has(b) && lit.has(n.p.slug) : false;
                const cls = `edge${src.p.status === "done" ? " done" : ""}${onPath ? " crit" : ""}`;
                return <path key={`${b}->${n.p.slug}`} className={cls} markerEnd="url(#ar)" d={`M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`} style={lit && !onPath ? { opacity: 0.25 } : undefined} />;
              }),
            )}
            {nodes.map((n) => {
              const st = n.p.status;
              const cls = `node${st === "done" ? " done" : st === "in-progress" ? " doing" : " draft"}${blocks(n.p.slug).length >= 3 ? " hub" : ""}`;
              const sub = st === "done" ? "done" : n.p.phasesTotal ? `${n.p.phasesDone} / ${n.p.phasesTotal} · ${n.p.horizon}` : `${st} · ${n.p.horizon}`;
              const dim = lit && !lit.has(n.p.slug);
              return (
                <g key={n.p.slug} className={cls} transform={`translate(${n.x},${n.y})`} style={{ cursor: "pointer", opacity: dim ? 0.3 : 1 }} onClick={() => setFocus(focus === n.p.slug ? null : n.p.slug)} onDoubleClick={() => navigate("plan", n.p.slug)}>
                  <rect width={W} height={H} rx={8} />
                  <circle cx={16} cy={21} r={5} fill={st === "done" ? "var(--good)" : st === "in-progress" ? "var(--warn)" : "none"} stroke="var(--muted)" />
                  <text x={30} y={18}>{n.p.name.length > 22 ? `${n.p.name.slice(0, 21)}…` : n.p.name}</text>
                  <text className="sub" x={30} y={32}>{sub}{blocks(n.p.slug).length ? ` · blocks ${blocks(n.p.slug).length}` : ""}</text>
                </g>
              );
            })}
          </svg>
        )}
        <div className="legend" style={{ marginTop: 10 }}>
          <span><i style={{ background: "var(--good)" }} />done</span>
          <span><i style={{ background: "var(--warn)" }} />in progress</span>
          <span><i style={{ border: "1.5px dashed var(--muted)", background: "transparent" }} />not started</span>
          <span><i style={{ background: "var(--crit)", height: 3, width: 18 }} />focused chain</span>
          <span className="muted">· double-click opens the plan</span>
        </div>
      </div>

      <div className="two">
        <div className="tw">
          <table className="grid">
            <thead><tr><th>Plan</th><th>Blocked by</th><th>Blocks</th><th>Status</th></tr></thead>
            <tbody>
              {live.filter((p) => p.blockedBy.length || blocks(p.slug).length).map((p) => (
                <tr key={p.slug}>
                  <td><a href={href("plan", p.slug)}>{p.name}</a></td>
                  <td>{p.blockedBy.map((b) => { const bp = plans.find((x) => x.slug === b); return <span key={b}>{bp?.name ?? b}{bp?.status === "done" ? " ✓" : ""} </span>; })}{p.blockedBy.length === 0 && "—"}</td>
                  <td>{blocks(p.slug).map((b) => b.name).join(" · ") || "—"}</td>
                  <td><Pill kind={p.status === "done" ? "good" : p.status === "in-progress" ? "warn" : "neutral"}>{p.status}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="hub">
          <div className="eyebrow">Hubs — unblock these first</div>
          {hubs.slice(0, 5).map((h) => (
            <div className="h" key={h.p.slug}><div><b>{h.p.name}</b><small>{blocks(h.p.slug).map((b) => b.name).join(" · ")}</small></div><span className="n">{h.n}</span></div>
          ))}
          {hubs.length === 0 && <div className="muted">No dependencies declared yet.</div>}
          <div className="eyebrow" style={{ marginTop: 8 }}>Free to start (no open blockers)</div>
          {free.slice(0, 6).map((p) => (
            <div className="h" key={p.slug}><div><b>{p.name}</b><small>{p.status} · {p.horizon}</small></div><span className="muted mono">0</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}
