// src/app/api/documents/[id]/update/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTypeTVA, MENTIONS_TVA } from "@/lib/documents/config";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };
    const params = await Promise.resolve(context.params);
    const { id } = params;
    const body = await request.json();
    
    console.log("📝 Update document request:", { id, user: user.id, role: user.role });

    // Vérifier que le document existe
    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        collaboration: {
          include: {
            marque: true,
            talent: true,
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document non trouvé" },
        { status: 404 }
      );
    }

    // Vérifier les permissions
    const rolesAutorises = ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES"];
    if (!rolesAutorises.includes(user.role)) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour modifier ce document" },
        { status: 403 }
      );
    }

    // Ne pas permettre la modification de documents validés/payés
    // Les devis ENVOYES peuvent être modifiés (pas encore signés)
    if (["VALIDE", "PAYE"].includes(document.statut)) {
      return NextResponse.json(
        { error: "Impossible de modifier un document validé ou payé" },
        { status: 400 }
      );
    }

    const { 
      lignes, 
      titre, 
      commentaires, 
      typeTVA: customTypeTVA,
      dateEmission,
      dateEcheance,
      poClient,
      modePaiement,
      referencePaiement
    } = body;

    // Déterminer le type de TVA à utiliser
    let typeTVA = document.typeTVA;
    if (customTypeTVA && ["FRANCE", "EU_INTRACOM", "EU_SANS_TVA", "HORS_EU"].includes(customTypeTVA)) {
      typeTVA = customTypeTVA;
    } else if (!customTypeTVA) {
      // Recalculer automatiquement si pas de type fourni
      const marque = document.collaboration?.marque;
      typeTVA = getTypeTVA(
        marque?.pays || "France",
        marque?.numeroTVA || null
      );
    }

    const configTVA = MENTIONS_TVA[typeTVA as keyof typeof MENTIONS_TVA];
    const tauxTVA = configTVA.tauxTVA;
    const mentionTVA = configTVA.mention;

    // Recalculer les montants
    let montantHT = document.montantHT;
    let montantTVA_calc = document.montantTVA;
    let montantTTC = document.montantTTC;
    let lignesCalculees = document.lignes;

    if (lignes && Array.isArray(lignes)) {
      lignesCalculees = lignes.map((ligne: any) => ({
        description: ligne.description,
        quantite: ligne.quantite,
        prixUnitaire: ligne.prixUnitaire,
        tauxTVA: tauxTVA,
        totalHT: Math.round(ligne.quantite * ligne.prixUnitaire * 100) / 100, // Arrondi à 2 décimales
      }));

      const montantHT_num = lignesCalculees.reduce(
        (sum: number, l: any) => sum + l.totalHT,
        0
      );
      const montantHT_rounded = Math.round(montantHT_num * 100) / 100;
      const montantTVA_num = Math.round(montantHT_rounded * (tauxTVA / 100) * 100) / 100;
      const montantTTC_num = Math.round((montantHT_rounded + montantTVA_num) * 100) / 100;
      
      montantHT = montantHT_rounded as any;
      montantTVA_calc = montantTVA_num as any;
      montantTTC = montantTTC_num as any;
    } else if (customTypeTVA) {
      // Recalculer avec le nouveau type de TVA même si les lignes ne changent pas
      const lignesArray = Array.isArray(document.lignes) ? document.lignes : [];
      lignesCalculees = lignesArray.map((ligne: any) => ({
        ...ligne,
        tauxTVA: tauxTVA,
      }));

      const montantHT_num2 = lignesArray.reduce(
        (sum: number, l: any) => sum + (l.totalHT || l.quantite * l.prixUnitaire),
        0
      );
      const montantHT_rounded2 = Math.round(montantHT_num2 * 100) / 100;
      const montantTVA_num2 = Math.round(montantHT_rounded2 * (tauxTVA / 100) * 100) / 100;
      const montantTTC_num2 = Math.round((montantHT_rounded2 + montantTVA_num2) * 100) / 100;
      
      montantHT = montantHT_rounded2 as any;
      montantTVA_calc = montantTVA_num2 as any;
      montantTTC = montantTTC_num2 as any;
    }

    // Mettre à jour le document
    const updatedDoc = await prisma.document.update({
      where: { id },
      data: {
        titre: titre || document.titre,
        lignes: lignesCalculees as any,
        typeTVA: typeTVA as any,
        mentionTVA: mentionTVA,
        tauxTVA: tauxTVA,
        montantHT,
        montantTVA: montantTVA_calc,
        montantTTC,
        notes: commentaires !== undefined ? commentaires : document.notes,
        dateEmission: dateEmission ? new Date(dateEmission) : document.dateEmission,
        dateEcheance: dateEcheance ? new Date(dateEcheance) : document.dateEcheance,
        poClient: poClient !== undefined ? poClient : document.poClient,
        modePaiement: modePaiement || document.modePaiement,
        referencePaiement: referencePaiement !== undefined ? referencePaiement : document.referencePaiement,
      },
    });

    console.log("✅ Document updated successfully:", updatedDoc.id);

    return NextResponse.json({
      success: true,
      document: updatedDoc,
    });
  } catch (error) {
    console.error("Erreur mise à jour document:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du document" },
      { status: 500 }
    );
  }
}
