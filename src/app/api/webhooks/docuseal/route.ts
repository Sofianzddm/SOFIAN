// POST /api/webhooks/docuseal — Réception des événements DocuSeal (signature complétée, etc.)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { renderSignatureCompletedEmail } from "@/lib/emails/signature-completed";

type DocuSealPayload = {
  event_type?: string;
  event_name?: string;
  submission?: { id?: number };
  id?: number;
  submission_id?: number;
  data?: { id?: number; submission_id?: number };
  document_url?: string;
  documents?: Array<{ url?: string }>;
  submitter?: { email?: string };
  submitters?: Array<{ email?: string; completed_at?: string }>;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as DocuSealPayload;

    const eventType = body.event_type ?? body.event_name ?? "";
    const isFormCompleted = eventType === "form.completed";
    const isSubmissionCompleted =
      eventType === "submission.completed" || eventType === "SubmissionCompleted";
    const isCompleted = isFormCompleted || isSubmissionCompleted;

    if (!isCompleted) {
      return NextResponse.json({ received: true, ignored: true });
    }

    const submissionId =
      body.submission?.id != null
        ? String(body.submission.id)
        : body.id != null
          ? String(body.id)
          : body.submission_id != null
            ? String(body.submission_id)
            : body.data?.id != null
              ? String(body.data.id)
              : body.data?.submission_id != null
                ? String(body.data.submission_id)
                : null;

    if (!submissionId) {
      console.warn("Webhook DocuSeal: submission id manquant", body);
      return NextResponse.json({ received: true, error: "submission id manquant" }, { status: 400 });
    }

    const document = await prisma.document.findFirst({
      where: { signatureSubmissionId: submissionId },
      select: { id: true, createdById: true, signaturesTotal: true },
    });

    if (!document) {
      return NextResponse.json({ received: true, not_found: true });
    }

    const systemUserId =
      document.createdById ??
      (await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } }))?.id;

    if (!systemUserId) {
      console.error("Webhook DocuSeal: aucun userId pour DocumentEvent");
      return NextResponse.json({ received: true, error: "config" }, { status: 500 });
    }

    const documentUrl =
      body.document_url?.trim() ||
      (Array.isArray(body.documents) && body.documents[0]?.url ? body.documents[0].url.trim() : undefined);
    const signerEmail =
      body.submitter?.email?.trim() ||
      (Array.isArray(body.submitters) && body.submitters.length > 0)
        ? body.submitters.find((s) => s.email)?.email?.trim()
        : undefined;

    const now = new Date();
    const updateData: {
      signedDocumentUrl?: string;
      signatureStatus?: string;
      signatureSignedAt?: Date;
      signaturesCount?: number | { increment: number };
    } = {};
    if (documentUrl) updateData.signedDocumentUrl = documentUrl;
    if (isSubmissionCompleted) {
      updateData.signatureStatus = "SIGNED";
      updateData.signatureSignedAt = now;
      // Tous ont signé : forcer le compteur au total (DocuSeal n'envoie pas toujours un form.completed par signataire)
      updateData.signaturesCount = document.signaturesTotal ?? 2;
    } else if (isFormCompleted) {
      updateData.signaturesCount = { increment: 1 };
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.document.update({
        where: { id: document.id },
        data: updateData,
      });
    }

    // Email "Devis signé" quand toutes les parties ont signé (Resend)
    if (isSubmissionCompleted && documentUrl) {
      const resendKey = process.env.RESEND_API_KEY;
      const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
      if (resendKey && fromEmail) {
        const docFull = await prisma.document.findUnique({
          where: { id: document.id },
          select: {
            reference: true,
            montantHT: true,
            signedDocumentUrl: true,
            signatureSignedAt: true,
            collaboration: {
              select: {
                talent: { select: { prenom: true, nom: true } },
                marque: { select: { nom: true } },
              },
            },
            createdBy: { select: { email: true, prenom: true, nom: true } },
          },
        });
        const creator = docFull?.createdBy;
        const toEmail = creator?.email?.trim();
        if (docFull && toEmail) {
          const talent = docFull.collaboration?.talent;
          const marque = docFull.collaboration?.marque;
          const signedUrl = docFull.signedDocumentUrl ?? documentUrl;
          const signedAt = docFull.signatureSignedAt ?? now;
          const recipientName =
            [creator.prenom, creator.nom].filter(Boolean).join(" ") || "équipe";
          try {
            const resend = new Resend(resendKey);
            await resend.emails.send({
              from: `Glow Up Agence <${fromEmail}>`,
              to: toEmail,
              subject: `Devis ${docFull.reference} signé — ${talent?.prenom ?? ""} ${talent?.nom ?? ""} × ${marque?.nom ?? ""}`,
              html: renderSignatureCompletedEmail({
                recipientName,
                documentReference: docFull.reference,
                talentPrenom: talent?.prenom ?? "",
                talentNom: talent?.nom ?? "",
                marqueNom: marque?.nom ?? "",
                montantHT: Number(docFull.montantHT) ?? 0,
                signedAt: signedAt.toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                signedDocumentUrl: signedUrl,
              }),
            });
          } catch (err) {
            console.error("Webhook DocuSeal: envoi email devis signé échoué", err);
          }
        }
      }
    }

    // Un événement "Signé par [email]" par form.completed (un signataire a signé) ; pas d’event en double sur submission.completed
    if (isFormCompleted) {
      const eventDescription = signerEmail ? `Signé par ${signerEmail}` : "Document signé électroniquement";
      await prisma.documentEvent.create({
        data: {
          documentId: document.id,
          type: "SIGNED",
          description: eventDescription,
          userId: systemUserId,
        },
      });
    }

    return NextResponse.json({ received: true, updated: document.id });
  } catch (error) {
    console.error("Erreur webhook DocuSeal:", error);
    return NextResponse.json(
      { error: "Erreur traitement webhook" },
      { status: 500 }
    );
  }
}
