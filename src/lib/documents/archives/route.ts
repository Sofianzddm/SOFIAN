// src/app/api/documents/archives/route.ts

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { role: string };

    // Seul ADMIN a accès aux archives complètes
    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs" },
        { status: 403 }
      );
    }

    // Récupérer tous les talents avec leurs documents
    const talents = await prisma.talent.findMany({
      include: {
        collaborations: {
          include: {
            marque: true,
            documents: {
              orderBy: { dateDocument: "desc" },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ prenom: "asc" }, { nom: "asc" }],
    });

    // Transformer les données pour l'affichage par talent > mois > marque
    const result = talents.map((talent) => {
      // Grouper les collabs par mois
      const collabsParMois: Record<string, any[]> = {};

      talent.collaborations.forEach((collab) => {
        const date = new Date(collab.createdAt);
        const moisKey = date.toLocaleDateString("fr-FR", {
          month: "long",
          year: "numeric",
        });
        // Capitaliser la première lettre
        const moisFormatted = moisKey.charAt(0).toUpperCase() + moisKey.slice(1);

        if (!collabsParMois[moisFormatted]) {
          collabsParMois[moisFormatted] = [];
        }
        collabsParMois[moisFormatted].push(collab);
      });

      // Calculer le CA total
      const totalCA = talent.collaborations.reduce((sum, collab) => {
        const docsPaye = collab.documents.filter((d) => d.type === "FACTURE");
        return (
          sum +
          docsPaye.reduce((s, d) => s + Number(d.montantTTC || 0), 0)
        );
      }, 0);

      // Construire la structure mois > marques
      const mois = Object.entries(collabsParMois).map(([moisName, collabs]) => ({
        mois: moisName,
        marques: collabs.map((collab) => ({
          id: collab.marque.id,
          nom: collab.marque.nom,
          collaborationId: collab.id,
          montantTTC: collab.documents
            .filter((d: any) => d.type === "FACTURE")
            .reduce((s: number, d: any) => s + Number(d.totalTTC || 0), 0),
          statut: collab.statut,
          documents: collab.documents.map((doc: any) => ({
            id: doc.id,
            numero: doc.numero,
            type: doc.type,
            statut: doc.statut,
            totalTTC: Number(doc.totalTTC),
            dateDocument: doc.dateDocument,
          })),
        })),
      }));

      return {
        id: talent.id,
        prenom: talent.prenom,
        nom: talent.nom,
        photo: talent.photo,
        totalCA,
        nombreCollabs: talent.collaborations.length,
        mois,
      };
    });

    // Filtrer les talents sans collaborations
    const talentsAvecCollabs = result.filter((t) => t.nombreCollabs > 0);

    return NextResponse.json({ talents: talentsAvecCollabs });
  } catch (error) {
    console.error("Erreur archives:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des archives" },
      { status: 500 }
    );
  }
}
