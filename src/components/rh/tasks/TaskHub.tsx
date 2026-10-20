"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  LayoutGrid,
  List,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  RhAvatar,
  RhBadge,
  RhButton,
  RhCard,
  RhCardHead,
} from "@/components/rh/ui/primitives";
import { ExcelOfficeEditor } from "@/components/rh/tasks/ExcelOfficeEditor";
import {
  CommentComposer,
  renderCommentBody,
} from "@/components/rh/tasks/CommentComposer";
import {
  EVENT_LABEL,
  PRIORITY_META,
  STATUS_COLUMNS,
  STATUS_META,
  duePresets,
  dueTone,
  formatDueRelative,
  formatWhen,
  isOfficeFileName,
  type RhTaskDto,
  type TaskPerson,
  type TaskPriority,
  type TaskStatus,
  type TaskTalent,
} from "@/components/rh/tasks/task-meta";

type EmpOpt = {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  avatarUrl?: string | null;
  department?: string;
  jobTitle?: string;
};

type TalentOpt = TaskTalent;

type Props = {
  mode: "manage" | "mine";
  employees?: EmpOpt[];
  meId: string;
  initialTaskId?: string | null;
};

type ViewMode = "board" | "list" | "team";

const SUGGESTED_TAGS = [
  "urgent",
  "onboarding",
  "finance",
  "casting",
  "rh",
  "ops",
  "client",
  "relance",
];

const emptyForm = () => ({
  title: "",
  description: "",
  assigneeIds: [] as string[],
  talentId: null as string | null,
  talent: null as TalentOpt | null,
  priority: "NORMAL" as TaskPriority,
  dueAt: "",
  tags: "",
  wantBlankExcel: false,
  openAfterCreate: true,
});

function taskAssignees(task: RhTaskDto): TaskPerson[] {
  if (task.assignees?.length) return task.assignees;
  return task.assignee ? [task.assignee] : [];
}

export function TaskHub({ mode, employees = [], meId, initialTaskId }: Props) {
  const [tasks, setTasks] = useState<RhTaskDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<ViewMode>(mode === "manage" ? "board" : "list");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialTaskId || null
  );
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [talentQuery, setTalentQuery] = useState("");
  const [talentResults, setTalentResults] = useState<TalentOpt[]>([]);
  const [talentSearching, setTalentSearching] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);
  const [officeEdit, setOfficeEdit] = useState<{
    taskId: string;
    attachmentId: string;
    fileName: string;
  } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleCreateRef = useRef<HTMLInputElement>(null);

  const ACCEPT_FILES =
    ".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.png,.jpg,.jpeg,.webp,.gif,.zip,.numbers,.pages,.key,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (mode === "mine") params.set("mine", "1");
      if (showArchived) params.set("archived", "1");
      if (q.trim()) params.set("q", q.trim());
      if (mode === "manage" && assigneeFilter) {
        params.set("assigneeId", assigneeFilter);
      }
      if (priorityFilter) params.set("priority", priorityFilter);
      if (statusFilter === "open") {
        params.set("status", "TODO,IN_PROGRESS,BLOCKED");
      } else if (statusFilter === "overdue") {
        params.set("overdue", "1");
      } else if (statusFilter && statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      const res = await fetch(`/api/rh/tasks?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chargement impossible");
      setTasks(data.tasks || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [mode, showArchived, q, assigneeFilter, priorityFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (initialTaskId) setSelectedId(initialTaskId);
  }, [initialTaskId]);

  const selected = useMemo(
    () => tasks.find((t) => t.id === selectedId) || null,
    [tasks, selectedId]
  );

  useEffect(() => {
    if (!selected) return;
    setEditTitle(selected.title);
    setEditDesc(selected.description || "");
  }, [selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
        (e.target as HTMLElement)?.isContentEditable;
      if (e.key === "Escape") {
        if (creating) setCreating(false);
        else if (selectedId) setSelectedId(null);
        return;
      }
      if (typing) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setCreating(true);
        setTimeout(() => titleCreateRef.current?.focus(), 50);
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "1") setView("board");
      if (e.key === "2") setView("list");
      if (e.key === "3" && mode === "manage") setView("team");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [creating, selectedId, mode]);

  useEffect(() => {
    if (creating) setTimeout(() => titleCreateRef.current?.focus(), 40);
  }, [creating]);

  async function uploadToTask(taskId: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/rh/tasks/${taskId}/attachments`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Upload échoué : ${file.name}`);
    return data.task as RhTaskDto;
  }

  async function createTask() {
    if (!form.title.trim()) {
      toast.error("Titre obligatoire");
      return;
    }
    if (mode === "manage" && form.assigneeIds.length === 0) {
      toast.error("Choisis au moins un collaborateur");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/rh/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description || null,
          assigneeIds: mode === "manage" ? form.assigneeIds : [meId],
          talentId: form.talentId,
          priority: form.priority,
          dueAt: form.dueAt || null,
          tags: form.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Création impossible");
      let task = data.task as RhTaskDto;
      const files = [...pendingFiles];
      const wantExcel = form.wantBlankExcel;
      const openAfter = form.openAfterCreate;
      if (files.length) {
        toast.message(
          `Upload de ${files.length} fichier${files.length > 1 ? "s" : ""}…`
        );
        for (const file of files) {
          try {
            task = await uploadToTask(task.id, file);
          } catch (e) {
            toast.error(
              e instanceof Error ? e.message : `Échec : ${file.name}`
            );
          }
        }
      }

      let excelAttachmentId: string | null = null;
      let excelName = "Classeur.xlsx";
      if (wantExcel) {
        try {
          const exRes = await fetch(
            `/api/rh/tasks/${task.id}/attachments/blank-excel`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fileName: `${(form.title || "Classeur").slice(0, 40)}.xlsx`,
              }),
            }
          );
          const exData = await exRes.json();
          if (exRes.ok) {
            task = exData.task as RhTaskDto;
            excelAttachmentId = exData.attachmentId
              ? String(exData.attachmentId)
              : null;
            excelName =
              task.attachments.find((a) => a.id === excelAttachmentId)
                ?.fileName || excelName;
          }
        } catch {
          toast.error("Excel vierge non créé");
        }
      }

      toast.success(
        [
          "Tâche créée",
          mode === "manage" && form.assigneeIds.length
            ? "notif envoyée"
            : null,
          files.length ? `${files.length} PJ` : null,
          wantExcel ? "Excel" : null,
        ]
          .filter(Boolean)
          .join(" · ")
      );
      setCreating(false);
      setForm(emptyForm());
      setPendingFiles([]);
      setAssigneeQuery("");
      setSelectedId(task.id);
      await load();

      if (excelAttachmentId && openAfter) {
        setOfficeEdit({
          taskId: task.id,
          attachmentId: excelAttachmentId,
          fileName: excelName,
        });
      } else if (
        openAfter &&
        !excelAttachmentId &&
        files.some((f) => isOfficeFileName(f.name))
      ) {
        const officeAtt = task.attachments.find((a) =>
          isOfficeFileName(a.fileName)
        );
        if (officeAtt) {
          setOfficeEdit({
            taskId: task.id,
            attachmentId: officeAtt.id,
            fileName: officeAtt.fileName,
          });
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  function addPendingFiles(list: FileList | File[]) {
    const next = [...list];
    if (!next.length) return;
    setPendingFiles((prev) => {
      const names = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const merged = [...prev];
      for (const f of next) {
        const key = `${f.name}-${f.size}`;
        if (!names.has(key)) merged.push(f);
      }
      return merged.slice(0, 10);
    });
  }

  async function patchTask(id: string, body: Record<string, unknown>) {
    // Optimistic status move for drag
    if (typeof body.status === "string") {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                status: body.status as TaskStatus,
                overdue:
                  body.status === "DONE" || body.status === "CANCELLED"
                    ? false
                    : t.overdue,
              }
            : t
        )
      );
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/rh/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Mise à jour impossible");
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? (data.task as RhTaskDto) : t))
      );
      return data.task as RhTaskDto;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
      await load();
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function sendComment(body: string, mentionedIds: string[]) {
    if (!selected || !body.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rh/tasks/${selected.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, mentionedIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setTasks((prev) =>
        prev.map((t) =>
          t.id === selected.id ? (data.task as RhTaskDto) : t
        )
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file: File) {
    if (!selected) return;
    setBusy(true);
    try {
      const task = await uploadToTask(selected.id, file);
      setTasks((prev) =>
        prev.map((t) => (t.id === selected.id ? task : t))
      );
      toast.success(`${file.name} ajouté`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!selected) return;
    const list = [...files];
    for (const f of list) {
      await uploadFile(f);
    }
  }

  async function createBlankExcel() {
    if (!selected) return;
    const name = window.prompt("Nom du fichier Excel", "Classeur.xlsx");
    if (name == null) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/rh/tasks/${selected.id}/attachments/blank-excel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: name.trim() || "Classeur.xlsx" }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Création impossible");
      const task = data.task as RhTaskDto;
      setTasks((prev) =>
        prev.map((t) => (t.id === selected.id ? task : t))
      );
      toast.success("Excel créé");
      if (data.attachmentId && data.onlyOfficeReady) {
        setOfficeEdit({
          taskId: selected.id,
          attachmentId: String(data.attachmentId),
          fileName:
            task.attachments.find((a) => a.id === data.attachmentId)
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
    if (!selected) return;
    if (!window.confirm("Retirer cette pièce jointe ?")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/rh/tasks/${selected.id}/attachments?attachmentId=${attachmentId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setTasks((prev) =>
        prev.map((t) =>
          t.id === selected.id ? (data.task as RhTaskDto) : t
        )
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function removeTask(id: string) {
    if (!window.confirm("Supprimer définitivement cette tâche ?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rh/tasks/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (selectedId === id) setSelectedId(null);
      toast.success("Tâche supprimée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const openTasks = useMemo(
    () =>
      tasks.filter((t) =>
        ["TODO", "IN_PROGRESS", "BLOCKED"].includes(t.status)
      ),
    [tasks]
  );

  const kpis = useMemo(() => {
    const overdue = openTasks.filter((t) => t.overdue);
    const urgent = openTasks.filter((t) => t.priority === "URGENT");
    const dueToday = openTasks.filter((t) => {
      if (!t.dueAt) return false;
      const a = new Date(t.dueAt);
      const b = new Date();
      return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
      );
    });
    const done = tasks.filter((t) => t.status === "DONE");
    return {
      open: openTasks.length,
      overdue: overdue.length,
      urgent: urgent.length,
      dueToday: dueToday.length,
      done: done.length,
    };
  }, [tasks, openTasks]);

  const byColumn = useMemo(() => {
    const map: Record<string, RhTaskDto[]> = {};
    for (const s of STATUS_COLUMNS) map[s] = [];
    for (const t of tasks) {
      if (map[t.status]) map[t.status].push(t);
    }
    return map;
  }, [tasks]);

  const workload = useMemo(() => {
    const map = new Map<
      string,
      {
        person: EmpOpt;
        open: number;
        overdue: number;
        urgent: number;
      }
    >();
    for (const e of employees) {
      map.set(e.id, { person: e, open: 0, overdue: 0, urgent: 0 });
    }
    for (const t of openTasks) {
      for (const person of taskAssignees(t)) {
        let row = map.get(person.id);
        if (!row) {
          row = {
            person: {
              id: person.id,
              name: person.name,
              initials: person.initials,
              avatarColor: person.avatarColor,
              avatarUrl: person.avatarUrl,
              department: person.department,
              jobTitle: person.jobTitle,
            },
            open: 0,
            overdue: 0,
            urgent: 0,
          };
          map.set(person.id, row);
        }
        row.open += 1;
        if (t.overdue) row.overdue += 1;
        if (t.priority === "URGENT") row.urgent += 1;
      }
    }
    return [...map.values()]
      .filter((r) => r.open > 0 || mode === "manage")
      .sort((a, b) => b.open - a.open || b.overdue - a.overdue);
  }, [employees, openTasks, mode]);

  useEffect(() => {
    if (!creating && !selectedId) return;
    const q = talentQuery.trim();
    let cancelled = false;
    const t = setTimeout(() => {
      setTalentSearching(true);
      void fetch(
        `/api/rh/tasks/talents?q=${encodeURIComponent(q)}`
      )
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled) setTalentResults((d.talents || []) as TalentOpt[]);
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
  }, [talentQuery, creating, selectedId]);

  function openCreateFor(assigneeId?: string) {
    setForm({
      ...emptyForm(),
      assigneeIds: assigneeId ? [assigneeId] : [],
    });
    setPendingFiles([]);
    setAssigneeQuery("");
    setTalentQuery("");
    setCreating(true);
  }

  function toggleAssignee(id: string) {
    setForm((f) => {
      const has = f.assigneeIds.includes(id);
      return {
        ...f,
        assigneeIds: has
          ? f.assigneeIds.filter((x) => x !== id)
          : [...f.assigneeIds, id],
      };
    });
  }

  const formTags = useMemo(
    () =>
      form.tags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    [form.tags]
  );

  function toggleFormTag(tag: string) {
    const set = new Set(formTags);
    if (set.has(tag)) set.delete(tag);
    else set.add(tag);
    setForm((f) => ({ ...f, tags: [...set].join(", ") }));
  }

  const filteredAssignees = useMemo(() => {
    const q = assigneeQuery.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.department || "").toLowerCase().includes(q) ||
        (e.jobTitle || "").toLowerCase().includes(q)
    );
  }, [employees, assigneeQuery]);

  const selectedAssignees = useMemo(
    () => employees.filter((e) => form.assigneeIds.includes(e.id)),
    [employees, form.assigneeIds]
  );

  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-5 py-5 flex flex-col gap-4">
      {/* Header compact command-center */}
      <div className="flex flex-wrap items-end justify-between gap-3 rh-rise">
        <div>
          <div className="rh-micro" style={{ color: "var(--rh-accent)" }}>
            {mode === "manage" ? "HUB" : "MES TÂCHES"}
          </div>
          <h1 className="text-[22px] sm:text-[26px] font-semibold tracking-tight mt-0.5">
            {mode === "manage" ? "Pilotage" : "À traiter"}
          </h1>
          <p className="text-[12.5px] mt-1" style={{ color: "var(--rh-text-secondary)" }}>
            {mode === "manage"
              ? "Assigne · suis · débloque — N nouvelle · / chercher · 1/2/3 vues"
              : "Uniquement les tâches qui te sont assignées"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-full p-[3px]"
            style={{
              background: "var(--rh-surface-control)",
              border: "1px solid var(--rh-border-control)",
            }}
          >
            {(
              [
                { id: "board" as const, icon: LayoutGrid, tip: "Kanban" },
                { id: "list" as const, icon: List, tip: "Liste" },
                ...(mode === "manage"
                  ? [{ id: "team" as const, icon: Users, tip: "Charge" }]
                  : []),
              ] as Array<{ id: ViewMode; icon: typeof List; tip: string }>
            ).map((v) => (
              <button
                key={v.id}
                type="button"
                title={v.tip}
                onClick={() => setView(v.id)}
                className="border-0 cursor-pointer rounded-full p-2"
                style={{
                  background: view === v.id ? "var(--rh-chip)" : "transparent",
                  color:
                    view === v.id ? "var(--rh-accent)" : "var(--rh-text-muted)",
                }}
              >
                <v.icon size={14} />
              </button>
            ))}
          </div>
          <RhButton onClick={() => openCreateFor(assigneeFilter || undefined)}>
            <Plus size={14} /> Nouvelle
            <span className="rh-mono text-[9.5px] opacity-50 ml-1">N</span>
          </RhButton>
        </div>
      </div>

      {/* KPI filters */}
      <div className="grid gap-2 [grid-template-columns:repeat(5,minmax(0,1fr))] max-md:[grid-template-columns:repeat(3,minmax(0,1fr))] max-sm:[grid-template-columns:repeat(2,minmax(0,1fr))]">
        {(
          [
            {
              key: "open",
              label: "Ouvertes",
              value: kpis.open,
              tone: "#E5F2B5",
              filter: "open",
            },
            {
              key: "overdue",
              label: "En retard",
              value: kpis.overdue,
              tone: "#F2604E",
              filter: "overdue",
            },
            {
              key: "urgent",
              label: "Urgentes",
              value: kpis.urgent,
              tone: "#F0C24E",
              filter: "URGENT",
              isPriority: true,
            },
            {
              key: "today",
              label: "Aujourd’hui",
              value: kpis.dueToday,
              tone: "#7C8CF8",
              filter: "open",
            },
            {
              key: "done",
              label: "Terminées",
              value: kpis.done,
              tone: "#A8E0A0",
              filter: "DONE",
            },
          ] as const
        ).map((k) => {
          const active =
            ("isPriority" in k && k.isPriority
              ? priorityFilter === "URGENT"
              : statusFilter === k.filter) &&
            !(k.key === "today");
          return (
            <button
              key={k.key}
              type="button"
              className="text-left rounded-xl px-3.5 py-3 border cursor-pointer transition-colors"
              style={{
                background: active ? "var(--rh-surface-selected)" : "var(--rh-surface)",
                borderColor: active ? k.tone : "var(--rh-border-subtle)",
              }}
              onClick={() => {
                if ("isPriority" in k && k.isPriority) {
                  setPriorityFilter(priorityFilter === "URGENT" ? "" : "URGENT");
                  setStatusFilter("open");
                } else if (k.key === "today") {
                  setStatusFilter("open");
                  setPriorityFilter("");
                  // soft client filter via q empty — keep open, user sees dueToday in board
                  toast.message(
                    `${kpis.dueToday} tâche${kpis.dueToday > 1 ? "s" : ""} pour aujourd’hui`
                  );
                } else {
                  setStatusFilter(
                    statusFilter === k.filter ? "open" : k.filter
                  );
                  if (k.filter !== "URGENT") setPriorityFilter("");
                }
              }}
            >
              <div
                className="text-[10px] uppercase tracking-wide"
                style={{ color: "var(--rh-text-muted)" }}
              >
                {k.label}
              </div>
              <div
                className="mt-0.5 text-[24px] font-semibold tabular-nums leading-none"
                style={{ color: k.tone }}
              >
                {k.value}
              </div>
            </button>
          );
        })}
      </div>

      {/* Workload chips (manage) */}
      {mode === "manage" && workload.some((w) => w.open > 0) ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setAssigneeFilter("")}
            className="shrink-0 rounded-full px-3 py-1.5 text-[12px] border-0 cursor-pointer"
            style={{
              background: !assigneeFilter ? "var(--rh-chip)" : "var(--rh-surface)",
              color: !assigneeFilter ? "var(--rh-accent)" : "var(--rh-text-muted)",
            }}
          >
            Toute l’équipe
          </button>
          {workload
            .filter((w) => w.open > 0)
            .map((w) => (
              <button
                key={w.person.id}
                type="button"
                onClick={() =>
                  setAssigneeFilter(
                    assigneeFilter === w.person.id ? "" : w.person.id
                  )
                }
                className="shrink-0 inline-flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1 text-[12px] border cursor-pointer"
                style={{
                  background:
                    assigneeFilter === w.person.id
                      ? "var(--rh-surface-selected)"
                      : "var(--rh-surface)",
                  borderColor:
                    assigneeFilter === w.person.id
                      ? "var(--rh-accent)"
                      : "var(--rh-border-subtle)",
                  color: "var(--rh-text)",
                }}
              >
                <RhAvatar
                  initials={w.person.initials}
                  color={w.person.avatarColor}
                  src={w.person.avatarUrl}
                  size={22}
                />
                <span className="font-medium">{w.person.name.split(" ")[0]}</span>
                <span
                  className="rh-mono text-[10px] tabular-nums"
                  style={{
                    color: w.overdue > 0 ? "#F2604E" : "var(--rh-text-muted)",
                  }}
                >
                  {w.open}
                  {w.overdue > 0 ? ` · ${w.overdue}⏱` : ""}
                </span>
              </button>
            ))}
        </div>
      ) : null}

      {/* Search / filters */}
      <RhCard className="!p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--rh-text-dim)" }}
            />
            <input
              ref={searchRef}
              className="rh-input w-full !pl-9"
              placeholder="Rechercher…  /"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void load();
              }}
            />
          </div>
          <select
            className="rh-input !w-auto"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="open">Ouvertes</option>
            <option value="all">Tous</option>
            <option value="overdue">En retard</option>
            <option value="TODO">À faire</option>
            <option value="IN_PROGRESS">En cours</option>
            <option value="BLOCKED">Bloquées</option>
            <option value="DONE">Terminées</option>
          </select>
          <select
            className="rh-input !w-auto"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="">Priorité</option>
            <option value="URGENT">Urgente</option>
            <option value="HIGH">Haute</option>
            <option value="NORMAL">Normale</option>
            <option value="LOW">Basse</option>
          </select>
          {mode === "manage" && employees.length > 0 ? (
            <select
              className="rh-input !w-auto"
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
            >
              <option value="">Assigné</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          ) : null}
          <label
            className="flex items-center gap-2 text-[12px] cursor-pointer px-1"
            style={{ color: "var(--rh-text-muted)" }}
          >
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Archives
          </label>
        </div>
      </RhCard>

      {loading ? (
        <div
          className="flex items-center justify-center gap-2 py-20"
          style={{ color: "var(--rh-text-muted)" }}
        >
          <Loader2 size={18} className="animate-spin" /> Chargement…
        </div>
      ) : view === "team" && mode === "manage" ? (
        <div className="flex flex-col gap-2 rh-rise">
          {workload.length === 0 ? (
            <EmptyState onCreate={() => openCreateFor()} manage />
          ) : (
            workload.map((w) => (
              <RhCard key={w.person.id} className="!p-0 overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-3 text-left border-0 cursor-pointer"
                  style={{ background: "transparent", color: "inherit" }}
                  onClick={() => {
                    setAssigneeFilter(w.person.id);
                    setView("board");
                    setStatusFilter("open");
                  }}
                >
                  <RhAvatar
                    initials={w.person.initials}
                    color={w.person.avatarColor}
                    src={w.person.avatarUrl}
                    size={36}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium">{w.person.name}</div>
                    <div
                      className="text-[11px] truncate"
                      style={{ color: "var(--rh-text-muted)" }}
                    >
                      {w.person.jobTitle || w.person.department || "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[12px] tabular-nums">
                    <span style={{ color: "var(--rh-accent)" }}>
                      {w.open} ouverte{w.open > 1 ? "s" : ""}
                    </span>
                    {w.overdue > 0 ? (
                      <span style={{ color: "#F2604E" }}>{w.overdue} retard</span>
                    ) : null}
                    {w.urgent > 0 ? (
                      <span style={{ color: "#F0C24E" }}>{w.urgent} urgent</span>
                    ) : null}
                  </div>
                  <RhButton
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      openCreateFor(w.person.id);
                    }}
                  >
                    <Plus size={12} /> Assigner
                  </RhButton>
                </button>
              </RhCard>
            ))
          )}
        </div>
      ) : view === "board" ? (
        tasks.length === 0 ? (
          <EmptyState onCreate={() => openCreateFor()} manage={mode === "manage"} />
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(4,minmax(0,1fr))] max-lg:[grid-template-columns:repeat(2,minmax(0,1fr))] max-sm:[grid-template-columns:1fr]">
            {STATUS_COLUMNS.map((col) => (
              <div
                key={col}
                className="flex flex-col gap-2 min-h-[220px] rounded-xl p-2 transition-colors"
                style={{
                  background:
                    dragOverCol === col
                      ? "rgba(31,41,55,.06)"
                      : "transparent",
                  outline:
                    dragOverCol === col
                      ? "1px dashed var(--rh-accent)"
                      : undefined,
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverCol(col);
                }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverCol(null);
                  const id = e.dataTransfer.getData("text/task-id");
                  if (!id) return;
                  const task = tasks.find((t) => t.id === id);
                  if (!task || task.status === col) return;
                  void patchTask(id, { status: col });
                }}
              >
                <div className="flex items-center justify-between px-1">
                  <RhBadge bg={STATUS_META[col].bg} fg={STATUS_META[col].fg}>
                    {STATUS_META[col].label}
                  </RhBadge>
                  <span
                    className="text-[11px] tabular-nums"
                    style={{ color: "var(--rh-text-dim)" }}
                  >
                    {byColumn[col]?.length || 0}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {(byColumn[col] || []).map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      active={task.id === selectedId}
                      showAssignee={mode === "manage"}
                      draggable
                      onClick={() => setSelectedId(task.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <RhCard className="!p-0 overflow-hidden rh-rise">
          <div className="divide-y" style={{ borderColor: "var(--rh-divider-row)" }}>
            {tasks.length === 0 ? (
              <EmptyState
                onCreate={() => openCreateFor()}
                manage={mode === "manage"}
                compact
              />
            ) : (
              tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setSelectedId(task.id)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-0 cursor-pointer"
                  style={{
                    background:
                      task.id === selectedId
                        ? "var(--rh-surface-selected)"
                        : "transparent",
                    color: "inherit",
                  }}
                  onMouseEnter={(e) => {
                    if (task.id !== selectedId)
                      e.currentTarget.style.background = "var(--rh-surface-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      task.id === selectedId
                        ? "var(--rh-surface-selected)"
                        : "transparent";
                  }}
                >
                  <RhAvatar
                    initials={
                      mode === "manage"
                        ? task.assignee.initials
                        : task.creator.initials
                    }
                    color={
                      mode === "manage"
                        ? task.assignee.avatarColor
                        : task.creator.avatarColor
                    }
                    src={
                      mode === "manage"
                        ? task.assignee.avatarUrl
                        : task.creator.avatarUrl
                    }
                    size={28}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-medium truncate">
                        {task.title}
                      </span>
                      <RhBadge
                        bg={PRIORITY_META[task.priority].bg}
                        fg={PRIORITY_META[task.priority].fg}
                      >
                        {PRIORITY_META[task.priority].label}
                      </RhBadge>
                      <RhBadge
                        bg={STATUS_META[task.status].bg}
                        fg={STATUS_META[task.status].fg}
                      >
                        {STATUS_META[task.status].label}
                      </RhBadge>
                    </div>
                    <div
                      className="text-[11px] mt-0.5 flex gap-3 flex-wrap"
                      style={{ color: "var(--rh-text-muted)" }}
                    >
                      <span>
                        {mode === "manage"
                          ? taskAssignees(task).length === 1
                            ? taskAssignees(task)[0]!.name
                            : `${taskAssignees(task).length} assignés`
                          : `par ${task.creator.name}`}
                      </span>
                      {task.talent ? (
                        <span style={{ color: "#7C3AED" }}>
                          {task.talent.name}
                        </span>
                      ) : null}
                      <span style={{ color: dueTone(task) }}>
                        <Clock3 size={10} className="inline mr-1" />
                        {formatDueRelative(task.dueAt, {
                          overdue: task.overdue,
                          done:
                            task.status === "DONE" ||
                            task.status === "CANCELLED",
                        })}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare size={10} /> {task.counts.comments}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Paperclip size={10} /> {task.counts.attachments}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </RhCard>
      )}

      {/* Drawer */}
      {selected ? (
        <DetailDrawer
          selected={selected}
          mode={mode}
          meId={meId}
          employees={employees}
          busy={busy}
          editTitle={editTitle}
          editDesc={editDesc}
          setEditTitle={setEditTitle}
          setEditDesc={setEditDesc}
          talentQuery={talentQuery}
          setTalentQuery={setTalentQuery}
          talentResults={talentResults}
          talentSearching={talentSearching}
          onClose={() => {
            setSelectedId(null);
            setTalentQuery("");
          }}
          onPatch={(body) => patchTask(selected.id, body)}
          onComment={(body, mentionedIds) =>
            void sendComment(body, mentionedIds)
          }
          onUpload={(files) => void uploadFiles(files)}
          acceptFiles={ACCEPT_FILES}
          onRemoveAtt={(id) => void removeAttachment(id)}
          onRemove={() => void removeTask(selected.id)}
          onOpenOffice={(att) =>
            setOfficeEdit({
              taskId: selected.id,
              attachmentId: att.id,
              fileName: att.fileName,
            })
          }
          onCreateExcel={() => void createBlankExcel()}
        />
      ) : null}

      {officeEdit ? (
        <ExcelOfficeEditor
          taskId={officeEdit.taskId}
          attachmentId={officeEdit.attachmentId}
          fileName={officeEdit.fileName}
          onClose={() => {
            setOfficeEdit(null);
            void load();
          }}
          onSaved={() => {
            void load();
          }}
        />
      ) : null}

      {/* Create modal */}
      {creating ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center px-3 py-4 sm:px-4"
          style={{ background: "rgba(0,0,0,.72)" }}
          onClick={() => {
            setCreating(false);
            setPendingFiles([]);
            setAssigneeQuery("");
          }}
        >
          <div
            className="w-full max-w-[640px] max-h-[min(92vh,900px)] overflow-y-auto rounded-2xl border rh-rise"
            style={{
              background: "var(--rh-bg-panel)",
              borderColor: "var(--rh-border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 border-b"
              style={{ background: "var(--rh-bg-panel)", borderColor: "var(--rh-border)" }}
            >
              <div>
                <div className="rh-micro" style={{ color: "var(--rh-accent)" }}>
                  NOUVELLE TÂCHE
                </div>
                <h3 className="text-[18px] font-semibold mt-0.5 tracking-tight">
                  {mode === "manage" ? "Brief pour l’équipe" : "Nouvelle tâche"}
                </h3>
                <p
                  className="text-[12px] mt-1"
                  style={{ color: "var(--rh-text-muted)" }}
                >
                  Titre, assigné, échéance, fichiers — notification auto à la
                  création.
                </p>
              </div>
              <button
                type="button"
                className="p-1.5 border-0 bg-transparent cursor-pointer rounded-lg"
                style={{ color: "var(--rh-text-muted)" }}
                onClick={() => {
                  setCreating(false);
                  setPendingFiles([]);
                  setAssigneeQuery("");
                  setTalentQuery("");
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-5">
              {/* Titre + description */}
              <section className="flex flex-col gap-2">
                <label className="rh-micro">Titre *</label>
                <input
                  ref={titleCreateRef}
                  className="rh-input !text-[15px] !font-medium"
                  placeholder="Ex. Finaliser le reporting collabs septembre"
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      void createTask();
                    }
                  }}
                />
                <label className="rh-micro mt-1">Brief / contexte</label>
                <textarea
                  className="rh-input min-h-[100px]"
                  placeholder={`Contexte, livrable attendu, liens utiles…\n\nEx.\n• Objectif\n• Deadline métier\n• Fichiers de référence`}
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </section>

              {/* Assignés (multi) */}
              {mode === "manage" ? (
                <section className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="rh-micro">
                      Assignés * · {form.assigneeIds.length} sélectionné
                      {form.assigneeIds.length > 1 ? "s" : ""}
                    </label>
                    {form.assigneeIds.length > 0 ? (
                      <button
                        type="button"
                        className="text-[11px] border-0 bg-transparent cursor-pointer"
                        style={{ color: "var(--rh-text-muted)" }}
                        onClick={() =>
                          setForm((f) => ({ ...f, assigneeIds: [] }))
                        }
                      >
                        Tout effacer
                      </button>
                    ) : null}
                  </div>
                  {selectedAssignees.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedAssignees.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => toggleAssignee(e.id)}
                          className="inline-flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-1 border-0 cursor-pointer"
                          style={{
                            background: "var(--rh-chip)",
                            color: "var(--rh-accent)",
                          }}
                          title="Retirer"
                        >
                          <RhAvatar
                            initials={e.initials}
                            color={e.avatarColor}
                            src={e.avatarUrl}
                            size={20}
                          />
                          <span className="text-[12px] font-medium">
                            {e.name.split(" ")[0]}
                          </span>
                          <X size={11} />
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2"
                      style={{ color: "var(--rh-text-dim)" }}
                    />
                    <input
                      className="rh-input w-full !pl-9"
                      placeholder="Ajouter des collaborateurs…"
                      value={assigneeQuery}
                      onChange={(e) => setAssigneeQuery(e.target.value)}
                    />
                  </div>
                  <div
                    className="grid gap-1.5 max-h-[180px] overflow-y-auto rounded-xl p-1.5 border"
                    style={{
                      background: "var(--rh-bg-panel)",
                      borderColor: "var(--rh-border-subtle)",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(200px, 1fr))",
                    }}
                  >
                    {filteredAssignees.length === 0 ? (
                      <div
                        className="col-span-full text-center text-[12px] py-4"
                        style={{ color: "var(--rh-text-muted)" }}
                      >
                        Aucun collaborateur
                      </div>
                    ) : (
                      filteredAssignees.map((e) => {
                        const on = form.assigneeIds.includes(e.id);
                        return (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => toggleAssignee(e.id)}
                            className="flex items-center gap-2 text-left rounded-lg px-2 py-2 border cursor-pointer transition-colors"
                            style={{
                              background: on
                                ? "rgba(31,41,55,.06)"
                                : "var(--rh-surface)",
                              borderColor: on
                                ? "var(--rh-accent)"
                                : "transparent",
                              color: "inherit",
                            }}
                          >
                            <RhAvatar
                              initials={e.initials}
                              color={e.avatarColor}
                              src={e.avatarUrl}
                              size={28}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-[12.5px] font-medium truncate">
                                {e.name}
                              </div>
                              <div
                                className="text-[10px] truncate"
                                style={{ color: "var(--rh-text-dim)" }}
                              >
                                {e.department || e.jobTitle || "—"}
                              </div>
                            </div>
                            {on ? (
                              <RhBadge bg="#1A2E1C" fg="#A8E0A0">
                                ✓
                              </RhBadge>
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                </section>
              ) : null}

              {/* Talent (interne — aucune notif) */}
              <section className="flex flex-col gap-2">
                <label className="rh-micro">
                  Talent concerné{" "}
                  <span style={{ color: "var(--rh-text-dim)" }}>
                    · optionnel · interne
                  </span>
                </label>
                <TalentLinkPicker
                  selected={form.talent}
                  query={talentQuery}
                  onQuery={setTalentQuery}
                  results={talentResults}
                  searching={talentSearching}
                  onSelect={(t) => {
                    setForm((f) => ({
                      ...f,
                      talentId: t.id,
                      talent: t,
                    }));
                    setTalentQuery("");
                  }}
                  onClear={() =>
                    setForm((f) => ({
                      ...f,
                      talentId: null,
                      talent: null,
                    }))
                  }
                />
              </section>

              {/* Priorité */}
              <section className="flex flex-col gap-2">
                <label className="rh-micro">Priorité</label>
                <div className="grid grid-cols-4 gap-1.5 max-sm:grid-cols-2">
                  {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => {
                    const active = form.priority === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, priority: p }))}
                        className="rounded-xl px-2 py-2.5 text-[12px] font-medium border cursor-pointer"
                        style={{
                          background: active
                            ? PRIORITY_META[p].bg
                            : "var(--rh-surface)",
                          color: active
                            ? PRIORITY_META[p].fg
                            : "var(--rh-text-muted)",
                          borderColor: active
                            ? PRIORITY_META[p].fg
                            : "var(--rh-border-subtle)",
                        }}
                      >
                        {PRIORITY_META[p].label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Échéance */}
              <section className="flex flex-col gap-2">
                <label className="rh-micro">Échéance</label>
                <div className="flex flex-wrap gap-1.5">
                  {duePresets().map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className="rounded-full px-3 py-1.5 text-[12px] border-0 cursor-pointer"
                      style={{
                        background:
                          form.dueAt === p.value
                            ? "var(--rh-chip)"
                            : "var(--rh-surface)",
                        color:
                          form.dueAt === p.value
                            ? "var(--rh-accent)"
                            : "var(--rh-text-muted)",
                      }}
                      onClick={() =>
                        setForm((f) => ({ ...f, dueAt: p.value }))
                      }
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="rounded-full px-3 py-1.5 text-[12px] border-0 cursor-pointer"
                    style={{
                      background: !form.dueAt
                        ? "var(--rh-chip)"
                        : "var(--rh-surface)",
                      color: !form.dueAt
                        ? "var(--rh-accent)"
                        : "var(--rh-text-muted)",
                    }}
                    onClick={() => setForm((f) => ({ ...f, dueAt: "" }))}
                  >
                    Sans date
                  </button>
                </div>
                <input
                  type="date"
                  className="rh-input max-w-[220px]"
                  value={form.dueAt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dueAt: e.target.value }))
                  }
                />
              </section>

              {/* Tags */}
              <section className="flex flex-col gap-2">
                <label className="rh-micro">Tags</label>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_TAGS.map((tag) => {
                    const on = formTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleFormTag(tag)}
                        className="rounded-full px-2.5 py-1 text-[11px] border-0 cursor-pointer"
                        style={{
                          background: on ? "var(--rh-chip)" : "var(--rh-surface)",
                          color: on ? "var(--rh-accent)" : "var(--rh-text-muted)",
                        }}
                      >
                        #{tag}
                      </button>
                    );
                  })}
                </div>
                <input
                  className="rh-input"
                  placeholder="Autres tags (séparés par des virgules)"
                  value={form.tags}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tags: e.target.value }))
                  }
                />
              </section>

              {/* Fichiers */}
              <section className="flex flex-col gap-2">
                <label className="rh-micro">Fichiers & Excel</label>
                <div
                  className="rounded-xl border border-dashed px-3 py-4"
                  style={{
                    borderColor: "var(--rh-border-strong)",
                    background: "var(--rh-surface)",
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files?.length) {
                      addPendingFiles(e.dataTransfer.files);
                    }
                  }}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <div className="text-[13px] font-medium">
                        Pièces jointes
                      </div>
                      <div
                        className="text-[11px] mt-0.5"
                        style={{ color: "var(--rh-text-muted)" }}
                      >
                        Excel, PDF, Word, CSV, images… · glisser-déposer · max
                        25 Mo
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        className="rh-btn-secondary inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 cursor-pointer border-0"
                        style={{
                          background: form.wantBlankExcel
                            ? "var(--rh-chip)"
                            : undefined,
                          color: form.wantBlankExcel
                            ? "var(--rh-accent)"
                            : undefined,
                        }}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            wantBlankExcel: !f.wantBlankExcel,
                          }))
                        }
                      >
                        <FileSpreadsheet size={12} />
                        {form.wantBlankExcel
                          ? "Excel vierge · oui"
                          : "Excel vierge"}
                      </button>
                      <label className="rh-btn-secondary cursor-pointer inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1.5">
                        <Paperclip size={12} /> Ajouter
                        <input
                          type="file"
                          className="hidden"
                          multiple
                          accept={ACCEPT_FILES}
                          onChange={(e) => {
                            if (e.target.files) addPendingFiles(e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  {form.wantBlankExcel ? (
                    <p
                      className="text-[11px] mt-2"
                      style={{ color: "var(--rh-accent)" }}
                    >
                      Un classeur Excel sera créé et ouvert à la création.
                    </p>
                  ) : null}
                  {pendingFiles.length > 0 ? (
                    <ul className="mt-3 flex flex-col gap-1.5">
                      {pendingFiles.map((f, i) => (
                        <li
                          key={`${f.name}-${f.size}-${i}`}
                          className="flex items-center gap-2 text-[12px] rounded-lg px-2.5 py-1.5"
                          style={{ background: "var(--rh-bg-panel)" }}
                        >
                          {isOfficeFileName(f.name) ? (
                            <FileSpreadsheet
                              size={12}
                              style={{ color: "var(--rh-accent)" }}
                            />
                          ) : (
                            <Paperclip
                              size={12}
                              style={{ color: "var(--rh-accent)" }}
                            />
                          )}
                          <span className="flex-1 truncate">{f.name}</span>
                          <span
                            className="rh-mono text-[10px] shrink-0"
                            style={{ color: "var(--rh-text-dim)" }}
                          >
                            {(f.size / 1024).toFixed(0)} Ko
                          </span>
                          <button
                            type="button"
                            className="border-0 bg-transparent cursor-pointer p-0.5"
                            style={{ color: "var(--rh-text-muted)" }}
                            onClick={() =>
                              setPendingFiles((prev) =>
                                prev.filter((_, idx) => idx !== i)
                              )
                            }
                          >
                            <X size={12} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <label
                  className="flex items-center gap-2 text-[12px] cursor-pointer"
                  style={{ color: "var(--rh-text-muted)" }}
                >
                  <input
                    type="checkbox"
                    checked={form.openAfterCreate}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        openAfterCreate: e.target.checked,
                      }))
                    }
                  />
                  Ouvrir l’Excel dans l’éditeur après création
                </label>
              </section>
            </div>

            <div
              className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t"
              style={{ background: "var(--rh-bg-panel)", borderColor: "var(--rh-border)" }}
            >
              <span
                className="rh-mono text-[10px]"
                style={{ color: "var(--rh-text-dim)" }}
              >
                ⌘↵ créer
                {selectedAssignees.length
                  ? ` · → ${selectedAssignees.map((a) => a.name.split(" ")[0]).join(", ")}`
                  : ""}
                {pendingFiles.length
                  ? ` · ${pendingFiles.length} PJ`
                  : ""}
                {form.wantBlankExcel ? " · Excel" : ""}
              </span>
              <div className="flex gap-2">
                <RhButton
                  variant="secondary"
                  onClick={() => {
                    setCreating(false);
                    setPendingFiles([]);
                    setAssigneeQuery("");
                  }}
                >
                  Annuler
                </RhButton>
                <RhButton disabled={busy} onClick={() => void createTask()}>
                  {busy ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Plus size={14} />
                  )}
                  Créer la tâche
                </RhButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({
  onCreate,
  manage,
  compact,
}: {
  onCreate: () => void;
  manage?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`text-center ${compact ? "px-5 py-12" : "py-16 px-6 rounded-2xl border"}`}
      style={{
        borderColor: "var(--rh-border-subtle)",
        background: compact ? undefined : "var(--rh-surface)",
        color: "var(--rh-text-muted)",
      }}
    >
      <div className="text-[14px] font-medium" style={{ color: "var(--rh-text)" }}>
        {manage ? "Aucune tâche pour ces filtres" : "Rien à faire ici"}
      </div>
      <p className="text-[12.5px] mt-1 mb-4">
        {manage
          ? "Assigne la première — ton équipe la verra dans son espace RH."
          : "Quand on t’en confie, elles apparaissent ici."}
      </p>
      {manage ? (
        <RhButton onClick={onCreate}>
          <Plus size={14} /> Créer une tâche
        </RhButton>
      ) : null}
    </div>
  );
}

function TaskCard({
  task,
  active,
  showAssignee,
  draggable,
  onClick,
}: {
  task: RhTaskDto;
  active: boolean;
  showAssignee: boolean;
  draggable?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task-id", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onClick}
      className="text-left rounded-xl p-3 border transition-colors cursor-grab active:cursor-grabbing"
      style={{
        background: active ? "var(--rh-surface-selected)" : "var(--rh-bg-panel)",
        borderColor: active
          ? "var(--rh-accent)"
          : task.overdue
            ? "rgba(242,96,78,.35)"
            : "var(--rh-border-subtle)",
        boxShadow: task.priority === "URGENT" ? "inset 3px 0 0 #F2604E" : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-[13px] font-medium leading-snug">{task.title}</span>
        <RhBadge
          bg={PRIORITY_META[task.priority].bg}
          fg={PRIORITY_META[task.priority].fg}
        >
          {PRIORITY_META[task.priority].label.slice(0, 1)}
        </RhBadge>
      </div>
      {task.talent ? (
        <div
          className="inline-flex items-center gap-1.5 mb-2 rounded-full pl-1 pr-2 py-0.5"
          style={{ background: "rgba(124,58,237,.08)" }}
        >
          <RhAvatar
            initials={task.talent.initials}
            color="#7C3AED"
            src={task.talent.photo}
            size={16}
          />
          <span className="text-[10px]" style={{ color: "#6D28D9" }}>
            {task.talent.name}
          </span>
        </div>
      ) : null}
      {showAssignee ? (
        <div className="flex items-center gap-1.5 mb-2">
          <div className="flex -space-x-1.5">
            {taskAssignees(task).slice(0, 3).map((p) => (
              <RhAvatar
                key={p.id}
                initials={p.initials}
                color={p.avatarColor}
                src={p.avatarUrl}
                size={18}
              />
            ))}
          </div>
          <span
            className="text-[11px] truncate"
            style={{ color: "var(--rh-text-muted)" }}
          >
            {taskAssignees(task).length === 1
              ? taskAssignees(task)[0]!.name
              : `${taskAssignees(task).length} personnes`}
          </span>
        </div>
      ) : null}
      <div
        className="flex items-center justify-between text-[10px]"
        style={{ color: "var(--rh-text-dim)" }}
      >
        <span style={{ color: dueTone(task), fontWeight: task.overdue ? 600 : 400 }}>
          {formatDueRelative(task.dueAt, {
            overdue: task.overdue,
            done: task.status === "DONE" || task.status === "CANCELLED",
          })}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-0.5">
            <MessageSquare size={10} /> {task.counts.comments}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Paperclip size={10} /> {task.counts.attachments}
          </span>
        </span>
      </div>
    </button>
  );
}

function DetailDrawer({
  selected,
  mode,
  meId,
  employees,
  busy,
  editTitle,
  editDesc,
  setEditTitle,
  setEditDesc,
  talentQuery,
  setTalentQuery,
  talentResults,
  talentSearching,
  onClose,
  onPatch,
  onComment,
  onUpload,
  acceptFiles,
  onRemoveAtt,
  onRemove,
  onOpenOffice,
  onCreateExcel,
}: {
  selected: RhTaskDto;
  mode: "manage" | "mine";
  meId: string;
  employees: EmpOpt[];
  busy: boolean;
  editTitle: string;
  editDesc: string;
  setEditTitle: (v: string) => void;
  setEditDesc: (v: string) => void;
  talentQuery: string;
  setTalentQuery: (v: string) => void;
  talentResults: TalentOpt[];
  talentSearching: boolean;
  onClose: () => void;
  onPatch: (body: Record<string, unknown>) => Promise<RhTaskDto | null>;
  onComment: (body: string, mentionedIds: string[]) => void;
  onUpload: (files: FileList | File[]) => void;
  acceptFiles: string;
  onRemoveAtt: (id: string) => void;
  onRemove: () => void;
  onOpenOffice: (att: RhTaskDto["attachments"][number]) => void;
  onCreateExcel: () => void;
}) {
  const canManage = mode === "manage" || selected.creator.id === meId;
  const [dropHot, setDropHot] = useState(false);
  const people = taskAssignees(selected);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(0,0,0,.55)" }}
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-[480px] overflow-y-auto border-l flex flex-col rh-rise"
        style={{ background: "var(--rh-bg-panel)", borderColor: "var(--rh-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 border-b"
          style={{ background: "var(--rh-bg-panel)", borderColor: "var(--rh-border)" }}
        >
          <div className="min-w-0 flex-1">
            {canManage && mode === "manage" ? (
              <input
                className="rh-input w-full !text-[16px] !font-semibold"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={() => {
                  if (editTitle.trim() && editTitle !== selected.title) {
                    void onPatch({ title: editTitle });
                  }
                }}
              />
            ) : (
              <h2 className="text-[16px] font-semibold leading-snug">
                {selected.title}
              </h2>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <RhBadge
                bg={STATUS_META[selected.status].bg}
                fg={STATUS_META[selected.status].fg}
              >
                {STATUS_META[selected.status].label}
              </RhBadge>
              <RhBadge
                bg={PRIORITY_META[selected.priority].bg}
                fg={PRIORITY_META[selected.priority].fg}
              >
                {PRIORITY_META[selected.priority].label}
              </RhBadge>
              <span className="text-[11px]" style={{ color: dueTone(selected) }}>
                {formatDueRelative(selected.dueAt, {
                  overdue: selected.overdue,
                  done:
                    selected.status === "DONE" ||
                    selected.status === "CANCELLED",
                })}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="p-2 border-0 bg-transparent cursor-pointer"
            style={{ color: "var(--rh-text-muted)" }}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-5 flex-1">
          <section className="flex flex-col gap-3">
            <div>
              <div className="rh-micro mb-1.5">
                Assignés · {people.length}
              </div>
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
                  initials={selected.creator.initials}
                  color={selected.creator.avatarColor}
                  src={selected.creator.avatarUrl}
                  size={24}
                />
                <span className="text-[13px]">{selected.creator.name}</span>
              </div>
            </div>
            <div>
              <div className="rh-micro mb-1.5">
                Talent concerné{" "}
                <span style={{ color: "var(--rh-text-dim)" }}>· interne</span>
              </div>
              {canManage ? (
                <TalentLinkPicker
                  selected={selected.talent}
                  query={talentQuery}
                  onQuery={setTalentQuery}
                  results={talentResults}
                  searching={talentSearching}
                  onSelect={(t) => {
                    void onPatch({ talentId: t.id });
                    setTalentQuery("");
                  }}
                  onClear={() => void onPatch({ talentId: null })}
                />
              ) : selected.talent ? (
                <a
                  href={`/talents/${selected.talent.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 no-underline"
                  style={{ color: "inherit" }}
                >
                  <RhAvatar
                    initials={selected.talent.initials}
                    color="#7C3AED"
                    src={selected.talent.photo}
                    size={24}
                  />
                  <span className="text-[13px]">{selected.talent.name}</span>
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
                  disabled={busy || selected.status === s}
                  onClick={() => void onPatch({ status: s })}
                  className="rh-badge cursor-pointer border-0 disabled:opacity-40"
                  style={{
                    background: STATUS_META[s].bg,
                    color: STATUS_META[s].fg,
                    outline:
                      selected.status === s
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
                  value={selected.priority}
                  disabled={busy}
                  onChange={(e) => void onPatch({ priority: e.target.value })}
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
                  value={selected.dueAt ? selected.dueAt.slice(0, 10) : ""}
                  disabled={busy}
                  onChange={(e) =>
                    void onPatch({ dueAt: e.target.value || null })
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
                    onClick={() => void onPatch({ dueAt: p.value })}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="col-span-2">
                <div className="rh-micro mb-1.5">Assignés (multi)</div>
                <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto">
                  {employees.map((e) => {
                    const on = people.some((p) => p.id === e.id);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const next = on
                            ? people.filter((p) => p.id !== e.id).map((p) => p.id)
                            : [...people.map((p) => p.id), e.id];
                          if (!next.length) {
                            toast.error("Au moins un assigné");
                            return;
                          }
                          void onPatch({ assigneeIds: next });
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-1 border cursor-pointer"
                        style={{
                          background: on ? "var(--rh-chip)" : "var(--rh-surface)",
                          borderColor: on ? "var(--rh-accent)" : "transparent",
                          color: on ? "var(--rh-accent)" : "var(--rh-text-muted)",
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
                className="rh-input w-full min-h-[100px]"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                onBlur={() => {
                  if (editDesc !== (selected.description || "")) {
                    void onPatch({ description: editDesc || null });
                  }
                }}
                placeholder="Contexte, livrables…"
              />
            ) : (
              <p
                className="text-[13px] whitespace-pre-wrap leading-relaxed"
                style={{ color: "var(--rh-text-body)" }}
              >
                {selected.description || "Pas de description."}
              </p>
            )}
          </section>

          {selected.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {selected.tags.map((tag) => (
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
                    onClick={onCreateExcel}
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
                      accept={acceptFiles}
                      disabled={busy}
                      onChange={(e) => {
                        if (e.target.files?.length) onUpload(e.target.files);
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
                if (e.dataTransfer.files?.length) onUpload(e.dataTransfer.files);
              }}
            >
              <div className="text-[12px]">
                Glisse Excel, PDF, Word, CSV… ici
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: "var(--rh-text-dim)" }}>
                Max 25 Mo · Excel éditable dans le navigateur
              </div>
            </div>
            {selected.attachments.length === 0 ? (
              <p
                className="text-[12px] mt-2"
                style={{ color: "var(--rh-text-muted)" }}
              >
                Aucune pour l’instant.
              </p>
            ) : (
              <ul className="flex flex-col gap-2 mt-2">
                {selected.attachments.map((a) => (
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
                        onClick={() => onOpenOffice(a)}
                      >
                        Ouvrir
                      </RhButton>
                    ) : null}
                    <button
                      type="button"
                      className="border-0 bg-transparent cursor-pointer"
                      style={{ color: "var(--rh-text-muted)" }}
                      onClick={() => onRemoveAtt(a.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <RhCardHead title="Commentaires" />
            <div className="flex flex-col gap-3 mt-2">
              {selected.comments.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg px-3 py-2"
                  style={{ background: "var(--rh-surface)" }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <RhAvatar
                      initials={c.author.initials}
                      color={c.author.avatarColor}
                      src={c.author.avatarUrl}
                      size={20}
                    />
                    <span className="text-[12px] font-medium">
                      {c.author.name}
                    </span>
                    <span
                      className="text-[10px]"
                      style={{ color: "var(--rh-text-dim)" }}
                    >
                      {formatWhen(c.createdAt)}
                    </span>
                  </div>
                  <p
                    className="text-[13px] whitespace-pre-wrap"
                    style={{ color: "var(--rh-text-body)" }}
                  >
                    {renderCommentBody(c.body).map((part, i) =>
                      part.type === "mention" ? (
                        <span
                          key={i}
                          className="inline-flex rounded px-1 mx-0.5 text-[12px] font-medium"
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
              ))}
              <CommentComposer
                employees={employees}
                busy={busy}
                onSend={onComment}
              />
            </div>
          </section>

          <section>
            <RhCardHead title="Historique" />
            <ul className="mt-2 flex flex-col gap-1.5">
              {selected.events.map((ev) => (
                <li
                  key={ev.id}
                  className="text-[11px] flex gap-2"
                  style={{ color: "var(--rh-text-muted)" }}
                >
                  <span className="tabular-nums shrink-0">
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
          </section>
        </div>

        <div
          className="sticky bottom-0 flex flex-wrap gap-2 px-5 py-3 border-t"
          style={{ background: "var(--rh-bg-panel)", borderColor: "var(--rh-border)" }}
        >
          {selected.status !== "DONE" ? (
            <RhButton
              disabled={busy}
              onClick={() => void onPatch({ status: "DONE" })}
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
                  void onPatch({ archived: !selected.archivedAt })
                }
              >
                <Archive size={14} />
                {selected.archivedAt ? "Désarchiver" : "Archiver"}
              </RhButton>
              <RhButton variant="danger" disabled={busy} onClick={onRemove}>
                <Trash2 size={14} /> Supprimer
              </RhButton>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Sélecteur talent — lien interne RH, aucune notif au talent. */
function TalentLinkPicker({
  selected,
  query,
  onQuery,
  results,
  searching,
  onSelect,
  onClear,
}: {
  selected: TalentOpt | null;
  query: string;
  onQuery: (v: string) => void;
  results: TalentOpt[];
  searching: boolean;
  onSelect: (t: TalentOpt) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {selected ? (
        <div
          className="flex items-center gap-2 rounded-xl px-2.5 py-2 border"
          style={{
            background: "rgba(124,58,237,.08)",
            borderColor: "rgba(124,58,237,.2)",
          }}
        >
          <RhAvatar
            initials={selected.initials}
            color="#7C3AED"
            src={selected.photo}
            size={28}
          />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium truncate">
              {selected.name}
            </div>
            {selected.instagram ? (
              <div
                className="text-[10px] truncate"
                style={{ color: "var(--rh-text-dim)" }}
              >
                @{selected.instagram.replace(/^@/, "")}
              </div>
            ) : null}
          </div>
          <a
            href={`/talents/${selected.id}`}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] no-underline"
            style={{ color: "var(--rh-accent)" }}
            onClick={(e) => e.stopPropagation()}
          >
            Fiche
          </a>
          <button
            type="button"
            className="p-1 border-0 bg-transparent cursor-pointer"
            style={{ color: "var(--rh-text-muted)" }}
            onClick={onClear}
            title="Retirer"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--rh-text-dim)" }}
            />
            <input
              className="rh-input w-full !pl-9"
              placeholder="Rechercher un talent (nom, IG)…"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
            />
          </div>
          {(query.trim() || results.length > 0) && (
            <div
              className="max-h-[160px] overflow-y-auto rounded-xl border p-1"
              style={{
                background: "var(--rh-bg-panel)",
                borderColor: "var(--rh-border-subtle)",
              }}
            >
              {searching ? (
                <div
                  className="text-center text-[12px] py-3"
                  style={{ color: "var(--rh-text-dim)" }}
                >
                  Recherche…
                </div>
              ) : results.length === 0 ? (
                <div
                  className="text-center text-[12px] py-3"
                  style={{ color: "var(--rh-text-dim)" }}
                >
                  Aucun talent
                </div>
              ) : (
                results.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelect(t)}
                    className="flex w-full items-center gap-2 text-left rounded-lg px-2 py-1.5 border-0 cursor-pointer"
                    style={{
                      background: "transparent",
                      color: "inherit",
                    }}
                  >
                    <RhAvatar
                      initials={t.initials}
                      color="#7C3AED"
                      src={t.photo}
                      size={24}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium truncate">
                        {t.name}
                      </div>
                      {t.instagram ? (
                        <div
                          className="text-[10px] truncate"
                          style={{ color: "var(--rh-text-dim)" }}
                        >
                          @{t.instagram.replace(/^@/, "")}
                        </div>
                      ) : null}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
