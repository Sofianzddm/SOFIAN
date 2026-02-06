import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

// GET - Liste des users (filtrable par rôle)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Seuls ADMIN et HEAD_OF peuvent voir la liste complète
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES"].includes(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");
    const showAll = searchParams.get("showAll") === "true";

    const where: any = {};
    
    // Par défaut, ne montrer que les utilisateurs actifs
    if (!showAll) {
      where.actif = true;
    }
    
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
        actif: true,
        createdAt: true,
      },
      orderBy: [
        { actif: "desc" },
        { prenom: "asc" },
      ],
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error("Erreur GET users:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des utilisateurs" },
      { status: 500 }
    );
  }
}

// POST - Créer un nouvel utilisateur
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Seuls les ADMIN peuvent créer des utilisateurs
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ 
        error: "Seuls les administrateurs peuvent créer des utilisateurs" 
      }, { status: 403 });
    }

    const data = await request.json();

    // Validation des champs requis
    if (!data.email || !data.prenom || !data.nom || !data.role || !data.password) {
      return NextResponse.json({ 
        error: "Email, prénom, nom, rôle et mot de passe sont requis" 
      }, { status: 400 });
    }

    // Validation du mot de passe
    if (data.password.length < 8) {
      return NextResponse.json({ 
        error: "Le mot de passe doit contenir au moins 8 caractères" 
      }, { status: 400 });
    }

    // Vérifier si l'email existe déjà
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      return NextResponse.json({ 
        error: "Un utilisateur avec cet email existe déjà" 
      }, { status: 400 });
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Créer l'utilisateur avec le mot de passe hashé
    const user = await prisma.user.create({
      data: {
        email: data.email,
        prenom: data.prenom,
        nom: data.nom,
        password: hashedPassword,
        role: data.role,
        actif: true,
      },
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        role: true,
        actif: true,
        createdAt: true,
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error("Erreur POST user:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création de l'utilisateur" },
      { status: 500 }
    );
  }
}
