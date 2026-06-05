import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { findMarqueByName } from "@/lib/marque-resolver";

// GET - Recherche les contacts d'une marque enregistrée dans l'app (CRM interne),
// à partir du nom de la boîte. Ne touche pas HubSpot.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const brand = (request.nextUrl.searchParams.get("brand") || "").trim();
    if (brand.length < 2) {
      return NextResponse.json(
        { error: "Paramètre brand requis (min 2 caractères)." },
        { status: 400 }
      );
    }

    const resolved = await findMarqueByName(brand);
    if (!resolved) {
      return NextResponse.json({ contacts: [], marqueId: null });
    }

    const rows = await prisma.marqueContact.findMany({
      where: { marqueId: resolved.marqueId, email: { not: null } },
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        poste: true,
        principal: true,
      },
      orderBy: [{ principal: "desc" }, { nom: "asc" }],
    });

    const marque = await prisma.marque.findUnique({
      where: { id: resolved.marqueId },
      select: { nom: true },
    });

    const contacts = rows
      .map((c) => ({
        id: c.id,
        firstname: (c.prenom || "").trim(),
        lastname: (c.nom || "").trim(),
        email: (c.email || "").trim(),
        role: (c.poste || "").trim(),
        companyName: marque?.nom || brand,
      }))
      .filter((c) => c.email);

    return NextResponse.json({ contacts, marqueId: resolved.marqueId });
  } catch (error) {
    console.error("GET /api/marques/contacts:", error);
    return NextResponse.json(
      { error: "Erreur lors de la recherche des contacts de la marque." },
      { status: 500 }
    );
  }
}
