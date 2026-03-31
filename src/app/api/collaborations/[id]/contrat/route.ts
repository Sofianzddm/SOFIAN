// POST /api/collaborations/[id]/contrat — Créer une submission DocuSeal (contrat talent) et enregistrer l’ID
import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { render } from "@react-email/render";
import { Resend } from "resend";
import { getAppSession } from "@/lib/getAppSession";
import prisma from "@/lib/prisma";
import { ContratTalentEmail } from "@/lib/emails/ContratTalent";

const DOCUSEAL_SUBMISSIONS = "https://api.docuseal.com/submissions";
const DOCUSEAL_SIGNING_BASE = "https://docuseal.com/s";

type DocuSealSubmitterRow = {
  role?: string;
  embed_src?: string | null;
  url?: string | null;
  submission_url?: string | null;
  slug?: string | null;
};

function getSubmitterSigningUrl(s: DocuSealSubmitterRow): string | null {
  const raw =
    s.embed_src?.trim() ||
    s.url?.trim() ||
    s.submission_url?.trim() ||
    (s.slug?.trim() ? `${DOCUSEAL_SIGNING_BASE}/${s.slug.trim()}` : "");
  return raw && raw.startsWith("http") ? raw : null;
}

const TYPE_LABELS: Record<string, string> = {
  STORY: "Story",
  STORY_CONCOURS: "Story Concours",
  POST: "Post",
  POST_CONCOURS: "Post Concours",
  POST_COMMUN: "Post Commun",
  POST_CROSSPOST: "IG Post Crosspost",
  REEL: "Reel",
  REEL_CROSSPOST: "IG Réel Crosspost",
  REEL_CONCOURS: "IG Réel Jeu Concours",
  TIKTOK_VIDEO: "Vidéo TikTok",
  TIKTOK_VIDEO_CONCOURS: "TikTok Jeu Concours",
  YOUTUBE_VIDEO: "Vidéo YouTube",
  YOUTUBE_SHORT: "YouTube Short",
  SNAPCHAT_STORY: "Snapchat Story",
  SNAPCHAT_SPOTLIGHT: "Snapchat Spotlight",
  EVENT: "Event",
  SHOOTING: "Shooting",
  AMBASSADEUR: "Ambassadeur",
};

function formatLivrables(
  livrables: Array<{ typeContenu: string; quantite: number; prixUnitaire: unknown; description: string | null }>
): string {
  return livrables
    .map((l) => {
      const label = TYPE_LABELS[l.typeContenu] || l.typeContenu;
      const line = `${l.quantite}× ${label}`;
      const desc = l.description?.trim();
      return desc ? `${line} — ${desc}` : line;
    })
    .join("\n");
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
        { error: "Seuls les administrateurs et les TM peuvent envoyer le contrat" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const templateIdRaw = process.env.DOCUSEAL_CONTRAT_TALENT_TEMPLATE_ID?.trim();
    const templateId = templateIdRaw ? parseInt(templateIdRaw, 10) : NaN;
    if (!Number.isInteger(templateId) || templateId <= 0) {
      return NextResponse.json(
        { error: "Configuration manquante : DOCUSEAL_CONTRAT_TALENT_TEMPLATE_ID" },
        { status: 503 }
      );
    }

    const agenceSignatureEmail = process.env.AGENCE_SIGNATURE_EMAIL?.trim();
    if (!agenceSignatureEmail) {
      return NextResponse.json(
        { error: "Configuration manquante : AGENCE_SIGNATURE_EMAIL" },
        { status: 503 }
      );
    }

    const docusealKey = process.env.DOCUSEAL_API_KEY;
    if (!docusealKey) {
      return NextResponse.json(
        { error: "DocuSeal n'est pas configuré (DOCUSEAL_API_KEY manquant)" },
        { status: 503 }
      );
    }

    if (!process.env.RESEND_API_KEY?.trim()) {
      return NextResponse.json(
        { error: "Envoi email non configuré (RESEND_API_KEY manquant)" },
        { status: 503 }
      );
    }

    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const pickStr = (key: string, fallback: string): string =>
      raw[key] !== undefined && raw[key] !== null ? String(raw[key]) : fallback;

    const collaboration = await prisma.collaboration.findUnique({
      where: { id },
      include: {
        talent: {
          select: {
            prenom: true,
            nom: true,
            email: true,
            raisonSociale: true,
            siret: true,
            formeJuridique: true,
            adresse: true,
            codePostal: true,
            ville: true,
            pays: true,
          },
        },
        marque: { select: { nom: true } },
        livrables: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!collaboration) {
      return NextResponse.json({ error: "Collaboration non trouvée" }, { status: 404 });
    }

    const talent = collaboration.talent;
    const talentNomDb = `${talent.prenom} ${talent.nom}`.trim();
    const societeNomDb = talent.raisonSociale ?? "";
    const siretDb = talent.siret ?? "";
    const adresseTalentDb = [talent.adresse, talent.codePostal, talent.ville, talent.pays]
      .filter(Boolean)
      .join(", ");
    const marqueNomDb = collaboration.marque?.nom ?? "";
    const livrablesTextDb = formatLivrables(collaboration.livrables);
    const montantNetDb = collaboration.montantNet?.toString() ?? "";

    const talent_nom = pickStr("talent_nom", talentNomDb);
    const societe_nom = pickStr("societe_nom", societeNomDb);
    const siret = pickStr("siret", siretDb);
    const adresse_talent = pickStr("adresse_talent", adresseTalentDb);
    const marque = pickStr("marque", marqueNomDb);
    const livrables = pickStr("livrables", livrablesTextDb);
    const montant_net_talent = pickStr("montant_net_talent", montantNetDb);

    const fieldValues = {
      talent_nom,
      societe_nom,
      siret,
      adresse_talent,
      marque,
      livrables,
      montant_net_talent: montant_net_talent.toString(),
    };

    const readonlyFieldNames = [
      "talent_nom",
      "societe_nom",
      "siret",
      "adresse_talent",
      "marque",
      "livrables",
      "montant_net_talent",
    ] as const;

    const submitters = [
      {
        email: talent.email,
        name: talent_nom,
        role: "Talent",
        order: 1,
        values: fieldValues,
        fields: readonlyFieldNames.map((name) => ({ name, readonly: true })),
      },
      {
        email: agenceSignatureEmail,
        name: "Sofian Ayad-Zeddam",
        role: "Agence",
        order: 2,
        readonly: true,
        values: fieldValues,
      },
    ];

    const submissionPayload = {
      template_id: templateId,
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
      console.error("DocuSeal submissions (contrat collab) error:", res.status, errText);
      return NextResponse.json(
        { error: "Erreur DocuSeal : " + (errText || res.statusText) },
        { status: 502 }
      );
    }

    const data = await res.json();
    const submissionList = (Array.isArray(data) ? data : []) as DocuSealSubmitterRow[];
    const first = submissionList[0] as DocuSealSubmitterRow & { submission_id?: number };
    const submissionId =
      first?.submission_id != null ? String(first.submission_id) : "";

    if (!submissionId) {
      console.error("DocuSeal contrat collab : submission_id manquant", data);
      return NextResponse.json(
        { error: "Réponse DocuSeal invalide (pas de submission_id)" },
        { status: 502 }
      );
    }

    const talentRow =
      submissionList.find((s) => s.role === "Talent") ?? submissionList[0];
    const submitterLink = getSubmitterSigningUrl(talentRow ?? {});

    if (!submitterLink) {
      console.error("DocuSeal contrat collab : lien de signature talent introuvable", data);
      return NextResponse.json(
        { error: "Impossible de récupérer le lien de signature DocuSeal pour le talent" },
        { status: 502 }
      );
    }

    const resend = new Resend(process.env.RESEND_API_KEY!.trim());
    const html = await render(
      React.createElement(ContratTalentEmail, {
        talentNom: talent_nom,
        marque,
        submitterLink,
      })
    );
    const sendResult = await resend.emails.send({
      from: "Glow Up <contrat@glowupagence.fr>",
      to: talent.email,
      subject: `Votre contrat x ${marque} — à signer`,
      html,
    });
    if (sendResult.error) {
      console.error("Resend contrat talent:", sendResult.error);
      return NextResponse.json(
        { error: "L’email n’a pas pu être envoyé (Resend)" },
        { status: 502 }
      );
    }

    const sentAt = new Date();
    await prisma.collaboration.update({
      where: { id },
      data: {
        contratSubmissionId: submissionId,
        contratStatut: "EN_ATTENTE_TALENT",
        contratEnvoyeAt: sentAt,
        contratTalentSigneAt: null,
        contratSigneAt: null,
      },
    });

    return NextResponse.json({ success: true, submissionId });
  } catch (error) {
    console.error("POST /api/collaborations/[id]/contrat:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création du contrat" },
      { status: 500 }
    );
  }
}
