import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

// POST - Activer le portail créateur pour un talent
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: talentId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };

    // Seuls ADMIN et HEAD_OF peuvent activer le portail
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE"].includes(user.role)) {
      return NextResponse.json(
        { error: "Permissions insuffisantes" },
        { status: 403 }
      );
    }

    const { password } = await request.json();

    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 8 caractères" },
        { status: 400 }
      );
    }

    // Vérifier que le talent existe
    const talent = await prisma.talent.findUnique({
      where: { id: talentId },
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        userId: true,
      },
    });

    if (!talent) {
      return NextResponse.json({ error: "Talent introuvable" }, { status: 404 });
    }

    // Vérifier si le talent a déjà un compte utilisateur
    if (talent.userId) {
      return NextResponse.json(
        { error: "Ce talent a déjà un compte utilisateur actif" },
        { status: 400 }
      );
    }

    // Vérifier si l'email est déjà utilisé
    const existingUser = await prisma.user.findUnique({
      where: { email: talent.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Un utilisateur avec cet email existe déjà" },
        { status: 400 }
      );
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Créer l'utilisateur et lier au talent dans une transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Créer l'utilisateur
      const newUser = await tx.user.create({
        data: {
          email: talent.email,
          prenom: talent.prenom,
          nom: talent.nom,
          password: hashedPassword,
          role: "TALENT",
          actif: true,
        },
      });

      // 2. Lier le talent à l'utilisateur
      const updatedTalent = await tx.talent.update({
        where: { id: talentId },
        data: { userId: newUser.id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              actif: true,
            },
          },
        },
      });

      return { user: newUser, talent: updatedTalent };
    });

    return NextResponse.json({
      message: "Portail créateur activé avec succès",
      talent: result.talent,
    });
  } catch (error) {
    console.error("Erreur activation portail:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'activation du portail" },
      { status: 500 }
    );
  }
}
