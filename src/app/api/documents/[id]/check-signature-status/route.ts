// GET /api/documents/[id]/check-signature-status — Vérifier le statut de signature chez DocuSeal et mettre à jour la DB
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DOCUSEAL_API_BASE = "https://api.docuseal.com";

type DocuSealSubmitter = { status?: string; completed_at?: string | null };
type DocuSealSubmission = {
  id?: number;
  submitters?: DocuSealSubmitter[];
  documents?: Array<{ url?: string }>;
  combined_document_url?: string | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await params;
    const key = process.env.DOCUSEAL_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: "DocuSeal non configuré" },
        { status: 503 }
      );
    }

    const document = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        signatureStatus: true,
        signatureSubmissionId: true,
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });
    }
    if (document.type !== "DEVIS") {
      return NextResponse.json(
        { error: "Seuls les devis peuvent être vérifiés" },
        { status: 400 }
      );
    }
    const submissionId = document.signatureSubmissionId?.trim();
    if (!submissionId) {
      return NextResponse.json(
        { error: "Aucune soumission DocuSeal liée" },
        { status: 400 }
      );
    }

    const res = await fetch(`${DOCUSEAL_API_BASE}/submissions/${submissionId}`, {
      method: "GET",
      headers: { "X-Auth-Token": key },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("DocuSeal GET submission error:", res.status, text);
      return NextResponse.json(
        { error: "Erreur DocuSeal: " + (text || res.statusText) },
        { status: 502 }
      );
    }

    const data = (await res.json()) as DocuSealSubmission;
    const submitters = data.submitters ?? [];
    const total = submitters.length;
    const completedCount = submitters.filter(
      (s) => String(s.status).toLowerCase() === "completed"
    ).length;
    const allCompleted = total > 0 && completedCount >= total;

    const documentUrl =
      (data.combined_document_url?.trim() ||
        (Array.isArray(data.documents) && data.documents[0]?.url
          ? data.documents[0].url.trim()
          : undefined)) ?? undefined;

    const now = new Date();
    await prisma.document.update({
      where: { id },
      data: {
        signaturesCount: completedCount,
        signaturesTotal: total,
        ...(allCompleted
          ? {
              signatureStatus: "SIGNED",
              signatureSignedAt: now,
              ...(documentUrl ? { signedDocumentUrl: documentUrl } : {}),
            }
          : {}),
      },
    });

    return NextResponse.json({
      success: true,
      signaturesCount: completedCount,
      signaturesTotal: total,
      signatureStatus: allCompleted ? "SIGNED" : document.signatureStatus,
    });
  } catch (error) {
    console.error("check-signature-status:", error);
    return NextResponse.json(
      { error: "Erreur lors de la vérification" },
      { status: 500 }
    );
  }
}
