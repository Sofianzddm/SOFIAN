import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getImpersonateCookieName } from "@/lib/getAppSession";

const COOKIE_MAX_AGE = 60 * 60; // 1 heure

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const userId = typeof body.userId === "string" ? body.userId.trim() : null;
    if (!userId) {
      return NextResponse.json({ error: "userId requis" }, { status: 400 });
    }

    if (userId === session.user.id) {
      return NextResponse.json({ error: "Vous ne pouvez pas vous faire passer pour vous-même" }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, actif: true, prenom: true, nom: true, role: true },
    });
    if (!targetUser || !targetUser.actif) {
      return NextResponse.json({ error: "Utilisateur introuvable ou inactif" }, { status: 404 });
    }

    const cookieName = getImpersonateCookieName();
    const res = NextResponse.json({
      ok: true,
      // Données utiles pour éventuellement piloter useSession().update côté client
      impersonatedId: targetUser.id,
      impersonatedRole: targetUser.role,
      adminName: `${(session.user as any).name ?? ""}`.trim(),
    });
    res.cookies.set(cookieName, userId, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
    });
    return res;
  } catch (error) {
    console.error("Erreur impersonate:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
