// GET /api/documents/[id]/ouvrir — Ouvre le devis (PDF DocuSeal si dispo, sinon PDF généré).
// La Head of Influence peut ouvrir même si le 2e signataire n'a pas encore signé.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DOCUSEAL_API_BASE = "https://api.docuseal.com";
const ROLES_OUVRIR = [
  "ADMIN",
  "HEAD_OF",
  "HEAD_OF_INFLUENCE",
  "HEAD_OF_SALES",
  "TM",
];
const ROLES_AVANT_FIN_SIGNATURE = ["HEAD_OF", "HEAD_OF_INFLUENCE"];

type DocuSealSubmission = {
  documents?: Array<{ url?: string }>;
  combined_document_url?: string | null;
  submitters?: Array<{
    status?: string;
    documents?: Array<{ url?: string }>;
  }>;
};

function pickDocumentUrl(data: DocuSealSubmission): string | undefined {
  const combined = data.combined_document_url?.trim();
  if (combined) return combined;
  const fromDocuments = data.documents?.[0]?.url?.trim();
  if (fromDocuments) return fromDocuments;
  const fromSubmitter = data.submitters
    ?.find((s) => String(s.status).toLowerCase() === "completed")
    ?.documents?.[0]?.url?.trim();
  return fromSubmitter || undefined;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const role = (session.user as { role?: string }).role ?? "";
    if (!ROLES_OUVRIR.includes(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await params;
    const document = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        signatureStatus: true,
        signatureSubmissionId: true,
        signedDocumentUrl: true,
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });
    }
    if (document.type !== "DEVIS") {
      return NextResponse.json({ error: "Seuls les devis peuvent être ouverts ainsi" }, { status: 400 });
    }

    const canOpenAvantFin = ROLES_AVANT_FIN_SIGNATURE.includes(role);
    const fullySigned = document.signatureStatus === "SIGNED";
    if (!fullySigned && !canOpenAvantFin) {
      return NextResponse.json(
        { error: "Le devis n'est pas encore entièrement signé" },
        { status: 403 }
      );
    }

    const pdfFallback = new URL(`/api/documents/${id}/pdf`, request.url);

    let signedUrl = document.signedDocumentUrl?.trim() || "";
    const submissionId = document.signatureSubmissionId?.trim();
    const key = process.env.DOCUSEAL_API_KEY;

    if (submissionId && key && (!signedUrl || !fullySigned)) {
      try {
        const res = await fetch(`${DOCUSEAL_API_BASE}/submissions/${submissionId}`, {
          method: "GET",
          headers: { "X-Auth-Token": key },
        });
        if (res.ok) {
          const data = (await res.json()) as DocuSealSubmission;
          const documentUrl = pickDocumentUrl(data);
          if (documentUrl) {
            signedUrl = documentUrl;
            await prisma.document.update({
              where: { id },
              data: { signedDocumentUrl: documentUrl },
            });
          }
        }
      } catch (err) {
        console.error("ouvrir devis: DocuSeal", err);
      }
    }

    if (signedUrl) {
      return NextResponse.redirect(signedUrl);
    }

    return NextResponse.redirect(pdfFallback);
  } catch (error) {
    console.error("ouvrir devis:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'ouverture du devis" },
      { status: 500 }
    );
  }
}
