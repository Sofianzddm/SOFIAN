// POST /api/signatures/[id]/relancer
// Relance le premier signataire en attente — hub / talent / collab
import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { ContratGlowUpEmail } from "@/lib/emails/ContratGlowUpEmail";
import { SIGNATURE_DOCUMENT_ROLES } from "@/lib/signature-documents";

const DOCUSEAL_SUBMISSIONS = "https://api.docuseal.com/submissions";
const DOCUSEAL_SIGNING_BASE = "https://docuseal.com/s";

type Source = "hub" | "talent" | "collab";

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
    const user = session.user as { role: string };
    if (!SIGNATURE_DOCUMENT_ROLES.includes(user.role as (typeof SIGNATURE_DOCUMENT_ROLES)[number])) {
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
    let source: Source = "hub";
    try {
      const body = await request.json().catch(() => ({}));
      if (body && typeof body.email === "string") {
        bodyEmail = body.email.trim();
      }
      if (
        body &&
        (body.source === "hub" || body.source === "talent" || body.source === "collab")
      ) {
        source = body.source;
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

    let submissionId: string | null = null;
    let titre = "Document";
    let kind: "contrat" | "document" = "document";
    let enAttente = false;

    if (source === "hub") {
      const document = await prisma.signatureDocument.findUnique({ where: { id } });
      if (!document) {
        return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });
      }
      submissionId = document.submissionId;
      titre = document.titre;
      kind = "document";
      enAttente = document.statut === "EN_ATTENTE";
    } else if (source === "talent") {
      const contrat = await prisma.talentContrat.findUnique({ where: { id } });
      if (!contrat) {
        return NextResponse.json({ error: "Contrat talent non trouvé" }, { status: 404 });
      }
      submissionId = contrat.submissionId;
      titre = contrat.titre;
      kind = "contrat";
      enAttente = ["EN_ATTENTE_TALENT", "EN_ATTENTE_AGENCE"].includes(contrat.statut);
    } else {
      const collab = await prisma.collaboration.findUnique({
        where: { id },
        include: {
          talent: { select: { prenom: true, nom: true } },
          marque: { select: { nom: true } },
        },
      });
      if (!collab) {
        return NextResponse.json({ error: "Collaboration non trouvée" }, { status: 404 });
      }
      submissionId = collab.contratSubmissionId;
      titre =
        collab.contratTitre?.trim() ||
        `Contrat ${collab.talent.prenom} ${collab.talent.nom} x ${collab.marque.nom}`;
      kind = "contrat";
      enAttente =
        !!collab.contratSubmissionId &&
        !["NON_ENVOYE", "BROUILLON", "SIGNE"].includes(collab.contratStatut);
    }

    if (!submissionId || !enAttente) {
      return NextResponse.json(
        { error: "Ce document n'est pas en attente de signature" },
        { status: 400 }
      );
    }

    const subRes = await fetch(`${DOCUSEAL_SUBMISSIONS}/${submissionId}`, {
      headers: { "X-Auth-Token": docusealKey },
    });
    if (!subRes.ok) {
      const errText = await subRes.text();
      console.error("DocuSeal GET submission (relance) error:", subRes.status, errText);
      return NextResponse.json(
        { error: "Erreur DocuSeal (lecture submission)" },
        { status: 502 }
      );
    }

    const submission = (await subRes.json()) as {
      submitters?: Array<{
        email?: string;
        name?: string;
        role?: string;
        slug?: string;
        embed_src?: string;
        completed_at?: string | null;
        status?: string;
      }>;
    };

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

    const relanceEmail = bodyEmail || pending.email.trim();
    const signerName =
      pending.name?.trim() ||
      relanceEmail.split("@")[0] ||
      "Signataire";
    const isAgence =
      (pending.role || "").trim().toLowerCase() === "agence" ||
      relanceEmail.toLowerCase() ===
        (
          process.env.AGENCE_SIGNATURE_EMAIL?.trim() ||
          process.env.NEXT_PUBLIC_AGENCE_EMAIL?.trim() ||
          "contrat@glowupagence.fr"
        ).toLowerCase();

    const resend = new Resend(resendKey);
    const html = await render(
      React.createElement(ContratGlowUpEmail, {
        signerName: isAgence
          ? process.env.NEXT_PUBLIC_AGENCE_NOM?.trim() || "Glow Up Agence"
          : signerName,
        contratTitre: titre,
        signingUrl,
        isRelance: true,
        isAgence,
        kind,
      })
    );

    const fromAddr = fromEmail.includes("<")
      ? (fromEmail.match(/<([^>]+)>/)?.[1] ?? fromEmail).trim().toLowerCase()
      : fromEmail.toLowerCase();
    const from =
      relanceEmail.trim().toLowerCase() === fromAddr
        ? "Glow Up Agence <notifications@glowupagence.fr>"
        : `Glow Up Agence <${fromEmail}>`;

    const subjectNoun = kind === "document" ? "Document" : "Contrat";
    await resend.emails.send({
      from,
      to: relanceEmail,
      subject: `Rappel — ${subjectNoun} à signer — ${titre}`,
      html,
    });

    return NextResponse.json({ success: true, relanceEmail, source });
  } catch (error) {
    console.error("POST /api/signatures/[id]/relancer:", error);
    return NextResponse.json(
      { error: "Erreur lors de la relance" },
      { status: 500 }
    );
  }
}
