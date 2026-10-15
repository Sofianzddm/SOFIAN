import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/factures/talents-a-valider
 * Liste des factures talents reçues en attente de validation admin.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Seuls les ADMIN peuvent consulter les factures talents à valider" },
        { status: 403 }
      );
    }

    const collabs = await prisma.collaboration.findMany({
      where: {
        factureTalentUrl: { not: null },
        factureValidee: false,
      },
      select: {
        id: true,
        reference: true,
        statut: true,
        montantBrut: true,
        montantNet: true,
        commissionEuros: true,
        factureTalentUrl: true,
        factureTalentRecueAt: true,
        isLongTerme: true,
        talent: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            manager: {
              select: { id: true, prenom: true, nom: true },
            },
          },
        },
        marque: {
          select: { id: true, nom: true },
        },
        cycles: {
          where: { factureTalentUrl: { not: null } },
          select: {
            id: true,
            numero: true,
            description: true,
            montantNet: true,
            factureTalentUrl: true,
            factureTalentRecueAt: true,
          },
          orderBy: { numero: "asc" },
        },
      },
      orderBy: { factureTalentRecueAt: "desc" },
    });

    return NextResponse.json({
      items: collabs.map((c) => ({
        id: c.id,
        reference: c.reference,
        statut: c.statut,
        montantBrut: Number(c.montantBrut),
        montantNet: Number(c.montantNet),
        commissionEuros: Number(c.commissionEuros),
        factureTalentUrl: c.factureTalentUrl,
        factureTalentRecueAt: c.factureTalentRecueAt?.toISOString() ?? null,
        isLongTerme: c.isLongTerme,
        talent: {
          id: c.talent.id,
          prenom: c.talent.prenom,
          nom: c.talent.nom,
        },
        marque: c.marque,
        tm: c.talent.manager
          ? {
              id: c.talent.manager.id,
              prenom: c.talent.manager.prenom,
              nom: c.talent.manager.nom,
            }
          : null,
        cycles: c.cycles.map((cy) => ({
          id: cy.id,
          numero: cy.numero,
          description: cy.description,
          montantNet: Number(cy.montantNet),
          factureTalentUrl: cy.factureTalentUrl,
          factureTalentRecueAt: cy.factureTalentRecueAt?.toISOString() ?? null,
        })),
      })),
    });
  } catch (error) {
    console.error("Erreur GET /api/factures/talents-a-valider:", error);
    return NextResponse.json(
      { error: "Erreur lors du chargement des factures à valider" },
      { status: 500 }
    );
  }
}
