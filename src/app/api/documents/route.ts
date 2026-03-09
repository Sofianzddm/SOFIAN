import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import prisma from "@/lib/prisma";

// GET - Liste tous les documents
export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const statut = searchParams.get("statut");

    const documents = await prisma.document.findMany({
      where: {
        ...(type && type !== "ALL" ? { type: type as any } : {}),
        ...(statut && statut !== "ALL" ? { statut: statut as any } : {}),
      },
      include: {
        collaboration: {
          select: {
            id: true,
            reference: true,
            talent: {
              select: { id: true, prenom: true, nom: true },
            },
            marque: {
              select: { id: true, nom: true },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Infos confidentielles : seul l'admin voit le statut "Payé" sur les documents (factures)
    const isAdmin = (session.user as { role?: string }).role === "ADMIN";
    const payload = isAdmin
      ? documents
      : documents.map((d) => ({
          ...d,
          statut: d.statut === "PAYE" ? "ENVOYE" : d.statut,
          ...(d.statut === "PAYE" ? { datePaiement: null, referencePaiement: null, modePaiement: null } : {}),
        }));

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Erreur GET documents:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des documents" },
      { status: 500 }
    );
  }
}
