// src/app/api/documents/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";
import { denyIfUnassignedCm } from "@/lib/account-manager-assign";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const params = await Promise.resolve(context.params);
    const { id } = params;
    
    console.log("📄 Get document request:", { id, user: session.user.id });

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        collaboration: {
          include: {
            talent: true,
            marque: {
              select: {
                id: true,
                nom: true,
                raisonSociale: true,
                adresseRue: true,
                adresseComplement: true,
                codePostal: true,
                ville: true,
                pays: true,
                siret: true,
                numeroTVA: true,
              },
            },
            quotes: {
              select: {
                id: true,
                reference: true,
                issueDate: true,
                status: true,
                invoiceId: true,
              },
              orderBy: { issueDate: "desc" },
            },
          },
        },
        createdBy: { select: { id: true, prenom: true, nom: true, email: true } },
        events: {
          orderBy: { createdAt: "desc" },
          include: { user: { select: { id: true, prenom: true, nom: true, email: true } } },
        },
        comments: {
          orderBy: { createdAt: "desc" },
          include: { user: { select: { id: true, prenom: true, nom: true, email: true } } },
        },
        linkedQuote: true,
        transactionsQonto: {
          orderBy: { dateTransaction: "desc" },
          select: {
            id: true,
            qontoId: true,
            montant: true,
            libelle: true,
            reference: true,
            dateTransaction: true,
            emetteur: true,
            emetteurIban: true,
            statut: true,
          },
        },
        transactionMatches: {
          orderBy: { createdAt: "desc" },
          include: {
            transaction: {
              select: {
                id: true,
                qontoId: true,
                montant: true,
                libelle: true,
                reference: true,
                dateTransaction: true,
                emetteur: true,
                emetteurIban: true,
                statut: true,
              },
            },
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document non trouvé" },
        { status: 404 }
      );
    }

    // Infos confidentielles : seul l'admin voit "Payé" (marque nous a réglé) et les infos de paiement
    const isAdmin = (session.user as { role?: string }).role === "ADMIN";
    const payload = isAdmin
      ? document
      : {
          ...document,
          statut: document.statut === "PAYE" ? "ENVOYE" : document.statut,
          datePaiement: null,
          referencePaiement: null,
          modePaiement: null,
          transactionsQonto: [],
          transactionMatches: [],
        };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Erreur récupération document:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération du document" },
      { status: 500 }
    );
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES_EMAIL = ["ADMIN", "HEAD_OF_SALES", "CM"];

/**
 * PATCH /api/documents/[id]
 * Met à jour l'email destinataire (clientEmail) d'une facture, sans toucher au PDF.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const user = session.user as { id: string; role?: string };
    if (!user.role || !ROLES_EMAIL.includes(user.role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const params = await Promise.resolve(context.params);
    const { id } = params;
    const body = await request.json().catch(() => ({}));
    if (!("clientEmail" in body)) {
      return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
    }

    const raw = typeof body.clientEmail === "string" ? body.clientEmail.trim() : "";
    if (raw && !EMAIL_RE.test(raw)) {
      return NextResponse.json({ error: "Adresse email invalide" }, { status: 400 });
    }

    const document = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        statut: true,
        clientEmail: true,
        collaboration: { select: { accountManagerId: true } },
      },
    });
    if (!document) {
      return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });
    }
    if (denyIfUnassignedCm(user, document.collaboration?.accountManagerId)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    if (document.type !== "FACTURE") {
      return NextResponse.json(
        { error: "L'email destinataire ne peut être renseigné que sur une facture" },
        { status: 400 }
      );
    }
    if (document.statut === "ANNULE") {
      return NextResponse.json(
        { error: "Impossible de modifier une facture annulée" },
        { status: 400 }
      );
    }

    const clientEmail = raw || null;
    const updated = await prisma.document.update({
      where: { id },
      data: { clientEmail },
      select: { id: true, reference: true, clientEmail: true },
    });

    await prisma.documentEvent.create({
      data: {
        documentId: id,
        type: "EDITED",
        description: clientEmail
          ? `Email destinataire mis à jour : ${clientEmail}`
          : "Email destinataire retiré",
        userId: user.id,
      },
    });

    return NextResponse.json({ success: true, document: updated });
  } catch (error) {
    console.error("Erreur mise à jour email destinataire:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour de l'email" },
      { status: 500 }
    );
  }
}
