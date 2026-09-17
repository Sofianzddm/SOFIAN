import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";
import { persistInboundQualifiedContact } from "@/lib/outreach-bridge";

const ALLOWED_ROLES = ["CASTING_MANAGER", "HEAD_OF_SALES", "ADMIN"] as const;
const ALLOWED_CATEGORIES = new Set([
  "COLLAB_PAID",
  "COLLAB_GIFTING",
  "PRESS_KIT",
  "EVENT_INVITE",
  "OTHER",
]);

/**
 * Enregistre la qualification (agence / marque + langue), crée la fiche
 * contact CRM, et enrôle immédiatement dans le cycle outreach si absent
 * (agence → à contacter ; marque → WAITING J+30).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(req);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const kind = String(body.contactKind || "").trim().toUpperCase();
    if (kind !== "MARQUE" && kind !== "AGENCE") {
      return NextResponse.json(
        { error: "Choisis Agence ou Marque en direct avant d'enregistrer." },
        { status: 400 }
      );
    }

    const contactAgence =
      kind === "AGENCE" ? String(body.contactAgence || "").trim() : "";
    if (kind === "AGENCE" && !contactAgence) {
      return NextResponse.json(
        { error: "Indique le nom de l'agence avant d'enregistrer." },
        { status: 400 }
      );
    }

    const contactLanguage =
      String(body.contactLanguage || "").trim().toLowerCase() === "en" ? "en" : "fr";

    const { id } = await params;
    const existing = await prisma.inboundOpportunity.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Opportunite introuvable" }, { status: 404 });
    }

    const fiche = await persistInboundQualifiedContact(id, session.user.id, {
      contactKind: kind,
      contactAgence: contactAgence || null,
      contactLanguage,
    });

    if (!fiche.ok) {
      const messages: Record<string, string> = {
        introuvable: "Opportunité introuvable",
        "email-invalide": "Email expéditeur invalide",
        "agence-sans-nom": "Indique le nom de l'agence",
        "marque-introuvable": "Impossible de résoudre la marque",
      };
      return NextResponse.json(
        { error: messages[fiche.reason] || `Erreur: ${fiche.reason}` },
        { status: 400 }
      );
    }

    const opportunity = await prisma.inboundOpportunity.findUnique({
      where: { id },
      include: {
        talent: { select: { id: true, prenom: true, nom: true, photo: true } },
        convertedBy: { select: { id: true, prenom: true, nom: true } },
        archivedBy: { select: { id: true, prenom: true, nom: true } },
      },
    });

    if (!opportunity) {
      return NextResponse.json({ error: "Opportunite introuvable" }, { status: 404 });
    }

    return NextResponse.json({
      opportunity: {
        ...opportunity,
        category: ALLOWED_CATEGORIES.has(opportunity.category)
          ? opportunity.category
          : "OTHER",
      },
      fiche,
    });
  } catch (error) {
    console.error("POST /api/inbound/opportunities/[id]/qualify error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
