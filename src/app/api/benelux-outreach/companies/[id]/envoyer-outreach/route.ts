/**
 * POST /api/benelux-outreach/companies/[id]/envoyer-outreach
 * Miroir FR : enrôle tous les contacts CARTO/MANUAL avec email dans le cycle BENELUX.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { findCrossPipelineConflict } from "@/lib/outreach-bridge";

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;
const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

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
    const company = await prisma.beneluxCompany.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        nom: true,
        contacts: {
          where: {
            outreachExcluded: false,
            excluded: false,
            email: { not: null },
            outreachTargets: { none: {} },
          },
          select: {
            id: true,
            prenom: true,
            nom: true,
            email: true,
            language: true,
          },
        },
      },
    });
    if (!company) {
      return NextResponse.json({ error: "Entreprise introuvable." }, { status: 404 });
    }

    let enrolled = 0;
    for (const c of company.contacts) {
      const email = (c.email || "").trim().toLowerCase();
      if (!isValidEmail(email)) continue;
      const conflict = await findCrossPipelineConflict(email, "benelux");
      if (conflict) continue;
      const existing = await prisma.beneluxOutreachTarget.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existing) continue;

      await prisma.beneluxOutreachTarget.create({
        data: {
          companyId: company.id,
          beneluxContactId: c.id,
          firstname: c.prenom || c.nom || "Contact",
          lastname: c.prenom ? c.nom : null,
          email,
          companyName: company.nom,
          language: c.language === "en" ? "en" : "fr",
          createdById: session.user.id,
        },
      });
      await prisma.beneluxContact.update({
        where: { id: c.id },
        data: { emailLookupStatus: "FOUND", emailSuggested: null },
      });
      enrolled += 1;
    }

    return NextResponse.json({
      ok: true,
      status: enrolled > 0 ? "enrolled" : "already_ready",
      enrolled,
      message:
        enrolled > 0
          ? `${enrolled} contact${enrolled > 1 ? "s" : ""} ajouté${enrolled > 1 ? "s" : ""} au cycle BENELUX.`
          : "Aucun nouveau contact à enrôler.",
    });
  } catch (error) {
    console.error("POST .../envoyer-outreach:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
