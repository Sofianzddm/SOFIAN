import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Rôles autorisés à corriger les coordonnées d'un contact d'agence depuis la
// fiche partenaire. On inclut HEAD_OF_SALES (responsable prospection) en plus
// des gestionnaires partenaires (ADMIN / HEAD_OF).
const MANAGE_ROLES = ["ADMIN", "HEAD_OF", "HEAD_OF_SALES"] as const;

function canManage(role: string | undefined | null): boolean {
  return MANAGE_ROLES.includes((role || "") as (typeof MANAGE_ROLES)[number]);
}

/**
 * PATCH /api/partners/[id]/agency-contacts/[contactId]
 * Corrige un contact d'agence (prénom, nom, email, poste, langue) et propage
 * la modification vers la Prospection Agences (AgencyOutreachTarget liés), afin
 * que /agency-outreach reste synchronisé.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const role = (session.user as { role?: string }).role || "TALENT";
    if (!canManage(role)) {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs / Head Of" },
        { status: 403 }
      );
    }

    const { id, contactId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      prenom?: string;
      nom?: string | null;
      email?: string;
      poste?: string | null;
      language?: string;
    };

    const prenom = String(body.prenom ?? "").trim();
    const nom = String(body.nom ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();

    if (!prenom || !email) {
      return NextResponse.json(
        { error: "Prénom et email sont obligatoires." },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email invalide." }, { status: 400 });
    }

    const contact = await prisma.agencyContact.findFirst({
      where: { id: contactId, partnerId: id },
      include: { outreachTargets: { select: { id: true } } },
    });
    if (!contact) {
      return NextResponse.json(
        { error: "Contact introuvable pour cette agence." },
        { status: 404 }
      );
    }

    // Vérifs d'unicité uniquement si l'email change.
    if (email !== contact.email.toLowerCase()) {
      // Unicité au sein de l'agence (AgencyContact @@unique([partnerId, email]))
      const dupContact = await prisma.agencyContact.findFirst({
        where: { partnerId: id, email, NOT: { id: contactId } },
        select: { id: true },
      });
      if (dupContact) {
        return NextResponse.json(
          { error: "Un autre contact de cette agence utilise déjà cet email." },
          { status: 409 }
        );
      }

      // Unicité globale sur la prospection (AgencyOutreachTarget @@unique([email]))
      const dupTarget = await prisma.agencyOutreachTarget.findUnique({
        where: { email },
        select: { id: true, company: true, agencyContactId: true },
      });
      if (dupTarget && dupTarget.agencyContactId !== contactId) {
        return NextResponse.json(
          { error: `Cet email est déjà suivi en prospection (${dupTarget.company}).` },
          { status: 409 }
        );
      }
    }

    const language =
      body.language === "en" || body.language === "fr" ? body.language : undefined;
    const poste =
      body.poste !== undefined ? String(body.poste ?? "").trim() || null : undefined;

    // 1) Met à jour la source de vérité (contact agence)
    const updatedContact = await prisma.agencyContact.update({
      where: { id: contactId },
      data: {
        prenom,
        nom: nom || null,
        email,
        ...(poste !== undefined ? { poste } : {}),
        ...(language ? { language } : {}),
      },
    });

    // 2) Propage vers la Prospection Agences (snapshots des cibles liées)
    await prisma.agencyOutreachTarget
      .updateMany({
        where: { agencyContactId: contactId },
        data: {
          firstname: prenom,
          lastname: nom || null,
          email,
          ...(language ? { language } : {}),
        },
      })
      .catch((e) =>
        console.warn(
          "[partners agency-contacts PATCH] propagation prospection:",
          e
        )
      );

    return NextResponse.json({ contact: updatedContact });
  } catch (error) {
    console.error(
      "Erreur PATCH /api/partners/[id]/agency-contacts/[contactId]:",
      error
    );
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du contact." },
      { status: 500 }
    );
  }
}
