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

    const talentEmail = contrat.talent.email?.trim();
    if (!talentEmail) {
      return NextResponse.json(
        { error: "Ce talent n'a pas d'email renseigné" },
        { status: 400 }
      );
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

    // Email personnalisé au talent uniquement (l'agence signera à son tour,
    // notifiée par le webhook / DocuSeal quand order 1 est complété)
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
    if (resendKey && fromEmail) {
      const talentSubmitter = submissionList.find(
        (s) => s.email?.trim().toLowerCase() === talentEmail.toLowerCase()
      );
      const signingUrl = talentSubmitter ? getSubmitterSigningUrl(talentSubmitter) : null;
      if (signingUrl) {
        const resend = new Resend(resendKey);
        const html = await render(
          React.createElement(ContratGlowUpEmail, {
            signerName: contrat.talent.prenom || talentName,
            contratTitre: contrat.titre,
            signingUrl,
          })
        );
        await resend.emails.send({
          from: `Glow Up Agence <${fromEmail}>`,
          to: talentEmail,
          subject: `Votre contrat Glow Up — ${contrat.titre}`,
          html,
        });
      } else {
        console.warn("Contrat talent: pas de signing_url pour le talent, email non envoyé");
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

    // Notifier les ADMIN et HEAD_OF_SALES que le contrat est parti en signature
    try {
      const destinataires = await prisma.user.findMany({
        where: {
          role: { in: ["ADMIN", "HEAD_OF_SALES"] },
          actif: true,
          id: { not: user.id }, // pas de notif à soi-même
        },
        select: { id: true },
      });
      await Promise.all(
        destinataires.map((dest) =>
          prisma.notification.create({
            data: {
              userId: dest.id,
              type: "GENERAL",
              titre: "✍️ Contrat envoyé en signature",
              message: `Le contrat « ${contrat.titre} » a été envoyé en signature électronique à ${talentName}`,
              lien: `/talents/${id}`,
              talentId: id,
              actorId: user.id,
            },
          })
        )
      );
    } catch (err) {
      console.error("Contrat talent: erreur création notifications:", err);
    }

    return NextResponse.json({
      success: true,
      submissionId,
      statut: updated.statut,
    });
  } catch (error) {
    console.error("Erreur envoi contrat talent:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi pour signature" },
      { status: 500 }
    );
  }
}
