import type { ReactNode } from "react";
import type { Card, CardType, Priority, Stage } from "../types";
import { CARD_TYPE_GLYPH } from "../types";

/** Linear-style status circle: dashed → empty → half → three-quarter → filled. */
export function StageDot({ stage }: { stage: Stage }) {
  const cls: Record<Stage, string> = {
    inbox: "backlog",
    ideas: "todo",
    next: "todo",
    now: "doing",
    review: "review",
    done: "done",
    dropped: "dropped",
  };
  return <span className={`st ${cls[stage]}`} aria-hidden />;
}

export function TypeGlyph({ type }: { type: CardType }) {
  const cls = type === "plan-phase" ? "plan" : type === "feature" ? "feat" : type;
  return (
    <span className={`ty ${cls}`} title={type}>
      {CARD_TYPE_GLYPH[type]}
    </span>
  );
}

export function PriorityBars({ p }: { p: Priority }) {
  const cls = p === "urgent" ? "urgent p3" : p === "high" ? "p3" : p === "medium" ? "p2" : "p1";
  return (
    <span className={`pri ${cls}`} title={`priority: ${p}`}>
      <i />
      <i />
      <i />
    </span>
  );
}

export function Pill({ kind, children }: { kind: "good" | "warn" | "crit" | "info" | "violet" | "neutral"; children: ReactNode }) {
  return <span className={`pill ${kind}`}>{children}</span>;
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>;
}

export function Bar({ pct, kind }: { pct: number; kind?: "warn" | "crit" }) {
  return (
    <span className={`bar${kind ? ` ${kind}` : ""}`}>
      <i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </span>
  );
}

export function Age({ days, warnAt = 7, critAt = 14, suffix = "d" }: { days: number; warnAt?: number; critAt?: number; suffix?: string }) {
  const cls = days >= critAt ? "age dead" : days >= warnAt ? "age old" : "age";
  return <span className={cls}>{days}{suffix}</span>;
}

export function CardRow({ c }: { c: Card }) {
  return (
    <span className="r">
      <TypeGlyph type={c.type} />
      <span className="id">{c.id}</span>
      <PriorityBars p={c.priority} />
      {c.area.slice(0, 2).map((a) => (
        <Tag key={a}>{a}</Tag>
      ))}
      {c.tier && <Tag>tier {c.tier}</Tag>}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}
