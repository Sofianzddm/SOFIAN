// POST /api/collaborations/[id]/contrat/envoyer-upload
// Crée la submission DocuSeal et envoie un email Resend à chaque signataire
import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import prisma from "@/lib/prisma";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { ContratGlowUpEmail } from "@/lib/emails/ContratGlowUpEmail";
import {
  parseContratSignataires,
  validateSignatairesInput,
  type ContratSignataire,
} from "@/lib/collab-contrat-upload";

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role ?? "";
    if (!["ADMIN", "TM"].includes(role)) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour envoyer en signature" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const docusealKey = process.env.DOCUSEAL_API_KEY;
    if (!docusealKey) {
      return NextResponse.json(
        { error: "DocuSeal n'est pas configuré" },
        { status: 503 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      signataires?: unknown;
    };

    const collaboration = await prisma.collaboration.findUnique({
      where: { id },
      include: {
        talent: { select: { prenom: true, nom: true } },
        marque: { select: { nom: true } },
      },
    });
    if (!collaboration) {
      return NextResponse.json({ error: "Collaboration non trouvée" }, { status: 404 });
    }
    if (collaboration.contratStatut !== "BROUILLON") {
      return NextResponse.json(
        { error: "Ce contrat a déjà été envoyé ou signé" },
        { status: 400 }
      );
    }
    if (!collaboration.contratDocusealTemplateId) {
      return NextResponse.json(
        { error: "Aucun template DocuSeal — uploadez d'abord un PDF" },
        { status: 400 }
      );
    }

    let signataires: ContratSignataire[];
    if (body.signataires !== undefined) {
      const validated = validateSignatairesInput(body.signataires);
      if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: 400 });
      }
      signataires = validated.signataires;
    } else {
      signataires = parseContratSignataires(collaboration.contratSignataires);
      if (signataires.length === 0) {
        return NextResponse.json(
          { error: "Aucun signataire configuré" },
          { status: 400 }
        );
      }
    }

    const titre =
      collaboration.contratTitre?.trim() ||
      `Contrat ${collaboration.talent.prenom} ${collaboration.talent.nom} x ${collaboration.marque.nom}`;

    const submitters = signataires.map((s, i) => ({
      email: s.email,
      name: s.name,
      role: s.role || `Signataire ${i + 1}`,
      order: i + 1,
    }));

    const submissionPayload = {
      template_id: collaboration.contratDocusealTemplateId,
      send_email: false,
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
      console.error("DocuSeal submissions (collab upload) error:", res.status, errText);
      return NextResponse.json(
        { error: "Erreur DocuSeal: " + (errText || res.statusText) },
        { status: 502 }
      );
    }

    const data = await res.json();
    const submissionList = (Array.isArray(data) ? data : []) as DocuSealSubmitter[];
    const submissionId =
      submissionList[0]?.submission_id != null
        ? String(submissionList[0].submission_id)
        : "";
    if (!submissionId) {
      console.error("DocuSeal collab upload: submission_id manquant", data);
      return NextResponse.json(
        { error: "Réponse DocuSeal invalide" },
        { status: 502 }
      );
    }

    const resendKey = process.env.RESEND_API_KEY?.trim();
    if (!resendKey) {
      return NextResponse.json(
        { error: "Envoi email non configuré (RESEND_API_KEY manquant)" },
        { status: 503 }
      );
    }

    const resend = new Resend(resendKey);
    const emailsEnvoyes: string[] = [];
    const emailsEchoues: string[] = [];

    for (const signer of signataires) {
      const row = submissionList.find(
        (s) => s.email?.trim().toLowerCase() === signer.email.toLowerCase()
      );
      const signingUrl = row ? getSubmitterSigningUrl(row) : null;
      if (!signingUrl) {
        console.warn("Collab contrat upload: pas de signing_url pour", signer.email);
        emailsEchoues.push(signer.email);
        continue;
      }
      const html = await render(
        React.createElement(ContratGlowUpEmail, {
          signerName: signer.name.split(" ")[0] || signer.name,
          contratTitre: titre,
          signingUrl,
        })
      );
      const sendResult = await resend.emails.send({
        from: resendFromAddress(signer.email),
        to: signer.email,
        subject: `Votre contrat Glow Up — ${titre}`,
        html,
      });
      if (sendResult.error) {
        console.error("Collab contrat upload Resend:", signer.email, sendResult.error);
        emailsEchoues.push(signer.email);
      } else {
        emailsEnvoyes.push(signer.email);
      }
    }

    if (emailsEnvoyes.length === 0) {
      return NextResponse.json(
        {
          error:
            "DocuSeal OK mais aucun email n'a pu être envoyé. Vérifiez les adresses et Resend.",
          emailsEchoues,
        },
        { status: 502 }
      );
    }

    await prisma.collaboration.update({
      where: { id },
      data: {
        contratSubmissionId: submissionId,
        contratStatut: "EN_ATTENTE_TALENT",
        contratEnvoyeAt: new Date(),
        contratTalentSigneAt: null,
        contratSigneAt: null,
        contratSignataires: signataires,
        contratTitre: titre,
      },
    });

    return NextResponse.json({
      success: true,
      submissionId,
      emailsEnvoyes: emailsEnvoyes.length,
      emailsEnvoyesList: emailsEnvoyes,
      emailsEchoues,
      signatairesCount: signataires.length,
      partial:
        emailsEchoues.length > 0
          ? `Envoyé à ${emailsEnvoyes.length}/${signataires.length} — échec : ${emailsEchoues.join(", ")}`
          : null,
    });
  } catch (error) {
    console.error("POST /api/collaborations/[id]/contrat/envoyer-upload:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi pour signature" },
      { status: 500 }
    );
  }
}
