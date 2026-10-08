// POST /api/collaborations/[id]/contrat/upload
// Upload PDF + création template DocuSeal vide → brouillon contrat collab
// (même pipeline que POST /api/talents/[id]/contrats)
import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import prisma from "@/lib/prisma";
import { uploadBufferToS3, buildKey, isS3Configured } from "@/lib/s3";
import { validateSignatairesInput } from "@/lib/collab-contrat-upload";

const DOCUSEAL_TEMPLATES_PDF = "https://api.docuseal.com/templates/pdf";

function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

async function uploadContratPdf(
  buffer: Buffer,
  collabId: string,
  safeName: string
): Promise<string> {
  if (isS3Configured()) {
    const key = buildKey(
      "glowup-contrats-collabs",
      `${collabId}/${Date.now()}-${safeName}.pdf`
    );
    return uploadBufferToS3(buffer, { key, contentType: "application/pdf" });
  }

  const { v2: cloudinary } = await import("cloudinary");
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  const base64 = `data:application/pdf;base64,${buffer.toString("base64")}`;
  const uploaded = await cloudinary.uploader.upload(base64, {
    folder: "glowup-contrats-collabs",
    public_id: `${collabId}-${Date.now()}-${safeName}`,
    resource_type: "auto",
  });
  return uploaded.secure_url;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role ?? "";
    if (!["ADMIN", "TM"].includes(role)) {
      return NextResponse.json(
        { error: "Seuls les administrateurs et les TM peuvent uploader un contrat" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const docusealKey = process.env.DOCUSEAL_API_KEY;
    if (!docusealKey) {
      return NextResponse.json(
        { error: "DocuSeal n'est pas configuré (DOCUSEAL_API_KEY manquant)" },
        { status: 503 }
      );
    }
    if (!isS3Configured() && !isCloudinaryConfigured()) {
      return NextResponse.json(
        { error: "Aucun stockage de fichiers configuré (S3 ou Cloudinary requis)" },
        { status: 503 }
      );
    }

    const collaboration = await prisma.collaboration.findUnique({
      where: { id },
      include: {
        talent: { select: { prenom: true, nom: true } },
        marque: { select: { nom: true } },
      },
    });
    if (!collaboration) {
      return NextResponse.json({ error: "Collaboration non trouvée" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const titreRaw = formData.get("titre");
    const signatairesRaw = formData.get("signataires");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier PDF requis" }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Seuls les fichiers PDF sont acceptés" },
        { status: 400 }
      );
    }
    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Fichier trop volumineux (max 20 Mo)" },
        { status: 400 }
      );
    }

    let signatairesParsed: unknown = [];
    if (typeof signatairesRaw === "string" && signatairesRaw.trim()) {
      try {
        signatairesParsed = JSON.parse(signatairesRaw);
      } catch {
        return NextResponse.json(
          { error: "Liste de signataires invalide" },
          { status: 400 }
        );
      }
    }
    const validated = validateSignatairesInput(signatairesParsed);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const titre =
      (typeof titreRaw === "string" && titreRaw.trim()) ||
      file.name.replace(/\.pdf$/i, "") ||
      `Contrat ${collaboration.talent.prenom} ${collaboration.talent.nom} x ${collaboration.marque.nom}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName =
      titre
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9-_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase() || "contrat";

    const fichierUrl = await uploadContratPdf(buffer, collaboration.id, safeName);

    const templatePayload = {
      name: `${collaboration.reference} — ${titre}`,
      documents: [
        {
          name: "contrat",
          file: buffer.toString("base64"),
          fields: [],
        },
      ],
    };

    const templateRes = await fetch(DOCUSEAL_TEMPLATES_PDF, {
      method: "POST",
      headers: {
        "X-Auth-Token": docusealKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(templatePayload),
    });

    if (!templateRes.ok) {
      const errText = await templateRes.text();
      console.error("DocuSeal templates/pdf (collab) error:", templateRes.status, errText);
      return NextResponse.json(
        { error: "Erreur DocuSeal (création template): " + (errText || templateRes.statusText) },
        { status: 502 }
      );
    }

    const templateData = (await templateRes.json()) as { id?: number };
    const templateId = templateData.id;
    if (templateId == null) {
      return NextResponse.json(
        { error: "Réponse DocuSeal invalide (template id manquant)" },
        { status: 502 }
      );
    }

    await prisma.collaboration.update({
      where: { id },
      data: {
        contratDocusealTemplateId: Number(templateId),
        contratFichierUrl: fichierUrl,
        contratTitre: titre,
        contratSignataires: validated.signataires,
        contratStatut: "BROUILLON",
        contratSubmissionId: null,
        contratEnvoyeAt: null,
        contratTalentSigneAt: null,
        contratSigneAt: null,
      },
    });

    return NextResponse.json({
      success: true,
      collaborationId: id,
      titre,
      signatairesCount: validated.signataires.length,
    });
  } catch (error) {
    console.error("POST /api/collaborations/[id]/contrat/upload:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'upload du contrat" },
      { status: 500 }
    );
  }
}
