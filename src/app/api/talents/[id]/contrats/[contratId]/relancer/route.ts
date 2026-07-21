// POST /api/talents/[id]/contrats/[contratId]/relancer — Renvoyer le lien de signature au signataire en attente
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
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const docusealKey = process.env.DOCUSEAL_API_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
    if (!docusealKey) {
      return NextResponse.json({ error: "DocuSeal n'est pas configuré" }, { status: 503 });
    }
    if (!resendKey || !fromEmail) {
      return NextResponse.json({ error: "Resend n'est pas configuré" }, { status: 503 });
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
    if (bodyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bodyEmail)) {
      return NextResponse.json(
        { error: "Adresse email invalide" },
        { status: 400 }
      );
    }

    const contrat = await prisma.talentContrat.findUnique({
      where: { id: contratId },
      include: { talent: { select: { prenom: true, nom: true, email: true } } },
    });
    if (!contrat || contrat.talentId !== id) {
      return NextResponse.json({ error: "Contrat non trouvé" }, { status: 404 });
    }
    if (
      !contrat.submissionId ||
      !["EN_ATTENTE_TALENT", "EN_ATTENTE_AGENCE"].includes(contrat.statut)
    ) {
      return NextResponse.json(
        { error: "Ce contrat n'est pas en attente de signature" },
        { status: 400 }
      );
    }

    // Récupérer les submitters de la submission pour retrouver le lien de signature
    const subRes = await fetch(`${DOCUSEAL_SUBMISSIONS}/${contrat.submissionId}`, {
      headers: { "X-Auth-Token": docusealKey },
    });
    if (!subRes.ok) {
      const errText = await subRes.text();
      console.error("DocuSeal GET submission error:", subRes.status, errText);
      return NextResponse.json(
        { error: "Erreur DocuSeal (lecture submission)" },
        { status: 502 }
      );
    }
    const submission = (await subRes.json()) as {
      submitters?: Array<{
        email?: string;
        role?: string;
        slug?: string;
        embed_src?: string;
        completed_at?: string | null;
        status?: string;
      }>;
    };

    // Relancer le premier signataire non complété
    const pending = (submission.submitters ?? []).find(
      (s) => !(s.completed_at && String(s.completed_at).trim()) && s.status !== "completed"
    );
    if (!pending?.email) {
      return NextResponse.json(
        { error: "Aucun signataire en attente trouvé" },
        { status: 400 }
      );
    }
    const signingUrl =
      pending.embed_src?.trim() ||
      (pending.slug ? `${DOCUSEAL_SIGNING_BASE}/${pending.slug}` : null);
    if (!signingUrl) {
      return NextResponse.json(
        { error: "Lien de signature introuvable" },
        { status: 502 }
      );
    }

    const isAgence = pending.role === "Agence";
    // Email override uniquement pour le talent (pas pour l'agence)
    const relanceEmail =
      !isAgence && bodyEmail ? bodyEmail : pending.email.trim();

    if (
      !isAgence &&
      bodyEmail &&
      bodyEmail.toLowerCase() !== (contrat.talent.email || "").trim().toLowerCase()
    ) {
      await prisma.talent.update({
        where: { id },
        data: { email: bodyEmail },
      });
    }

    const signerName = isAgence
      ? process.env.NEXT_PUBLIC_AGENCE_NOM?.trim() || "Glow Up Agence"
      : contrat.talent.prenom || `${contrat.talent.prenom} ${contrat.talent.nom}`.trim();

    const resend = new Resend(resendKey);
    const html = await render(
      React.createElement(ContratGlowUpEmail, {
        signerName,
        contratTitre: contrat.titre,
        signingUrl,
        isAgence,
        isRelance: true,
      })
    );
    await resend.emails.send({
      from: `Glow Up Agence <${fromEmail}>`,
      to: relanceEmail,
      subject: `Rappel — Votre contrat Glow Up — ${contrat.titre}`,
      html,
    });

    // Notifier les ADMIN et HEAD_OF_INFLUENCE de la relance (notif in-app + email interne)
    await notifierEquipeContratTalent({
      talentId: id,
      talentNom: `${contrat.talent.prenom} ${contrat.talent.nom}`.trim() || "Talent",
      contratTitre: contrat.titre,
      actorId: user.id,
      isRelance: true,
    });

    return NextResponse.json({ success: true, relanceEmail });
  } catch (error) {
    console.error("Erreur relance contrat talent:", error);
    return NextResponse.json(
      { error: "Erreur lors de la relance" },
      { status: 500 }
    );
  }
}
