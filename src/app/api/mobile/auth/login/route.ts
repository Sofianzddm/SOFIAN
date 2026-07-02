import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signMobileToken } from "@/lib/mobile-auth";

/**
 * POST /api/mobile/auth/login
 * Body : { email, password }
 * Retour : { token, user } — token Bearer valable 90 jours, à stocker dans
 * le keychain / secure storage de l'app mobile.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email et mot de passe requis" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });

    if (!user?.actif || !user.password) {
      return NextResponse.json(
        { error: "Identifiants invalides" },
        { status: 401 }
      );
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json(
        { error: "Identifiants invalides" },
        { status: 401 }
      );
    }

    const token = signMobileToken({ id: user.id, role: user.role });

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        prenom: user.prenom,
        nom: user.nom,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Erreur POST /api/mobile/auth/login:", error);
    return NextResponse.json(
      { error: "Erreur lors de la connexion" },
      { status: 500 }
    );
  }
}
