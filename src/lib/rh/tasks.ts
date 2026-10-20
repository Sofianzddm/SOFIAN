import type {
  Prisma,
  RhTaskPriority,
  RhTaskStatus,
} from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  displayName,
  initials,
  type RhEmployeeSession,
} from "@/lib/rh/auth";
import {
  notifyRhTaskAssigned,
  notifyRhTaskComment,
  notifyRhTaskStatusChanged,
} from "@/lib/rh/notify";

/** Hub tâches : ADMIN plateforme uniquement. */
function isPatronHubUser(viewer: RhEmployeeSession): boolean {
  return viewer.appRole === "ADMIN";
}

const personSelect = {
  id: true,
  avatarColor: true,
  avatarUrl: true,
  jobTitle: true,
  department: true,
  user: { select: { prenom: true, nom: true, email: true } },
} as const;

const talentSelect = {
  id: true,
  prenom: true,
  nom: true,
  photo: true,
  instagram: true,
} as const;

const taskInclude = {
  assignee: { select: personSelect },
  assignees: {
    include: { employee: { select: personSelect } },
    orderBy: { createdAt: "asc" as const },
  },
  creator: { select: personSelect },
  talent: { select: talentSelect },
  comments: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: personSelect } },
  },
  attachments: {
    orderBy: { createdAt: "desc" as const },
    include: { uploader: { select: personSelect } },
  },
  events: {
    orderBy: { createdAt: "desc" as const },
    take: 40,
    include: { actor: { select: personSelect } },
  },
  _count: { select: { comments: true, attachments: true } },
} as const;

function mapTalent(
  row: {
    id: string;
    prenom: string;
    nom: string;
    photo: string | null;
    instagram: string | null;
  } | null
) {
  if (!row) return null;
  const name = `${row.prenom} ${row.nom}`.trim();
  const initials = `${row.prenom?.[0] || ""}${row.nom?.[0] || ""}`
    .toUpperCase()
    .slice(0, 2);
  return {
    id: row.id,
    name,
    initials: initials || "?",
    photo: row.photo,
    instagram: row.instagram,
  };
}

async function resolveTalentId(
  talentId: string | null | undefined
): Promise<string | null | undefined> {
  if (talentId === undefined) return undefined;
  if (talentId === null || talentId === "") return null;
  const t = await prisma.talent.findFirst({
    where: { id: talentId, isArchived: false },
    select: { id: true },
  });
  if (!t) throw new Error("Talent introuvable");
  return t.id;
}

/** Mentions stockées : @[Prénom Nom](employeeId) */
export const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

export function parseMentionIds(body: string): string[] {
  const ids: string[] = [];
  const re = new RegExp(MENTION_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[2] && !ids.includes(m[2])) ids.push(m[2]);
  }
  return ids.slice(0, 20);
}

async function syncTaskAssignees(taskId: string, employeeIds: string[]) {
  const unique = [...new Set(employeeIds.filter(Boolean))];
  if (!unique.length) throw new Error("Au moins un assigné requis");
  await prisma.rhTaskAssignee.deleteMany({
    where: { taskId, employeeId: { notIn: unique } },
  });
  const existing = await prisma.rhTaskAssignee.findMany({
    where: { taskId },
    select: { employeeId: true },
  });
  const have = new Set(existing.map((e) => e.employeeId));
  const toAdd = unique.filter((id) => !have.has(id));
  if (toAdd.length) {
    await prisma.rhTaskAssignee.createMany({
      data: toAdd.map((employeeId) => ({ taskId, employeeId })),
      skipDuplicates: true,
    });
  }
  return unique;
}

export type RhTaskListFilters = {
  assigneeId?: string;
  creatorId?: string;
  status?: RhTaskStatus | RhTaskStatus[];
  priority?: RhTaskPriority | RhTaskPriority[];
  q?: string;
  includeArchived?: boolean;
  overdueOnly?: boolean;
  dueBefore?: Date;
  mineOnly?: boolean;
};

function mapPerson(row: {
  id: string;
  avatarColor: string;
  avatarUrl: string | null;
  jobTitle: string;
  department: string;
  user: { prenom: string; nom: string; email: string };
}) {
  return {
    id: row.id,
    name: displayName(row.user),
    initials: initials(row.user),
    avatarColor: row.avatarColor,
    avatarUrl: row.avatarUrl,
    jobTitle: row.jobTitle,
    department: row.department,
    email: row.user.email,
  };
}

export function serializeTask(
  task: Prisma.RhTaskGetPayload<{ include: typeof taskInclude }>
) {
  const now = Date.now();
  const dueMs = task.dueAt?.getTime() ?? null;
  const overdue =
    !!dueMs &&
    dueMs < now &&
    task.status !== "DONE" &&
    task.status !== "CANCELLED";

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt?.toISOString() ?? null,
    startedAt: task.startedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    archivedAt: task.archivedAt?.toISOString() ?? null,
    tags: task.tags,
    sortOrder: task.sortOrder,
    overdue,
    assignee: mapPerson(task.assignee),
    assignees: (task.assignees?.length
      ? task.assignees.map((a) => mapPerson(a.employee))
      : [mapPerson(task.assignee)]
    ),
    creator: mapPerson(task.creator),
    talent: mapTalent(task.talent),
    comments: task.comments.map((c) => ({
      id: c.id,
      body: c.body,
      mentionedIds: (c as { mentionedIds?: string[] }).mentionedIds || [],
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      author: mapPerson(c.author),
    })),
    attachments: task.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      fileUrl: a.fileUrl,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      createdAt: a.createdAt.toISOString(),
      uploader: mapPerson(a.uploader),
    })),
    events: task.events.map((e) => ({
      id: e.id,
      kind: e.kind,
      detail: e.detail,
      createdAt: e.createdAt.toISOString(),
      actor: e.actor ? mapPerson(e.actor) : null,
    })),
    counts: {
      comments: task._count.comments,
      attachments: task._count.attachments,
    },
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export type SerializedRhTask = ReturnType<typeof serializeTask>;

/** Accès lecture : assigné (principal ou multi), créateur, ou Sofian. */
export async function canAccessRhTask(
  viewer: RhEmployeeSession,
  task: { id?: string; assigneeId: string; creatorId: string }
): Promise<boolean> {
  if (viewer.id === task.assigneeId || viewer.id === task.creatorId) return true;
  if (isPatronHubUser(viewer)) return true;
  if (task.id) {
    const row = await prisma.rhTaskAssignee.findFirst({
      where: { taskId: task.id, employeeId: viewer.id },
      select: { id: true },
    });
    if (row) return true;
  }
  return false;
}

async function isTaskAssignee(
  taskId: string,
  employeeId: string,
  primaryAssigneeId: string
): Promise<boolean> {
  if (employeeId === primaryAssigneeId) return true;
  const row = await prisma.rhTaskAssignee.findFirst({
    where: { taskId, employeeId },
    select: { id: true },
  });
  return Boolean(row);
}

/** Création / assignation à autrui : Sofian uniquement (hub caché). */
export async function canAssignRhTask(
  viewer: RhEmployeeSession,
  _assigneeId: string
): Promise<boolean> {
  return isPatronHubUser(viewer);
}

async function logEvent(
  taskId: string,
  actorId: string | null,
  kind: string,
  detail: Record<string, unknown> = {}
) {
  await prisma.rhTaskEvent.create({
    data: {
      taskId,
      actorId,
      kind,
      detail: detail as Prisma.InputJsonValue,
    },
  });
}

export async function listRhTasks(
  viewer: RhEmployeeSession,
  filters: RhTaskListFilters = {}
) {
  const where: Prisma.RhTaskWhereInput = {};

  if (!filters.includeArchived) {
    where.archivedAt = null;
  }

  // Hub patron (Sofian) : toute l’équipe. Sinon : mes tâches seulement.
  if (filters.mineOnly || !isPatronHubUser(viewer)) {
    where.OR = [
      { assigneeId: viewer.id },
      { creatorId: viewer.id },
      { assignees: { some: { employeeId: viewer.id } } },
    ];
  }

  if (filters.assigneeId) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { assigneeId: filters.assigneeId },
          { assignees: { some: { employeeId: filters.assigneeId } } },
        ],
      },
    ];
  }
  if (filters.creatorId) where.creatorId = filters.creatorId;

  if (filters.status) {
    where.status = Array.isArray(filters.status)
      ? { in: filters.status }
      : filters.status;
  }
  if (filters.priority) {
    where.priority = Array.isArray(filters.priority)
      ? { in: filters.priority }
      : filters.priority;
  }

  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { tags: { has: q } },
          { talent: { prenom: { contains: q, mode: "insensitive" } } },
          { talent: { nom: { contains: q, mode: "insensitive" } } },
          { talent: { instagram: { contains: q, mode: "insensitive" } } },
        ],
      },
    ];
  }

  if (filters.overdueOnly) {
    where.dueAt = { lt: new Date() };
    where.status = { notIn: ["DONE", "CANCELLED"] };
  } else if (filters.dueBefore) {
    where.dueAt = { lte: filters.dueBefore };
  }

  const rows = await prisma.rhTask.findMany({
    where,
    include: taskInclude,
    orderBy: [
      { priority: "desc" },
      { dueAt: "asc" },
      { sortOrder: "asc" },
      { createdAt: "desc" },
    ],
    take: 200,
  });

  return rows.map(serializeTask);
}

export async function getRhTask(viewer: RhEmployeeSession, taskId: string) {
  const task = await prisma.rhTask.findUnique({
    where: { id: taskId },
    include: taskInclude,
  });
  if (!task) return null;
  if (!(await canAccessRhTask(viewer, task))) return null;
  return serializeTask(task);
}

export async function createRhTask(
  viewer: RhEmployeeSession,
  input: {
    title: string;
    description?: string | null;
    assigneeId?: string;
    assigneeIds?: string[];
    talentId?: string | null;
    priority?: RhTaskPriority;
    dueAt?: string | null;
    tags?: string[];
  }
) {
  const title = input.title?.trim();
  if (!title) throw new Error("Titre obligatoire");

  const assigneeIds = [
    ...new Set(
      (input.assigneeIds?.length
        ? input.assigneeIds
        : input.assigneeId
          ? [input.assigneeId]
          : []
      ).filter(Boolean)
    ),
  ];
  if (!assigneeIds.length) throw new Error("Choisis au moins un assigné");

  for (const id of assigneeIds) {
    const selfAssign = id === viewer.id;
    if (!selfAssign && !(await canAssignRhTask(viewer, id))) {
      throw new Error("Tu ne peux pas assigner cette personne");
    }
  }

  const found = await prisma.rhEmployee.findMany({
    where: { id: { in: assigneeIds }, actif: true },
    select: { id: true },
  });
  if (found.length !== assigneeIds.length) {
    throw new Error("Collaborateur introuvable");
  }

  const primaryId = assigneeIds[0]!;
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) {
    throw new Error("Échéance invalide");
  }

  const tags = (input.tags || [])
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);

  const talentId = await resolveTalentId(input.talentId ?? null);

  const task = await prisma.rhTask.create({
    data: {
      title: title.slice(0, 200),
      description: input.description?.trim() || null,
      assigneeId: primaryId,
      creatorId: viewer.id,
      priority: input.priority || "NORMAL",
      dueAt,
      tags,
      talentId: talentId ?? null,
      assignees: {
        create: assigneeIds.map((employeeId) => ({ employeeId })),
      },
    },
    include: taskInclude,
  });

  await logEvent(task.id, viewer.id, "CREATED", {
    title: task.title,
    assigneeId: primaryId,
    assigneeIds,
    talentId: talentId ?? null,
    priority: task.priority,
    dueAt: task.dueAt?.toISOString() ?? null,
  });

  for (const id of assigneeIds) {
    if (id === viewer.id) continue;
    await notifyRhTaskAssigned({
      taskId: task.id,
      title: task.title,
      assigneeId: id,
      creatorId: viewer.id,
      dueAt: task.dueAt,
      priority: task.priority,
    });
  }

  return serializeTask(task);
}

export async function updateRhTask(
  viewer: RhEmployeeSession,
  taskId: string,
  input: {
    title?: string;
    description?: string | null;
    status?: RhTaskStatus;
    priority?: RhTaskPriority;
    dueAt?: string | null;
    assigneeId?: string;
    assigneeIds?: string[];
    talentId?: string | null;
    tags?: string[];
    archived?: boolean;
  }
) {
  const existing = await prisma.rhTask.findUnique({ where: { id: taskId } });
  if (!existing) throw new Error("Tâche introuvable");
  if (!(await canAccessRhTask(viewer, existing))) {
    throw new Error("Accès refusé");
  }

  const isManagerSide = await canAssignRhTask(viewer, existing.assigneeId);
  const isAssignee = await isTaskAssignee(
    taskId,
    viewer.id,
    existing.assigneeId
  );
  const data: Prisma.RhTaskUpdateInput = {};
  const events: Array<{ kind: string; detail: Record<string, unknown> }> = [];
  let nextAssigneeIds: string[] | null = null;

  // Salarié assigné : peut changer statut (+ description légère via commentaire plutôt)
  if (input.status && input.status !== existing.status) {
    if (!isAssignee && !isManagerSide) {
      throw new Error("Tu ne peux pas changer le statut");
    }
    data.status = input.status;
    if (input.status === "IN_PROGRESS" && !existing.startedAt) {
      data.startedAt = new Date();
    }
    if (input.status === "DONE") {
      data.completedAt = new Date();
    } else if (existing.status === "DONE") {
      data.completedAt = null;
    }
    events.push({
      kind: "STATUS",
      detail: { from: existing.status, to: input.status },
    });
  }

  // Champs manager/HR (ou créateur)
  const canEditMeta =
    isManagerSide ||
    viewer.id === existing.creatorId ||
    isPatronHubUser(viewer);

  if (canEditMeta) {
    if (input.title != null) {
      const t = input.title.trim();
      if (!t) throw new Error("Titre obligatoire");
      if (t !== existing.title) {
        data.title = t.slice(0, 200);
        events.push({
          kind: "TITLE",
          detail: { from: existing.title, to: data.title },
        });
      }
    }
    if (input.description !== undefined) {
      data.description = input.description?.trim() || null;
    }
    if (input.priority && input.priority !== existing.priority) {
      data.priority = input.priority;
      events.push({
        kind: "PRIORITY",
        detail: { from: existing.priority, to: input.priority },
      });
    }
    if (input.dueAt !== undefined) {
      const dueAt = input.dueAt ? new Date(input.dueAt) : null;
      if (dueAt && Number.isNaN(dueAt.getTime())) {
        throw new Error("Échéance invalide");
      }
      data.dueAt = dueAt;
      events.push({
        kind: "DUE",
        detail: {
          from: existing.dueAt?.toISOString() ?? null,
          to: dueAt?.toISOString() ?? null,
        },
      });
    }
    if (input.tags) {
      data.tags = input.tags
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 12);
    }
    if (input.assigneeIds || input.assigneeId) {
      const ids = [
        ...new Set(
          (input.assigneeIds?.length
            ? input.assigneeIds
            : input.assigneeId
              ? [input.assigneeId]
              : []
          ).filter(Boolean)
        ),
      ];
      if (!ids.length) throw new Error("Au moins un assigné requis");
      for (const id of ids) {
        if (!(await canAssignRhTask(viewer, id)) && id !== viewer.id) {
          throw new Error("Tu ne peux pas réassigner à cette personne");
        }
      }
      const primary = ids[0]!;
      data.assignee = { connect: { id: primary } };
      nextAssigneeIds = ids;
      events.push({
        kind: "REASSIGN",
        detail: { from: existing.assigneeId, to: primary, assigneeIds: ids },
      });
    }
    if (input.talentId !== undefined) {
      const nextTalent = await resolveTalentId(input.talentId);
      const prev = existing.talentId;
      if (nextTalent !== prev) {
        if (nextTalent) {
          data.talent = { connect: { id: nextTalent } };
        } else {
          data.talent = { disconnect: true };
        }
        events.push({
          kind: "TALENT",
          detail: { from: prev, to: nextTalent ?? null },
        });
      }
    }
    if (input.archived === true && !existing.archivedAt) {
      data.archivedAt = new Date();
      events.push({ kind: "ARCHIVED", detail: {} });
    }
    if (input.archived === false && existing.archivedAt) {
      data.archivedAt = null;
      events.push({ kind: "UNARCHIVED", detail: {} });
    }
  } else if (
    input.title != null ||
    input.description !== undefined ||
    input.priority ||
    input.dueAt !== undefined ||
    input.tags ||
    input.assigneeId ||
    input.assigneeIds ||
    input.talentId !== undefined ||
    input.archived != null
  ) {
    throw new Error("Seuls le créateur / manager / RH peuvent modifier ces champs");
  }

  const previousAssigneeIds = nextAssigneeIds
    ? (
        await prisma.rhTaskAssignee.findMany({
          where: { taskId },
          select: { employeeId: true },
        })
      ).map((a) => a.employeeId)
    : [];

  if (nextAssigneeIds) {
    await syncTaskAssignees(taskId, nextAssigneeIds);
  }

  const task = await prisma.rhTask.update({
    where: { id: taskId },
    data,
    include: taskInclude,
  });

  for (const ev of events) {
    await logEvent(taskId, viewer.id, ev.kind, ev.detail);
  }

  if (input.status && input.status !== existing.status) {
    const allAssigneeIds = (
      await prisma.rhTaskAssignee.findMany({
        where: { taskId },
        select: { employeeId: true },
      })
    ).map((a) => a.employeeId);
    void notifyRhTaskStatusChanged({
      taskId,
      title: task.title,
      assigneeId: task.assigneeId,
      assigneeIds: allAssigneeIds,
      creatorId: task.creatorId,
      actorId: viewer.id,
      from: existing.status,
      to: input.status,
    });
  }

  if (nextAssigneeIds) {
    const prevSet = new Set(previousAssigneeIds);
    for (const id of nextAssigneeIds) {
      if (id === viewer.id || prevSet.has(id)) continue;
      await notifyRhTaskAssigned({
        taskId,
        title: task.title,
        assigneeId: id,
        creatorId: viewer.id,
        dueAt: task.dueAt,
        priority: task.priority,
        reassigned: true,
      });
    }
  }

  return serializeTask(task);
}

export async function deleteRhTask(viewer: RhEmployeeSession, taskId: string) {
  const existing = await prisma.rhTask.findUnique({ where: { id: taskId } });
  if (!existing) throw new Error("Tâche introuvable");
  const can =
    isPatronHubUser(viewer) ||
    viewer.id === existing.creatorId ||
    (await canAssignRhTask(viewer, existing.assigneeId));
  if (!can) throw new Error("Accès refusé");
  await prisma.rhTask.delete({ where: { id: taskId } });
  return { ok: true };
}

export async function addRhTaskComment(
  viewer: RhEmployeeSession,
  taskId: string,
  body: string,
  explicitMentionIds?: string[]
) {
  const text = body?.trim();
  if (!text) throw new Error("Commentaire vide");
  const existing = await prisma.rhTask.findUnique({ where: { id: taskId } });
  if (!existing) throw new Error("Tâche introuvable");
  if (!(await canAccessRhTask(viewer, existing))) {
    throw new Error("Accès refusé");
  }

  const fromBody = parseMentionIds(text);
  const mentionedIds = [
    ...new Set([...(explicitMentionIds || []), ...fromBody]),
  ].filter((id) => id !== viewer.id);

  await prisma.rhTaskComment.create({
    data: {
      taskId,
      authorId: viewer.id,
      body: text.slice(0, 5000),
      mentionedIds,
    },
  });
  await logEvent(taskId, viewer.id, "COMMENT", {
    preview: text.slice(0, 120),
    mentionedIds,
  });

  const assigneeIds = (
    await prisma.rhTaskAssignee.findMany({
      where: { taskId },
      select: { employeeId: true },
    })
  ).map((a) => a.employeeId);

  void notifyRhTaskComment({
    taskId,
    title: existing.title,
    assigneeId: existing.assigneeId,
    assigneeIds,
    creatorId: existing.creatorId,
    authorId: viewer.id,
    preview: text.slice(0, 160),
  });

  if (mentionedIds.length) {
    const { notifyRhTaskMention } = await import("@/lib/rh/notify");
    void notifyRhTaskMention({
      taskId,
      title: existing.title,
      authorId: viewer.id,
      mentionedIds,
      preview: text.slice(0, 160),
    });
  }

  return getRhTask(viewer, taskId);
}

export async function addRhTaskAttachment(
  viewer: RhEmployeeSession,
  taskId: string,
  file: {
    fileName: string;
    fileUrl: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
  }
) {
  const existing = await prisma.rhTask.findUnique({ where: { id: taskId } });
  if (!existing) throw new Error("Tâche introuvable");
  if (!(await canAccessRhTask(viewer, existing))) {
    throw new Error("Accès refusé");
  }
  if (!file.fileUrl?.trim() || !file.fileName?.trim()) {
    throw new Error("Fichier invalide");
  }

  await prisma.rhTaskAttachment.create({
    data: {
      taskId,
      uploaderId: viewer.id,
      fileName: file.fileName.slice(0, 240),
      fileUrl: file.fileUrl,
      mimeType: file.mimeType || null,
      sizeBytes: file.sizeBytes ?? null,
    },
  });
  await logEvent(taskId, viewer.id, "ATTACHMENT", {
    fileName: file.fileName,
  });

  return getRhTask(viewer, taskId);
}

export async function deleteRhTaskAttachment(
  viewer: RhEmployeeSession,
  taskId: string,
  attachmentId: string
) {
  const att = await prisma.rhTaskAttachment.findFirst({
    where: { id: attachmentId, taskId },
    include: { task: true },
  });
  if (!att) throw new Error("Pièce jointe introuvable");
  const can =
    viewer.id === att.uploaderId ||
    viewer.id === att.task.creatorId ||
    isPatronHubUser(viewer) ||
    (await canAssignRhTask(viewer, att.task.assigneeId));
  if (!can) throw new Error("Accès refusé");
  await prisma.rhTaskAttachment.delete({ where: { id: attachmentId } });
  await logEvent(taskId, viewer.id, "ATTACHMENT_REMOVED", {
    fileName: att.fileName,
  });
  return getRhTask(viewer, taskId);
}

export async function countOpenTasksForEmployee(employeeId: string) {
  return prisma.rhTask.count({
    where: {
      archivedAt: null,
      status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] },
      OR: [
        { assigneeId: employeeId },
        { assignees: { some: { employeeId } } },
      ],
    },
  });
}
