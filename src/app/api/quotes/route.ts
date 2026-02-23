import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Mêmes rôles que la page Factures pour cohérence (liste factures + onglet devis)
const ROLES = ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES"];

const QUOTE_STATUSES = ["DRAFT", "REGISTERED", "SENT", "VIEWED", "ACCEPTED", "DECLINED", "EXPIRED", "INVOICED", "CANCELLED"];

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = (session.user as { role?: string })?.role;
    if (!role || !ROLES.includes(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.trim();
    const period = searchParams.get("period") || "all"; // 3m | 6m | year | all
    const search = searchParams.get("search")?.trim() || "";

    const where: Record<string, unknown> = {};
    // Ne filtrer par statut que si une valeur valide (devis) est envoyée
    if (status && status.toLowerCase() !== "all" && QUOTE_STATUSES.includes(status)) {
      where.status = status;
    }
    if (period && period !== "all") {
      const now = new Date();
      let from: Date;
      if (period === "3m") {
        from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      } else if (period === "6m") {
        from = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      } else {
        from = new Date(now.getFullYear(), 0, 1);
      }
      where.issueDate = { gte: from };
    }
    if (search) {
      where.OR = [
        { reference: { contains: search, mode: "insensitive" } },
        { object: { contains: search, mode: "insensitive" } },
        { marque: { nom: { contains: search, mode: "insensitive" } } },
        { talent: { OR: [{ nom: { contains: search, mode: "insensitive" } }, { prenom: { contains: search, mode: "insensitive" } }] } },
      ];
    }

    const quotes = await prisma.quote.findMany({
      where,
      include: {
        marque: { select: { id: true, nom: true } },
        marqueContact: { select: { id: true, prenom: true, nom: true } },
        talent: { select: { id: true, prenom: true, nom: true } },
        collaboration: { select: { id: true, reference: true } },
      },
      orderBy: { issueDate: "desc" },
    });

    const enAttente = await prisma.quote.count({
      where: { status: { in: ["SENT", "VIEWED", "REGISTERED"] } },
    });
    const expire = await prisma.quote.count({
      where: { status: { not: "INVOICED" }, validUntil: { lt: new Date() } },
    });

    return NextResponse.json({
      quotes,
      stats: { enAttente, expire },
    });
  } catch (error) {
    console.error("GET /api/quotes:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des devis" },
      { status: 500 }
    );
  }
}
