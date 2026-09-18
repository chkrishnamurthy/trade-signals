import { useEffect, useMemo, useState } from "react";
import { createFile, nextId, slugFor } from "../lib/api";
import { journalBody, today } from "../lib/model";
import { useStore } from "../lib/store";
import type { Commit, JournalEntry } from "../types";

function addDays(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00`);
  t.setDate(t.getDate() + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
function mondayOf(d: string): string {
  const t = new Date(`${d}T00:00:00`);
  return addDays(d, -((t.getDay() + 6) % 7));
}
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function kindOf(subject: string): "ship" | "fix" | "plan" {
  if (/^docs|plan/i.test(subject)) return "plan";
  if (/^fix|^hotfix|^chore/i.test(subject)) return "fix";
  return "ship";
}

export function JournalView() {
  const { journal, commits, cards, reload, toast } = useStore();
  const [weekOf, setWeekOf] = useState(() => mondayOf(today()));
  const [date, setDate] = useState(today());
  const existing = journal.find((j) => j.date === date);
  const [shipped, setShipped] = useState("");
  const [decided, setDecided] = useState("");
  const [parked, setParked] = useState("");
  const [tomorrow, setTomorrow] = useState("");

  const dayCommits = (d: string) => commits.filter((c) => c.date === d);

  useEffect(() => {
    if (existing) {
      const clean = (a: string[]) => a.filter((x) => x !== "—").join("\n");
      setShipped(clean(existing.shipped));
      setDecided(clean(existing.decided));
      setParked(clean(existing.parked));
      setTomorrow(existing.tomorrow);
    } else {
      // Pre-fill "shipped" from the day's commits so the entry takes a minute.
      setShipped(dayCommits(date).map((c) => c.subject).filter((s) => !/^merge/i.test(s)).slice(0, 6).join("\n"));
      setDecided("");
      setParked("");
      setTomorrow("");
    }
  }, [date, existing?.path, commits.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekOf, i)), [weekOf]);
  const weekEntries = days.map((d) => journal.find((j) => j.date === d));
  const shippedN = weekEntries.reduce((n, e) => n + (e?.shipped.filter((s) => s !== "—").length ?? 0), 0);
  const plannedN = weekEntries.reduce((n, e) => n + (e?.decided.filter((s) => s !== "—").length ?? 0), 0);
  const parkedN = weekEntries.reduce((n, e) => n + (e?.parked.filter((s) => s !== "—").length ?? 0), 0);

  async function save() {
    try {
      await createFile(`docs/journal/${date}.md`, { date, title: `Journal ${date}` }, journalBody({ shipped, decided, parked, tomorrow }), true);
      // Parked lines become Inbox cards so no idea is lost.
      const parkedLines = parked.split("\n").map((l) => l.replace(/^[-*]\s+/, "").trim()).filter((l) => l && l !== "—");
      let made = 0;
      for (const line of parkedLines) {
        if (cards.some((c) => c.title.toLowerCase() === line.toLowerCase())) continue;
        const id = await nextId();
        const slug = await slugFor(line);
        try {
          await createFile(`issues/${slug || id.toLowerCase()}.md`, { id, title: line, type: "idea", stage: "inbox", priority: "medium", created: date, updated: date, stage_since: date, source: `journal ${date}` }, `_Parked in the journal on ${date}._\n`);
          made++;
        } catch {
          /* exists */
        }
      }
      toast(made ? `Saved · ${made} parked idea${made > 1 ? "s" : ""} sent to Inbox` : "Saved");
      reload();
    } catch {
      toast("Could not save the entry");
    }
  }

  // Streak: last 8 weeks, shade by commits + entry.
  const streak = useMemo(() => {
    const start = addDays(mondayOf(today()), -49);
    return Array.from({ length: 56 }, (_, i) => {
      const d = addDays(start, i);
      const n = dayCommits(d).length + (journal.some((j) => j.date === d) ? 2 : 0);
      return { d, l: n === 0 ? 0 : n < 2 ? 1 : n < 5 ? 2 : 3 };
    });
  }, [commits, journal]); // eslint-disable-line react-hooks/exhaustive-deps
  let cur = 0;
  const todayIdx = streak.findIndex((s) => s.d === today());
  for (let i = todayIdx; i >= 0 && (streak[i]?.l ?? 0) > 0; i--) cur++;

  return (
    <div className="v-journal">
      <div className="ph">
        <div>
          <div className="eyebrow">Work · 2</div>
          <h1>Journal</h1>
          <p>Five lines a day: shipped, decided, parked, tomorrow. Pre-filled from git. Parked lines go straight to the Inbox.</p>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <button type="button" className="btn" onClick={() => setWeekOf(addDays(weekOf, -7))}>◀</button>
          <span className="mono muted">{weekOf} – {addDays(weekOf, 6)}</span>
          <button type="button" className="btn" onClick={() => setWeekOf(addDays(weekOf, 7))}>▶</button>
          <button type="button" className="btn" onClick={() => { setWeekOf(mondayOf(today())); setDate(today()); }}>Today</button>
        </div>
      </div>

      <div className="week">
        {days.map((d, i) => {
          const e = weekEntries[i];
          const cs = dayCommits(d);
          const isToday = d === today();
          const off = i >= 5 && !e && cs.length === 0;
          return (
            <div key={d} className={`day${isToday ? " today" : ""}${off ? " off" : ""}${date === d ? " today" : ""}`} onClick={() => setDate(d)} role="button" tabIndex={0} onKeyDown={(ev) => ev.key === "Enter" && setDate(d)} style={{ cursor: "pointer" }}>
              <div className="d"><b>{DOW[i]} {d.slice(8)}</b><small>{cs.length ? `${cs.length} commit${cs.length > 1 ? "s" : ""}` : i >= 5 ? "off" : ""}</small></div>
              {e ? (
                <>
                  {e.shipped.filter((s) => s !== "—").slice(0, 3).map((s, k) => <div className="i ship" key={`s${k}`}><i />{s}</div>)}
                  {e.decided.filter((s) => s !== "—").slice(0, 2).map((s, k) => <div className="i plan" key={`d${k}`}><i />{s}</div>)}
                  {e.parked.filter((s) => s !== "—").slice(0, 1).map((s, k) => <div className="i park" key={`p${k}`}><i />{s}</div>)}
                </>
              ) : (
                cs.slice(0, 3).map((c) => <div className={`i ${kindOf(c.subject)}`} key={c.hash}><i />{c.subject.slice(0, 48)}</div>)
              )}
              <div className="m">
                <i className={(e?.shipped.filter((s) => s !== "—").length ?? cs.length) ? "s" : ""} />
                <i className={(e?.decided.filter((s) => s !== "—").length ?? 0) ? "p" : ""} />
                <i className={(e?.parked.filter((s) => s !== "—").length ?? 0) ? "p" : ""} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="cols">
        <div className="entry">
          <h2>{new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} <small>docs/journal/{date}.md{existing ? "" : " · new"}</small></h2>
          <div className="q"><label htmlFor="j1">Shipped <small>· pre-filled from git, edit freely</small></label><textarea id="j1" className="field" value={shipped} onChange={(e) => setShipped(e.target.value)} /></div>
          <div className="q"><label htmlFor="j2">Decided</label><textarea id="j2" className="field" value={decided} onChange={(e) => setDecided(e.target.value)} /></div>
          <div className="q"><label htmlFor="j3">Parked <small>· one per line; each becomes an Inbox card</small></label><textarea id="j3" className="field" value={parked} onChange={(e) => setParked(e.target.value)} /></div>
          <div className="q"><label htmlFor="j4">Tomorrow's one thing</label><textarea id="j4" className="field" style={{ minHeight: 40 }} value={tomorrow} onChange={(e) => setTomorrow(e.target.value)} /></div>
          <div className="auto"># auto{"\n"}commits: {dayCommits(date).length} · inbox: {cards.filter((c) => c.stage === "inbox").length} · in Now: {cards.filter((c) => c.stage === "now").length}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" className="btn primary" onClick={save}>Save entry</button>
          </div>
        </div>
        <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="eyebrow">This week · shipping vs planning</div>
            <div className="ratio">
              <i style={{ flex: shippedN || 0.0001, background: "var(--good)" }} />
              <i style={{ flex: plannedN || 0.0001, background: "var(--info)" }} />
              <i style={{ flex: parkedN || 0.0001, background: "var(--line-strong)" }} />
            </div>
            <div className="legend"><span><i style={{ background: "var(--good)" }} />shipped {shippedN}</span><span><i style={{ background: "var(--info)" }} />decided {plannedN}</span><span><i style={{ background: "var(--line-strong)" }} />parked {parkedN}</span></div>
            {plannedN > shippedN && shippedN + plannedN > 2 && <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>More deciding than shipping this week. Set tomorrow's one thing to a merge.</p>}
          </div>
          <div className="panel">
            <div className="eyebrow" style={{ marginBottom: 8 }}>Entries · last 8 weeks</div>
            <div className="streak">{streak.map((s) => <i key={s.d} className={s.l ? `l${s.l}` : ""} title={s.d} />)}</div>
            <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>Current streak <b className="mono">{cur} day{cur === 1 ? "" : "s"}</b>. Shade = commits + entry that day.</p>
          </div>
          <div className="panel">
            <div className="eyebrow" style={{ marginBottom: 8 }}>Recent entries</div>
            <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
              {journal.slice(0, 6).map((j: JournalEntry) => (
                <button type="button" key={j.path} className="btn ghost sm" style={{ justifyContent: "flex-start" }} onClick={() => { setDate(j.date); setWeekOf(mondayOf(j.date)); }}>
                  <span className="mono" style={{ whiteSpace: "nowrap" }}>{j.date}</span> <span className="muted">{j.tomorrow.slice(0, 40) || (j.shipped[0] ?? "")}</span>
                </button>
              ))}
              {journal.length === 0 && <span className="muted">None yet — save today's.</span>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export type { Commit };
