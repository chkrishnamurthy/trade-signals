import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useMemo, useState } from "react";
import { CardDrawer } from "../components/CardDrawer";
import { Bar, CardRow, StageDot } from "../components/atoms";
import { createFile, nextId, patchMeta, slugFor } from "../lib/api";
import { cardStageAge, daysBetween, today } from "../lib/model";
import { useStore } from "../lib/store";
import type { Card, CardType, Stage } from "../types";
import { AREAS, CARD_TYPES, STAGES, STAGE_LABEL, WIP_LIMIT, WIP_MAX_AGE_DAYS } from "../types";

function CardBody({ c, planTotal }: { c: Card; planTotal: number }) {
  const age = c.stage === "done" || c.stage === "dropped" ? null : cardStageAge(c);
  return (
    <>
      <div className="r">
        <span className="t">{c.title}</span>
      </div>
      <div className="r">
        <CardRow c={c} />
        {c.stage === "done" && c.doneAt && <span className="age">{c.doneAt.slice(5)}</span>}
        {c.stage === "dropped" && c.supersededBy && <span className="pill neutral">→ {c.supersededBy}</span>}
        {age !== null && <span className={`age${c.stage === "now" && age >= WIP_MAX_AGE_DAYS ? " stale" : ""}`}>{age}d</span>}
      </div>
      {c.type === "plan-phase" && c.phase != null && planTotal > 0 && (
        <div className="ph">
          <Bar pct={((c.phase + 1) / planTotal) * 100} />
          phase {c.phase} of {planTotal}
        </div>
      )}
      {c.plan && <span className="doc">▤ {c.plan}.md</span>}
    </>
  );
}

function DraggableCard({ c, planTotal, onOpen }: { c: Card; planTotal: number; onOpen: (c: Card) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.path });
  return (
    <div
      ref={setNodeRef}
      className={`card${isDragging ? " dragging" : ""}`}
      onClick={() => onOpen(c)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(c)}
      {...listeners}
      {...attributes}
    >
      <CardBody c={c} planTotal={planTotal} />
    </div>
  );
}

function Column({ stage, cards, planTotals, onOpen }: { stage: Stage; cards: Card[]; planTotals: Record<string, number>; onOpen: (c: Card) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${stage}` });
  const full = stage === "now" && cards.length >= WIP_LIMIT;
  return (
    <section ref={setNodeRef} className={`col ${stage}${isOver ? " drop-over" : ""}`}>
      <header>
        <StageDot stage={stage} />
        {STAGE_LABEL[stage]} <span className="cnt">{cards.length}</span>
        {stage === "now" && <span className={`wip${full ? " full" : ""}`}>WIP {cards.length} / {WIP_LIMIT}</span>}
      </header>
      {cards.map((c) => (
        <DraggableCard key={c.path} c={c} planTotal={planTotals[c.plan] ?? 0} onOpen={onOpen} />
      ))}
      {cards.length === 0 && <div className="add">—</div>}
    </section>
  );
}

export function BoardView() {
  const { cards, plans, reload, toast } = useStore();
  const [typeFilter, setTypeFilter] = useState<Set<CardType>>(new Set());
  const [areaFilter, setAreaFilter] = useState<string>("");
  const [showOldDone, setShowOldDone] = useState(false);
  const [showDropped, setShowDropped] = useState(true);
  const [selected, setSelected] = useState<Card | null>(null);
  const [capture, setCapture] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const planTotals = useMemo(() => Object.fromEntries(plans.map((p) => [p.slug, p.phasesTotal])), [plans]);
  const areas = useMemo(() => Array.from(new Set(cards.flatMap((c) => c.area))).sort(), [cards]);

  const visible = useMemo(
    () =>
      cards.filter((c) => {
        if (typeFilter.size && !typeFilter.has(c.type)) return false;
        if (areaFilter && !c.area.includes(areaFilter)) return false;
        if (c.stage === "done" && !showOldDone && daysBetween(c.doneAt || c.updated) > 14) return false;
        if (c.stage === "dropped" && !showDropped) return false;
        return true;
      }),
    [cards, typeFilter, areaFilter, showOldDone, showDropped],
  );

  const byStage = (s: Stage) =>
    visible
      .filter((c) => c.stage === s)
      .sort((a, b) => (s === "done" ? b.updated.localeCompare(a.updated) : a.created.localeCompare(b.created)));

  function handleEnd(e: DragEndEvent) {
    setActiveId(null);
    const path = String(e.active.id);
    const over = e.over?.id ? String(e.over.id) : "";
    if (!over) return;
    const target: Stage | null = over.startsWith("col:") ? (over.slice(4) as Stage) : (cards.find((c) => c.path === over)?.stage ?? null);
    const card = cards.find((c) => c.path === path);
    if (!target || !card || card.stage === target) return;
    if (target === "now" && cards.filter((c) => c.stage === "now").length >= WIP_LIMIT) {
      toast(`Now is full (${WIP_LIMIT}). Finish or drop one first.`);
      return;
    }
    const patch: Record<string, unknown> = { stage: target, stage_since: today(), updated: today() };
    if (target === "done") patch.done_at = today();
    patchMeta(path, patch)
      .then(reload)
      .catch(() => toast("Could not save stage"));
  }

  async function onCapture() {
    const raw = capture.trim();
    if (!raw) return;
    const tags = Array.from(raw.matchAll(/#(\w+)/g)).map((m) => (m[1] ?? "").toLowerCase());
    const title = raw.replace(/#\w+/g, "").replace(/\s+/g, " ").trim();
    const type: CardType = tags.includes("bug") ? "bug" : tags.includes("chore") ? "chore" : tags.includes("feature") ? "feature" : "idea";
    const area = tags.filter((t) => (AREAS as readonly string[]).includes(t));
    try {
      const id = await nextId();
      const slug = await slugFor(title);
      await createFile(
        `issues/${slug || id.toLowerCase()}.md`,
        { id, title, type, stage: "inbox", priority: "medium", area, created: today(), updated: today(), stage_since: today(), source: "board capture" },
        `_Captured ${today()}. Open the card to set its type, area and stage._\n`,
      );
      setCapture("");
      toast(`${id} added to Inbox`);
      reload();
    } catch (e) {
      toast(e instanceof Error && e.message === "exists" ? "A card with that name already exists" : "Could not create the card");
    }
  }

  const active = cards.find((c) => c.path === activeId) ?? null;
  const selectedLive = selected ? (cards.find((c) => c.path === selected.path) ?? selected) : null;

  return (
    <div className="v-board">
      <div className="ph">
        <div>
          <div className="eyebrow">Work · 1</div>
          <h1>Board</h1>
          <p>Inbox → Ideas → Next → Now → Review → Done. Now is capped at {WIP_LIMIT}; a card older than {WIP_MAX_AGE_DAYS} days there turns amber.</p>
        </div>
      </div>
      <div className="capture">
        <span className="muted">＋</span>
        <input
          id="capture"
          value={capture}
          onChange={(e) => setCapture(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCapture()}
          placeholder="Add to Inbox — type an idea, bug or task and press Enter (tags: #bug #chore #feature #web #worker …)"
        />
        <span className="hint"><kbd>Enter</kbd></span>
      </div>
      <div className="toolbar">
        {CARD_TYPES.map((t) => (
          <button
            type="button"
            key={t}
            className={`chip${typeFilter.has(t) ? " on" : ""}`}
            onClick={() =>
              setTypeFilter((cur) => {
                const n = new Set(cur);
                if (n.has(t)) n.delete(t);
                else n.add(t);
                return n;
              })
            }
          >
            {t}
          </button>
        ))}
        <select className="field" style={{ width: "auto" }} value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
          <option value="">all areas</option>
          {areas.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <span className="grow" />
        <button type="button" className={`chip${showOldDone ? " on" : ""}`} onClick={() => setShowOldDone((v) => !v)}>
          {showOldDone ? "all done" : "done ≤ 14d"}
        </button>
        <button type="button" className={`chip${showDropped ? " on" : ""}`} onClick={() => setShowDropped((v) => !v)}>
          dropped
        </button>
      </div>

      {cards.length === 0 ? (
        <div className="empty-state">
          <h2>No cards yet</h2>
          <p>Capture one in the Triage inbox, or drop a Markdown file into <code>issues/</code>.</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
          onDragEnd={handleEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="board">
            {STAGES.map((s) => (
              <Column key={s} stage={s} cards={byStage(s)} planTotals={planTotals} onOpen={setSelected} />
            ))}
          </div>
          <DragOverlay>
            {active ? (
              <div className="card" style={{ cursor: "grabbing" }}>
                <CardBody c={active} planTotal={planTotals[active.plan] ?? 0} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {selectedLive && <CardDrawer card={selectedLive} onClose={() => setSelected(null)} />}
    </div>
  );
}
