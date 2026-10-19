// GET  /api/signatures — Liste des documents en signature (hub entreprise)
// POST /api/signatures — Upload PDF + template DocuSeal vide → BROUILLON
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadBufferToS3, buildKey, isS3Configured } from "@/lib/s3";
import {
  SIGNATURE_DOCUMENT_ROLES,
  validateSignatairesInput,
} from "@/lib/signature-documents";

const DOCUSEAL_TEMPLATES_PDF = "https://api.docuseal.com/templates/pdf";

function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

async function uploadSignaturePdf(
  buffer: Buffer,
  safeName: string
): Promise<string> {
  if (isS3Configured()) {
    const key = buildKey("glowup-signatures", `${Date.now()}-${safeName}.pdf`);
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
    folder: "glowup-signatures",
    public_id: `${Date.now()}-${safeName}`,
    resource_type: "auto",
  });
  return uploaded.secure_url;
}

type HistoryStatut = "BROUILLON" | "EN_ATTENTE" | "SIGNE";
type HistorySource = "hub" | "talent" | "collab";

type HistoryItem = {
  id: string;
  source: HistorySource;
  titre: string;
  statut: HistoryStatut;
  fichierUrl: string | null;
  signedDocumentUrl: string | null;
  submissionId: string | null;
  signataires: unknown;
  signaturesCompleted: number;
  signaturesTotal: number;
  envoyeAt: string | null;
  signeAt: string | null;
  createdAt: string;
  createdBy: { prenom: string; nom: string } | null;
  meta: {
    label: string;
    href: string | null;
    talentId?: string;
    talentNom?: string;
    marqueNom?: string;
    reference?: string;
  };
};

function mapTalentStatut(statut: string): HistoryStatut {
  if (statut === "SIGNE") return "SIGNE";
  if (statut === "BROUILLON") return "BROUILLON";
  return "EN_ATTENTE";
}

function mapCollabStatut(statut: string): HistoryStatut | null {
  if (statut === "NON_ENVOYE") return null;
  if (statut === "SIGNE") return "SIGNE";
  if (statut === "BROUILLON") return "BROUILLON";
  return "EN_ATTENTE";
}

async function fetchDocusealSignedUrl(
  submissionId: string,
  apiKey: string
): Promise<string | null> {
  try {
    const res = await fetch(`https://api.docuseal.com/submissions/${submissionId}`, {
      headers: { "X-Auth-Token": apiKey },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      documents?: Array<{ url?: string }>;
      combined_document_url?: string;
    };
    return (
      data.documents?.[0]?.url?.trim() ||
      data.combined_document_url?.trim() ||
      null
    );
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const user = session.user as { role: string };
    if (!SIGNATURE_DOCUMENT_ROLES.includes(user.role as (typeof SIGNATURE_DOCUMENT_ROLES)[number])) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const [hubDocs, talentContrats, collabContrats] = await Promise.all([
      prisma.signatureDocument.findMany({
        include: { createdBy: { select: { prenom: true, nom: true } } },
      }),
      prisma.talentContrat.findMany({
        include: {
          talent: { select: { id: true, prenom: true, nom: true, email: true } },
          createdBy: { select: { prenom: true, nom: true } },
        },
      }),
      prisma.collaboration.findMany({
        where: {
          OR: [
            { contratSubmissionId: { not: null } },
            { contratDocusealTemplateId: { not: null } },
            { contratStatut: { not: "NON_ENVOYE" } },
          ],
        },
        include: {
          talent: { select: { id: true, prenom: true, nom: true } },
          marque: { select: { nom: true } },
        },
      }),
    ]);

    const history: HistoryItem[] = [];

    for (const doc of hubDocs) {
      history.push({
        id: doc.id,
        source: "hub",
        titre: doc.titre,
        statut: doc.statut as HistoryStatut,
        fichierUrl: doc.fichierUrl,
        signedDocumentUrl: doc.signedDocumentUrl,
        submissionId: doc.submissionId,
        signataires: doc.signataires,
        signaturesCompleted: doc.signaturesCompleted,
        signaturesTotal: doc.signaturesTotal,
        envoyeAt: doc.envoyeAt?.toISOString() ?? null,
        signeAt: doc.signeAt?.toISOString() ?? null,
        createdAt: doc.createdAt.toISOString(),
        createdBy: doc.createdBy,
        meta: { label: "Signatures", href: null },
      });
    }

    for (const c of talentContrats) {
      const talentNom = `${c.talent.prenom} ${c.talent.nom}`.trim();
      history.push({
        id: c.id,
        source: "talent",
        titre: c.titre,
        statut: mapTalentStatut(c.statut),
        fichierUrl: c.fichierUrl,
        signedDocumentUrl: c.signedDocumentUrl,
        submissionId: c.submissionId,
        signataires: [
          {
            name: talentNom,
            email: c.talent.email || "",
          },
          ...(c.avecSignatureAgence
            ? [
                {
                  name: "Glow Up Agence",
                  email:
                    process.env.AGENCE_SIGNATURE_EMAIL?.trim() ||
                    process.env.NEXT_PUBLIC_AGENCE_EMAIL?.trim() ||
                    "contrat@glowupagence.fr",
                },
              ]
            : []),
        ],
        signaturesCompleted:
          c.statut === "SIGNE" ? (c.avecSignatureAgence ? 2 : 1) : c.talentSigneAt ? 1 : 0,
        signaturesTotal: c.avecSignatureAgence ? 2 : 1,
        envoyeAt: c.envoyeAt?.toISOString() ?? null,
        signeAt: c.signeAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        createdBy: c.createdBy,
        meta: {
          label: "Contrat talent",
          href: `/talents/${c.talent.id}`,
          talentId: c.talent.id,
          talentNom,
        },
      });
    }

    for (const collab of collabContrats) {
      const statut = mapCollabStatut(collab.contratStatut);
      if (!statut) continue;
      const talentNom = `${collab.talent.prenom} ${collab.talent.nom}`.trim();
      const titre =
        collab.contratTitre?.trim() ||
        `Contrat ${talentNom} x ${collab.marque.nom}`;
      history.push({
        id: collab.id,
        source: "collab",
        titre,
        statut,
        fichierUrl: collab.contratFichierUrl,
        signedDocumentUrl: null,
        submissionId: collab.contratSubmissionId,
        signataires: collab.contratSignataires,
        signaturesCompleted: statut === "SIGNE" ? 1 : 0,
        signaturesTotal: Array.isArray(collab.contratSignataires)
          ? collab.contratSignataires.length
          : 1,
        envoyeAt: collab.contratEnvoyeAt?.toISOString() ?? null,
        signeAt: collab.contratSigneAt?.toISOString() ?? null,
        createdAt: (collab.contratEnvoyeAt ?? collab.createdAt).toISOString(),
        createdBy: null,
        meta: {
          label: "Contrat collab",
          href: `/collaborations/${collab.id}`,
          talentId: collab.talent.id,
          talentNom,
          marqueNom: collab.marque.nom,
          reference: collab.reference,
        },
      });
    }

    // Enrichir les PDF signés manquants via DocuSeal (historique collab / anciens talent)
    const docusealKey = process.env.DOCUSEAL_API_KEY?.trim();
    if (docusealKey) {
      const missing = history.filter(
        (h) => h.statut === "SIGNE" && !h.signedDocumentUrl && h.submissionId
      );
      await Promise.all(
        missing.map(async (item) => {
          const url = await fetchDocusealSignedUrl(item.submissionId!, docusealKey);
          if (url) item.signedDocumentUrl = url;
        })
      );
    }

    history.sort((a, b) => {
      const da = a.signeAt || a.envoyeAt || a.createdAt;
      const db = b.signeAt || b.envoyeAt || b.createdAt;
      return db.localeCompare(da);
    });

    // Compat : `documents` = uniquement hub (actions upload/relance)
    const documents = history.filter((h) => h.source === "hub");

    return NextResponse.json({ history, documents });
  } catch (error) {
    console.error("GET /api/signatures:", error);
    return NextResponse.json(
      { error: "Erreur lors du chargement des documents" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const user = session.user as { id: string; role: string };
    if (!SIGNATURE_DOCUMENT_ROLES.includes(user.role as (typeof SIGNATURE_DOCUMENT_ROLES)[number])) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour envoyer un document en signature" },
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
      "Document";

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName =
      titre
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9-_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase() || "document";

    const fichierUrl = await uploadSignaturePdf(buffer, safeName);

    const templatePayload = {
      name: `Signature — ${titre}`,
      documents: [
        {
          name: "document",
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
      console.error("DocuSeal templates/pdf (signatures) error:", templateRes.status, errText);
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

    const document = await prisma.signatureDocument.create({
      data: {
        titre,
        fichierUrl,
        docusealTemplateId: Number(templateId),
        signataires: validated.signataires,
        signaturesTotal: validated.signataires.length,
        createdById: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        titre: document.titre,
        statut: document.statut,
      },
    });
  } catch (error) {
    console.error("POST /api/signatures:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création du document" },
      { status: 500 }
    );
  }
}
