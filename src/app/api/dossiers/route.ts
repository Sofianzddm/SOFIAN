import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// GET - Liste complète des dossiers talents organisés par mois/marque
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Vérifier que c'est un ADMIN
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
    }

    // Récupérer tous les talents avec leurs collaborations
    const talents = await prisma.talent.findMany({
      select: {
        id: true,
        prenom: true,
        nom: true,
        photo: true,
      },
      orderBy: { prenom: "asc" },
    });

    // Pour chaque talent, récupérer toutes ses collaborations avec historique complet
    const dossiersData = await Promise.all(
      talents.map(async (talent) => {
        const collaborations = await prisma.collaboration.findMany({
          where: { talentId: talent.id },
          include: {
            marque: {
              select: { id: true, nom: true, secteur: true },
            },
            livrables: true,
            documents: {
              select: {
                id: true,
                reference: true,
                type: true,
                statut: true,
                montantHT: true,
                montantTVA: true,
                montantTTC: true,
                dateEmission: true,
                dateEcheance: true,
                datePaiement: true,
              },
              orderBy: { createdAt: "asc" },
            },
            negociation: {
              select: {
                id: true,
                reference: true,
                budgetMarque: true,
                budgetSouhaite: true,
                budgetFinal: true,
                statut: true,
                dateValidation: true,
                validateur: {
                  select: { prenom: true, nom: true },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        });

        // Organiser par mois
        const parMois = collaborations.reduce((acc, collab) => {
          const date = new Date(collab.createdAt);
          const moisKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          const moisLabel = date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

          if (!acc[moisKey]) {
            acc[moisKey] = {
              moisKey,
              moisLabel,
              collaborations: [],
            };
          }

          // Récupérer les documents par type
          const devis = collab.documents.find((d) => d.type === "DEVIS");
          const factureClient = collab.documents.find((d) => d.type === "FACTURE");

          acc[moisKey].collaborations.push({
            id: collab.id,
            reference: collab.reference,
            createdAt: collab.createdAt,
            statut: collab.statut,
            source: collab.source,
            montantBrut: collab.montantBrut,
            commissionPercent: collab.commissionPercent,
            commissionEuros: collab.commissionEuros,
            montantNet: collab.montantNet,
            datePublication: collab.datePublication,
            factureTalentUrl: collab.factureTalentUrl,
            factureTalentRecueAt: collab.factureTalentRecueAt,
            paidAt: collab.paidAt,
            marque: collab.marque,
            livrables: collab.livrables,
            negociation: collab.negociation,
            devis,
            factureClient,
          });

          return acc;
        }, {} as Record<string, any>);

        // Convertir en tableau et trier par date décroissante
        const moisArray = Object.values(parMois).sort((a: any, b: any) => 
          b.moisKey.localeCompare(a.moisKey)
        );

        return {
          talent,
          mois: moisArray,
        };
      })
    );

    // Filtrer les talents qui ont au moins une collaboration
    const dossiersAvecCollabs = dossiersData.filter(
      (dossier) => dossier.mois.length > 0
    );

    return NextResponse.json(dossiersAvecCollabs);
  } catch (error) {
    console.error("Erreur GET dossiers:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
