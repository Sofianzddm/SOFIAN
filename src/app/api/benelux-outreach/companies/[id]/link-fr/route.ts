import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { beneluxCompanyToMarqueDetail } from "@/lib/benelux-as-marque";

/**
 * POST /api/benelux-outreach/companies/[id]/link-fr
 *
 * Associe (ou détache) une entreprise BENELUX à une fiche Marque FR existante
 * via `linkedMarqueId` — sans copier de contacts ni lancer un transfert.
 *
 * Body: { marqueId: string | null }
 * - string → lie cette fiche BE à la marque FR (lien exclusif : les autres
 *   entreprises BE déjà liées à cette marque sont détachées).
 * - null → détache le lien.
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

const companySelect = {
  id: true,
  nom: true,
  secteur: true,
  siteWeb: true,
  ville: true,
  notes: true,
  createdAt: true,
  linkedMarqueId: true,
  contacts: {
    where: { excluded: false },
    orderBy: [{ principal: "desc" as const }, { prenom: "asc" as const }],
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      poste: true,
      language: true,
      principal: true,
      source: true,
      perimetre: true,
      localisation: true,
      priorite: true,
      linkedinUrl: true,
      outreachExcluded: true,
      emailLookupStatus: true,
      emailSuggested: true,
      outreachTargets: {
        select: {
          id: true,
          status: true,
          cycleCount: true,
          lastSentAt: true,
          nextRecontactAt: true,
          lastRepliedAt: true,
        },
      },
    },
  },
  _count: { select: { contacts: true, outreachTargets: true } },
};

const linkedMarqueSelect = {
  id: true,
  nom: true,
  raisonSociale: true,
  formeJuridique: true,
  siret: true,
  numeroTVA: true,
  adresseRue: true,
  adresseComplement: true,
  codePostal: true,
  ville: true,
  pays: true,
  delaiPaiement: true,
  modePaiement: true,
  devise: true,
  collaborations: {
    include: {
      talent: { select: { prenom: true, nom: true } },
    },
    orderBy: { createdAt: "desc" as const },
    take: 50,
  },
  _count: { select: { collaborations: true } },
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json(
        { error: "Permissions insuffisantes" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      marqueId?: string | null;
    };

    const company = await prisma.beneluxCompany.findUnique({
      where: { id },
      select: { id: true, nom: true, linkedMarqueId: true },
    });
    if (!company) {
      return NextResponse.json(
        { error: "Entreprise BENELUX introuvable." },
        { status: 404 }
      );
    }

    const raw = body.marqueId;
    const marqueId =
      raw === null || raw === undefined
        ? null
        : String(raw).trim() || null;

    let linked: {
      id: string;
      nom: string;
    } | null = null;

    if (marqueId) {
      const marque = await prisma.marque.findUnique({
        where: { id: marqueId },
        select: linkedMarqueSelect,
      });
      if (!marque) {
        return NextResponse.json(
          { error: "Fiche France introuvable." },
          { status: 404 }
        );
      }
      linked = marque;

      // Lien exclusif : une marque FR ↔ une entreprise BE.
      await prisma.beneluxCompany.updateMany({
        where: {
          linkedMarqueId: marqueId,
          id: { not: id },
        },
        data: { linkedMarqueId: null },
      });

      await prisma.beneluxCompany.update({
        where: { id },
        data: { linkedMarqueId: marqueId },
      });
    } else {
      await prisma.beneluxCompany.update({
        where: { id },
        data: { linkedMarqueId: null },
      });
    }

    const updated = await prisma.beneluxCompany.findUniqueOrThrow({
      where: { id },
      select: companySelect,
    });

    const linkedFull = linked
      ? await prisma.marque.findUnique({
          where: { id: linked.id },
          select: linkedMarqueSelect,
        })
      : null;

    return NextResponse.json({
      ...beneluxCompanyToMarqueDetail(
        updated,
        linkedFull as Parameters<typeof beneluxCompanyToMarqueDetail>[1]
      ),
      linkedMarqueId: marqueId,
      linkedMarque: linkedFull
        ? { id: linkedFull.id, nom: linkedFull.nom }
        : null,
    });
  } catch (error) {
    console.error(
      "POST /api/benelux-outreach/companies/[id]/link-fr:",
      error
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erreur serveur",
      },
      { status: 500 }
    );
  }
}
