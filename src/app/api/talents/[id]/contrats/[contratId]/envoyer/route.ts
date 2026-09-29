// POST /api/talents/[id]/contrats/[contratId]/envoyer — Créer la submission DocuSeal
// puis envoyer l'email personnalisé "Votre contrat Glow Up" via Resend
import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { ContratGlowUpEmail } from "@/lib/emails/ContratGlowUpEmail";
import { CONTRAT_TALENT_ROLES } from "@/lib/talent-contrats";
import { notifierEquipeContratTalent } from "@/lib/talent-contrats-notify";

const DOCUSEAL_SUBMISSIONS = "https://api.docuseal.com/submissions";
const DOCUSEAL_SIGNING_BASE = "https://docuseal.com/s";

type DocuSealSubmitter = {
  email?: string;
  name?: string;
  role?: string;
  slug?: string | null;
  embed_src?: string | null;
  url?: string | null;
  submission_url?: string | null;
  submission_id?: number;
  id?: number;
};

function getSubmitterSigningUrl(s: DocuSealSubmitter): string | null {
  const raw =
    s.embed_src?.trim() ||
    s.url?.trim() ||
    s.submission_url?.trim() ||
    (s.slug?.trim() ? `${DOCUSEAL_SIGNING_BASE}/${s.slug.trim()}` : "");
  return raw && raw.startsWith("http") ? raw : null;
}

/** Évite From = To (ex. contrat@ → contrat@) souvent filtré par Gmail Workspace. */
function resendFromAddress(toEmail: string): string {
  const configured = process.env.RESEND_FROM_EMAIL?.trim() || "contrat@glowupagence.fr";
  const to = toEmail.trim().toLowerCase();
  const fromAddr = configured.includes("<")
    ? (configured.match(/<([^>]+)>/)?.[1] ?? configured).trim().toLowerCase()
    : configured.toLowerCase();
  if (to && to === fromAddr) {
    return "Glow Up Agence <notifications@glowupagence.fr>";
  }
  return configured.includes("<") ? configured : `Glow Up Agence <${configured}>`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contratId: string }> }
) {
  try {
    const { id, contratId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const user = session.user as { id: string; role: string };
    if (!CONTRAT_TALENT_ROLES.includes(user.role)) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour envoyer en signature" },
        { status: 403 }
      );
    }

    const docusealKey = process.env.DOCUSEAL_API_KEY;
    if (!docusealKey) {
      return NextResponse.json(
        { error: "DocuSeal n'est pas configuré" },
        { status: 503 }
      );
    }

    let bodyEmail: string | undefined;
    try {
      const body = await request.json().catch(() => ({}));
      if (body && typeof body.email === "string") {
        bodyEmail = body.email.trim();
      }
    } catch {
      // body optionnel
    }

    const contrat = await prisma.talentContrat.findUnique({
      where: { id: contratId },
      include: {
        talent: { select: { prenom: true, nom: true, email: true } },
      },
    });
    if (!contrat || contrat.talentId !== id) {
      return NextResponse.json({ error: "Contrat non trouvé" }, { status: 404 });
    }
    if (contrat.statut !== "BROUILLON") {
      return NextResponse.json(
        { error: "Ce contrat a déjà été envoyé ou signé" },
        { status: 400 }
      );
    }

    const talentEmail = (bodyEmail || contrat.talent.email || "").trim();
    if (!talentEmail) {
      return NextResponse.json(
        { error: "Ce talent n'a pas d'email renseigné" },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(talentEmail)) {
      return NextResponse.json(
        { error: "Adresse email invalide" },
        { status: 400 }
      );
    }

    // Si l'email a été modifié à l'envoi, synchroniser la fiche talent
    if (
      bodyEmail &&
      bodyEmail.toLowerCase() !== (contrat.talent.email || "").trim().toLowerCase()
    ) {
      await prisma.talent.update({
        where: { id },
        data: { email: talentEmail },
      });
    }
    const talentName =
      `${contrat.talent.prenom} ${contrat.talent.nom}`.trim() || "Talent";

    const agenceEmail =
      process.env.AGENCE_SIGNATURE_EMAIL?.trim() ||
      process.env.NEXT_PUBLIC_AGENCE_EMAIL?.trim() ||
      "contrat@glowupagence.fr";
    const agenceName = process.env.NEXT_PUBLIC_AGENCE_NOM?.trim() || "Glow Up Agence";

    // Signataires : Talent (ordre 1), puis Agence (ordre 2) si demandé — sans doublon d'email
    const submitters: { email: string; name: string; role: string; order: number }[] = [
      { email: talentEmail, name: talentName, role: "Talent", order: 1 },
    ];
    if (
      contrat.avecSignatureAgence &&
      agenceEmail.toLowerCase() !== talentEmail.toLowerCase()
    ) {
      submitters.push({ email: agenceEmail, name: agenceName, role: "Agence", order: 2 });
    }

    const submissionPayload = {
      template_id: contrat.docusealTemplateId,
      send_email: false, // Email branded Glow Up via Resend uniquement
      submitters,
    };

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
    const submissionList = (Array.isArray(data) ? data : []) as DocuSealSubmitter[];
    // Réponse = [{ id: <submitter>, submission_id: <submission> }, ...]
    // On sauvegarde submission_id (jamais .id qui est l'ID du submitter)
    const submissionId =
      submissionList[0]?.submission_id != null
        ? String(submissionList[0].submission_id)
        : "";
    if (!submissionId) {
      console.error("DocuSeal response missing submission_id:", data);
      return NextResponse.json(
        { error: "Réponse DocuSeal invalide" },
        { status: 502 }
      );
    }

    // Emails branded via Resend : talent + agence (si double signature), comme les devis
    let emailEnvoye = false;
    let emailAgenceEnvoye = false;
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const resend = new Resend(resendKey);

      const talentSubmitter = submissionList.find(
        (s) => s.email?.trim().toLowerCase() === talentEmail.toLowerCase()
      );
      const talentSigningUrl = talentSubmitter
        ? getSubmitterSigningUrl(talentSubmitter)
        : null;
      if (talentSigningUrl) {
        const html = await render(
          React.createElement(ContratGlowUpEmail, {
            signerName: contrat.talent.prenom || talentName,
            contratTitre: contrat.titre,
            signingUrl: talentSigningUrl,
          })
        );
        const sendResult = await resend.emails.send({
          from: resendFromAddress(talentEmail),
          to: talentEmail,
          subject: `Votre contrat Glow Up — ${contrat.titre}`,
          html,
        });
        if (sendResult.error) {
          console.error("Contrat talent: erreur Resend talent:", sendResult.error);
        } else {
          emailEnvoye = true;
        }
      } else {
        console.warn("Contrat talent: pas de signing_url pour le talent, email non envoyé");
      }

      // Double signature : envoyer le lien à contrat@ dès l'envoi (comme les devis).
      // Un 2e mail « Le talent a signé » partira via le webhook DocuSeal.
      if (contrat.avecSignatureAgence) {
        const agenceSubmitter = submissionList.find((s) => {
          const role = (s.role || "").trim().toLowerCase();
          const email = (s.email || "").trim().toLowerCase();
          return (
            role === "agence" || email === agenceEmail.toLowerCase()
          );
        });
        const agenceSigningUrl = agenceSubmitter
          ? getSubmitterSigningUrl(agenceSubmitter)
          : null;
        if (agenceSubmitter?.email && agenceSigningUrl) {
          const htmlAgence = await render(
            React.createElement(ContratGlowUpEmail, {
              signerName: agenceName,
              contratTitre: contrat.titre,
              signingUrl: agenceSigningUrl,
              isAgence: true,
              talentHasSigned: false,
            })
          );
          const sendAgence = await resend.emails.send({
            from: resendFromAddress(agenceSubmitter.email),
            to: agenceSubmitter.email,
            subject: `À signer — Contrat talent — ${contrat.titre}`,
            html: htmlAgence,
          });
          if (sendAgence.error) {
            console.error("Contrat talent: erreur Resend agence:", sendAgence.error);
          } else {
            emailAgenceEnvoye = true;
          }
        } else {
          console.warn(
            "Contrat talent: pas de signing_url pour l'agence, email double signature non envoyé"
          );
        }
      }
    } else {
      console.warn("Contrat talent: Resend non configuré, email non envoyé");
    }

    const updated = await prisma.talentContrat.update({
      where: { id: contratId },
      data: {
        statut: "EN_ATTENTE_TALENT",
        submissionId,
        envoyeAt: new Date(),
      },
    });

    // Notifier les ADMIN et HEAD_OF_INFLUENCE (notif in-app + email interne)
    await notifierEquipeContratTalent({
      talentId: id,
      talentNom: talentName,
      contratTitre: contrat.titre,
      actorId: user.id,
    });

    return NextResponse.json({
      success: true,
      submissionId,
      statut: updated.statut,
      emailEnvoye,
      emailAgenceEnvoye,
      email: talentEmail,
    });
  } catch (error) {
    console.error("Erreur envoi contrat talent:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi pour signature" },
      { status: 500 }
    );
  }
}
