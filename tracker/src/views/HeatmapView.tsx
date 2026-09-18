import { useMemo, useState } from "react";
import { PriorityBars, StageDot, Tag, TypeGlyph } from "../components/atoms";
import { cardAge, daysBetween } from "../lib/model";
import { useStore } from "../lib/store";
import type { Card, CardType } from "../types";
import { AREAS, CARD_TYPES } from "../types";

const OPEN = new Set(["inbox", "ideas", "next", "now", "review"]);

export function HeatmapView() {
  const { cards } = useStore();
  const [mode, setMode] = useState<"open" | "closed" | "all">("open");
  const [sel, setSel] = useState<{ area: string; type: CardType | "total" } | null>(null);

  const pool = useMemo(
    () =>
      cards.filter((c) =>
        mode === "open" ? OPEN.has(c.stage) : mode === "closed" ? (c.stage === "done" || c.stage === "dropped") && daysBetween(c.doneAt || c.updated) <= 30 : true,
      ),
    [cards, mode],
  );
  const areas = useMemo(() => {
    const seen = new Set<string>([...AREAS, ...cards.flatMap((c) => c.area)]);
    return [...seen];
  }, [cards]);
  const areaOf = (c: Card) => (c.area.length ? c.area : ["unassigned"]);
  const rows = [...areas, "unassigned"].map((a) => ({
    area: a,
    cells: CARD_TYPES.map((t) => pool.filter((c) => c.type === t && areaOf(c).includes(a)).length),
  }));
  const max = Math.max(1, ...rows.flatMap((r) => r.cells));
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const totals = CARD_TYPES.map((_, i) => rows.reduce((s, r) => s + (r.cells[i] ?? 0), 0));

  const list = sel
    ? pool.filter((c) => areaOf(c).includes(sel.area) && (sel.type === "total" || c.type === sel.type))
    : pool;

  // Insights are sentences generated from three simple rules.
  const insights: Array<{ kind: "crit" | "info" | "violet"; head: string; body: string }> = [];
  const bugs = pool.filter((c) => c.type === "bug");
  if (bugs.length) {
    const byArea = new Map<string, number>();
    for (const b of bugs) for (const a of areaOf(b)) byArea.set(a, (byArea.get(a) ?? 0) + 1);
    const [top, n] = [...byArea].sort((x, y) => y[1] - x[1])[0] ?? ["", 0];
    if (top) insights.push({ kind: "crit", head: `${top} has ${n} of ${bugs.length} open bug${bugs.length > 1 ? "s" : ""}`, body: "Where the churn is. If it repeats week over week, fix the boundary, not the bugs." });
  }
  const old = pool.filter((c) => OPEN.has(c.stage) && cardAge(c) >= 21);
  if (old.length) {
    const byArea = new Map<string, number>();
    for (const b of old) for (const a of areaOf(b)) byArea.set(a, (byArea.get(a) ?? 0) + 1);
    const [top, n] = [...byArea].sort((x, y) => y[1] - x[1])[0] ?? ["", 0];
    insights.push({ kind: "info", head: `${n} card${n > 1 ? "s" : ""} in ${top} older than 3 weeks`, body: "Either schedule them into Next or drop them from the board." });
  }
  const ideaOnly = rows.filter((r) => r.cells.reduce((s, x) => s + x, 0) > 0 && r.cells.every((x, i) => CARD_TYPES[i] === "idea" || x === 0));
  if (ideaOnly.length) insights.push({ kind: "violet", head: `${ideaOnly.map((r) => r.area).join(", ")}: all ideas, zero work`, body: "Expected for areas behind a blocker. Nothing to do yet." });

  const closed30 = cards.filter((c) => (c.stage === "done" || c.stage === "dropped") && daysBetween(c.doneAt || c.updated) <= 30);
  const closedByArea = [...areas, "unassigned"].map((a) => ({ a, n: closed30.filter((c) => areaOf(c).includes(a)).length })).sort((x, y) => y.n - x.n);
  const maxClosed = Math.max(1, ...closedByArea.map((x) => x.n));

  return (
    <div className="v-heatmap">
      <div className="ph">
        <div>
          <div className="eyebrow">Insight · 7</div>
          <h1>Heatmap</h1>
          <p>Where work clusters — area × kind. Click a cell to filter the list. Useful once you have ~30+ cards; until then a sanity check.</p>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <span className="seg">
            {(["open", "closed", "all"] as const).map((m) => <span key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{m === "closed" ? "Closed 30d" : m[0]?.toUpperCase() + m.slice(1)}</span>)}
          </span>
        </div>
      </div>

      <div className="hm">
        <table>
          <thead><tr><th className="r">Area</th>{CARD_TYPES.map((t) => <th key={t}>{t}</th>)}<th>Total</th></tr></thead>
          <tbody>
            {rows.filter((r) => r.cells.some((x) => x > 0) || (AREAS as readonly string[]).includes(r.area)).map((r) => (
              <tr key={r.area}>
                <th className="r">{r.area}</th>
                {r.cells.map((n, i) => {
                  const t = CARD_TYPES[i] as CardType;
                  const on = sel?.area === r.area && sel.type === t;
                  return <td key={t} className={`l${level(n)}${on ? " sel" : ""}`} onClick={() => setSel(on ? null : { area: r.area, type: t })}>{n}</td>;
                })}
                <td className={`tot${sel?.area === r.area && sel.type === "total" ? " sel" : ""}`} onClick={() => setSel({ area: r.area, type: "total" })} style={{ cursor: "pointer" }}>{r.cells.reduce((s, x) => s + x, 0)}</td>
              </tr>
            ))}
            <tr><th className="r">Total</th>{totals.map((n, i) => <td key={i} className="tot">{n}</td>)}<td className="tot">{pool.length}</td></tr>
          </tbody>
        </table>
        <div className="scale">fewer {[0, 1, 2, 3, 4].map((l) => <i key={l} className={`l${l}`} style={{ background: l === 0 ? "var(--surface-2)" : l === 4 ? "var(--accent)" : `color-mix(in oklab,var(--accent) ${[0, 18, 38, 62][l]}%,var(--surface))` }} />)} more · one hue, light→dark</div>
      </div>

      <div className="two">
        <div className="tw">
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8 }}>
            <span className="chip on">{sel ? `${sel.area} × ${sel.type} · ${list.length}` : `all · ${list.length}`}</span>
            {sel && <button type="button" className="btn ghost sm" onClick={() => setSel(null)}>clear</button>}
          </div>
          <table className="grid">
            <thead><tr><th></th><th>Title</th><th>Stage</th><th>Pri</th><th>Age</th></tr></thead>
            <tbody>
              {list.slice(0, 40).map((c) => (
                <tr key={c.id}>
                  <td><TypeGlyph type={c.type} /></td>
                  <td>{c.title} {c.tier && <Tag>tier {c.tier}</Tag>}{c.plan && <Tag>{c.plan}</Tag>}</td>
                  <td><StageDot stage={c.stage} /> {c.stage}</td>
                  <td><PriorityBars p={c.priority} /></td>
                  <td className="mono muted">{cardAge(c)}d</td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={5} className="muted">Nothing here.</td></tr>}
            </tbody>
          </table>
        </div>
        <div>
          <div className="panel" style={{ marginBottom: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>What the heatmap is saying</div>
            <div className="ins">
              {insights.map((i) => (
                <div className="i" key={i.head}><span className={`pill ${i.kind}`}>{i.kind === "crit" ? "bugs" : i.kind === "info" ? "aging" : "ideas"}</span><div><b>{i.head}</b><small>{i.body}</small></div></div>
              ))}
              {insights.length === 0 && <span className="muted">Nothing stands out yet.</span>}
            </div>
          </div>
          <div className="panel">
            <div className="eyebrow" style={{ marginBottom: 8 }}>Closed in last 30 days · by area</div>
            <div className="bars">
              {closedByArea.filter((x) => x.n > 0 || (AREAS as readonly string[]).includes(x.a)).map((x) => (
                <div className="b" key={x.a}><span>{x.a}</span><span className="bar"><i style={{ width: `${(x.n / maxClosed) * 100}%` }} /></span><span className="n">{x.n}</span></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
