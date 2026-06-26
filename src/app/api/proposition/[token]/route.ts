import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Lecture publique d'une proposition de partenariat (lien privé par token).
 * Aucune authentification : la marque y accède via le lien partagé.
 *  GET  → contenu de la présentation (incrémente le compteur de vues)
 */

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const proposal = await prisma.partnershipProposal.findUnique({
      where: { publicToken: token },
    });

    if (!proposal) {
      return NextResponse.json({ error: "Lien privé invalide" }, { status: 404 });
    }

    // Tracking de consultation (best-effort, non bloquant).
    prisma.partnershipProposal
      .update({
        where: { id: proposal.id },
        data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
      })
      .catch(() => {});

    return NextResponse.json({
      proposal: {
        id: proposal.id,
        nomMarque: proposal.nomMarque,
        brandLogoUrl: proposal.brandLogoUrl,
        title: proposal.title,
        subtitle: proposal.subtitle,
        coverPhotoUrl: proposal.coverPhotoUrl,
        accentColor: proposal.accentColor,
        theme: proposal.theme ?? null,
        emvConfig: proposal.emvConfig ?? null,
        introMessage: proposal.introMessage,
        casting: Array.isArray(proposal.casting) ? proposal.casting : [],
        castingGroups: Array.isArray(proposal.castingGroups) ? proposal.castingGroups : [],
        budgetLines: Array.isArray(proposal.budgetLines) ? proposal.budgetLines : [],
        budgetGroups: Array.isArray(proposal.budgetGroups) ? proposal.budgetGroups : [],
        budgetCurrency: proposal.budgetCurrency,
        deliverables: Array.isArray(proposal.deliverables) ? proposal.deliverables : [],
        photos: Array.isArray(proposal.photos) ? proposal.photos : [],
        logistics: Array.isArray(proposal.logistics) ? proposal.logistics : [],
        eventLocation: proposal.eventLocation,
        eventDateLabel: proposal.eventDateLabel,
        contactName: proposal.contactName,
        contactEmail: proposal.contactEmail,
      },
    });
  } catch (error) {
    console.error("GET /api/proposition/[token]:", error);
    return NextResponse.json({ error: "Erreur lors du chargement" }, { status: 500 });
  }
}
