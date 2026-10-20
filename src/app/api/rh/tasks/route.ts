import { NextRequest, NextResponse } from "next/server";
import type { RhTaskPriority, RhTaskStatus } from "@prisma/client";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";
import { createRhTask, listRhTasks } from "@/lib/rh/tasks";

const STATUSES = new Set([
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
  "CANCELLED",
]);
const PRIORITIES = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);

export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const statusRaw = sp.get("status");
  const priorityRaw = sp.get("priority");
  const status = statusRaw
    ? (statusRaw.split(",").filter((s) => STATUSES.has(s)) as RhTaskStatus[])
    : undefined;
  const priority = priorityRaw
    ? (priorityRaw
        .split(",")
        .filter((s) => PRIORITIES.has(s)) as RhTaskPriority[])
    : undefined;

  try {
    const tasks = await listRhTasks(session.employee, {
      assigneeId: sp.get("assigneeId") || undefined,
      creatorId: sp.get("creatorId") || undefined,
      status: status?.length === 1 ? status[0] : status,
      priority: priority?.length === 1 ? priority[0] : priority,
      q: sp.get("q") || undefined,
      includeArchived: sp.get("archived") === "1",
      overdueOnly: sp.get("overdue") === "1",
      mineOnly: sp.get("mine") === "1",
    });
    return NextResponse.json({ tasks });
  } catch (e) {
    console.error("[rh.tasks] list", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  try {
    const assigneeIds = Array.isArray(body.assigneeIds)
      ? body.assigneeIds.map((id) => String(id)).filter(Boolean)
      : body.assigneeId
        ? [String(body.assigneeId)]
        : [];
    const task = await createRhTask(session.employee, {
      title: String(body.title || ""),
      description:
        body.description == null ? null : String(body.description),
      assigneeIds,
      // Métadonnée interne uniquement — aucune notif au talent
      talentId:
        body.talentId === undefined
          ? null
          : body.talentId == null || body.talentId === ""
            ? null
            : String(body.talentId),
      priority: PRIORITIES.has(String(body.priority || ""))
        ? (String(body.priority) as RhTaskPriority)
        : "NORMAL",
      dueAt: body.dueAt == null || body.dueAt === "" ? null : String(body.dueAt),
      tags: Array.isArray(body.tags)
        ? body.tags.map((t) => String(t))
        : typeof body.tags === "string"
          ? String(body.tags)
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur";
    const status =
      msg.includes("pas assigner") || msg.includes("introuvable")
        ? 403
        : msg.includes("obligatoire") || msg.includes("invalide")
          ? 400
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
