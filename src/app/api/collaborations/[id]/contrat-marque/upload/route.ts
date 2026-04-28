import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function statutV1FromLegacyCollab(statut: string | null | undefined): string {
  if (statut === "APPROUVE" || statut === "SIGNE") return "APPROUVE";
  if (statut === "A_MODIFIER") return "A_MODIFIER";
  return "EN_ATTENTE_JURISTE";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!["ADMIN", "HEAD_OF_INFLUENCE", "JURISTE"].includes(session.user.role)) {
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    const { id } = await params;
    const collaboration = await prisma.collaboration.findUnique({
      where: { id },
      select: {
        id: true,
        reference: true,
        contratMarquePdfUrl: true,
        contratMarqueStatut: true,
        contratMarqueMode: true,
      },
    });
    if (!collaboration) {
      return NextResponse.json({ error: "Collaboration non trouvée" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }
    const isPdfMime = file.type === "application/pdf";
    const isPdfByName = file.name.toLowerCase().endsWith(".pdf");
    if (!isPdfMime && !isPdfByName) {
      return NextResponse.json({ error: "Le contrat doit être un PDF" }, { status: 400 });
    }

    const signedFinal =
      formData.get("signedFinal") === "true" ||
      formData.get("signedFinal") === "1" ||
      formData.get("signedFinal") === "on";

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;
    const uploaded = await cloudinary.uploader.upload(base64, {
      folder: "glowup-contrats-marques",
      public_id: `${collaboration.reference}-${Date.now()}`,
      resource_type: "auto",
    });

    const url = uploaded.secure_url;

    const lastVersion = await prisma.contratMarqueVersion.findFirst({
      where: { collaborationId: id },
      orderBy: { numero: "desc" },
    });

    const oldPdfUrl = collaboration.contratMarquePdfUrl?.trim() ?? "";

    /**
     * Dépôt d'un PDF signé "final" :
     * - si déjà SIGNE : on reste SIGNE
     * - si APPROUVE : on garde APPROUVE (attente éventuelle de contre-signature client)
     */
    if (signedFinal) {
      const canDepositSignedFinal =
        collaboration.contratMarqueStatut === "SIGNE" ||
        collaboration.contratMarqueStatut === "APPROUVE";
      if (!canDepositSignedFinal) {
        return NextResponse.json(
          {
            error:
              "Le PDF signé définitif ne peut être déposé que sur un contrat approuvé ou déjà signé.",
          },
          { status: 400 }
        );
      }

      const newVersionSigned = await prisma.$transaction(async (tx) => {
        if (lastVersion) {
          return tx.contratMarqueVersion.create({
            data: {
              collaborationId: id,
              numero: lastVersion.numero + 1,
              pdfUrl: url,
              statut: "SIGNE",
            },
          });
        }
        if (oldPdfUrl) {
          const v1 = await tx.contratMarqueVersion.create({
            data: {
              collaborationId: id,
              numero: 1,
              pdfUrl: oldPdfUrl,
              statut: "SIGNE",
            },
          });
          await tx.contratMarqueAnnotation.updateMany({
            where: { collaborationId: id, versionId: null },
            data: { versionId: v1.id },
          });
          return tx.contratMarqueVersion.create({
            data: {
              collaborationId: id,
              numero: 2,
              pdfUrl: url,
              statut: "SIGNE",
            },
          });
        }
        return tx.contratMarqueVersion.create({
          data: {
            collaborationId: id,
            numero: 1,
            pdfUrl: url,
            statut: "SIGNE",
          },
        });
      });

      const nextSignedStatus =
        collaboration.contratMarqueStatut === "SIGNE" ? "SIGNE" : "APPROUVE";
      await prisma.collaboration.update({
        where: { id },
        data: {
          contratMarquePdfUrl: url,
          contratMarqueStatut: nextSignedStatus,
          contratMarqueSigneAt:
            nextSignedStatus === "SIGNE" ? new Date() : null,
          contratMarqueMode: collaboration.contratMarqueMode ?? "EXTERNE",
          contratMarqueVersionActuelle: newVersionSigned.numero,
          contratMarquePdfOfficielSigneDeposeAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        url,
        versionId: newVersionSigned.id,
        numero: newVersionSigned.numero,
        signedFinal: true,
      });
    }

    const newVersion = await prisma.$transaction(async (tx) => {
      if (lastVersion) {
        const nv = await tx.contratMarqueVersion.create({
          data: {
            collaborationId: id,
            numero: lastVersion.numero + 1,
            pdfUrl: url,
            statut: "EN_ATTENTE_JURISTE",
          },
        });
        return nv;
      }

      if (oldPdfUrl) {
        /** Ancien PDF seul sur la collab → on fige la V1 en base, puis on crée la V2 (nouveau fichier). */
        const v1 = await tx.contratMarqueVersion.create({
          data: {
            collaborationId: id,
            numero: 1,
            pdfUrl: oldPdfUrl,
            statut: statutV1FromLegacyCollab(collaboration.contratMarqueStatut),
          },
        });

        await tx.contratMarqueAnnotation.updateMany({
          where: { collaborationId: id, versionId: null },
          data: { versionId: v1.id },
        });

        return await tx.contratMarqueVersion.create({
          data: {
            collaborationId: id,
            numero: 2,
            pdfUrl: url,
            statut: "EN_ATTENTE_JURISTE",
          },
        });
      }

      return await tx.contratMarqueVersion.create({
        data: {
          collaborationId: id,
          numero: 1,
          pdfUrl: url,
          statut: "EN_ATTENTE_JURISTE",
        },
      });
    });

    await prisma.collaboration.update({
      where: { id },
      data: {
        contratMarquePdfUrl: url,
        contratMarqueStatut: "EN_ATTENTE_JURISTE",
        contratMarqueVersionActuelle: newVersion.numero,
        contratMarqueApprouveAt: null,
        contratMarqueEnvoyeJuristeAt: null,
      },
    });

    return NextResponse.json({
      success: true,
      url,
      versionId: newVersion.id,
      numero: newVersion.numero,
    });
  } catch (error) {
    console.error("POST contrat-marque/upload:", error);
    return NextResponse.json({ error: "Erreur lors de l'upload du contrat" }, { status: 500 });
  }
}
