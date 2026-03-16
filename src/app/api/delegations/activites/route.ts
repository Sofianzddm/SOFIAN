import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import prisma from "@/lib/prisma";

// GET /api/delegations/activites?tmOrigineId=xxx
// Retourne les activités loggées pendant les délégations d'une TM
export async function GET(request: NextRequest) {
  const session = await getAppSession(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const url = new URL(request.url);
  const tmOrigineId = url.searchParams.get("tmOrigineId") ?? (session.user as any).id;

  // Sécurité : une TM ne peut voir que ses propres délégations
  if ((session.user as any).role === "TM" && tmOrigineId !== (session.user as any).id) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const activites = await prisma.delegationActivite.findMany({
    where: {
      delegation: {
        tmOrigineId,
      },
    },
    include: {
      auteur: { select: { prenom: true, nom: true } },
      talent: { select: { id: true, prenom: true, nom: true, photo: true } },
      delegation: {
        select: {
          tmRelai: { select: { prenom: true, nom: true } },
          actif: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(activites);
}

