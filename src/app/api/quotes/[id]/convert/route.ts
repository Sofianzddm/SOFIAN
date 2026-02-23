import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { genererNumeroDocument } from "@/lib/documents/numerotation";

const ROLES = ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE"];

/**
 * POST /api/quotes/[id]/convert
 * Convertit un devis (Quote) en facture (Document).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: quoteId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const user = session.user as { id: string; role?: string };
    if (!user.role || !ROLES.includes(user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        items: { orderBy: { sortOrder: "asc" } },
        collaboration: true,
        marque: true,
        talent: true,
      },
    });

    if (!quote) {
      return NextResponse.json({ error: "Devis non trouvé" }, { status: 404 });
    }
    if (quote.status === "INVOICED" && quote.invoiceId) {
      return NextResponse.json(
        { error: "Ce devis a déjà été converti en facture" },
        { status: 400 }
      );
    }
    if (quote.status === "CANCELLED" || quote.status === "DECLINED") {
      return NextResponse.json(
        { error: "Impossible de convertir un devis annulé ou refusé" },
        { status: 400 }
      );
    }

    const referenceFacture = await genererNumeroDocument("FACTURE");

    const lignes = quote.items.map((item) => ({
      description: item.designation,
      quantite: item.quantity,
      prixUnitaire: item.unitPriceHT,
      montantHT: item.totalHT,
    }));

    const montantHT = quote.totalHT;
    const montantTVA = quote.totalTVA;
    const montantTTC = quote.totalTTC;

    const document = await prisma.document.create({
      data: {
        reference: referenceFacture,
        type: "FACTURE",
        statut: "BROUILLON",
        collaborationId: quote.collaborationId,
        titre: quote.object,
        montantHT,
        tauxTVA: quote.tvaRate,
        montantTVA,
        montantTTC,
        typeTVA: "FRANCE",
        lignes: lignes as any,
        dateDocument: new Date(),
        dateEmission: new Date(),
        dateEcheance: quote.validUntil,
        factureRef: quote.reference,
        createdById: user.id,
      },
    });

    await prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: "INVOICED",
        invoiceId: document.id,
        convertedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      facture: {
        id: document.id,
        reference: referenceFacture,
        montantTTC: Number(document.montantTTC),
      },
      message: `Facture ${referenceFacture} créée depuis le devis ${quote.reference}`,
    });
  } catch (error) {
    console.error("Erreur conversion Quote→Facture:", error);
    return NextResponse.json(
      { error: "Erreur lors de la conversion du devis en facture" },
      { status: 500 }
    );
  }
}
