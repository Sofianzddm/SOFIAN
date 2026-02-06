import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin uniquement" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ error: "Email requis" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        prenom: true,
        nom: true,
        role: true,
        actif: true,
        password: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      prenom: user.prenom,
      nom: user.nom,
      role: user.role,
      actif: user.actif,
      createdAt: user.createdAt,
      hasPassword: !!user.password,
      passwordStartsWith: user.password ? user.password.substring(0, 10) + "..." : null,
      passwordLength: user.password?.length || 0,
    });
  } catch (error) {
    console.error("Erreur check user:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
