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
import { useCallback, useEffect, useMemo, useState } from "react";
import { IssueDetail } from "../components/IssueDetail";
import { generateIssues, loadList, patchIssue } from "../lib/api";
import type { FileNode, IssueStatus, IssueType } from "../types";
import {
  ISSUE_COLUMNS,
  ISSUE_COLUMN_LABEL,
  ISSUE_TYPES,
  issuePriority,
  issueStatus,
  issueTier,
  issueType,
} from "../types";

const COLUMN_DOT: Record<IssueStatus, string> = {
  backlog: "var(--backlog)",
  todo: "var(--todo)",
  "in-progress": "var(--progress)",
  done: "var(--done)",
};

function CardBody({ file }: { file: FileNode }) {
  const tier = issueTier(file.meta);
  const pri = issuePriority(file.meta);
  return (
    <>
      <p className="t">{file.title}</p>
      <div className="tags">
        <span className={`badge type-${issueType(file.meta)}`}>{issueType(file.meta)}</span>
        {tier && <span className="badge muted">tier {tier}</span>}
        <span className={`pri ${pri}`}>{pri}</span>
      </div>
    </>
  );
}

function DraggableCard({ file, onOpen }: { file: FileNode; onOpen: (f: FileNode) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: file.path });
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`card${isDragging ? " dragging" : ""}`}
      onClick={() => onOpen(file)}
      {...listeners}
      {...attributes}
    >
      <CardBody file={file} />
    </button>
  );
}

function Column({
  status,
  files,
  onOpen,
}: {
  status: IssueStatus;
  files: FileNode[];
  onOpen: (f: FileNode) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  return (
    <div ref={setNodeRef} className={`col${isOver ? " drop-over" : ""}`}>
      <div className="col-head">
        <span className="dot" style={{ background: COLUMN_DOT[status] }} />
        {ISSUE_COLUMN_LABEL[status]}
        <span className="ct">{files.length}</span>
      </div>
      <div className="col-body">
        {files.map((f) => (
          <DraggableCard key={f.path} file={f} onOpen={onOpen} />
        ))}
        {files.length === 0 && <div className="col-empty">—</div>}
      </div>
    </div>
  );
}

export function IssuesView({ onToast }: { onToast: (m: string) => void }) {
  const [files, setFiles] = useState<FileNode[] | null>(null);
  const [typeFilter, setTypeFilter] = useState<Set<IssueType>>(new Set());
  const [selected, setSelected] = useState<FileNode | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const reload = useCallback(() => {
    loadList("issues")
      .then(setFiles)
      .catch(() => setFiles([]));
  }, []);

  useEffect(reload, [reload]);

  async function onGenerate() {
    setGenerating(true);
    try {
      const { created } = await generateIssues();
      onToast(created > 0 ? `Generated ${created} issue file${created === 1 ? "" : "s"}` : "No new issues to generate");
      reload();
    } catch {
      onToast("Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const filtered = useMemo(() => {
    if (!files) return [];
    if (typeFilter.size === 0) return files;
    return files.filter((f) => typeFilter.has(issueType(f.meta)));
  }, [files, typeFilter]);

  function toggleType(t: IssueType) {
    setTypeFilter((cur) => {
      const next = new Set(cur);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function handleStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleEnd(e: DragEndEvent) {
    setActiveId(null);
    const path = String(e.active.id);
    const over = e.over?.id ? String(e.over.id) : "";
    if (!over) return;
    let target: IssueStatus | null = null;
    if (over.startsWith("col:")) target = over.slice(4) as IssueStatus;
    else target = files ? issueStatus(files.find((f) => f.path === over)?.meta ?? {}) : null;
    if (!target) return;
    const file = files?.find((f) => f.path === path);
    if (!file || issueStatus(file.meta) === target) return;

    setFiles((cur) =>
      (cur ?? []).map((f) => (f.path === path ? { ...f, meta: { ...f.meta, status: target } } : f)),
    );
    patchIssue(path, { status: target }).catch(() => {
      onToast("Could not save status — reloading");
      reload();
    });
  }

  if (files === null) return <p className="empty">Loading…</p>;

  if (files.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon" aria-hidden>
          ◔
        </div>
        <h2>No issues yet</h2>
        <p>
          The board is driven entirely by Markdown files in <code>issues/</code>. There are none
          yet — that's expected for a fresh project. Generate a starting set from the backlog and
          they'll appear here as real files you can edit or delete.
        </p>
        <button type="button" className="btn-accent lg" onClick={onGenerate} disabled={generating}>
          {generating ? "Generating…" : "Generate Issues"}
        </button>
        <p className="empty-note mono">
          Reads docs/planning/pending-features.md and writes one issue file per item.
        </p>
      </div>
    );
  }

  const active = files.find((f) => f.path === activeId) ?? null;

  return (
    <>
      <div className="filters">
        <span className="lbl">Type</span>
        {ISSUE_TYPES.map((t) => (
          <button
            type="button"
            key={t}
            className={`chip${typeFilter.has(t) ? " on" : ""}`}
            onClick={() => toggleType(t)}
          >
            {t}
          </button>
        ))}
        {typeFilter.size > 0 && (
          <button type="button" className="chip" onClick={() => setTypeFilter(new Set())}>
            clear
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="icon-btn" onClick={onGenerate} disabled={generating}>
          {generating ? "Generating…" : "↻ Generate from backlog"}
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleStart}
        onDragEnd={handleEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="board-scroll">
          <div className="board">
            {ISSUE_COLUMNS.map((status) => (
              <Column
                key={status}
                status={status}
                files={filtered.filter((f) => issueStatus(f.meta) === status)}
                onOpen={setSelected}
              />
            ))}
          </div>
        </div>
        <DragOverlay>
          {active ? (
            <div className="card" style={{ cursor: "grabbing" }}>
              <CardBody file={active} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {selected && (
        <IssueDetail file={selected} onClose={() => setSelected(null)} onToast={onToast} />
      )}
    </>
  );
}
