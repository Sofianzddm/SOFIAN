import { NextRequest, NextResponse } from "next/server";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";
import { addRhTaskComment } from "@/lib/rh/tasks";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
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
    const mentionedIds = Array.isArray(body.mentionedIds)
      ? body.mentionedIds.map((x) => String(x)).filter(Boolean)
      : undefined;
    const task = await addRhTaskComment(
      session.employee,
      id,
      String(body.body || ""),
      mentionedIds
    );
    return NextResponse.json({ task }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur";
    const status = msg.includes("refusé")
      ? 403
      : msg.includes("introuvable")
        ? 404
        : msg.includes("vide")
          ? 400
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
