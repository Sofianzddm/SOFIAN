import { NextRequest, NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/account-access-lock";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";
import { generateTaskBrief } from "@/lib/rh/task-brief-ai";

const BRIEF_AI_EMAIL = "s.zeddam@glowupagence.fr";

/**
 * POST /api/rh/tasks/generate-brief
 * Rédige un brief de tâche via xAI — réservé à s.zeddam@glowupagence.fr (ADMIN).
 */
export async function POST(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const role = session.app.user.role || "";
  const email = normalizeEmail(session.app.user.email || "");
  if (role !== "ADMIN" || email !== BRIEF_AI_EMAIL) {
    return NextResponse.json(
      { error: "Accès réservé" },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const title = String(body.title || "").trim();
  if (!title) {
    return NextResponse.json({ error: "Titre requis" }, { status: 400 });
  }

  const assigneeNames = Array.isArray(body.assigneeNames)
    ? body.assigneeNames.map((n) => String(n)).filter(Boolean)
    : [];
  const tags = Array.isArray(body.tags)
    ? body.tags.map((t) => String(t)).filter(Boolean)
    : [];

  try {
    const description = await generateTaskBrief({
      title,
      notes: body.notes == null ? null : String(body.notes),
      assigneeNames,
      priority: body.priority == null ? null : String(body.priority),
      dueAt: body.dueAt == null ? null : String(body.dueAt),
      talentName: body.talentName == null ? null : String(body.talentName),
      tags,
    });

    if (!description) {
      return NextResponse.json(
        {
          error: process.env.XAI_API_KEY
            ? "Génération impossible"
            : "XAI_API_KEY non configurée",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ description });
  } catch (e) {
    console.error("[rh.tasks.generate-brief]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 500 }
    );
  }
}
