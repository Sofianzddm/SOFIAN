import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";

const ALLOWED_ROLES = ["CASTING_MANAGER", "ADMIN"] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

type DemandeEntranteRow = {
  id: string;
  from: string;
  subject: string;
  body: string;
  date: Date;
  status: string;
  emailPret: string | null;
  sujetPret: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isAllowed(session.user.role)) {
      return NextResponse.json(
        { error: "Accès réservé au Casting Manager et Admin." },
        { status: 403 }
      );
    }

    const rows = (await prisma.$queryRaw`
      SELECT "id", "from", "subject", "body", "date", "status", "emailPret", "sujetPret", "createdAt", "updatedAt"
      FROM "DemandeEntrante"
      ORDER BY "date" DESC
    `) as DemandeEntranteRow[];

    return NextResponse.json({ demandes: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    console.error("GET /api/demandes-entrantes:", e);
    return NextResponse.json(
      { error: "Erreur lors du chargement des demandes entrantes." },
      { status: 500 }
    );
  }
}

