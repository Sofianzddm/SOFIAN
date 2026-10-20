import { NextRequest, NextResponse } from "next/server";
import type { RhTaskPriority, RhTaskStatus } from "@prisma/client";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";
import {
  deleteRhTask,
  getRhTask,
  updateRhTask,
} from "@/lib/rh/tasks";

const STATUSES = new Set([
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
  "CANCELLED",
]);
const PRIORITIES = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const task = await getRhTask(session.employee, id);
  if (!task) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }
  return NextResponse.json({ task });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  try {
    const task = await updateRhTask(session.employee, id, {
      title: body.title != null ? String(body.title) : undefined,
      description:
        body.description === undefined
          ? undefined
          : body.description == null
            ? null
            : String(body.description),
      status: STATUSES.has(String(body.status || ""))
        ? (String(body.status) as RhTaskStatus)
        : undefined,
      priority: PRIORITIES.has(String(body.priority || ""))
        ? (String(body.priority) as RhTaskPriority)
        : undefined,
      dueAt:
        body.dueAt === undefined
          ? undefined
          : body.dueAt == null || body.dueAt === ""
            ? null
            : String(body.dueAt),
      assigneeId:
        body.assigneeId != null ? String(body.assigneeId) : undefined,
      assigneeIds: Array.isArray(body.assigneeIds)
        ? body.assigneeIds.map((id) => String(id)).filter(Boolean)
        : undefined,
      // Métadonnée interne uniquement — aucune notif au talent
      talentId:
        body.talentId === undefined
          ? undefined
          : body.talentId == null || body.talentId === ""
            ? null
            : String(body.talentId),
      tags: Array.isArray(body.tags)
        ? body.tags.map((t) => String(t))
        : undefined,
      archived:
        typeof body.archived === "boolean" ? body.archived : undefined,
    });
    return NextResponse.json({ task });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur";
    const status = msg.includes("refusé") || msg.includes("pas")
      ? 403
      : msg.includes("introuvable")
        ? 404
        : msg.includes("obligatoire") || msg.includes("invalide")
          ? 400
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    await deleteRhTask(session.employee, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur";
    const status = msg.includes("refusé")
      ? 403
      : msg.includes("introuvable")
        ? 404
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
