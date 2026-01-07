import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET - Liste des users (filtrable par rôle)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");

    const where: any = { actif: true };
    
    if (role) {
      where.role = role;
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        role: true,
      },
      orderBy: {
        prenom: "asc",
      },
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error("Erreur GET users:", error);
    return NextResponse.json(
      { message: "Erreur lors de la récupération des utilisateurs" },
      { status: 500 }
    );
  }
}
