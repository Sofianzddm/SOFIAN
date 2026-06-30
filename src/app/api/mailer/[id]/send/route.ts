import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/prisma";
import { executeMailSend } from "@/lib/admin-mailer";

/** Envoie immédiatement un mail (brouillon ou programmé), et programme ses relances. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Accès réservé à l'admin." }, { status: 403 });
  }
  const { id } = await params;

  const mail = await prisma.adminMail.findUnique({ where: { id } });
  if (!mail) {
    return NextResponse.json({ error: "Mail introuvable." }, { status: 404 });
  }
  if (mail.status === "SENT") {
    return NextResponse.json({ error: "Mail déjà envoyé." }, { status: 409 });
  }

  // ?force=1 : ignore le cooldown anti double-contact (Leyna < 20j).
  const force = request.nextUrl.searchParams.get("force") === "1";
  if (force) {
    await prisma.adminMail.update({ where: { id }, data: { forceSend: true } });
  }

  const result = await executeMailSend(id);
  const refreshed = await prisma.adminMail.findUnique({
    where: { id },
    include: { followups: { orderBy: { order: "asc" } } },
  });

  // Report (cooldown) : ce n'est pas une erreur, on renvoie 200 avec un flag.
  if (result.held) {
    return NextResponse.json({
      mail: refreshed,
      held: true,
      message: result.error,
    });
  }
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Échec de l'envoi.", mail: refreshed },
      { status: 422 }
    );
  }
  return NextResponse.json({ mail: refreshed });
}
