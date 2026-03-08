// POST /api/documents/[id]/envoyer-signature-avec-fields — Créer la submission DocuSeal puis envoyer email branded Resend
import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { SignatureRequestEmail } from "@/lib/emails/SignatureRequestEmail";

const DOCUSEAL_SUBMISSIONS = "https://api.docuseal.com/submissions";
const DOCUSEAL_SIGNING_BASE = "https://docuseal.com/s";

/** Récupère l'URL de signature propre à chaque submitter (réponse DocuSeal) */
function getSubmitterSigningUrl(s: {
  embed_src?: string | null;
  url?: string | null;
  submission_url?: string | null;
  slug?: string | null;
}): string | null {
  const raw =
    s.embed_src?.trim() ||
    s.url?.trim() ||
    s.submission_url?.trim() ||
    (s.slug?.trim() ? `${DOCUSEAL_SIGNING_BASE}/${s.slug.trim()}` : "");
  return raw && raw.startsWith("http") ? raw : null;
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
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES", "TM"].includes(user.role)) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour envoyer en signature" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const templateId = body.templateId != null ? Number(body.templateId) : NaN;
    // Un seul canal pour l'email client : body (pas de fallback marque/contacts ici → évite doublon)
    const clientEmail = (body.signerEmail ?? body.clientEmail ?? body.email) as string | undefined;
    const clientName = ((body.signerName ?? body.clientName ?? body.name) as string)?.trim() || "Client";
    const signerEmail = clientEmail?.trim();
    const signerName = clientName || "Client";
    // Agence : uniquement depuis le body (pas env vide)
    const agenceEmailRaw = (body.agenceEmail as string) ?? "";
    const agenceEmail = agenceEmailRaw.trim() || (process.env.NEXT_PUBLIC_AGENCE_EMAIL ?? "contrat@glowupagence.fr").trim();
    const agenceName = ((body.agenceName as string) ?? "").trim() || "Agence";

    if (!Number.isInteger(templateId) || templateId <= 0 || !signerEmail) {
      return NextResponse.json(
        { error: "templateId et email client requis" },
        { status: 400 }
      );
    }
    if (!agenceEmail) {
      return NextResponse.json(
        { error: "agenceEmail requis (signataire 2)" },
        { status: 400 }
      );
    }

    // Submitters sans doublon : chaque email une seule fois (client reçoit une fois, agence une fois)
    const submitters: { email: string; name: string; role: string; order: number }[] = [];
    const seenEmails = new Set<string>();
    const add = (email: string, name: string, role: string, order: number) => {
      const key = email.toLowerCase();
      if (seenEmails.has(key)) return;
      seenEmails.add(key);
      submitters.push({ email, name, role, order });
    };
    add(signerEmail, signerName, "Client", 1);
    add(agenceEmail, agenceName, "Agence", 2);

    console.log("submitters:", signerEmail, agenceEmail);

    const docusealKey = process.env.DOCUSEAL_API_KEY;
    if (!docusealKey) {
      return NextResponse.json(
        { error: "DocuSeal n'est pas configuré" },
        { status: 503 }
      );
    }

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        collaboration: {
          include: {
            talent: { select: { prenom: true, nom: true } },
            marque: { select: { nom: true } },
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });
    }

    if (document.type !== "DEVIS") {
      return NextResponse.json(
        { error: "Seuls les devis peuvent être envoyés en signature" },
        { status: 400 }
      );
    }

    if (document.signatureStatus === "PENDING" || document.signatureStatus === "SIGNED") {
      return NextResponse.json(
        { error: "Ce devis a déjà été envoyé ou signé" },
        { status: 400 }
      );
    }

    const useResend = !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
    const submissionPayload = {
      template_id: templateId,
      send_email: false, // On n'utilise que l'email branded Glow Up via Resend
      submitters,
    };
    console.log("DocuSeal body (submissions):", JSON.stringify(submissionPayload, null, 2));

    const res = await fetch(DOCUSEAL_SUBMISSIONS, {
      method: "POST",
      headers: {
        "X-Auth-Token": docusealKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(submissionPayload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("DocuSeal submissions error:", res.status, errText);
      return NextResponse.json(
        { error: "Erreur DocuSeal: " + (errText || res.statusText) },
        { status: 502 }
      );
    }

    const data = await res.json();
    console.log("DocuSeal response (submissions):", JSON.stringify(data, null, 2));
    const submissionList = Array.isArray(data) ? data : [];
    const submissionId =
      submissionList[0]?.submission_id != null
        ? String(submissionList[0].submission_id)
        : typeof data === "object" && data !== null && "id" in data
          ? String((data as { id: number }).id)
          : "";

    if (!submissionId) {
      console.error("DocuSeal response missing submission id:", data);
      return NextResponse.json(
        { error: "Réponse DocuSeal invalide" },
        { status: 502 }
      );
    }

    const talent = document.collaboration?.talent;
    const marque = document.collaboration?.marque;
    const talentPrenom = talent?.prenom ?? "";
    const talentNom = talent?.nom ?? "";
    const marqueNom = marque?.nom ?? "";
    const montantHT = Number(document.montantHT) ?? 0;
    const dateDocument = document.dateDocument
      ? new Date(document.dateDocument).toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "";

    if (useResend) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromEmail = process.env.RESEND_FROM_EMAIL!.trim();
      const subject = `Devis ${document.reference} à signer — ${talentPrenom} × ${marqueNom}`;

      for (const submitter of submissionList as Array<{
        email?: string;
        name?: string;
        slug?: string;
        embed_src?: string;
        url?: string;
        submission_url?: string;
      }>) {
        const email = submitter.email?.trim();
        if (!email) continue;
        const signingUrl = getSubmitterSigningUrl(submitter);
        if (!signingUrl) {
          console.warn("DocuSeal submitter sans signing_url, email ignoré:", email);
          continue;
        }
        const signerName = (submitter.name as string)?.trim() || "Signataire";
        const talentNomFull = [talentPrenom, talentNom].filter(Boolean).join(" ") || talentNom;
        const html = await render(
          React.createElement(SignatureRequestEmail, {
            signerName,
            documentReference: document.reference,
            talentNom: talentNomFull,
            marqueNom,
            montantHT: Number(montantHT) ?? 0,
            dateDocument,
            signingUrl,
          })
        );
        await resend.emails.send({
          from: `Glow Up Agence <${fromEmail}>`,
          to: email,
          subject,
          html,
        });
      }
    }

    const now = new Date();

    await prisma.document.update({
      where: { id },
      data: {
        signatureStatus: "PENDING",
        signatureSubmissionId: submissionId,
        signatureSentAt: now,
        signatureSignerEmail: signerEmail,
        signaturesCount: 0,
        signaturesTotal: 2,
        statut: document.statut === "BROUILLON" ? "ENVOYE" : document.statut,
      },
    });

    await prisma.documentEvent.create({
      data: {
        documentId: id,
        type: "SENT",
        description: `Envoyé pour signature à ${signerEmail} et ${agenceEmail}`,
        userId: user.id,
      },
    });

    const collaborationId = document.collaborationId ?? undefined;

    return NextResponse.json({
      success: true,
      submissionId,
      collaborationId,
    });
  } catch (error) {
    console.error("Erreur envoyer-signature-avec-fields:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi pour signature" },
      { status: 500 }
    );
  }
}
