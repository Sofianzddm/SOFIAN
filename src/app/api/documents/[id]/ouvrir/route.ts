// GET /api/documents/[id]/ouvrir — Ouvre le devis (PDF avec les signatures déjà apposées).
// Head of Influence : même si le 2e signataire n'a pas encore signé.
// On proxifie toujours le PDF DocuSeal (les URLs brutes expirent / exigent la clé API).
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

function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).toString("utf8") === "%PDF";
}

function isDocusealUrl(url: string): boolean {
  return /docuseal\.(com|cloud)/i.test(url);
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

/** PDF DocuSeal à jour, y compris partiellement signé (1/2). */
async function fetchDocusealPartialPdf(
  submissionId: string,
  apiKey: string
): Promise<Buffer | null> {
  const res = await fetch(
    `${DOCUSEAL_API_BASE}/submissions/${submissionId}/documents?merge=true`,
    { headers: { "X-Auth-Token": apiKey } }
  );
  if (!res.ok) {
    console.error("DocuSeal GET documents:", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as { documents?: Array<{ url?: string }> };
  const url = data.documents?.[0]?.url?.trim();
  if (!url) return null;
  return fetchPdfBuffer(url, apiKey);
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
    const submissionId = document.signatureSubmissionId?.trim();

    if (submissionId && key) {
      try {
        const partial = await fetchDocusealPartialPdf(submissionId, key);
        if (partial) return pdfResponse(partial, filename);
      } catch (err) {
        console.error("ouvrir devis: DocuSeal documents", err);
      }
    }

    // Upload manuel (Cloudinary / S3), pas une URL DocuSeal expirée
    const stored = document.signedDocumentUrl?.trim() || "";
    if (stored && !isDocusealUrl(stored)) {
      const buf = await fetchPdfBuffer(stored);
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
