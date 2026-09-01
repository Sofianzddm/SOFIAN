// src/app/api/documents/[id]/relance/route.ts
// POST /api/documents/[id]/relance — Envoie une relance (1, 2 ou 3) à la marque
// pour une facture en retard. Email envoyé via Resend depuis comptabilite@glowupagence.fr.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  sendRelanceEmail,
  renderRelanceEmailHtml,
  type RelanceLevel,
} from "@/lib/emails/relance-facture";
import { generateDocumentPDF, documentToPDFData } from "@/lib/documents/generatePDF";
import { AGENCE_CONFIG } from "@/lib/documents/config";
import { denyIfUnassignedCm } from "@/lib/account-manager-assign";

const ROLES_AUTORISES = ["ADMIN", "HEAD_OF_SALES", "CM"];

function diffDays(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function levelLabel(level: RelanceLevel): string {
  return level === 1 ? "1ère" : level === 2 ? "2ème" : "3ème";
}

type RelanceContact = {
  email: string | null;
  prenom: string | null;
  nom: string | null;
  principal?: boolean;
};

type RelanceDoc = {
  clientEmail: string | null;
  clientNom: string | null;
  linkedQuote: { marqueContact: RelanceContact | null } | null;
  collaboration: {
    marque: {
      nom: string;
      contacts: RelanceContact[];
    } | null;
  } | null;
};

function contactName(c: RelanceContact | null | undefined): string | null {
  if (!c) return null;
  return [c.prenom, c.nom].filter(Boolean).join(" ") || null;
}

function resolveRelanceDestinataire(document: RelanceDoc): {
  to: string | null;
  destinataireNom: string | null;
} {
  let to: string | null = document.clientEmail?.trim() || null;
  let destinataireNom: string | null = null;

  if (!to && document.linkedQuote?.marqueContact?.email) {
    to = document.linkedQuote.marqueContact.email;
    destinataireNom = contactName(document.linkedQuote.marqueContact);
  }
  if (!to && document.collaboration?.marque?.contacts?.length) {
    const principal = document.collaboration.marque.contacts.find((c) => c.principal && c.email);
    const anyContact = document.collaboration.marque.contacts.find((c) => c.email);
    const contact = principal ?? anyContact;
    if (contact?.email) {
      to = contact.email;
      destinataireNom = contactName(contact);
    }
  }
  return { to, destinataireNom };
}

function nomForEmail(document: RelanceDoc, email: string | null): string | null {
  if (!email) return null;
  const needle = email.trim().toLowerCase();
  const quote = document.linkedQuote?.marqueContact;
  if (quote?.email?.trim().toLowerCase() === needle) return contactName(quote);
  const contacts = document.collaboration?.marque?.contacts ?? [];
  const match = contacts.find((c) => c.email?.trim().toLowerCase() === needle);
  return contactName(match);
}

/** Détermine le niveau de relance à envoyer en fonction des relances déjà faites. */
function nextRelanceLevel(d: {
  relance1SentAt: Date | null;
  relance2SentAt: Date | null;
  relance3SentAt: Date | null;
}): RelanceLevel | null {
  if (!d.relance1SentAt) return 1;
  if (!d.relance2SentAt) return 2;
  if (!d.relance3SentAt) return 3;
  return null;
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
    const user = session.user as { id: string; role?: string };
    if (!user.role || !ROLES_AUTORISES.includes(user.role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const forcedLevel: number | undefined = body?.level;

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        collaboration: {
          include: {
            talent: true,
            marque: { include: { contacts: { orderBy: { principal: "desc" } } } },
          },
        },
        linkedQuote: {
          include: { marqueContact: true, marque: true },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
    }
    if (document.type !== "FACTURE") {
      return NextResponse.json({ error: "Seules les factures peuvent faire l'objet d'une relance" }, { status: 400 });
    }
    if (denyIfUnassignedCm(user, document.collaboration?.accountManagerId)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    if (document.statut === "PAYE") {
      return NextResponse.json({ error: "Cette facture est déjà payée" }, { status: 400 });
    }
    if (document.statut === "ANNULE") {
      return NextResponse.json({ error: "Cette facture est annulée" }, { status: 400 });
    }
    // On accepte ENVOYE et VALIDE (Enregistré) : dans le workflow actuel les factures
    // restent souvent en VALIDE même après avoir été transmises à la marque.
    if (document.statut !== "ENVOYE" && document.statut !== "VALIDE") {
      return NextResponse.json(
        { error: "La facture doit être au statut « Envoyé » ou « Enregistré » pour pouvoir lancer une relance" },
        { status: 400 }
      );
    }

    // Vérifier qu'il y a bien un retard
    const now = new Date();
    const echeance = document.dateEcheance ?? new Date(document.dateEmission.getTime() + 30 * 24 * 60 * 60 * 1000);
    if (echeance >= now) {
      return NextResponse.json(
        { error: "Cette facture n'est pas encore en retard (échéance non dépassée)" },
        { status: 400 }
      );
    }

    // Niveau de relance à envoyer (auto sauf si forcé via body.level)
    const autoLevel = nextRelanceLevel(document);
    const level: RelanceLevel | null =
      forcedLevel === 1 || forcedLevel === 2 || forcedLevel === 3 ? (forcedLevel as RelanceLevel) : autoLevel;
    if (!level) {
      return NextResponse.json(
        { error: "Toutes les relances ont déjà été envoyées (1ère, 2ème, 3ème)" },
        { status: 400 }
      );
    }

    const { to, destinataireNom } = resolveRelanceDestinataire(document);

    if (!to || !to.includes("@")) {
      return NextResponse.json(
        {
          error:
            "Aucune adresse email destinataire n'est renseignée (client ou contact marque). Ajoutez un contact à la marque puis recommencez.",
        },
        { status: 400 }
      );
    }

    const clientNom =
      document.collaboration?.marque?.nom ?? document.clientNom ?? "Client";
    const joursRetard = Math.max(1, diffDays(echeance, now));

    // Générer le PDF de la facture en pièce jointe
    let pdfBuffer: Buffer | undefined;
    let pdfFilename: string | undefined;
    try {
      if (document.pdfBase64) {
        pdfBuffer = Buffer.from(document.pdfBase64, "base64");
      } else {
        const docForPdf = await prisma.document.findUnique({
          where: { id },
          include: { collaboration: { include: { marque: true, talent: true } } },
        });
        if (docForPdf) {
          const pdfData = documentToPDFData(docForPdf, (docForPdf as any).langueDocument);
          pdfBuffer = await generateDocumentPDF(pdfData, docForPdf.type);
        }
      }
      pdfFilename = `${document.reference}.pdf`;
    } catch (e) {
      // Si la génération PDF échoue, on continue sans pièce jointe
      console.warn("Génération PDF pour relance échouée :", e);
    }

    // Envoi de l'email via Resend
    const emailResult = await sendRelanceEmail({
      to,
      data: {
        level,
        destinataireNom,
        clientNom,
        reference: document.reference,
        montantTTC: Number(document.montantTTC),
        devise: document.devise || "EUR",
        dateEmission: document.dateEmission,
        dateEcheance: echeance,
        joursRetard,
        locale: (document as any).langueDocument === "en" ? "en" : "fr",
      },
      pdfBuffer,
      pdfFilename,
    });

    // Mise à jour du document + historique
    const fieldKey =
      level === 1 ? "relance1SentAt" : level === 2 ? "relance2SentAt" : "relance3SentAt";
    await prisma.document.update({
      where: { id },
      data: { [fieldKey]: new Date() },
    });

    await prisma.documentEvent.create({
      data: {
        documentId: id,
        type: "REMINDER_SENT",
        description: `${levelLabel(level)} relance envoyée à ${to}`,
        userId: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      level,
      sentTo: to,
      emailId: emailResult.id ?? null,
    });
  } catch (error) {
    console.error("Erreur envoi relance :", error);
    const message = error instanceof Error ? error.message : "Erreur lors de l'envoi de la relance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const RELANCE_INCLUDE = {
  collaboration: {
    include: {
      talent: true,
      marque: { include: { contacts: { orderBy: { principal: "desc" as const } } } },
    },
  },
  linkedQuote: {
    include: { marqueContact: true, marque: true },
  },
};

/**
 * GET /api/documents/[id]/relance?level=1|2|3
 * Aperçu du mail de relance déjà envoyé (reconstruction du template + destinataire historique).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const user = session.user as { id: string; role?: string };
    if (!user.role || !ROLES_AUTORISES.includes(user.role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const levelRaw = Number(request.nextUrl.searchParams.get("level"));
    if (levelRaw !== 1 && levelRaw !== 2 && levelRaw !== 3) {
      return NextResponse.json({ error: "Niveau de relance invalide" }, { status: 400 });
    }
    const level = levelRaw as RelanceLevel;

    const document = await prisma.document.findUnique({
      where: { id },
      include: RELANCE_INCLUDE,
    });
    if (!document || document.type !== "FACTURE") {
      return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
    }

    const sentAt =
      level === 1
        ? document.relance1SentAt
        : level === 2
          ? document.relance2SentAt
          : document.relance3SentAt;
    if (!sentAt) {
      return NextResponse.json(
        { error: "Cette relance n'a pas encore été envoyée" },
        { status: 404 }
      );
    }

    const events = await prisma.documentEvent.findMany({
      where: { documentId: id, type: "REMINDER_SENT" },
      orderBy: { createdAt: "asc" },
      select: { description: true, createdAt: true },
    });
    const prefix = `${levelLabel(level)} relance envoyée à `;
    const event = [...events].reverse().find((e) => e.description?.startsWith(prefix));
    const sentToFromEvent = event?.description?.slice(prefix.length).trim() || null;

    const resolved = resolveRelanceDestinataire(document);
    const sentTo = sentToFromEvent || resolved.to;
    const destinataireNom = nomForEmail(document, sentTo) || resolved.destinataireNom;

    const echeance =
      document.dateEcheance ??
      new Date(document.dateEmission.getTime() + 30 * 24 * 60 * 60 * 1000);
    const joursRetard = Math.max(1, diffDays(echeance, sentAt));
    const clientNom = document.collaboration?.marque?.nom ?? document.clientNom ?? "Client";

    const { subject, html } = await renderRelanceEmailHtml({
      level,
      destinataireNom,
      clientNom,
      reference: document.reference,
      montantTTC: Number(document.montantTTC),
      devise: document.devise || "EUR",
      dateEmission: document.dateEmission,
      dateEcheance: echeance,
      joursRetard,
      locale: document.langueDocument === "en" ? "en" : "fr",
    });

    return NextResponse.json({
      level,
      subject,
      html,
      sentAt: sentAt.toISOString(),
      sentTo,
      from: `Comptabilité Glow Up <${AGENCE_CONFIG.email}>`,
      fromEmail: AGENCE_CONFIG.email,
      reference: document.reference,
    });
  } catch (error) {
    console.error("Erreur aperçu relance :", error);
    const message = error instanceof Error ? error.message : "Erreur lors de l'aperçu de la relance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
