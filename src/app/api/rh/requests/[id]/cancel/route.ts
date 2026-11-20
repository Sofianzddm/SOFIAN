import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  canDecideRhRequest,
  isRhManager,
  requireRhSessionFromRequest,
} from "@/lib/rh/auth";
import { cancelRhRequest } from "@/lib/rh/request-cancel";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Annulation CP / sans solde / feuille (HS).
 * - Collaborateur : sa propre demande (attente, ou congé approuvé pas encore commencé)
 * - Manager / RH : demandes de son périmètre (y compris déjà approuvées)
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const note = typeof body.note === "string" ? body.note.trim() : undefined;

  const req = await prisma.rhRequest.findUnique({ where: { id } });
  if (!req) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  const isOwner = req.employeeId === session.employee.id;
  const asManager =
    !isOwner &&
    isRhManager(session.employee.rhRole) &&
    (await canDecideRhRequest(session.employee, req.employeeId));

  if (!isOwner && !asManager) {
    return NextResponse.json({ error: "Interdit" }, { status: 403 });
  }

  // Manager/RH : session sécurisée People
  if (asManager) {
    const { hasRhSecureSession } = await import("@/lib/rh/secure-session");
    if (!(await hasRhSecureSession(session.app.user.id, request))) {
      return NextResponse.json(
        {
          error: "Réservé au manager / RH (connexion sécurisée)",
          code: "RH_MFA_REQUIRED",
        },
        { status: 403 }
      );
    }
  }

  try {
    await cancelRhRequest({
      requestId: id,
      actorId: session.employee.id,
      asManager,
      note,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}
