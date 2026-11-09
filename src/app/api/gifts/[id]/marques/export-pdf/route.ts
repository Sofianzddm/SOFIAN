import { createElement } from "react";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { renderToBuffer } from "@react-pdf/renderer";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GiftContactedMarquesPdfDocument } from "@/lib/gifts/gift-contacted-marques-pdf";

const TYPE_LABELS: Record<string, string> = {
  PRODUIT: "Produit",
  EXPERIENCE: "Expérience",
  SERVICE: "Service",
  HOTEL: "Hôtel",
  AUTRE: "Autre",
};

function slugFilename(raw: string) {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const demande = await prisma.demandeGift.findUnique({
      where: { id },
      select: {
        id: true,
        reference: true,
        typeGift: true,
        talent: { select: { prenom: true, nom: true } },
        marques: {
          select: {
            marque: { select: { id: true, nom: true } },
          },
        },
        marque: { select: { id: true, nom: true } },
      },
    });

    if (!demande) {
      return NextResponse.json({ error: "Demande non trouvée" }, { status: 404 });
    }

    const noms = new Map<string, string>();

    for (const row of demande.marques) {
      const nom = row.marque?.nom?.trim();
      if (!nom || !row.marque?.id) continue;
      noms.set(row.marque.id, nom);
    }

    // Legacy : marque principale seule
    if (noms.size === 0 && demande.marque?.nom?.trim()) {
      noms.set(demande.marque.id, demande.marque.nom.trim());
    }

    const marqueNoms = Array.from(noms.values()).sort((a, b) =>
      a.localeCompare(b, "fr", { sensitivity: "base" })
    );

    if (marqueNoms.length === 0) {
      return NextResponse.json(
        { error: "Aucune marque à exporter." },
        { status: 400 }
      );
    }

    const talentName = [demande.talent?.prenom, demande.talent?.nom]
      .filter(Boolean)
      .join(" ")
      .trim() || "Talent";

    const buffer = await renderToBuffer(
      createElement(GiftContactedMarquesPdfDocument, {
        talentName,
        reference: demande.reference || id,
        typeGiftLabel: TYPE_LABELS[demande.typeGift] || demande.typeGift || "Gift",
        marqueNoms,
        generatedAt: new Date(),
      }) as Parameters<typeof renderToBuffer>[0]
    );

    const filename = `marques-selection-${slugFilename(talentName)}-${slugFilename(
      demande.reference || id
    )}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/gifts/[id]/marques/export-pdf:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
