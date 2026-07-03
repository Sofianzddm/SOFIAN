// POST /api/webhooks/docuseal — Réception des événements DocuSeal (signature complétée, etc.)
import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { SignatureCompletedEmail } from "@/lib/emails/SignatureCompletedEmail";
import { ContratGlowUpEmail } from "@/lib/emails/ContratGlowUpEmail";

type DocuSealPayload = {
  event_type?: string;
  event_name?: string;
  submission?: { id?: number };
  id?: number;
  submission_id?: number;
  data?: {
    id?: number;
    submission_id?: number;
    submission?: { id?: number };
    submitters?: Array<{ email?: string; name?: string; role?: string }>;
    documents?: Array<{ url?: string }>;
    audit_log_url?: string;
  };
  document_url?: string;
  documents?: Array<{ url?: string }>;
  submitter?: { email?: string };
  submitters?: Array<{ email?: string; completed_at?: string }>;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as DocuSealPayload;

  console.log("WEBHOOK RECU", body.event_type ?? body.event_name ?? "(absent)");
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

    // ——— submission.completed : flow dédié (body.data.id = ID submission DocuSeal = signatureSubmissionId en DB) ———
    if (isSubmissionCompleted) {
      // Ne pas utiliser body.data.submitters[].id (ID signataire) — uniquement body.data.id (ID submission)
      const submissionId =
        body.data?.id != null ? String(body.data.id) : null;

      if (!submissionId) {
        console.warn("Webhook DocuSeal: submission.completed sans body.data.id (requis pour signatureSubmissionId)", body);
        return;
      }

      try {
        const document = await prisma.document.findFirst({
          where: { signatureSubmissionId: submissionId },
          include: {
            collaboration: {
              include: { talent: true, marque: true },
            },
          },
        });

        if (!document) {
          const collabContrat = await prisma.collaboration.findFirst({
            where: { contratSubmissionId: submissionId },
          });
          if (collabContrat) {
            const now = new Date();
            await prisma.collaboration.update({
              where: { id: collabContrat.id },
              data: {
                contratStatut: "SIGNE",
                contratSigneAt: now,
                ...(collabContrat.contratTalentSigneAt == null
                  ? { contratTalentSigneAt: now }
                  : {}),
              },
            });
            console.log(
              "Collaboration contrat: submission.completed → SIGNE",
              collabContrat.id
            );
          } else if (await handleTalentContratCompleted(submissionId, body)) {
            // Contrat talent (fiche talent) marqué SIGNE
          } else {
            console.log(
              "Document non trouvé pour submission:",
              body.data?.id ?? submissionId
            );
          }
          return;
        }
        console.log("DOCUMENT TROUVE", document.id);

        const signedDocumentUrl =
          body.data?.documents?.[0]?.url ??
          body.document_url?.trim() ??
          body.documents?.[0]?.url?.trim();
        const now = new Date();

        await prisma.document.update({
          where: { id: document.id },
          data: {
            signatureStatus: "SIGNED",
            signatureSignedAt: now,
            ...(signedDocumentUrl ? { signedDocumentUrl } : {}),
            signaturesCount: 2,
          },
        });
        console.log("DOCUMENT MIS A JOUR");

        const emails = (body.data?.submitters ?? body.submitters ?? [])
          .map((s: { email?: string }) => s?.email?.trim())
          .filter((e): e is string => !!e);
        console.log("=== ENVOI EMAIL CONFIRMATION ===");
        console.log("destinataires:", emails);

        const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
        const resendKey = process.env.RESEND_API_KEY;
        if (!resendKey || !fromEmail) {
          console.warn(
            "Webhook DocuSeal: RESEND_API_KEY ou RESEND_FROM_EMAIL manquant (vérifier Vercel → Settings → Environment Variables), email non envoyé"
          );
          return;
        }
        if (emails.length === 0) {
          console.warn("Webhook DocuSeal: aucun destinataire (body.data.submitters vide), email non envoyé");
          return;
        }

        const talent = document.collaboration?.talent;
        const marque = document.collaboration?.marque;
        const finalSignedUrl =
          signedDocumentUrl ??
          (document as { signedDocumentUrl?: string | null }).signedDocumentUrl ??
          (document.collaborationId && process.env.NEXT_PUBLIC_BASE_URL
            ? `${String(process.env.NEXT_PUBLIC_BASE_URL).replace(/\/$/, "")}/collaborations/${document.collaborationId}`
            : "#");
        const montantHT = Number((document as { montantHT?: unknown }).montantHT) ?? 0;
        const talentNomFull = [talent?.prenom, talent?.nom].filter(Boolean).join(" ") || "";
        const clientSubmitter = body.data?.submitters?.find((s) => s.role === "Client");
        const signerName = clientSubmitter?.name?.trim() ?? "vous";

        let html: string;
        try {
          html = await render(
            React.createElement(SignatureCompletedEmail, {
              signerName,
              documentReference: document.reference,
              talentNom: talentNomFull,
              marqueNom: marque?.nom ?? "",
              montantHT,
              signedDocumentUrl: finalSignedUrl,
              auditLogUrl: body.data?.audit_log_url ?? undefined,
            })
          );
          console.log("HTML généré, longueur:", html.length);
        } catch (err) {
          console.error("Erreur render React Email:", err);
          throw err;
        }

        const resend = new Resend(resendKey);
        const sendResult = await resend.emails.send({
          from: fromEmail.includes("<") ? fromEmail : `Glow Up Agence <${fromEmail}>`,
          to: emails,
          subject: `Devis ${document.reference} signé - ${talent?.prenom ?? ""} x ${marque?.nom ?? ""}`,
          html,
        });

        if (sendResult.error) {
          console.error("Webhook DocuSeal: Resend a retourné une erreur:", sendResult.error);
        } else {
          console.log("EMAIL ENVOYE");
          console.log("Webhook DocuSeal: email confirmation envoyé avec succès");
        }
      } catch (err) {
        console.error("Webhook DocuSeal: erreur traitement submission.completed", err);
      }
      return;
    }

    // ——— form.completed / form.started / form.viewed : body.data.id = ID submitter ❌, body.data.submission_id = ID submission ✅ ———
    const submissionIdRaw = body.data?.submission_id ?? body.data?.submission?.id;
    const submissionId = submissionIdRaw != null ? String(submissionIdRaw) : null;

    if (!submissionId) {
      console.warn("Webhook DocuSeal: submission id manquant (body.data.submission_id ou body.data.submission.id)", body);
      return;
    }

    const document = await prisma.document.findFirst({
      where: { signatureSubmissionId: submissionId },
      select: { id: true, createdById: true, signaturesTotal: true },
    });

    if (!document) {
      const collabContrat = await prisma.collaboration.findFirst({
        where: { contratSubmissionId: submissionId },
      });
      if (collabContrat) {
        const submittersRaw = body.submitters ?? body.data?.submitters ?? [];
        const submitters = submittersRaw as Array<{
          completed_at?: string | null;
          status?: string;
        }>;
        const completedCount = submitters.filter((s) => {
          const hasCompletedAt = !!(s.completed_at && String(s.completed_at).trim());
          return hasCompletedAt || s.status === "completed";
        }).length;
        const current = collabContrat.contratStatut;
        let nextStatut = current;
        if (completedCount >= 2) nextStatut = "SIGNE";
        else if (completedCount === 1) nextStatut = "EN_ATTENTE_AGENCE";
        else {
          if (current === "EN_ATTENTE_TALENT") nextStatut = "EN_ATTENTE_AGENCE";
          else if (current === "EN_ATTENTE_AGENCE") nextStatut = "SIGNE";
        }
        const now = new Date();
        await prisma.collaboration.update({
          where: { id: collabContrat.id },
          data: {
            contratStatut: nextStatut,
            ...(nextStatut === "EN_ATTENTE_AGENCE" && !collabContrat.contratTalentSigneAt
              ? { contratTalentSigneAt: now }
              : {}),
            ...(nextStatut === "SIGNE"
              ? {
                  contratSigneAt: now,
                  ...(!collabContrat.contratTalentSigneAt ? { contratTalentSigneAt: now } : {}),
                }
              : {}),
          },
        });
        console.log("Collaboration contrat: form.completed", {
          submissionId,
          completedCount,
          nextStatut,
        });
      } else if (await handleTalentContratFormCompleted(submissionId, body)) {
        // Contrat talent (fiche talent) : statut avancé
      } else {
        console.log(
          "DocuSeal webhook: document non trouvé pour submissionId",
          submissionId
        );
      }
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
      body.data?.documents?.[0]?.url?.trim() ||
      (Array.isArray(body.documents) && body.documents[0]?.url ? body.documents[0].url.trim() : undefined);
    const submitters = body.submitters ?? body.data?.submitters ?? [];
    const signerEmail =
      body.submitter?.email?.trim() ||
      (Array.isArray(submitters) && submitters.length > 0
        ? submitters.find((s: { email?: string }) => s.email)?.email?.trim()
        : undefined);

    const now = new Date();
    const updateData: {
      signedDocumentUrl?: string;
      signaturesCount?: number | { increment: number };
    } = {};
    if (documentUrl) updateData.signedDocumentUrl = documentUrl;
    updateData.signaturesCount = { increment: 1 };

    try {
      await prisma.document.update({
        where: { id: document.id },
        data: updateData,
      });
    } catch (err) {
      console.error("Webhook DocuSeal: erreur update document (form.completed)", err);
      return;
    }
    // Un événement "Signé par [email]" par form.completed (un signataire a signé) ; pas d’event en double sur submission.completed
    const eventDescription = signerEmail ? `Signé par ${signerEmail}` : "Document signé électroniquement";
    try {
      await prisma.documentEvent.create({
        data: {
          documentId: document.id,
          type: "SIGNED",
          description: eventDescription,
          userId: systemUserId,
        },
      });
    } catch (err) {
      console.error("Webhook DocuSeal: erreur création DocumentEvent", err);
    }

    console.log("DocuSeal webhook: traitement form.completed OK, document.id =", document.id);
  } catch (error) {
    console.error("Erreur webhook DocuSeal (traitement):", error);
  }
}

// ============================================
// Contrats talent (fiche talent) — TalentContrat
// ============================================

/** submission.completed → contrat talent SIGNE (+ PDF signé). Renvoie true si un contrat a matché. */
async function handleTalentContratCompleted(
  submissionId: string,
  body: DocuSealPayload
): Promise<boolean> {
  const contrat = await prisma.talentContrat.findFirst({
    where: { submissionId },
  });
  if (!contrat) return false;

  const signedDocumentUrl =
    body.data?.documents?.[0]?.url ??
    body.document_url?.trim() ??
    body.documents?.[0]?.url?.trim();
  const now = new Date();

  await prisma.talentContrat.update({
    where: { id: contrat.id },
    data: {
      statut: "SIGNE",
      signeAt: now,
      ...(contrat.talentSigneAt == null ? { talentSigneAt: now } : {}),
      ...(signedDocumentUrl ? { signedDocumentUrl } : {}),
    },
  });
  console.log("TalentContrat: submission.completed → SIGNE", contrat.id);
  return true;
}

/**
 * form.completed → avance le statut du contrat talent
 * (EN_ATTENTE_TALENT → EN_ATTENTE_AGENCE → SIGNE) et envoie son lien
 * de signature à l'agence quand c'est son tour. Renvoie true si un contrat a matché.
 */
async function handleTalentContratFormCompleted(
  submissionId: string,
  body: DocuSealPayload
): Promise<boolean> {
  const contrat = await prisma.talentContrat.findFirst({
    where: { submissionId },
    include: { talent: { select: { prenom: true, nom: true } } },
  });
  if (!contrat) return false;

  const submittersRaw = body.submitters ?? body.data?.submitters ?? [];
  const submitters = submittersRaw as Array<{
    completed_at?: string | null;
    status?: string;
  }>;
  const completedCount = submitters.filter((s) => {
    const hasCompletedAt = !!(s.completed_at && String(s.completed_at).trim());
    return hasCompletedAt || s.status === "completed";
  }).length;

  const totalSignataires = contrat.avecSignatureAgence ? 2 : 1;
  const current = contrat.statut;
  let nextStatut = current;
  if (completedCount >= totalSignataires) nextStatut = "SIGNE";
  else if (completedCount >= 1) nextStatut = "EN_ATTENTE_AGENCE";
  else {
    if (current === "EN_ATTENTE_TALENT") {
      nextStatut = totalSignataires === 1 ? "SIGNE" : "EN_ATTENTE_AGENCE";
    } else if (current === "EN_ATTENTE_AGENCE") {
      nextStatut = "SIGNE";
    }
  }

  const now = new Date();
  await prisma.talentContrat.update({
    where: { id: contrat.id },
    data: {
      statut: nextStatut,
      ...(nextStatut !== "EN_ATTENTE_TALENT" && !contrat.talentSigneAt
        ? { talentSigneAt: now }
        : {}),
      ...(nextStatut === "SIGNE" ? { signeAt: now } : {}),
    },
  });
  console.log("TalentContrat: form.completed", { submissionId, completedCount, nextStatut });

  // Le talent a signé → envoyer son lien de signature à l'agence (email branded)
  if (nextStatut === "EN_ATTENTE_AGENCE" && current !== "EN_ATTENTE_AGENCE") {
    await envoyerLienSignatureAgence(contrat.id, submissionId, contrat.titre).catch((err) =>
      console.error("TalentContrat: erreur envoi lien agence", err)
    );
  }
  return true;
}

/** Récupère le lien de signature de l'agence sur la submission et lui envoie l'email. */
async function envoyerLienSignatureAgence(
  contratId: string,
  submissionId: string,
  contratTitre: string
) {
  const docusealKey = process.env.DOCUSEAL_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
  if (!docusealKey || !resendKey || !fromEmail) {
    console.warn("TalentContrat: DocuSeal/Resend non configuré, email agence non envoyé");
    return;
  }

  const res = await fetch(`https://api.docuseal.com/submissions/${submissionId}`, {
    headers: { "X-Auth-Token": docusealKey },
  });
  if (!res.ok) {
    console.error("TalentContrat: erreur GET submission", res.status, await res.text());
    return;
  }
  const submission = (await res.json()) as {
    submitters?: Array<{
      email?: string;
      role?: string;
      slug?: string;
      embed_src?: string;
      completed_at?: string | null;
      status?: string;
    }>;
  };
  const agence = (submission.submitters ?? []).find(
    (s) =>
      s.role === "Agence" &&
      !(s.completed_at && String(s.completed_at).trim()) &&
      s.status !== "completed"
  );
  if (!agence?.email) {
    console.warn("TalentContrat: submitter Agence en attente introuvable", contratId);
    return;
  }
  const signingUrl =
    agence.embed_src?.trim() ||
    (agence.slug ? `https://docuseal.com/s/${agence.slug}` : null);
  if (!signingUrl) {
    console.warn("TalentContrat: pas de lien de signature agence", contratId);
    return;
  }

  const html = await render(
    React.createElement(ContratGlowUpEmail, {
      signerName: process.env.NEXT_PUBLIC_AGENCE_NOM?.trim() || "Glow Up Agence",
      contratTitre,
      signingUrl,
      isAgence: true,
    })
  );
  const resend = new Resend(resendKey);
  await resend.emails.send({
    from: `Glow Up Agence <${fromEmail}>`,
    to: agence.email,
    subject: `À signer — Contrat talent — ${contratTitre}`,
    html,
  });
  console.log("TalentContrat: lien signature envoyé à l'agence", agence.email);
}
