import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/objectifs/[id] — mettre à jour (valeurActuelle) ou ADMIN édite
 * DELETE /api/objectifs/[id] — ADMIN uniquement
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const { id } = await params;
    const existing = await prisma.objectif.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Objectif introuvable" }, { status: 404 });
    }

    const role = (session.user as { role?: string }).role;
    const userId = (session.user as { id?: string }).id;
    const isAdmin = role === "ADMIN";
    const isBeneficiaire = existing.userId === userId;

    if (!isAdmin && !isBeneficiaire) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const body = await request.json();
    const data: { valeurActuelle?: number | null; titre?: string; description?: string | null; valeurCible?: number | null; dateLimite?: Date | null } = {};
    if (typeof body.valeurActuelle !== "undefined") {
      data.valeurActuelle = body.valeurActuelle != null ? Number(body.valeurActuelle) : null;
    }
    if (isAdmin) {
      if (typeof body.titre === "string") data.titre = body.titre.trim();
      if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null;
      if (body.valeurCible !== undefined) data.valeurCible = body.valeurCible != null ? Number(body.valeurCible) : null;
      if (body.dateLimite !== undefined) data.dateLimite = body.dateLimite ? new Date(body.dateLimite) : null;
    }

    const objectif = await prisma.objectif.update({
      where: { id },
      data,
      include: { createur: { select: { prenom: true, nom: true } } },
    });
    return NextResponse.json({ objectif });
  } catch (error) {
    console.error("PATCH /api/objectifs/[id]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
      return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
    }
    const { id } = await params;
    await prisma.objectif.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/objectifs/[id]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
