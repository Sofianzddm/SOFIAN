/**
 * POST /api/benelux-outreach/companies/[id]/outreach-toggle
 * Body: { enabled: boolean } — met / retire la carto du cycle BENELUX.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id: companyId } = await params;
    const body = (await request.json().catch(() => ({}))) as { enabled?: boolean };
    const enabled = Boolean(body.enabled);

    const company = await prisma.beneluxCompany.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) {
      return NextResponse.json({ error: "Entreprise introuvable." }, { status: 404 });
    }

    if (!enabled) {
      const now = new Date();
      await prisma.$transaction([
        prisma.beneluxContact.updateMany({
          where: { companyId, source: "CARTO" },
          data: { outreachExcluded: true },
        }),
        prisma.beneluxOutreachTarget.updateMany({
          where: { companyId, status: { not: "STOPPED" } },
          data: {
            status: "STOPPED",
            stoppedAt: now,
            stoppedById: session.user.id,
            autoRescheduleReason: "Retiré de l'Outreach (fiche BENELUX)",
            autoRescheduledAt: now,
          },
        }),
      ]);
      return NextResponse.json({ ok: true, enabled: false });
    }

    await prisma.beneluxContact.updateMany({
      where: { companyId, source: "CARTO" },
      data: { outreachExcluded: false },
    });
    return NextResponse.json({ ok: true, enabled: true });
  } catch (error) {
    console.error("POST .../outreach-toggle:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
