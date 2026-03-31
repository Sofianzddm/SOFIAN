import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canReadContratMarqueReview } from "@/lib/contratMarqueAccess";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const user = session.user as { id: string; role: string };
    const { id } = await params;

    const collab = await prisma.collaboration.findUnique({
      where: { id },
      select: {
        id: true,
        accountManagerId: true,
        talent: { select: { managerId: true } },
      },
    });
    if (!collab) {
      return NextResponse.json({ error: "Collaboration non trouvée" }, { status: 404 });
    }
    if (!canReadContratMarqueReview(user.id, user.role, collab)) {
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    const versionId = request.nextUrl.searchParams.get("versionId");

    const where: {
      collaborationId: string;
      OR?: ({ versionId: string | null } | { versionId: string })[];
      versionId?: string;
    } = { collaborationId: id };

    if (versionId) {
      const version = await prisma.contratMarqueVersion.findFirst({
        where: { id: versionId, collaborationId: id },
      });
      if (!version) {
        return NextResponse.json({ error: "Version introuvable" }, { status: 404 });
      }
      /** Legacy sans versionId : même PDF que la V1 uniquement (pas fusionné sur V2+). */
      const includeLegacyNull = version.numero === 1;
      if (includeLegacyNull) {
        where.OR = [{ versionId }, { versionId: null }];
      } else {
        where.versionId = versionId;
      }
    }

    const annotations = await prisma.contratMarqueAnnotation.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(annotations);
  } catch (error) {
    console.error("GET contrat-marque/annotations:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const user = session.user as { id: string; role: string };
    const { id } = await params;

    const collab = await prisma.collaboration.findUnique({
      where: { id },
      select: {
        id: true,
        accountManagerId: true,
        contratMarqueVersionActuelle: true,
        talent: { select: { managerId: true } },
      },
    });
    if (!collab) {
      return NextResponse.json({ error: "Collaboration non trouvée" }, { status: 404 });
    }
    if (!canReadContratMarqueReview(user.id, user.role, collab)) {
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }
    if (!["ADMIN", "HEAD_OF_INFLUENCE", "JURISTE"].includes(user.role)) {
      return NextResponse.json({ error: "Annotation réservée aux rôles habilités" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      content?: unknown;
      position?: unknown;
      color?: string;
      type?: string;
      versionId?: string | null;
    };
    if (!body.id || typeof body.id !== "string") {
      return NextResponse.json({ error: "id requis" }, { status: 400 });
    }
    if (body.position == null || typeof body.position !== "object") {
      return NextResponse.json({ error: "position requise" }, { status: 400 });
    }

    let versionId: string | null | undefined = body.versionId;
    if (versionId) {
      const v = await prisma.contratMarqueVersion.findFirst({
        where: { id: versionId, collaborationId: id },
      });
      if (!v) {
        return NextResponse.json({ error: "Version invalide" }, { status: 400 });
      }
    } else if (collab.contratMarqueVersionActuelle) {
      const actuelle = await prisma.contratMarqueVersion.findFirst({
        where: { collaborationId: id, numero: collab.contratMarqueVersionActuelle },
      });
      if (actuelle) {
        versionId = actuelle.id;
      }
    }

    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: { prenom: true, nom: true, role: true },
    });
    const auteurNom = profile ? `${profile.prenom} ${profile.nom}`.trim() : "Utilisateur";
    const auteurRole = profile?.role ?? user.role;

    const annotation = await prisma.contratMarqueAnnotation.create({
      data: {
        id: body.id,
        collaborationId: id,
        auteurId: user.id,
        auteurNom,
        auteurRole,
        content: body.content ?? {},
        position: body.position as object,
        color: body.color ?? "#FFE28F",
        type: body.type ?? "text",
        ...(versionId ? { versionId } : {}),
      },
    });

    return NextResponse.json(annotation);
  } catch (error) {
    console.error("POST contrat-marque/annotations:", error);
    return NextResponse.json({ error: "Erreur lors de la création" }, { status: 500 });
  }
}
