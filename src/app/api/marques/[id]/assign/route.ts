import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canWriteMarqueCrm } from "@/lib/marque-crm-access";
import { isMarquePortfolioRole } from "@/lib/marque-portfolio";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH — Attribue la marque FR au portefeuille Leyna ou Joey.
 * Body: { assignedToId: string | null, marqueIdBe?: string }
 * Si marqueIdBe (ou fiches BE déjà linkedMarqueId) : garantit le lien FR↔BE
 * pour que le portefeuille s’applique aussi à la fiche Benelux liée.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canWriteMarqueCrm(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.marque.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Marque introuvable" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      assignedToId?: string | null;
      /** Fiche Benelux à (re)lier explicitement à cette marque FR. */
      marqueIdBe?: string | null;
    };

    if (!("assignedToId" in body)) {
      return NextResponse.json(
        { error: "assignedToId requis (string ou null)" },
        { status: 400 }
      );
    }

    const assignedToId =
      body.assignedToId === null || body.assignedToId === ""
        ? null
        : String(body.assignedToId).trim();

    if (assignedToId) {
      const owner = await prisma.user.findFirst({
        where: { id: assignedToId, actif: true },
        select: { id: true, role: true, prenom: true, nom: true, email: true },
      });
      if (!owner || !isMarquePortfolioRole(owner.role)) {
        return NextResponse.json(
          {
            error:
              "L’assignation doit viser Leyna (Head of Sales) ou Joey (Business Developer).",
          },
          { status: 400 }
        );
      }
    }

    const marqueIdBe = String(body.marqueIdBe || "").trim() || null;
    if (marqueIdBe) {
      const be = await prisma.beneluxCompany.findUnique({
        where: { id: marqueIdBe },
        select: { id: true },
      });
      if (!be) {
        return NextResponse.json(
          { error: "Fiche Benelux introuvable" },
          { status: 404 }
        );
      }
      await prisma.beneluxCompany.update({
        where: { id: marqueIdBe },
        data: { linkedMarqueId: id },
      });
    }

    // Toute fiche BE déjà liée reste liée ; on compte pour le feedback UI.
    const linkedBe = await prisma.beneluxCompany.findMany({
      where: { linkedMarqueId: id },
      select: { id: true, nom: true },
    });

    const marque = await prisma.marque.update({
      where: { id },
      data: { assignedToId },
      select: {
        id: true,
        assignedToId: true,
        assignedTo: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json({
      ...marque,
      linkedBenelux: linkedBe,
      appliedToBenelux: linkedBe.length > 0,
    });
  } catch (error) {
    console.error("PATCH marque assign:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
