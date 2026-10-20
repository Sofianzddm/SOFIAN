// POST — Relance le premier signataire en attente (contrat marque DocuSeal)
import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { ContratGlowUpEmail } from "@/lib/emails/ContratGlowUpEmail";
import {
  getAgenceSignatureEmail,
  getAgenceSignatureName,
  isAgenceSubmitter,
  normalizeGlowupEmail,
} from "@/lib/agence-signature";

const DOCUSEAL_SUBMISSIONS = "https://api.docuseal.com/submissions";
const DOCUSEAL_SIGNING_BASE = "https://docuseal.com/s";

function canRelancer(role: string): boolean {
  return ["ADMIN", "JURISTE", "HEAD_OF_INFLUENCE"].includes(role);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role as string;
    if (!canRelancer(role)) {
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    const { id } = await params;
    const docusealKey = process.env.DOCUSEAL_API_KEY?.trim();
    const resendKey = process.env.RESEND_API_KEY?.trim();
    const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
    if (!docusealKey) {
      return NextResponse.json({ error: "DocuSeal n'est pas configuré" }, { status: 503 });
    }
    if (!resendKey || !fromEmail) {
      return NextResponse.json({ error: "Resend n'est pas configuré" }, { status: 503 });
    }

    const body = (await request.json().catch(() => ({}))) as { email?: string };
    const bodyEmail = typeof body.email === "string" ? body.email.trim() : undefined;
    if (bodyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bodyEmail)) {
      return NextResponse.json({ error: "Adresse email invalide" }, { status: 400 });
    }

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
    if (collab.contratMarqueStatut !== "EN_SIGNATURE" || !collab.contratMarqueSubmissionId) {
      return NextResponse.json(
        { error: "Ce contrat marque n'est pas en attente de signature" },
        { status: 400 }
      );
    }

    const submissionId = collab.contratMarqueSubmissionId;
    const titre = `Contrat marque — ${collab.talent.prenom} ${collab.talent.nom} x ${collab.marque.nom}`;

    const subRes = await fetch(`${DOCUSEAL_SUBMISSIONS}/${submissionId}`, {
      headers: { "X-Auth-Token": docusealKey },
    });
    if (!subRes.ok) {
      const errText = await subRes.text();
      console.error("DocuSeal GET submission (relance contrat marque):", subRes.status, errText);
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

    const pendingList = (submission.submitters ?? []).filter(
      (s) => !(s.completed_at && String(s.completed_at).trim()) && s.status !== "completed"
    );
    if (pendingList.length === 0) {
      return NextResponse.json(
        { error: "Aucun signataire en attente trouvé" },
        { status: 400 }
      );
    }

    const pending = bodyEmail
      ? pendingList.find(
          (s) => s.email?.trim().toLowerCase() === bodyEmail.toLowerCase()
        ) ?? pendingList[0]
      : pendingList[0];

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
      return NextResponse.json({ error: "Lien de signature introuvable" }, { status: 502 });
    }

    const isAgence = isAgenceSubmitter({
      role: pending.role,
      email: bodyEmail || pending.email,
    });
    const relanceEmail = isAgence
      ? getAgenceSignatureEmail()
      : normalizeGlowupEmail(bodyEmail || pending.email.trim());
    const signerName =
      pending.name?.trim() || relanceEmail.split("@")[0] || "Signataire";

    const resend = new Resend(resendKey);
    const html = await render(
      React.createElement(ContratGlowUpEmail, {
        signerName: isAgence ? getAgenceSignatureName() : signerName,
        contratTitre: titre,
        signingUrl,
        isRelance: true,
        isAgence,
        kind: "document",
      })
    );

    const fromAddr = fromEmail.includes("<")
      ? (fromEmail.match(/<([^>]+)>/)?.[1] ?? fromEmail).trim().toLowerCase()
      : fromEmail.toLowerCase();
    const from =
      relanceEmail.trim().toLowerCase() === fromAddr
        ? "Glow Up Agence <notifications@glowupagence.fr>"
        : fromEmail.includes("<")
          ? fromEmail
          : `Glow Up Agence <${fromEmail}>`;

    await resend.emails.send({
      from,
      to: relanceEmail,
      subject: `Rappel — Contrat marque à signer — ${titre}`,
      html,
    });

    return NextResponse.json({ success: true, relanceEmail });
  } catch (error) {
    console.error("POST contrat-marque/relancer:", error);
    return NextResponse.json({ error: "Erreur lors de la relance" }, { status: 500 });
  }
}
