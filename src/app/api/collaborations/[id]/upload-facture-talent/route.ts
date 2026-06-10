import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { uploadFileToS3, deleteFromS3 } from "@/lib/s3";

// POST - Upload de la facture par le talent
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id } = await params;

    // 1. Récupérer la collaboration avec le talent
    const collaboration = await prisma.collaboration.findUnique({
      where: { id },
      include: {
        talent: {
          select: {
            id: true,
            userId: true,
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
      },
    });

    if (!collaboration) {
      return NextResponse.json({ error: "Collaboration non trouvée" }, { status: 404 });
    }

    // 2. Vérifier que l'utilisateur connecté est bien le talent propriétaire
    if (collaboration.talent.userId !== session.user.id && session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Vous n'êtes pas autorisé à uploader une facture pour cette collaboration" },
        { status: 403 }
      );
    }

    // 3. Vérifier que la collaboration est au bon statut
    if (!["PUBLIE", "FACTURE_RECUE", "PAYE"].includes(collaboration.statut)) {
      return NextResponse.json(
        {
          error: "Vous pouvez uploader votre facture uniquement après la publication de la collaboration",
          statutActuel: collaboration.statut,
        },
        { status: 400 }
      );
    }

    // 4. Vérifier qu'une facture n'a pas déjà été uploadée
    if (collaboration.factureTalentUrl && session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Une facture a déjà été uploadée pour cette collaboration" },
        { status: 400 }
      );
    }

    // 5. Récupérer le fichier depuis le formData
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }

    // 6. Valider le type de fichier
    const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Format non accepté. Formats autorisés : PDF, JPG, PNG" },
        { status: 400 }
      );
    }

    // 7. Valider la taille (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "Fichier trop volumineux. Taille maximum : 10MB" },
        { status: 400 }
      );
    }

    // 8. Upload vers S3 (PDF ou image)
    const fileUrl = await uploadFileToS3(file, {
      folder: "glowup-factures-talents",
      baseName: `${collaboration.reference}-${Date.now()}`,
    });

    // 9. Supprimer l'ancienne facture si elle existe (cas ADMIN qui remplace)
    if (collaboration.factureTalentUrl) {
      await deleteFromS3(collaboration.factureTalentUrl);
    }

    // 10. Mettre à jour la collaboration
    const updated = await prisma.collaboration.update({
      where: { id },
      data: {
        factureTalentUrl: fileUrl,
        factureTalentRecueAt: new Date(),
        statut: collaboration.statut === "PUBLIE" ? "FACTURE_RECUE" : collaboration.statut,
      },
    });

    // 11. Créer une notification pour le TM et ADMIN
    const notifications = [];

    // Notification au manager du talent (collabId pour permettre "Marquer conforme" depuis les notifs)
    if (collaboration.talent.manager) {
      notifications.push(
        prisma.notification.create({
          data: {
            userId: collaboration.talent.manager.id,
            type: "FACTURE_RECUE",
            titre: "📤 Facture talent reçue",
            message: `${collaboration.talent.prenom} ${collaboration.talent.nom} a uploadé sa facture pour la collaboration ${collaboration.reference} (${collaboration.marque.nom})`,
            lien: `/collaborations/${id}`,
            collabId: id,
          },
        })
      );
    }

    // Notification aux ADMIN (ex: Maud) — collabId pour afficher le bouton "Marquer conforme"
    const admins = await prisma.user.findMany({
      where: { 
        role: "ADMIN",
        actif: true 
      },
      select: { id: true, prenom: true, nom: true },
    });

    admins.forEach((admin) => {
      notifications.push(
        prisma.notification.create({
          data: {
            userId: admin.id,
            type: "FACTURE_RECUE",
            titre: "📤 Facture talent reçue",
            message: `${collaboration.talent.prenom} ${collaboration.talent.nom} a uploadé sa facture pour ${collaboration.reference} (${collaboration.marque.nom})`,
            lien: `/collaborations/${id}`,
            collabId: id,
          },
        })
      );
    });

    await Promise.all(notifications);

    return NextResponse.json({
      success: true,
      url: fileUrl,
      collaboration: {
        id: updated.id,
        reference: updated.reference,
        statut: updated.statut,
        factureTalentUrl: updated.factureTalentUrl,
        factureTalentRecueAt: updated.factureTalentRecueAt,
      },
      message: "Facture uploadée avec succès ! Votre manager a été notifié.",
    });
  } catch (error) {
    console.error("Erreur upload facture talent:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'upload de la facture" },
      { status: 500 }
    );
  }
}
