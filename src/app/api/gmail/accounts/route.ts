import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";
import { clearGmailFromNameCache, clearGmailSignatureCache } from "@/lib/gmail";

/**
 * Gestion des boîtes Gmail connectées à la plateforme.
 *  GET    → liste des boîtes (ADMIN : tout + liste users pour liaison ;
 *           CASTING_MANAGER : liste simple pour le sélecteur d'expéditeur)
 *  PATCH  → lier/délier un utilisateur, changer le nom d'expéditeur (ADMIN)
 *  DELETE → déconnecter une boîte (ADMIN)
 */

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role || "";
    // STRATEGY_PLANNER : lecture seule pour afficher le nom de la boîte
    // d'envoi de ses projets (Ski Trip → Ines).
    if (role !== "ADMIN" && role !== "CASTING_MANAGER" && role !== "STRATEGY_PLANNER") {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const tokens = await prisma.gmailToken.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        displayName: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, prenom: true, nom: true, email: true, role: true } },
      },
    });

    const accounts = tokens.map((t) => ({
      id: t.id,
      email: t.email,
      displayName: t.displayName,
      userId: t.userId,
      user: t.user,
      connectedAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

    if (role !== "ADMIN") {
      return NextResponse.json({ accounts });
    }

    const users = await prisma.user.findMany({
      where: { actif: true },
      orderBy: [{ prenom: "asc" }, { nom: "asc" }],
      select: { id: true, prenom: true, nom: true, email: true, role: true },
    });

    return NextResponse.json({ accounts, users });
  } catch (error) {
    console.error("GET /api/gmail/accounts:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Réservé à l'admin" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      userId?: string | null;
      displayName?: string | null;
    };
    const id = (body.id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "Id de boîte requis." }, { status: 400 });
    }

    const token = await prisma.gmailToken.findUnique({ where: { id } });
    if (!token) {
      return NextResponse.json({ error: "Boîte introuvable." }, { status: 404 });
    }

    const data: { userId?: string | null; displayName?: string | null } = {};

    if ("userId" in body) {
      const userId = body.userId ? String(body.userId).trim() : null;
      if (userId) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) {
          return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
        }
        const alreadyLinked = await prisma.gmailToken.findUnique({
          where: { userId },
          select: { id: true, email: true },
        });
        if (alreadyLinked && alreadyLinked.id !== id) {
          return NextResponse.json(
            { error: `Cet utilisateur est déjà lié à la boîte ${alreadyLinked.email}.` },
            { status: 409 }
          );
        }
      }
      data.userId = userId;
    }

    if ("displayName" in body) {
      data.displayName = body.displayName ? String(body.displayName).trim() || null : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Rien à modifier." }, { status: 400 });
    }

    const updated = await prisma.gmailToken.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        displayName: true,
        userId: true,
        user: { select: { id: true, prenom: true, nom: true, email: true, role: true } },
      },
    });

    clearGmailFromNameCache(updated.email);

    return NextResponse.json({ account: updated });
  } catch (error) {
    console.error("PATCH /api/gmail/accounts:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Réservé à l'admin" }, { status: 403 });
    }

    const id = (request.nextUrl.searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json({ error: "Id de boîte requis." }, { status: 400 });
    }

    const token = await prisma.gmailToken.findUnique({ where: { id } });
    if (!token) {
      return NextResponse.json({ error: "Boîte introuvable." }, { status: 404 });
    }

    await prisma.gmailToken.delete({ where: { id } });
    clearGmailFromNameCache(token.email);
    clearGmailSignatureCache(token.email);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/gmail/accounts:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
