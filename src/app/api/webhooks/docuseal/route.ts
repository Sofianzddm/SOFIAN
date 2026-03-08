// POST /api/webhooks/docuseal — Réception des événements DocuSeal (signature complétée, etc.)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { getSignatureCompletedHtml } from "@/lib/emails/templates";

type DocuSealPayload = {
  event_type?: string;
  event_name?: string;
  submission?: { id?: number };
  id?: number;
  submission_id?: number;
  data?: {
    id?: number;
    submission_id?: number;
    submitters?: Array<{ email?: string; name?: string }>;
  };
  document_url?: string;
  documents?: Array<{ url?: string }>;
  submitter?: { email?: string };
  submitters?: Array<{ email?: string; completed_at?: string }>;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as DocuSealPayload;

  // Logger TOUT ce qui arrive
  console.log("=== DOCUSEAL WEBHOOK ===");
  console.log("event_type:", body.event_type ?? body.event_name ?? "(absent)");
  console.log("body complet:", JSON.stringify(body, null, 2));

  // Retourner 200 immédiatement pour éviter retry DocuSeal (traitement en arrière-plan)
  processDocuSealWebhook(body).catch((err) =>
    console.error("DocuSeal webhook processing error:", err)
  );
  return NextResponse.json({ received: true }, { status: 200 });
}

async function processDocuSealWebhook(body: DocuSealPayload) {
  try {
    const eventType = body.event_type ?? body.event_name ?? "";
    const isFormCompleted = eventType === "form.completed";
    const isSubmissionCompleted =
      eventType === "submission.completed" || eventType === "SubmissionCompleted";
    const isCompleted = isFormCompleted || isSubmissionCompleted;

    if (!isCompleted) {
      console.log("DocuSeal webhook: event ignoré", eventType);
      return;
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
      return;
    }

    const document = await prisma.document.findFirst({
      where: { signatureSubmissionId: submissionId },
      select: { id: true, createdById: true, signaturesTotal: true },
    });

    if (!document) {
      console.log("DocuSeal webhook: document non trouvé pour submissionId", submissionId);
      return;
    }

    const systemUserId =
      document.createdById ??
      (await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } }))?.id;

    if (!systemUserId) {
      console.error("Webhook DocuSeal: aucun userId pour DocumentEvent");
      return;
    }

    const documentUrl =
      body.document_url?.trim() ||
      (Array.isArray(body.documents) && body.documents[0]?.url ? body.documents[0].url.trim() : undefined);
    const submitters = body.submitters ?? [];
    const signerEmail =
      body.submitter?.email?.trim() ||
      (Array.isArray(submitters) && submitters.length > 0
        ? submitters.find((s) => s.email)?.email?.trim()
        : undefined);

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

    // Email "Devis signé" quand toutes les parties ont signé (Resend) — on envoie même si document_url absent du payload
    if (isSubmissionCompleted) {
      let signedDocumentUrl = documentUrl;
      if (!signedDocumentUrl) {
        const docAfter = await prisma.document.findUnique({
          where: { id: document.id },
          select: { signedDocumentUrl: true },
        });
        signedDocumentUrl = docAfter?.signedDocumentUrl ?? undefined;
      }
      if (!signedDocumentUrl) {
        const key = process.env.DOCUSEAL_API_KEY;
        if (key) {
          try {
            const r = await fetch(`https://api.docuseal.com/submissions/${submissionId}`, {
              headers: { "X-Auth-Token": key },
            });
            if (r.ok) {
              const sub = (await r.json()) as { combined_document_url?: string; documents?: Array<{ url?: string }> };
              const url = sub.combined_document_url?.trim() || sub.documents?.[0]?.url?.trim();
              if (url) {
                await prisma.document.update({
                  where: { id: document.id },
                  data: { signedDocumentUrl: url },
                });
                signedDocumentUrl = url;
              }
            }
          } catch (e) {
            console.warn("Webhook DocuSeal: fetch submission pour URL signé", e);
          }
        }
      }

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
            collaborationId: true,
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
        const creatorEmail = creator?.email?.trim();
        const submittersFromPayload = body.data?.submitters ?? body.submitters ?? [];
        const signatoryEmails = (Array.isArray(submittersFromPayload) ? submittersFromPayload : [])
          .map((s: { email?: string }) => s?.email?.trim())
          .filter((e): e is string => !!e);
        const emails = Array.from(new Set([...(creatorEmail ? [creatorEmail] : []), ...signatoryEmails]));
        console.log("Envoi confirmation à:", emails);
        if (docFull && emails.length > 0) {
          const talent = docFull.collaboration?.talent;
          const marque = docFull.collaboration?.marque;
          const finalSignedUrl = signedDocumentUrl ?? docFull.signedDocumentUrl ?? (typeof process.env.NEXT_PUBLIC_BASE_URL === "string" && docFull.collaborationId ? `${process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "")}/collaborations/${docFull.collaborationId}` : "");
          const signedAt = docFull.signatureSignedAt ?? now;
          const recipientName = creator
            ? [creator.prenom, creator.nom].filter(Boolean).join(" ") || "équipe"
            : "équipe";
          try {
            const signedAtStr = signedAt.toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
            const html = getSignatureCompletedHtml({
              recipientName,
              documentReference: docFull.reference,
              talentPrenom: talent?.prenom ?? "",
              talentNom: talent?.nom ?? "",
              marqueNom: marque?.nom ?? "",
              montantHT: Number(docFull.montantHT) ?? 0,
              signedAt: signedAtStr,
              signedDocumentUrl: finalSignedUrl || "#",
            });
            const resend = new Resend(resendKey);
            await resend.emails.send({
              from: `Glow Up Agence <${fromEmail}>`,
              to: emails,
              subject: `Devis ${docFull.reference} signé — ${talent?.prenom ?? ""} ${talent?.nom ?? ""} × ${marque?.nom ?? ""}`,
              html,
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

    console.log("DocuSeal webhook: traitement OK, document.id =", document.id);
  } catch (error) {
    console.error("Erreur webhook DocuSeal (traitement):", error);
  }
}
