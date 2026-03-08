import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET - Détail d'une collaboration
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await params;
    const collaboration = await prisma.collaboration.findUnique({
      where: { id: id },
      include: {
        talent: {
          select: { id: true, prenom: true, nom: true, email: true, photo: true },
        },
        marque: {
          select: { 
            id: true, 
            nom: true, 
            secteur: true,
            raisonSociale: true,
            adresseRue: true,
            adresseComplement: true,
            codePostal: true,
            ville: true,
            pays: true,
            siret: true,
            numeroTVA: true,
            contacts: { orderBy: { principal: "desc" }, select: { id: true, email: true, nom: true, prenom: true, principal: true } },
          },
        },
        livrables: {
          orderBy: { createdAt: "asc" },
        },
        documents: {
          select: {
            id: true,
            reference: true,
            type: true,
            statut: true,
            montantTTC: true,
            dateEmission: true,
            avoirRef: true,
            factureRef: true,
            signatureStatus: true,
            signatureSubmissionId: true,
            signatureSentAt: true,
            signatureSignedAt: true,
            signatureSignerEmail: true,
            signedDocumentUrl: true,
            signaturesCount: true,
            signaturesTotal: true,
            events: {
              where: { type: "SIGNED" },
              select: { id: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        comments: {
          orderBy: { createdAt: "desc" },
          include: {
            user: { select: { id: true, prenom: true, nom: true } },
          },
        },
      },
    });

    if (!collaboration) {
      return NextResponse.json({ message: "Non trouvée" }, { status: 404 });
    }

    // S'assurer que marquePayeeAt et paidAt sont bien envoyés au front (paiements)
    const payload = {
      ...collaboration,
      marquePayeeAt: collaboration.marquePayeeAt != null ? collaboration.marquePayeeAt : null,
      paidAt: collaboration.paidAt != null ? collaboration.paidAt : null,
    };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Erreur GET collaboration:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}

// PATCH - Mettre à jour le statut
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const userRole = session.user.role;
    const { id } = await params;
    const data = await request.json();

    // Vérifier les permissions pour le statut "PAYE" et marquePayeeAt (ADMIN uniquement)
    if (data.statut === "PAYE" || data.marquePayeeAt !== undefined) {
      if (userRole !== "ADMIN") {
        return NextResponse.json({
          error: "Seuls les ADMIN peuvent enregistrer les paiements (marque ou talent)",
        }, { status: 403 });
      }
    }

    if (data.statut === "PERDU" && !data.raisonPerdu) {
      return NextResponse.json({ message: "Raison obligatoire" }, { status: 400 });
    }

    const updateData: any = {};

    if (data.statut) updateData.statut = data.statut;
    if (data.raisonPerdu !== undefined) updateData.raisonPerdu = data.raisonPerdu;
    if (data.lienPublication !== undefined) updateData.lienPublication = data.lienPublication;
    if (data.datePublication !== undefined) updateData.datePublication = new Date(data.datePublication);
    if (data.statut === "PAYE") updateData.paidAt = new Date();
    if (data.marquePayeeAt !== undefined) updateData.marquePayeeAt = data.marquePayeeAt ? new Date(data.marquePayeeAt) : null;

    const collaboration = await prisma.collaboration.update({
      where: { id: id },
      data: updateData,
      include: {
        talent: { 
          select: { 
            id: true, 
            userId: true, // IMPORTANT: pour créer la notification
            prenom: true, 
            nom: true, 
            email: true, 
            photo: true 
          } 
        },
        marque: { 
          select: { 
            id: true, 
            nom: true, 
            secteur: true,
            raisonSociale: true,
            adresseRue: true,
            adresseComplement: true,
            codePostal: true,
            ville: true,
            pays: true,
            siret: true,
            numeroTVA: true,
          } 
        },
        livrables: true,
        documents: {
          select: {
            id: true,
            reference: true,
            type: true,
            statut: true,
            montantTTC: true,
            dateEmission: true,
            avoirRef: true,
            factureRef: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    // Si on marque "marque a payé", mettre à jour la facture client liée (si elle existe)
    if (data.marquePayeeAt) {
      const facture = await prisma.document.findFirst({
        where: { collaborationId: id, type: "FACTURE", statut: { not: "ANNULE" } },
        orderBy: { createdAt: "desc" },
      });
      if (facture && facture.statut !== "PAYE") {
        await prisma.document.update({
          where: { id: facture.id },
          data: { statut: "PAYE" as any, datePaiement: new Date() },
        });
      }
    }

    // 🔔 NOTIFICATION : Si la collaboration passe en PUBLIE, notifier le talent
    if (data.statut === "PUBLIE" && collaboration.talent.userId) {
      try {
        await prisma.notification.create({
          data: {
            userId: collaboration.talent.userId,
            type: "COLLAB_PUBLIE",
            titre: "🎉 Collaboration publiée !",
            message: `Félicitations ! Ta collaboration avec ${collaboration.marque.nom} (${collaboration.reference}) est maintenant publiée. Tu peux maintenant uploader ta facture.`,
            lien: `/talent/collaborations`,
            collabId: collaboration.id,
          },
        });
        console.log(`✅ Notification envoyée au talent ${collaboration.talent.prenom} pour collab publiée`);
      } catch (notifError) {
        console.error("❌ Erreur création notification PUBLIE:", notifError);
      }
    }

    // 🔔 NOTIFICATION : Si on marque "Talent payé", notifier le talent
    if (data.statut === "PAYE" && collaboration.talent.userId) {
      try {
        await prisma.notification.create({
          data: {
            userId: collaboration.talent.userId,
            type: "PAIEMENT_RECU",
            titre: "💰 Paiement reçu !",
            message: `Votre collaboration ${collaboration.reference} avec ${collaboration.marque.nom} a été réglée.`,
            lien: `/talent/collaborations`,
            collabId: collaboration.id,
          },
        });
      } catch (notifError) {
        console.error("❌ Erreur création notification PAIEMENT_RECU:", notifError);
      }
    }

    return NextResponse.json(collaboration);
  } catch (error) {
    console.error("Erreur PATCH collaboration:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}

// PUT - Mettre à jour une collaboration complète (avec livrables)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await request.json();

    const livrables = Array.isArray(data.livrables) ? data.livrables : [];
    // Recalculer montantBrut côté serveur à partir des livrables (évite incohérence négo / ajout livrable)
    const montantBrut = livrables.reduce(
      (sum: number, l: any) =>
        sum + (parseFloat(l.prixUnitaire) || 0) * (Number(l.quantite) || 1),
      0
    );

    const existing = await prisma.collaboration.findUnique({
      where: { id },
      select: { commissionPercent: true },
    });
    const commissionPercent = existing ? Number(existing.commissionPercent ?? 0) : parseFloat(data.commissionPercent) || 0;
    const commissionEuros = (montantBrut * commissionPercent) / 100;
    const montantNet = montantBrut - commissionEuros;

    // Supprimer les anciens livrables
    await prisma.collabLivrable.deleteMany({
      where: { collaborationId: id },
    });

    // Mettre à jour la collaboration avec montants recalculés
    const collaboration = await prisma.collaboration.update({
      where: { id: id },
      data: {
        talentId: data.talentId,
        marqueId: data.marqueId,
        source: data.source,
        description: data.description || null,
        montantBrut,
        commissionPercent,
        commissionEuros,
        montantNet,
        isLongTerme: data.isLongTerme || false,
        livrables: {
          create: livrables.map((l: any) => ({
            typeContenu: l.typeContenu,
            quantite: l.quantite || 1,
            prixUnitaire: parseFloat(l.prixUnitaire) || 0,
            description: l.description || null,
          })),
        },
      },
      include: {
        livrables: true,
        documents: {
          select: {
            id: true,
            reference: true,
            type: true,
            statut: true,
            montantTTC: true,
            dateEmission: true,
            avoirRef: true,
            factureRef: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    return NextResponse.json(collaboration);
  } catch (error) {
    console.error("Erreur PUT collaboration:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}

// DELETE - Supprimer une collaboration
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Vérifier l'authentification et les permissions
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const userRole = session.user.role;
    
    // Seuls les ADMIN et HEAD_OF peuvent supprimer une collaboration
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES"].includes(userRole)) {
      return NextResponse.json({ 
        error: "Permissions insuffisantes pour supprimer une collaboration" 
      }, { status: 403 });
    }

    const { id } = await params;
    
    // Les livrables sont supprimés en cascade (onDelete: Cascade)
    await prisma.collaboration.delete({
      where: { id: id },
    });

    return NextResponse.json({ message: "Supprimée" });
  } catch (error) {
    console.error("Erreur DELETE collaboration:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}
