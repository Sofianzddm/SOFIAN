// GET /api/documents/[id]/ouvrir — Ouvre le devis dans le navigateur.
// Head of Influence : PDF du devis même si le 2e signataire n'a pas signé.
// On ne redirige jamais vers une URL DocuSeal (elles exigent la clé API → "Not authorized").
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

function isDocusealUrl(url: string): boolean {
  return /docuseal\.(com|cloud)/i.test(url);
}

function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).toString("utf8") === "%PDF";
}

async function fetchPdfBuffer(url: string, apiKey?: string): Promise<Buffer | null> {
  try {
    const headers: Record<string, string> = {};
    if (apiKey && isDocusealUrl(url)) {
      headers["X-Auth-Token"] = apiKey;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!isPdfBuffer(buf)) return null;
    return buf;
  } catch {
    return null;
  }
}

function pdfResponse(buf: Buffer, filename: string): NextResponse {
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Length": buf.length.toString(),
      "Cache-Control": "private, no-store",
    },
  });
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
        reference: true,
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

    const filename = `${document.reference || "devis"}.pdf`;
    const generatedPdf = new URL(`/api/documents/${id}/pdf`, request.url);
    const key = process.env.DOCUSEAL_API_KEY;

    // Tant que le devis n'est pas entièrement signé : PDF Glow Up (pas l'URL DocuSeal).
    if (!fullySigned) {
      return NextResponse.redirect(generatedPdf);
    }

    let signedUrl = document.signedDocumentUrl?.trim() || "";
    const submissionId = document.signatureSubmissionId?.trim();

    if (submissionId && key && (!signedUrl || isDocusealUrl(signedUrl))) {
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
      const buf = await fetchPdfBuffer(signedUrl, key);
      if (buf) return pdfResponse(buf, filename);
    }

    return NextResponse.redirect(generatedPdf);
  } catch (error) {
    console.error("ouvrir devis:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'ouverture du devis" },
      { status: 500 }
    );
  }
}
