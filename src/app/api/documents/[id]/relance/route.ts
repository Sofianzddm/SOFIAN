// src/app/api/documents/[id]/relance/route.ts
// POST /api/documents/[id]/relance — Envoie une relance (1, 2 ou 3) à la marque
// pour une facture en retard. Email envoyé via Resend depuis comptabilite@glowupagence.fr.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendRelanceEmail, type RelanceLevel } from "@/lib/emails/relance-facture";
import { generateDocumentPDF, documentToPDFData } from "@/lib/documents/generatePDF";

const ROLES_AUTORISES = ["ADMIN", "HEAD_OF_SALES"];

function diffDays(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
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
    if (document.statut === "PAYE") {
      return NextResponse.json({ error: "Cette facture est déjà payée" }, { status: 400 });
    }
    if (document.statut === "ANNULE") {
      return NextResponse.json({ error: "Cette facture est annulée" }, { status: 400 });
    }
    if (document.statut !== "ENVOYE") {
      return NextResponse.json(
        { error: "La facture doit être au statut « Envoyé » pour pouvoir lancer une relance" },
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

    // Destinataire : 1. clientEmail explicit, 2. contact lié au devis, 3. contact principal de la marque
    let to: string | null = document.clientEmail?.trim() || null;
    let destinataireNom: string | null = null;

    if (!to && document.linkedQuote?.marqueContact?.email) {
      to = document.linkedQuote.marqueContact.email;
      destinataireNom = [document.linkedQuote.marqueContact.prenom, document.linkedQuote.marqueContact.nom]
        .filter(Boolean)
        .join(" ") || null;
    }
    if (!to && document.collaboration?.marque?.contacts?.length) {
      const principal = document.collaboration.marque.contacts.find((c) => c.principal && c.email);
      const anyContact = document.collaboration.marque.contacts.find((c) => c.email);
      const contact = principal ?? anyContact;
      if (contact?.email) {
        to = contact.email;
        destinataireNom = [contact.prenom, contact.nom].filter(Boolean).join(" ") || null;
      }
    }

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
          const pdfData = documentToPDFData(docForPdf);
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
        description: `${level === 1 ? "1ère" : level === 2 ? "2ème" : "3ème"} relance envoyée à ${to}`,
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
