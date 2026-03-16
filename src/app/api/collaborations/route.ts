import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import prisma from "@/lib/prisma";
import { generateCollabReference } from "@/lib/generateCollabReference";
import { getTalentIdsAccessibles, logDelegationActivite } from "@/lib/delegations";

// GET - Liste des collaborations
export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };
    const { searchParams } = new URL(request.url);
    const accountManagerId = searchParams.get("accountManagerId");

    const where: any = {};

    // Si TM → voir uniquement SES collaborations (via ses talents), tous statuts sauf PERDU
    if (user.role === "TM") {
      const mesTalents = await prisma.talent.findMany({
        where: {
          isArchived: false,
          OR: [
            { managerId: user.id },
            {
              delegations: {
                some: {
                  tmRelaiId: user.id,
                  actif: true,
                },
              },
            },
          ],
        },
        select: { id: true },
      });
      where.talentId = { in: mesTalents.map((t) => t.id) };
      where.statut = { not: "PERDU" };
    }
    
    // Filtrer par Account Manager si spécifié (pour ADMIN uniquement)
    if (accountManagerId && user.role === "ADMIN") {
      where.accountManagerId = accountManagerId;
    }

    const collaborations = await prisma.collaboration.findMany({
      where,
      include: {
        talent: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            photo: true,
            managerId: true,
            manager: { select: { prenom: true, nom: true } },
            delegations: {
              where: { actif: true },
              select: { actif: true },
            },
          },
        },
        marque: {
          select: { id: true, nom: true },
        },
        livrables: true,
        accountManager: {
          select: { id: true, prenom: true, nom: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Infos confidentielles : seul l'admin voit "Payé" et les dates de paiement
    const isAdmin = user.role === "ADMIN";
    const payload = isAdmin
      ? collaborations
      : collaborations.map((c) => ({
          ...c,
          statut: c.statut === "PAYE" ? "FACTURE_RECUE" : c.statut,
          marquePayeeAt: undefined,
          paidAt: undefined,
        }));

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Erreur GET collaborations:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}

// POST - Créer une collaboration avec livrables
export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const data = await request.json();

    if (!data.talentId || !data.marqueId || !data.livrables?.length) {
      return NextResponse.json({ message: "Champs obligatoires manquants" }, { status: 400 });
    }

    // Vérification d'accès au talent : TM relai ou rôles libres uniquement
    const user = session.user as { id: string; role?: string };
    const role = user.role ?? "";
    const rolesLibres = ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE"];
    if (!rolesLibres.includes(role)) {
      const talentIds = await getTalentIdsAccessibles(user.id);
      if (!talentIds.includes(data.talentId)) {
        return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      }
    }

    // Validation facturation client : doit toujours être remplie pour toute création de collab (pour devis / facture)
    const billing = data.billing || {};
    if (
      !billing.raisonSociale ||
      !billing.adresseRue ||
      !billing.codePostal ||
      !billing.ville ||
      !billing.pays
    ) {
      return NextResponse.json(
        { message: "Informations de facturation client manquantes (raison sociale, adresse, code postal, ville, pays)." },
        { status: 400 }
      );
    }

    // Mettre à jour les infos de facturation de la marque AVANT de créer la collaboration
    await prisma.marque.update({
      where: { id: data.marqueId },
      data: {
        raisonSociale: String(billing.raisonSociale).trim(),
        adresseRue: String(billing.adresseRue).trim(),
        codePostal: String(billing.codePostal).trim(),
        ville: String(billing.ville).trim(),
        pays: String(billing.pays).trim(),
        siret: billing.siret ? String(billing.siret).trim() : null,
        numeroTVA: billing.numeroTVA ? String(billing.numeroTVA).trim() : null,
      },
    });

    // Générer une référence unique via le compteur centralisé
    const reference = await generateCollabReference();
    console.log(`🆕 Création collaboration manuelle: ${reference}`);

    // Créer la collaboration avec les livrables
    const collaboration = await prisma.collaboration.create({
      data: {
        reference,
        talentId: data.talentId,
        marqueId: data.marqueId,
        source: data.source || "INBOUND",
        description: data.description || null,
        montantBrut: parseFloat(data.montantBrut) || 0,
        commissionPercent: parseFloat(data.commissionPercent) || 20,
        commissionEuros: parseFloat(data.commissionEuros) || 0,
        montantNet: parseFloat(data.montantNet) || 0,
        isLongTerme: data.isLongTerme || false,
        statut: "EN_COURS", // Création manuelle = déjà en cours ; le TM peut mettre "Publié" en 1 clic
        livrables: {
          create: data.livrables.map((l: any) => ({
            typeContenu: l.typeContenu,
            quantite: l.quantite || 1,
            prixUnitaire: parseFloat(l.prixUnitaire) || 0,
            description: l.description || null,
          })),
        },
      },
      include: {
        talent: { select: { prenom: true, nom: true } },
        marque: { select: { nom: true } },
        livrables: true,
      },
    });

    // Log d'activité de délégation (création collab)
    logDelegationActivite({
      talentId: collaboration.talentId,
      auteurId: session.user.id,
      type: "COLLAB_CREEE",
      entiteType: "COLLAB",
      entiteId: collaboration.id,
      entiteRef: collaboration.reference,
      detail: "Nouvelle collaboration créée",
    }).catch(console.error);

    return NextResponse.json(collaboration, { status: 201 });
  } catch (error) {
    console.error("Erreur POST collaboration:", error);
    return NextResponse.json({ message: "Erreur lors de la création" }, { status: 500 });
  }
}
