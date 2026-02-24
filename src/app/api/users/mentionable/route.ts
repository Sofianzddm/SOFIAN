import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET - Utilisateurs mentionnables (@mentions) : équipe active
export async function GET() {
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

    return NextResponse.json(
      users.map((u) => ({
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
