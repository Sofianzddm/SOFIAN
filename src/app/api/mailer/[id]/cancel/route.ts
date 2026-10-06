import { NextRequest, NextResponse } from "next/server";
import { requireMailerAccess } from "@/lib/requireMailerAccess";
import { resolveProspectionActor } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";

/**
 * Annule un envoi programmé (repasse en brouillon) OU annule les relances en
 * attente d'un mail déjà envoyé (?followups=1).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireMailerAccess(request);
  if (!session) {
    return NextResponse.json({ error: "Accès non autorisé." }, { status: 403 });
  }
  const { id } = await params;

  const mail = await prisma.adminMail.findUnique({ where: { id } });
  if (!mail) {
    return NextResponse.json({ error: "Mail introuvable." }, { status: 404 });
  }
  const { userId, role } = await resolveProspectionActor(session);
  if (role !== "ADMIN" && mail.createdById !== userId) {
    return NextResponse.json({ error: "Accès non autorisé." }, { status: 403 });
  }

  const followupsOnly = request.nextUrl.searchParams.get("followups") === "1";

  if (followupsOnly) {
    await prisma.adminMailFollowup.updateMany({
      where: { mailId: id, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
  } else {
    if (mail.status !== "SCHEDULED") {
      return NextResponse.json(
        { error: "Seul un mail programmé peut être annulé." },
        { status: 409 }
      );
    }
    await prisma.adminMail.update({
      where: { id },
      data: { status: "DRAFT", scheduledAt: null },
    });
  }

  const refreshed = await prisma.adminMail.findUnique({
    where: { id },
    include: { followups: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json({ mail: refreshed });
}
