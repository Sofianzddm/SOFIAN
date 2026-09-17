import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  canReadContratMarqueReview,
  contratMarqueTalentAccessSelect,
} from "@/lib/contratMarqueAccess";

// GET - Utilisateurs mentionnables (@mentions) : équipe active
// `?contratMarqueCollabId=` restreint la liste aux personnes qui ont accès à la
// relecture du contrat : on ne peut pas mentionner une TM qui n'est ni la TM du
// talent ni son relai actif.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const users = await prisma.user.findMany({
      where: { actif: true },
      select: {
        id: true,
        prenom: true,
        nom: true,
        role: true,
      },
      orderBy: [{ prenom: "asc" }, { nom: "asc" }],
    });

    const contratMarqueCollabId = request.nextUrl.searchParams.get("contratMarqueCollabId");
    let autorises = users;
    if (contratMarqueCollabId) {
      const collab = await prisma.collaboration.findUnique({
        where: { id: contratMarqueCollabId },
        select: {
          accountManagerId: true,
          isPrivate: true,
          accountManager: { select: { role: true } },
          talent: { select: contratMarqueTalentAccessSelect },
        },
      });
      if (collab) {
        autorises = users.filter((u) => canReadContratMarqueReview(u.id, u.role, collab));
      }
    }

    return NextResponse.json(
      autorises.map((u) => ({
        id: u.id,
        firstName: u.prenom,
        lastName: u.nom,
        role: u.role,
      }))
    );
  } catch (error) {
    console.error("GET /api/users/mentionable:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des utilisateurs" },
      { status: 500 }
    );
  }
}
