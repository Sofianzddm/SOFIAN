import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * Gestion des marques filles d'une marque mère (id = la mère).
 *
 * POST   { childId }        → rattache la marque `childId` comme fille de `id`
 * DELETE ?childId=…         → détache la fille `childId` de `id`
 *
 * Garde anti-cycle : on ne peut pas rattacher une marque à l'une de ses propres
 * descendantes (ex. Unilever ne peut pas devenir fille de Dove).
 */

// POST — rattacher une fille
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { childId?: string };
    const childId = (body.childId || "").trim();

    if (!childId) {
      return NextResponse.json({ message: "childId requis." }, { status: 400 });
    }
    if (childId === id) {
      return NextResponse.json(
        { message: "Une marque ne peut pas être sa propre fille." },
        { status: 400 }
      );
    }

    const [mother, child] = await Promise.all([
      prisma.marque.findUnique({ where: { id }, select: { id: true } }),
      prisma.marque.findUnique({
        where: { id: childId },
        select: { id: true, nom: true },
      }),
    ]);
    if (!mother) {
      return NextResponse.json({ message: "Marque mère introuvable." }, { status: 404 });
    }
    if (!child) {
      return NextResponse.json({ message: "Marque fille introuvable." }, { status: 404 });
    }

    // Anti-cycle : la mère ne doit pas être une descendante de la fille.
    let cursor: string | null = id;
    let guard = 0;
    while (cursor && guard < 50) {
      const p: { parentMarqueId: string | null } | null = await prisma.marque.findUnique({
        where: { id: cursor },
        select: { parentMarqueId: true },
      });
      cursor = p?.parentMarqueId ?? null;
      if (cursor === childId) {
        return NextResponse.json(
          { message: "Hiérarchie circulaire : cette marque est une ascendante de la mère." },
          { status: 400 }
        );
      }
      guard += 1;
    }

    await prisma.marque.update({
      where: { id: childId },
      data: { parentMarqueId: id },
    });

    return NextResponse.json({ ok: true, child });
  } catch (error) {
    console.error("Erreur POST marque children:", error);
    return NextResponse.json({ message: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE — détacher une fille
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await params;
    const childId = (request.nextUrl.searchParams.get("childId") || "").trim();
    if (!childId) {
      return NextResponse.json({ message: "childId requis." }, { status: 400 });
    }

    const child = await prisma.marque.findUnique({
      where: { id: childId },
      select: { id: true, parentMarqueId: true },
    });
    if (!child || child.parentMarqueId !== id) {
      return NextResponse.json(
        { message: "Cette marque n'est pas une fille de la marque indiquée." },
        { status: 400 }
      );
    }

    await prisma.marque.update({
      where: { id: childId },
      data: { parentMarqueId: null },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erreur DELETE marque children:", error);
    return NextResponse.json({ message: "Erreur serveur" }, { status: 500 });
  }
}
