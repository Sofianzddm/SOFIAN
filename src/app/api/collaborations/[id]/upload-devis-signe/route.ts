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

const ALLOWED_ROLES = new Set([
  "ADMIN",
  "TM",
  "HEAD_OF",
  "HEAD_OF_INFLUENCE",
  "HEAD_OF_SALES",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    if (!ALLOWED_ROLES.has(session.user.role)) {
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    const { id } = await params;
    const collaboration = await prisma.collaboration.findUnique({
      where: { id },
      select: { id: true, reference: true },
    });

    if (!collaboration) {
      return NextResponse.json(
        { error: "Collaboration non trouvée" },
        { status: 404 }
      );
    }

    const devis = await prisma.document.findFirst({
      where: {
        collaborationId: id,
        type: "DEVIS",
        statut: { not: "ANNULE" },
        avoirRef: null,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reference: true,
        signedDocumentUrl: true,
      },
    });

    if (!devis) {
      return NextResponse.json(
        { error: "Aucun devis actif trouvé pour cette collaboration" },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }

    const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Format non accepté. Formats autorisés : PDF, JPG, PNG" },
        { status: 400 }
      );
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "Fichier trop volumineux. Taille maximum : 10MB" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

    const uploaded = await cloudinary.uploader.upload(base64, {
      folder: "glowup-devis-signes",
      public_id: `${collaboration.reference}-${devis.reference}-${Date.now()}`,
      resource_type: "auto",
    });

    if (devis.signedDocumentUrl && devis.signedDocumentUrl.includes("cloudinary.com")) {
      try {
        const urlParts = devis.signedDocumentUrl.split("/");
        const filenameWithExt = urlParts[urlParts.length - 1];
        const folder = urlParts[urlParts.length - 2];
        const publicId = `${folder}/${filenameWithExt.split(".")[0]}`;
        await cloudinary.uploader.destroy(publicId);
      } catch (error) {
        console.error("Ancien devis signé non supprimé:", error);
      }
    }

    const updatedDocument = await prisma.document.update({
      where: { id: devis.id },
      data: {
        signatureStatus: "SIGNED",
        signatureSignedAt: new Date(),
        signedDocumentUrl: uploaded.secure_url,
      },
      select: {
        id: true,
        reference: true,
        signatureStatus: true,
        signatureSignedAt: true,
        signedDocumentUrl: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Devis signé déposé avec succès",
      document: updatedDocument,
    });
  } catch (error) {
    console.error("POST upload-devis-signe:", error);
    return NextResponse.json(
      { error: "Erreur lors du dépôt du devis signé" },
      { status: 500 }
    );
  }
}
