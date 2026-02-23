// src/app/api/documents/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
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
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document non trouvé" },
        { status: 404 }
      );
    }

    return NextResponse.json(document);
  } catch (error) {
    console.error("Erreur récupération document:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération du document" },
      { status: 500 }
    );
  }
}
