"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  History,
  Loader2,
  MessageSquare,
  Paperclip,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  RhAvatar,
  RhBadge,
  RhButton,
  RhCardHead,
} from "@/components/rh/ui/primitives";
import { ExcelOfficeEditor } from "@/components/rh/tasks/ExcelOfficeEditor";
import {
  CommentComposer,
  renderCommentBody,
} from "@/components/rh/tasks/CommentComposer";
import { TalentLinkPicker } from "@/components/rh/tasks/TalentLinkPicker";
import {
  EVENT_LABEL,
  PRIORITY_META,
  STATUS_META,
  duePresets,
  dueTone,
  formatDueRelative,
  formatWhen,
  isOfficeFileName,
  taskDetailPath,
  type RhTaskDto,
  type TaskPerson,
  type TaskPriority,
  type TaskStatus,
  type TaskTalent,
} from "@/components/rh/tasks/task-meta";

export type TaskDetailEmp = {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  avatarUrl?: string | null;
  department?: string;
  jobTitle?: string;
};

const ACCEPT_FILES =
  ".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.png,.jpg,.jpeg,.webp,.gif,.zip,.numbers,.pages,.key,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function taskAssignees(task: RhTaskDto): TaskPerson[] {
  if (task.assignees?.length) return task.assignees;
  return task.assignee ? [task.assignee] : [];
}

type SideTab = "conversation" | "history";

export function TaskDetailPage({
  taskId,
  mode,
  meId,
  employees = [],
  backHref,
  onBack,
}: {
  taskId: string;
  mode: "manage" | "mine";
  meId: string;
  employees?: TaskDetailEmp[];
  backHref: string;
  /** Si fourni (ex. overlay espace salarié), remplace le Link retour. */
  onBack?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const officeParam = searchParams.get("office");

  const [task, setTask] = useState<RhTaskDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [talentQuery, setTalentQuery] = useState("");
  const [talentResults, setTalentResults] = useState<TaskTalent[]>([]);
  const [talentSearching, setTalentSearching] = useState(false);
  const [sideTab, setSideTab] = useState<SideTab>("conversation");
  const [dropHot, setDropHot] = useState(false);
  const [officeEdit, setOfficeEdit] = useState<{
    taskId: string;
    attachmentId: string;
    fileName: string;
  } | null>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const officeOpenedRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rh/tasks/${taskId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Tâche introuvable");
      const next = data.task as RhTaskDto;
      setTask(next);
      setEditTitle(next.title);
      setEditDesc(next.description || "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  useEffect(() => {
    if (!officeParam || !task || officeOpenedRef.current === officeParam) return;
    const att = task.attachments.find((a) => a.id === officeParam);
    if (!att || !isOfficeFileName(att.fileName)) return;
    officeOpenedRef.current = officeParam;
    setOfficeEdit({
      taskId: task.id,
      attachmentId: att.id,
      fileName: att.fileName,
    });
  }, [officeParam, task]);

  useEffect(() => {
    const q = talentQuery.trim();
    if (!q && !talentResults.length) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setTalentSearching(true);
      void fetch(`/api/rh/tasks/talents?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled) setTalentResults((d.talents || []) as TaskTalent[]);
        })
        .catch(() => {
          if (!cancelled) setTalentResults([]);
        })
        .finally(() => {
          if (!cancelled) setTalentSearching(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talentQuery]);

  useEffect(() => {
    if (sideTab !== "conversation") return;
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [task?.comments.length, sideTab]);

  async function patchTask(body: Record<string, unknown>) {
    if (!task) return null;
    setBusy(true);
    try {
      const res = await fetch(`/api/rh/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Mise à jour impossible");
      const next = data.task as RhTaskDto;
      setTask(next);
      setEditTitle(next.title);
      setEditDesc(next.description || "");
      return next;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
      await load();
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function sendComment(body: string, mentionedIds: string[]) {
    if (!task || !body.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rh/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, mentionedIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setTask(data.task as RhTaskDto);
      setSideTab("conversation");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function uploadToTask(file: File) {
    if (!task) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/rh/tasks/${task.id}/attachments`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Upload échoué : ${file.name}`);
    setTask(data.task as RhTaskDto);
    toast.success(`${file.name} ajouté`);
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!task) return;
    setBusy(true);
    try {
      for (const f of [...files]) {
        await uploadToTask(f);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function createBlankExcel() {
    if (!task) return;
    const name = window.prompt("Nom du fichier Excel", "Classeur.xlsx");
    if (name == null) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/rh/tasks/${task.id}/attachments/blank-excel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: name.trim() || "Classeur.xlsx" }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Création impossible");
      const next = data.task as RhTaskDto;
      setTask(next);
      toast.success("Excel créé");
      if (data.attachmentId && data.onlyOfficeReady) {
        setOfficeEdit({
          taskId: task.id,
          attachmentId: String(data.attachmentId),
          fileName:
            next.attachments.find((a) => a.id === data.attachmentId)
              ?.fileName || "Classeur.xlsx",
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function removeAttachment(attachmentId: string) {
    if (!task) return;
    if (!window.confirm("Retirer cette pièce jointe ?")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/rh/tasks/${task.id}/attachments?attachmentId=${attachmentId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setTask(data.task as RhTaskDto);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function removeTask() {
    if (!task) return;
    if (!window.confirm("Supprimer définitivement cette tâche ?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rh/tasks/${task.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      toast.success("Tâche supprimée");
      router.push(backHref);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
      setBusy(false);
    }
  }

  const canManage = mode === "manage" || (task ? task.creator.id === meId : false);
  const people = useMemo(() => (task ? taskAssignees(task) : []), [task]);
  const mentionEmployees = useMemo(() => {
    if (employees.length) return employees;
    if (!task) return [];
    const map = new Map<string, TaskDetailEmp>();
    for (const p of [...people, task.creator]) {
      map.set(p.id, {
        id: p.id,
        name: p.name,
        initials: p.initials,
        avatarColor: p.avatarColor,
        avatarUrl: p.avatarUrl,
      });
    }
    return [...map.values()];
  }, [employees, people, task]);

  if (loading && !task) {
    return (
      <div
        className="flex items-center justify-center gap-2 py-24 text-[14px]"
        style={{ color: "var(--rh-text-muted)" }}
      >
        <Loader2 size={16} className="animate-spin" />
        Chargement de la tâche…
      </div>
    );
  }

  if (!task) {
    return (
      <div className="py-16 text-center">
        <p className="text-[14px] mb-4" style={{ color: "var(--rh-text-muted)" }}>
          Tâche introuvable ou accès refusé.
        </p>
        <Link href={backHref} className="rh-btn-secondary no-underline inline-flex">
          <ArrowLeft size={14} /> Retour
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)]">
      {/* Header */}
      <header
        className="sticky top-0 z-20 border-b px-4 sm:px-6 py-4"
        style={{
          background: "var(--rh-bg-panel)",
          borderColor: "var(--rh-border)",
        }}
      >
        <div className="flex flex-wrap items-start gap-3 justify-between">
          <div className="min-w-0 flex-1 flex items-start gap-3">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="mt-1 p-2 rounded-lg border-0 cursor-pointer"
                style={{
                  color: "var(--rh-text-muted)",
                  background: "var(--rh-surface)",
                }}
                title="Retour"
              >
                <ArrowLeft size={16} />
              </button>
            ) : (
              <Link
                href={backHref}
                className="mt-1 p-2 rounded-lg no-underline border-0"
                style={{
                  color: "var(--rh-text-muted)",
                  background: "var(--rh-surface)",
                }}
                title="Retour au hub"
              >
                <ArrowLeft size={16} />
              </Link>
            )}
            <div className="min-w-0 flex-1">
              {canManage && mode === "manage" ? (
                <input
                  className="rh-input w-full !text-[18px] !font-semibold !border-0 !bg-transparent !px-0"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => {
                    if (editTitle.trim() && editTitle !== task.title) {
                      void patchTask({ title: editTitle });
                    }
                  }}
                />
              ) : (
                <h1 className="text-[18px] font-semibold leading-snug m-0">
                  {task.title}
                </h1>
              )}
              <div className="mt-2 flex flex-wrap gap-2 items-center">
                <RhBadge
                  bg={STATUS_META[task.status].bg}
                  fg={STATUS_META[task.status].fg}
                >
                  {STATUS_META[task.status].label}
                </RhBadge>
                <RhBadge
                  bg={PRIORITY_META[task.priority].bg}
                  fg={PRIORITY_META[task.priority].fg}
                >
                  {PRIORITY_META[task.priority].label}
                </RhBadge>
                <span className="text-[12px]" style={{ color: dueTone(task) }}>
                  {formatDueRelative(task.dueAt, {
                    overdue: task.overdue,
                    done:
                      task.status === "DONE" || task.status === "CANCELLED",
                  })}
                </span>
                <span
                  className="text-[11px] inline-flex items-center gap-1"
                  style={{ color: "var(--rh-text-dim)" }}
                >
                  <MessageSquare size={11} /> {task.counts.comments}
                  <Paperclip size={11} className="ml-1" />{" "}
                  {task.counts.attachments}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {task.status !== "DONE" ? (
              <RhButton
                disabled={busy}
                onClick={() => void patchTask({ status: "DONE" })}
              >
                <CheckCircle2 size={14} /> Terminer
              </RhButton>
            ) : null}
            {mode === "manage" ? (
              <>
                <RhButton
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void patchTask({ archived: !task.archivedAt })
                  }
                >
                  <Archive size={14} />
                  {task.archivedAt ? "Désarchiver" : "Archiver"}
                </RhButton>
                <RhButton
                  variant="danger"
                  disabled={busy}
                  onClick={() => void removeTask()}
                >
                  <Trash2 size={14} /> Supprimer
                </RhButton>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {/* Body: 2 columns */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] min-h-0">
        {/* Left: meta */}
        <aside
          className="border-b lg:border-b-0 lg:border-r overflow-y-auto px-4 sm:px-6 py-5 flex flex-col gap-5"
          style={{ borderColor: "var(--rh-border)" }}
        >
          <section className="flex flex-col gap-3">
            <div>
              <div className="rh-micro mb-1.5">Assignés · {people.length}</div>
              <div className="flex flex-wrap gap-1.5">
                {people.map((p) => (
                  <div
                    key={p.id}
                    className="inline-flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-1"
                    style={{ background: "var(--rh-surface)" }}
                  >
                    <RhAvatar
                      initials={p.initials}
                      color={p.avatarColor}
                      src={p.avatarUrl}
                      size={22}
                    />
                    <span className="text-[12px]">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="rh-micro mb-1">Créée par</div>
              <div className="flex items-center gap-2">
                <RhAvatar
                  initials={task.creator.initials}
                  color={task.creator.avatarColor}
                  src={task.creator.avatarUrl}
                  size={24}
                />
                <span className="text-[13px]">{task.creator.name}</span>
              </div>
            </div>
            <div>
              <div className="rh-micro mb-1.5">
                Talent concerné{" "}
                <span style={{ color: "var(--rh-text-dim)" }}>· interne</span>
              </div>
              {canManage ? (
                <TalentLinkPicker
                  selected={task.talent}
                  query={talentQuery}
                  onQuery={setTalentQuery}
                  results={talentResults}
                  searching={talentSearching}
                  onSelect={(t) => {
                    void patchTask({ talentId: t.id });
                    setTalentQuery("");
                  }}
                  onClear={() => void patchTask({ talentId: null })}
                />
              ) : task.talent ? (
                <a
                  href={`/talents/${task.talent.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 no-underline"
                  style={{ color: "inherit" }}
                >
                  <RhAvatar
                    initials={task.talent.initials}
                    color="#7C3AED"
                    src={task.talent.photo}
                    size={24}
                  />
                  <span className="text-[13px]">{task.talent.name}</span>
                </a>
              ) : (
                <span
                  className="text-[12px]"
                  style={{ color: "var(--rh-text-dim)" }}
                >
                  Aucun
                </span>
              )}
            </div>
          </section>

          <section>
            <div className="rh-micro mb-2">Statut</div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  "TODO",
                  "IN_PROGRESS",
                  "BLOCKED",
                  "DONE",
                  "CANCELLED",
                ] as TaskStatus[]
              ).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy || task.status === s}
                  onClick={() => void patchTask({ status: s })}
                  className="rh-badge cursor-pointer border-0 disabled:opacity-40"
                  style={{
                    background: STATUS_META[s].bg,
                    color: STATUS_META[s].fg,
                    outline:
                      task.status === s
                        ? "1px solid var(--rh-accent)"
                        : undefined,
                  }}
                >
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
          </section>

          {mode === "manage" ? (
            <section className="grid grid-cols-2 gap-3">
              <div>
                <div className="rh-micro mb-1">Priorité</div>
                <select
                  className="rh-input w-full"
                  value={task.priority}
                  disabled={busy}
                  onChange={(e) =>
                    void patchTask({ priority: e.target.value })
                  }
                >
                  {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_META[p].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="rh-micro mb-1">Échéance</div>
                <input
                  type="date"
                  className="rh-input w-full"
                  value={task.dueAt ? task.dueAt.slice(0, 10) : ""}
                  disabled={busy}
                  onChange={(e) =>
                    void patchTask({ dueAt: e.target.value || null })
                  }
                />
              </div>
              <div className="col-span-2 flex flex-wrap gap-1.5">
                {duePresets().map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className="rounded-full px-2.5 py-1 text-[11px] border-0 cursor-pointer"
                    style={{
                      background: "var(--rh-surface)",
                      color: "var(--rh-text-muted)",
                    }}
                    onClick={() => void patchTask({ dueAt: p.value })}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="col-span-2">
                <div className="rh-micro mb-1.5">Assignés (multi)</div>
                <div className="flex flex-wrap gap-1.5 max-h-[160px] overflow-y-auto">
                  {employees.map((e) => {
                    const on = people.some((p) => p.id === e.id);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const next = on
                            ? people
                                .filter((p) => p.id !== e.id)
                                .map((p) => p.id)
                            : [...people.map((p) => p.id), e.id];
                          if (!next.length) {
                            toast.error("Au moins un assigné");
                            return;
                          }
                          void patchTask({ assigneeIds: next });
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-1 border cursor-pointer"
                        style={{
                          background: on
                            ? "var(--rh-chip)"
                            : "var(--rh-surface)",
                          borderColor: on
                            ? "var(--rh-accent)"
                            : "transparent",
                          color: on
                            ? "var(--rh-accent)"
                            : "var(--rh-text-muted)",
                        }}
                      >
                        <RhAvatar
                          initials={e.initials}
                          color={e.avatarColor}
                          src={e.avatarUrl}
                          size={18}
                        />
                        <span className="text-[11px]">
                          {e.name.split(" ")[0]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : null}

          <section>
            <div className="rh-micro mb-1">Description</div>
            {mode === "manage" ? (
              <textarea
                className="rh-input w-full min-h-[120px]"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                onBlur={() => {
                  if (editDesc !== (task.description || "")) {
                    void patchTask({ description: editDesc || null });
                  }
                }}
                placeholder="Contexte, livrables…"
              />
            ) : (
              <p
                className="text-[13px] whitespace-pre-wrap leading-relaxed"
                style={{ color: "var(--rh-text-body)" }}
              >
                {task.description || "Pas de description."}
              </p>
            )}
          </section>

          {task.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {task.tags.map((tag) => (
                <RhBadge key={tag} bg="#1E222A" fg="#A8C0E0">
                  #{tag}
                </RhBadge>
              ))}
            </div>
          ) : null}

          <section>
            <RhCardHead
              title="Pièces jointes"
              right={
                <div className="flex items-center gap-1.5">
                  <RhButton
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void createBlankExcel()}
                    className="!text-[12px] !px-2.5 !py-1.5"
                  >
                    <FileSpreadsheet size={12} /> Excel
                  </RhButton>
                  <label className="rh-btn-secondary cursor-pointer inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1.5">
                    <Paperclip size={12} /> Ajouter
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      accept={ACCEPT_FILES}
                      disabled={busy}
                      onChange={(e) => {
                        if (e.target.files?.length) {
                          void uploadFiles(e.target.files);
                        }
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              }
            />
            <div
              className="mt-2 rounded-xl border border-dashed px-3 py-4 text-center transition-colors"
              style={{
                borderColor: dropHot
                  ? "var(--rh-accent)"
                  : "var(--rh-border-strong)",
                background: dropHot
                  ? "rgba(31,41,55,.06)"
                  : "var(--rh-surface)",
                color: "var(--rh-text-muted)",
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDropHot(true);
              }}
              onDragLeave={() => setDropHot(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDropHot(false);
                if (e.dataTransfer.files?.length) {
                  void uploadFiles(e.dataTransfer.files);
                }
              }}
            >
              <div className="text-[12px]">
                Glisse Excel, PDF, Word, CSV… ici
              </div>
              <div
                className="text-[10px] mt-0.5"
                style={{ color: "var(--rh-text-dim)" }}
              >
                Max 25 Mo · Excel éditable dans le navigateur
              </div>
            </div>
            {task.attachments.length === 0 ? (
              <p
                className="text-[12px] mt-2"
                style={{ color: "var(--rh-text-muted)" }}
              >
                Aucune pour l’instant.
              </p>
            ) : (
              <ul className="flex flex-col gap-2 mt-2">
                {task.attachments.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2 text-[12px] rounded-lg px-3 py-2"
                    style={{ background: "var(--rh-surface)" }}
                  >
                    {isOfficeFileName(a.fileName) ? (
                      <FileSpreadsheet
                        size={12}
                        className="shrink-0"
                        style={{ color: "var(--rh-accent)" }}
                      />
                    ) : (
                      <Paperclip
                        size={12}
                        className="shrink-0"
                        style={{ color: "var(--rh-accent)" }}
                      />
                    )}
                    <a
                      href={a.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 truncate"
                      download={a.fileName}
                    >
                      {a.fileName}
                    </a>
                    {a.sizeBytes ? (
                      <span
                        className="rh-mono text-[10px] shrink-0"
                        style={{ color: "var(--rh-text-dim)" }}
                      >
                        {Math.max(1, Math.round(a.sizeBytes / 1024))} Ko
                      </span>
                    ) : null}
                    {isOfficeFileName(a.fileName) ? (
                      <RhButton
                        variant="secondary"
                        className="!text-[11px] !px-2 !py-1"
                        disabled={busy}
                        onClick={() =>
                          setOfficeEdit({
                            taskId: task.id,
                            attachmentId: a.id,
                            fileName: a.fileName,
                          })
                        }
                      >
                        Ouvrir
                      </RhButton>
                    ) : null}
                    <button
                      type="button"
                      className="border-0 bg-transparent cursor-pointer"
                      style={{ color: "var(--rh-text-muted)" }}
                      onClick={() => void removeAttachment(a.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        {/* Right: conversation */}
        <section
          className="flex flex-col min-h-[420px] lg:min-h-0"
          style={{ background: "var(--rh-bg)" }}
        >
          <div
            className="flex items-center gap-1 px-4 sm:px-6 pt-4 border-b"
            style={{ borderColor: "var(--rh-border)" }}
          >
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium border-0 cursor-pointer bg-transparent"
              style={{
                color:
                  sideTab === "conversation"
                    ? "var(--rh-accent)"
                    : "var(--rh-text-muted)",
                borderBottom:
                  sideTab === "conversation"
                    ? "2px solid var(--rh-accent)"
                    : "2px solid transparent",
                marginBottom: -1,
              }}
              onClick={() => setSideTab("conversation")}
            >
              <MessageSquare size={14} />
              Conversation
              <span className="tabular-nums text-[11px] opacity-70">
                {task.comments.length}
              </span>
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium border-0 cursor-pointer bg-transparent"
              style={{
                color:
                  sideTab === "history"
                    ? "var(--rh-accent)"
                    : "var(--rh-text-muted)",
                borderBottom:
                  sideTab === "history"
                    ? "2px solid var(--rh-accent)"
                    : "2px solid transparent",
                marginBottom: -1,
              }}
              onClick={() => setSideTab("history")}
            >
              <History size={14} />
              Historique
            </button>
          </div>

          {sideTab === "conversation" ? (
            <>
              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 flex flex-col gap-3">
                {task.comments.length === 0 ? (
                  <div
                    className="flex-1 grid place-items-center text-center text-[13px] py-12"
                    style={{ color: "var(--rh-text-muted)" }}
                  >
                    Aucun message pour l’instant.
                    <br />
                    <span style={{ color: "var(--rh-text-dim)" }}>
                      Lance la conversation avec @mention si besoin.
                    </span>
                  </div>
                ) : (
                  task.comments.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-xl px-3.5 py-3"
                      style={{ background: "var(--rh-bg-panel)" }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <RhAvatar
                          initials={c.author.initials}
                          color={c.author.avatarColor}
                          src={c.author.avatarUrl}
                          size={24}
                        />
                        <span className="text-[13px] font-medium">
                          {c.author.name}
                        </span>
                        <span
                          className="text-[11px]"
                          style={{ color: "var(--rh-text-dim)" }}
                        >
                          {formatWhen(c.createdAt)}
                        </span>
                      </div>
                      <p
                        className="text-[14px] whitespace-pre-wrap leading-relaxed m-0"
                        style={{ color: "var(--rh-text-body)" }}
                      >
                        {renderCommentBody(c.body).map((part, i) =>
                          part.type === "mention" ? (
                            <span
                              key={i}
                              className="inline-flex rounded px-1 mx-0.5 text-[13px] font-medium"
                              style={{
                                background: "rgba(124,140,248,.2)",
                                color: "#A5B0FA",
                              }}
                            >
                              @{part.value}
                            </span>
                          ) : (
                            <span key={i}>{part.value}</span>
                          )
                        )}
                      </p>
                    </div>
                  ))
                )}
                <div ref={commentsEndRef} />
              </div>
              <div
                className="border-t px-4 sm:px-6 py-3"
                style={{
                  background: "var(--rh-bg-panel)",
                  borderColor: "var(--rh-border)",
                }}
              >
                <CommentComposer
                  employees={mentionEmployees}
                  busy={busy}
                  onSend={(body, mentionedIds) =>
                    void sendComment(body, mentionedIds)
                  }
                />
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
              {task.events.length === 0 ? (
                <p
                  className="text-[13px]"
                  style={{ color: "var(--rh-text-muted)" }}
                >
                  Aucun événement.
                </p>
              ) : (
                <ul className="flex flex-col gap-2 m-0 p-0 list-none">
                  {task.events.map((ev) => (
                    <li
                      key={ev.id}
                      className="text-[12px] flex gap-3 rounded-lg px-3 py-2"
                      style={{
                        color: "var(--rh-text-muted)",
                        background: "var(--rh-bg-panel)",
                      }}
                    >
                      <span className="tabular-nums shrink-0 w-[7.5rem]">
                        {formatWhen(ev.createdAt)}
                      </span>
                      <span>
                        <strong style={{ color: "var(--rh-text-body)" }}>
                          {EVENT_LABEL[ev.kind] || ev.kind}
                        </strong>
                        {ev.actor ? ` · ${ev.actor.name}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>

      {officeEdit ? (
        <ExcelOfficeEditor
          taskId={officeEdit.taskId}
          attachmentId={officeEdit.attachmentId}
          fileName={officeEdit.fileName}
          onClose={() => {
            setOfficeEdit(null);
            void load();
            if (officeParam) {
              router.replace(taskDetailPath(taskId));
            }
          }}
        />
      ) : null}
    </div>
  );
}
