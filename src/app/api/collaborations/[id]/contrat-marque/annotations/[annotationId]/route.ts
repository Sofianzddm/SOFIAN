import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canReadContratMarqueReview } from "@/lib/contratMarqueAccess";

async function loadCollabForAccess(id: string) {
  return prisma.collaboration.findUnique({
    where: { id },
    select: {
      id: true,
      accountManagerId: true,
      talent: { select: { managerId: true } },
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; annotationId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const user = session.user as { id: string; role: string };
    const { id, annotationId } = await params;

    const collab = await loadCollabForAccess(id);
    if (!collab) {
      return NextResponse.json({ error: "Collaboration non trouvée" }, { status: 404 });
    }
    if (!canReadContratMarqueReview(user.id, user.role, collab)) {
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }
    if (!["ADMIN", "JURISTE", "HEAD_OF_INFLUENCE"].includes(user.role)) {
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    const existing = await prisma.contratMarqueAnnotation.findFirst({
      where: { id: annotationId, collaborationId: id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Annotation introuvable" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      resolved?: boolean;
      content?: unknown;
    };

    const data: { resolved?: boolean; content?: object } = {};
    if (typeof body.resolved === "boolean") data.resolved = body.resolved;
    if (body.content !== undefined) {
      if (typeof body.content !== "object" || body.content === null) {
        return NextResponse.json({ error: "content invalide" }, { status: 400 });
      }
      data.content = body.content as object;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
    }

    const updated = await prisma.contratMarqueAnnotation.update({
      where: { id: annotationId },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH contrat-marque/annotations/[id]:", error);
    return NextResponse.json({ error: "Erreur lors de la mise à jour" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; annotationId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const user = session.user as { id: string; role: string };
    const { id, annotationId } = await params;

    const collab = await loadCollabForAccess(id);
    if (!collab) {
      return NextResponse.json({ error: "Collaboration non trouvée" }, { status: 404 });
    }
    if (!canReadContratMarqueReview(user.id, user.role, collab)) {
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    const existing = await prisma.contratMarqueAnnotation.findFirst({
      where: { id: annotationId, collaborationId: id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Annotation introuvable" }, { status: 404 });
    }

    const isAdmin = user.role === "ADMIN";
    const isOwnAnnotateur =
      existing.auteurId === user.id && ["JURISTE", "HEAD_OF_INFLUENCE"].includes(user.role);
    if (!isAdmin && !isOwnAnnotateur) {
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    await prisma.contratMarqueAnnotation.delete({
      where: { id: annotationId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE contrat-marque/annotations/[id]:", error);
    return NextResponse.json({ error: "Erreur lors de la suppression" }, { status: 500 });
  }
}
