import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { beneluxCompanyToMarqueDetail } from "@/lib/benelux-as-marque";

/**
 * Fiche entreprise BENELUX — alignée sur le contrat UI de la fiche marque FR
 * (même MarqueRecordPage). GET hydrate collabs / facturation / CA depuis la
 * marque FR liée (`linkedMarqueId`, ou match par nom en secours).
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

function hasAccess(role: string | undefined | null): boolean {
  return ALLOWED_ROLES.includes((role || "") as (typeof ALLOWED_ROLES)[number]);
}

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

async function resolveLinkedMarque(company: {
  id: string;
  nom: string;
  linkedMarqueId: string | null;
}) {
  if (company.linkedMarqueId) {
    const linked = await prisma.marque.findUnique({
      where: { id: company.linkedMarqueId },
      select: linkedMarqueSelect,
    });
    if (linked) return linked;
  }

  // Secours : match par nom (transferts antérieurs sans linkedMarqueId).
  const byName = await prisma.marque.findFirst({
    where: { nom: { equals: company.nom, mode: "insensitive" } },
    select: linkedMarqueSelect,
  });
  if (byName) {
    // Backfill silencieux du lien pour les prochains chargements.
    await prisma.beneluxCompany.update({
      where: { id: company.id },
      data: { linkedMarqueId: byName.id },
    });
    return byName;
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!hasAccess(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await params;
    const company = await prisma.beneluxCompany.findUnique({
      where: { id },
      select: companySelect,
    });

    if (!company) {
      return NextResponse.json({ error: "Entreprise introuvable." }, { status: 404 });
    }

    const linked = await resolveLinkedMarque(company);
    const detail = beneluxCompanyToMarqueDetail(company, linked as Parameters<typeof beneluxCompanyToMarqueDetail>[1]);
    return NextResponse.json({ ...detail, company: detail });
  } catch (error) {
    console.error("GET /api/benelux-outreach/companies/[id]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!hasAccess(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      nom?: string;
      secteur?: string | null;
      siteWeb?: string | null;
      ville?: string | null;
      notes?: string | null;
    };

    const existing = await prisma.beneluxCompany.findUnique({
      where: { id },
      select: { id: true, linkedMarqueId: true, nom: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Entreprise introuvable." }, { status: 404 });
    }

    const nom = (body.nom || "").trim();
    if (!nom) {
      return NextResponse.json({ error: "Le nom est requis." }, { status: 400 });
    }

    const updated = await prisma.beneluxCompany.update({
      where: { id },
      data: {
        nom,
        secteur: body.secteur?.trim() || null,
        siteWeb: body.siteWeb?.trim() || null,
        ville: body.ville?.trim() || null,
        notes: body.notes?.trim() || null,
      },
      select: companySelect,
    });

    const linked = await resolveLinkedMarque(updated);
    return NextResponse.json(
      beneluxCompanyToMarqueDetail(
        updated,
        linked as Parameters<typeof beneluxCompanyToMarqueDetail>[1]
      )
    );
  } catch (error) {
    console.error("PUT /api/benelux-outreach/companies/[id]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.beneluxCompany.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Entreprise introuvable." }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.beneluxOutreachTarget.deleteMany({ where: { companyId: id } }),
      prisma.beneluxCompany.delete({ where: { id } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/benelux-outreach/companies/[id]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
