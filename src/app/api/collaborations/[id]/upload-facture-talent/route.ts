import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { v2 as cloudinary } from "cloudinary";

// Configuration Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

    // 3. Une fois publiée (datePublication renseignée), le statut suivant n'importe plus
    if (!collaboration.datePublication) {
      return NextResponse.json(
        {
          error: "Vous pouvez uploader votre facture uniquement après la publication de la collaboration",
          statutActuel: collaboration.statut,
        },
        { status: 400 }
      );
    }

    // 4. Récupérer le fichier (+ cycleId optionnel pour collab multi-factures)
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const cycleIdRaw = formData.get("cycleId");
    const cycleId =
      typeof cycleIdRaw === "string" && cycleIdRaw.trim() ? cycleIdRaw.trim() : null;

    if (!file) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }

    // 5. Valider le type de fichier
    const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Format non accepté. Formats autorisés : PDF, JPG, PNG" },
        { status: 400 }
      );
    }

    // 6. Valider la taille (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "Fichier trop volumineux. Taille maximum : 10MB" },
        { status: 400 }
      );
    }

    const destroyCloudinaryUrl = async (url: string | null | undefined) => {
      if (!url || !url.includes("cloudinary.com")) return;
      try {
        const urlParts = url.split("/");
        const filenameWithExt = urlParts[urlParts.length - 1];
        const folder = urlParts[urlParts.length - 2];
        const publicId = `${folder}/${filenameWithExt.split(".")[0]}`;
        await cloudinary.uploader.destroy(publicId);
      } catch (e) {
        console.log("Ancienne facture non supprimée:", e);
      }
    };

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

    // ——— Upload ciblé sur un cycle (multi-factures long terme) ———
    if (cycleId) {
      const cycle = await prisma.collabCycle.findFirst({
        where: { id: cycleId, collaborationId: id },
      });
      if (!cycle) {
        return NextResponse.json(
          { error: "Cycle introuvable pour cette collaboration" },
          { status: 404 }
        );
      }
      if (cycle.factureTalentUrl && session.user.role !== "ADMIN") {
        return NextResponse.json(
          { error: "Une facture a déjà été uploadée pour ce cycle" },
          { status: 400 }
        );
      }

      const result = await cloudinary.uploader.upload(base64, {
        folder: "glowup-factures-talents",
        public_id: `${collaboration.reference}-c${cycle.numero}-${Date.now()}`,
        resource_type: "auto",
      });

      await destroyCloudinaryUrl(cycle.factureTalentUrl);

      const updatedCycle = await prisma.collabCycle.update({
        where: { id: cycle.id },
        data: {
          factureTalentUrl: result.secure_url,
          factureTalentRecueAt: new Date(),
          statut: "FACTURE",
        },
      });

      const allCycles = await prisma.collabCycle.findMany({
        where: { collaborationId: id },
        orderBy: { numero: "asc" },
      });
      const allUploaded = allCycles.length > 0 && allCycles.every((c) => !!c.factureTalentUrl);

      let collabStatut = collaboration.statut;
      let collabFactureUrl = collaboration.factureTalentUrl;
      let collabFactureRecueAt = collaboration.factureTalentRecueAt;

      if (allUploaded) {
        const updatedCollab = await prisma.collaboration.update({
          where: { id },
          data: {
            // Première facture cycle = slot collab (rétrocompat validation / listes)
            factureTalentUrl: allCycles[0].factureTalentUrl ?? result.secure_url,
            factureTalentRecueAt: new Date(),
            factureValidee: false,
            factureValideeAt: null,
            statut: collaboration.statut === "PUBLIE" ? "FACTURE_RECUE" : collaboration.statut,
          },
        });
        collabStatut = updatedCollab.statut;
        collabFactureUrl = updatedCollab.factureTalentUrl;
        collabFactureRecueAt = updatedCollab.factureTalentRecueAt;
      }

      const label = cycle.description || `Cycle ${cycle.numero}`;
      const notifications = [];
      if (collaboration.talent.manager) {
        notifications.push(
          prisma.notification.create({
            data: {
              userId: collaboration.talent.manager.id,
              type: "FACTURE_RECUE",
              titre: "📤 Facture talent reçue",
              message: `${collaboration.talent.prenom} ${collaboration.talent.nom} a uploadé sa facture « ${label} » pour ${collaboration.reference} (${collaboration.marque.nom})`,
              lien: `/collaborations/${id}`,
              collabId: id,
            },
          })
        );
      }
      const admins = await prisma.user.findMany({
        where: { role: "ADMIN", actif: true },
        select: { id: true },
      });
      for (const admin of admins) {
        notifications.push(
          prisma.notification.create({
            data: {
              userId: admin.id,
              type: "FACTURE_RECUE",
              titre: "📤 Facture talent reçue",
              message: `${collaboration.talent.prenom} ${collaboration.talent.nom} a uploadé sa facture « ${label} » pour ${collaboration.reference} (${collaboration.marque.nom})`,
              lien: `/collaborations/${id}`,
              collabId: id,
            },
          })
        );
      }
      await Promise.all(notifications);

      return NextResponse.json({
        success: true,
        url: result.secure_url,
        cycle: {
          id: updatedCycle.id,
          numero: updatedCycle.numero,
          description: updatedCycle.description,
          factureTalentUrl: updatedCycle.factureTalentUrl,
          factureTalentRecueAt: updatedCycle.factureTalentRecueAt,
        },
        collaboration: {
          id: collaboration.id,
          reference: collaboration.reference,
          statut: collabStatut,
          factureTalentUrl: collabFactureUrl,
          factureTalentRecueAt: collabFactureRecueAt,
        },
        allUploaded,
        message: allUploaded
          ? "Toutes les factures ont été envoyées ! Votre manager a été notifié."
          : `Facture « ${label} » uploadée. Il reste d'autres factures à envoyer.`,
      });
    }

    // ——— Upload classique (1 facture / collab) ———
    const existingCycles = await prisma.collabCycle.count({ where: { collaborationId: id } });
    if (existingCycles > 0) {
      return NextResponse.json(
        {
          error:
            "Cette collaboration a plusieurs factures (cycles). Choisis laquelle envoyer.",
        },
        { status: 400 }
      );
    }

    if (collaboration.factureTalentUrl && session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Une facture a déjà été uploadée pour cette collaboration" },
        { status: 400 }
      );
    }

    const result = await cloudinary.uploader.upload(base64, {
      folder: "glowup-factures-talents",
      public_id: `${collaboration.reference}-${Date.now()}`,
      resource_type: "auto",
    });

    await destroyCloudinaryUrl(collaboration.factureTalentUrl);

    const updated = await prisma.collaboration.update({
      where: { id },
      data: {
        factureTalentUrl: result.secure_url,
        factureTalentRecueAt: new Date(),
        factureValidee: false,
        factureValideeAt: null,
        statut: collaboration.statut === "PUBLIE" ? "FACTURE_RECUE" : collaboration.statut,
      },
    });

    const notifications = [];

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

    const admins = await prisma.user.findMany({
      where: {
        role: "ADMIN",
        actif: true,
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
      url: result.secure_url,
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
