export type TaskStatus =
  | "TODO"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "DONE"
  | "CANCELLED";

export type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type TaskPerson = {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  avatarUrl?: string | null;
  jobTitle: string;
  department: string;
  email?: string;
};

export type TaskTalent = {
  id: string;
  name: string;
  initials: string;
  photo: string | null;
  instagram: string | null;
};

export type RhTaskDto = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  tags: string[];
  sortOrder: number;
  overdue: boolean;
  assignee: TaskPerson;
  assignees: TaskPerson[];
  creator: TaskPerson;
  /** Lien interne — le talent n’est jamais notifié */
  talent: TaskTalent | null;
  comments: Array<{
    id: string;
    body: string;
    mentionedIds?: string[];
    createdAt: string;
    updatedAt: string;
    author: TaskPerson;
  }>;
  attachments: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    mimeType: string | null;
    sizeBytes: number | null;
    createdAt: string;
    uploader: TaskPerson;
  }>;
  events: Array<{
    id: string;
    kind: string;
    detail: unknown;
    createdAt: string;
    actor: TaskPerson | null;
  }>;
  counts: { comments: number; attachments: number };
  createdAt: string;
  updatedAt: string;
};

export const STATUS_META: Record<
  TaskStatus,
  { label: string; bg: string; fg: string }
> = {
  TODO: { label: "À faire", bg: "#EEF0F3", fg: "#4B5563" },
  IN_PROGRESS: { label: "En cours", bg: "#E8EEFB", fg: "#3B5BDB" },
  BLOCKED: { label: "Bloquée", bg: "#FDEEE6", fg: "#C2410C" },
  DONE: { label: "Terminée", bg: "#E8F6EC", fg: "#15803D" },
  CANCELLED: { label: "Annulée", bg: "#F3F4F6", fg: "#6B7280" },
};

export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; bg: string; fg: string }
> = {
  LOW: { label: "Basse", bg: "#F3F4F6", fg: "#6B7280" },
  NORMAL: { label: "Normale", bg: "#E8EEFB", fg: "#3B5BDB" },
  HIGH: { label: "Haute", bg: "#FEF3C7", fg: "#B45309" },
  URGENT: { label: "Urgente", bg: "#FEE2E2", fg: "#B91C1C" },
};

export const STATUS_COLUMNS: TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
];

export const EVENT_LABEL: Record<string, string> = {
  CREATED: "Créée",
  STATUS: "Statut",
  PRIORITY: "Priorité",
  DUE: "Échéance",
  REASSIGN: "Réassignée",
  TITLE: "Titre",
  COMMENT: "Commentaire",
  ATTACHMENT: "Pièce jointe",
  ATTACHMENT_REMOVED: "PJ retirée",
  ATTACHMENT_EDITED: "Excel / Office édité",
  TALENT: "Talent",
  ARCHIVED: "Archivée",
  UNARCHIVED: "Désarchivée",
};

export function isOfficeFileName(fileName: string): boolean {
  return /\.(xlsx?|csv|docx?|pptx?)$/i.test(fileName || "");
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function formatDue(iso: string | null): string {
  if (!iso) return "Sans échéance";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Libellé relatif pour le hub (Aujourd’hui, Demain, En retard · 2 j…). */
export function formatDueRelative(
  iso: string | null,
  opts?: { overdue?: boolean; done?: boolean }
): string {
  if (!iso) return "Sans échéance";
  if (opts?.done) return formatDue(iso);
  const due = startOfDay(new Date(iso));
  const today = startOfDay(new Date());
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) {
    const n = Math.abs(diff);
    return n === 1 ? "En retard · 1 j" : `En retard · ${n} j`;
  }
  if (diff === 0) return "Aujourd’hui";
  if (diff === 1) return "Demain";
  if (diff <= 7) return `Dans ${diff} j`;
  return formatDue(iso);
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dueTone(task: RhTaskDto): string {
  if (task.status === "DONE" || task.status === "CANCELLED") return "#8B95A5";
  if (task.overdue) return "#F2604E";
  if (!task.dueAt) return "#8B95A5";
  const days =
    (new Date(task.dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (days <= 2) return "#F0C24E";
  return "#A8C0E0";
}

export function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** URL page détail tâche — Hub ADMIN uniquement. */
export function taskDetailPath(taskId: string): string {
  return `/hub/tasks/${taskId}`;
}

export function duePresets(): Array<{ label: string; value: string }> {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const friday = new Date(today);
  const dow = today.getDay(); // 0 dim
  const toFri = dow === 0 ? 5 : dow <= 5 ? 5 - dow : 5 + 7 - dow;
  friday.setDate(today.getDate() + toFri);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  return [
    { label: "Aujourd’hui", value: isoDateLocal(today) },
    { label: "Demain", value: isoDateLocal(tomorrow) },
    { label: "Vendredi", value: isoDateLocal(friday) },
    { label: "+1 sem.", value: isoDateLocal(nextWeek) },
  ];
}
