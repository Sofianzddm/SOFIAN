// GET  /api/talents/[id]/contrats — Liste des contrats du talent (fiche talent)
// POST /api/talents/[id]/contrats — Upload PDF (S3) + création template DocuSeal vide → contrat BROUILLON
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadBufferToS3, buildKey, isS3Configured } from "@/lib/s3";
import { CONTRAT_TALENT_ROLES } from "@/lib/talent-contrats";

const DOCUSEAL_TEMPLATES_PDF = "https://api.docuseal.com/templates/pdf";

function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

/** Upload du PDF source : S3 en priorité, sinon repli Cloudinary (comme les contrats marque). */
async function uploadContratPdf(
  buffer: Buffer,
  talentId: string,
  safeName: string
): Promise<string> {
  if (isS3Configured()) {
    const key = buildKey(
      "glowup-contrats-talents",
      `${talentId}/${Date.now()}-${safeName}.pdf`
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
    folder: "glowup-contrats-talents",
    public_id: `${talentId}-${Date.now()}-${safeName}`,
    resource_type: "auto",
  });
  return uploaded.secure_url;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const user = session.user as { role: string };
    if (!CONTRAT_TALENT_ROLES.includes(user.role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const contrats = await prisma.talentContrat.findMany({
      where: { talentId: id },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { prenom: true, nom: true } },
      },
    });

    return NextResponse.json({ contrats });
  } catch (error) {
    console.error("Erreur liste contrats talent:", error);
    return NextResponse.json(
      { error: "Erreur lors du chargement des contrats" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const user = session.user as { id: string; role: string };
    if (!CONTRAT_TALENT_ROLES.includes(user.role)) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour envoyer un contrat en signature" },
        { status: 403 }
      );
    }

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

    const talent = await prisma.talent.findUnique({
      where: { id },
      select: { id: true, prenom: true, nom: true, email: true },
    });
    if (!talent) {
      return NextResponse.json({ error: "Talent non trouvé" }, { status: 404 });
    }
    if (!talent.email?.trim()) {
      return NextResponse.json(
        { error: "Ce talent n'a pas d'email renseigné" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const titreRaw = formData.get("titre");
    const avecSignatureAgenceRaw = formData.get("avecSignatureAgence");

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

    const titre =
      (typeof titreRaw === "string" && titreRaw.trim()) ||
      file.name.replace(/\.pdf$/i, "") ||
      "Contrat";
    const avecSignatureAgence = avecSignatureAgenceRaw !== "false";

    const buffer = Buffer.from(await file.arrayBuffer());

    // 1. Upload du PDF source (S3 en priorité, sinon Cloudinary)
    const safeName = titre
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "contrat";
    const fichierUrl = await uploadContratPdf(buffer, talent.id, safeName);

    // 2. Créer un template DocuSeal vide (les champs seront placés dans le builder)
    const templatePayload = {
      name: `Contrat ${talent.prenom} ${talent.nom} — ${titre}`,
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
      console.error("DocuSeal templates/pdf error:", templateRes.status, errText);
      return NextResponse.json(
        { error: "Erreur DocuSeal (création template): " + (errText || templateRes.statusText) },
        { status: 502 }
      );
    }

    const templateData = (await templateRes.json()) as { id?: number };
    const templateId = templateData.id;
    if (templateId == null) {
      console.error("DocuSeal template response missing id:", templateData);
      return NextResponse.json(
        { error: "Réponse DocuSeal invalide (template id manquant)" },
        { status: 502 }
      );
    }

    // 3. Créer le contrat en BROUILLON
    const contrat = await prisma.talentContrat.create({
      data: {
        talentId: talent.id,
        titre,
        fichierUrl,
        docusealTemplateId: Number(templateId),
        avecSignatureAgence,
        createdById: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      contrat: { id: contrat.id, titre: contrat.titre, statut: contrat.statut },
    });
  } catch (error) {
    console.error("Erreur création contrat talent:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création du contrat" },
      { status: 500 }
    );
  }
}
