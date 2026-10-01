import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getTalentDemoPublishedCollaborations } from "@/lib/talent-demo";
import { talentPortalPublishedWhere } from "@/lib/talent-portal";

/**
 * GET /api/talents/me/factures
 * Liste des factures que le talent nous a envoyées (uploadées).
 * Le talent n'a JAMAIS accès aux factures client.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const forceDemo = request.nextUrl.searchParams.get("demo") === "1";
    const envDemo = process.env.TALENT_PORTAL_DEMO === "1";
    if (forceDemo || envDemo) {
      const collaborations = getTalentDemoPublishedCollaborations();
      const formatted = collaborations.map((collab) => ({
        id: collab.id,
        reference: `Facture ${collab.marque}`.trim(),
        marque: collab.marque,
        dateEmission: collab.factureTalentRecueAt || collab.datePublication || collab.createdAt,
        montant: collab.montant,
        statut: collab.paidAt
          ? "PAYE"
          : collab.factureTalentUrl
          ? "FACTURE_RECUE"
          : "EN_ATTENTE",
        pdfUrl: collab.factureTalentUrl || null,
      }));
      return NextResponse.json(formatted);
    }

    if (session.user.role !== "TALENT") {
      return NextResponse.json(
        { error: "Accès réservé aux talents" },
        { status: 403 }
      );
    }

    // Récupérer le talent associé à cet utilisateur
    const talent = await prisma.talent.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!talent) {
      return NextResponse.json(
        { error: "Aucun profil talent trouvé" },
        { status: 404 }
      );
    }

    // Uniquement les factures que le talent nous a envoyées (uploadées),
    // sur les collabs publiées depuis le lancement du portail
    const collaborations = await prisma.collaboration.findMany({
      where: {
        talentId: talent.id,
        ...talentPortalPublishedWhere,
        OR: [
          { factureTalentUrl: { not: null } },
          { cycles: { some: { factureTalentUrl: { not: null } } } },
        ],
      },
      include: {
        marque: {
          select: { nom: true },
        },
        cycles: {
          where: { factureTalentUrl: { not: null } },
          orderBy: { numero: "asc" },
          select: {
            id: true,
            numero: true,
            description: true,
            montantNet: true,
            factureTalentUrl: true,
            factureTalentRecueAt: true,
            paidAt: true,
          },
        },
      },
      orderBy: { factureTalentRecueAt: "desc" },
    });

    const formatted: Array<{
      id: string;
      reference: string;
      marque: string;
      dateEmission: Date | string | null;
      montant: number;
      statut: string;
      pdfUrl: string | null;
    }> = [];

    for (const collab of collaborations) {
      if (collab.cycles.length > 0) {
        for (const cy of collab.cycles) {
          formatted.push({
            id: cy.id,
            reference: `Facture ${collab.marque?.nom || "collab"} — ${cy.description || `Cycle ${cy.numero}`}`.trim(),
            marque: collab.marque?.nom || "",
            dateEmission: cy.factureTalentRecueAt || collab.createdAt,
            montant: Number(cy.montantNet ?? 0),
            statut: cy.paidAt || collab.paidAt ? "PAYE" : "FACTURE_RECUE",
            pdfUrl: cy.factureTalentUrl,
          });
        }
      } else if (collab.factureTalentUrl) {
        formatted.push({
          id: collab.id,
          reference: `Facture ${collab.marque?.nom || "collab"}`.trim(),
          marque: collab.marque?.nom || "",
          dateEmission: collab.factureTalentRecueAt || collab.createdAt,
          montant: Number(collab.montantNet ?? 0),
          statut: collab.paidAt ? "PAYE" : "FACTURE_RECUE",
          pdfUrl: collab.factureTalentUrl,
        });
      }
    }

    formatted.sort((a, b) => {
      const da = new Date(a.dateEmission || 0).getTime();
      const db = new Date(b.dateEmission || 0).getTime();
      return db - da;
    });

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("❌ Erreur GET /api/talents/me/factures:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des factures" },
      { status: 500 }
    );
  }
}

