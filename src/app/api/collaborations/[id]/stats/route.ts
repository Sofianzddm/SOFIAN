import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import prisma from "@/lib/prisma";
import { canAccessPrivateCollab } from "@/lib/collab-private-access";
import { canWriteCollabStats } from "@/lib/collab-viewer-access";
import {
  isCollabStatType,
  parseOptionalInt,
} from "@/lib/collab-stats";

async function loadCollabForAccess(id: string) {
  return prisma.collaboration.findUnique({
    where: { id },
    select: {
      id: true,
      isPrivate: true,
      createdById: true,
      accountManagerId: true,
      contratMarquePdfUrl: true,
      lienPublication: true,
      datePublication: true,
      createdBy: { select: { email: true } },
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await params;
    const collab = await loadCollabForAccess(id);
    if (!collab) {
      return NextResponse.json({ error: "Collaboration non trouvée" }, { status: 404 });
    }

    if (
      !canAccessPrivateCollab(collab, {
        id: session.user.id,
        role: session.user.role,
        email: session.user.email,
      })
    ) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const publications = await prisma.collabStatPublication.findMany({
      where: { collaborationId: id },
      include: {
        screenshots: { orderBy: { position: "asc" } },
        saisiPar: { select: { id: true, prenom: true, nom: true } },
      },
      orderBy: [{ datePublication: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ publications });
  } catch (error) {
    console.error("GET /api/collaborations/[id]/stats:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const role = session.user.role || "";
    if (!canWriteCollabStats(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await params;
    const collab = await loadCollabForAccess(id);
    if (!collab) {
      return NextResponse.json({ error: "Collaboration non trouvée" }, { status: 404 });
    }

    if (
      !canAccessPrivateCollab(collab, {
        id: session.user.id,
        role,
        email: session.user.email,
      })
    ) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = await request.json();
    if (!isCollabStatType(body.typeContenu)) {
      return NextResponse.json(
        {
          error:
            "typeContenu invalide (types livrables collab : STORY, REEL_CONCOURS, TIKTOK_VIDEO, …)",
        },
        { status: 400 }
      );
    }

    const vues = parseOptionalInt(body.vues);
    const likes = parseOptionalInt(body.likes);
    const commentaires = parseOptionalInt(body.commentaires);
    const partages = parseOptionalInt(body.partages);
    const saves = parseOptionalInt(body.saves);
    if (
      vues === undefined ||
      likes === undefined ||
      commentaires === undefined ||
      partages === undefined ||
      saves === undefined
    ) {
      return NextResponse.json(
        { error: "Métriques invalides (nombres ≥ 0 attendus)" },
        { status: 400 }
      );
    }

    const datePublication = body.datePublication
      ? new Date(body.datePublication)
      : collab.datePublication;

    const publication = await prisma.collabStatPublication.create({
      data: {
        collaborationId: id,
        typeContenu: body.typeContenu,
        label: typeof body.label === "string" ? body.label.trim() || null : null,
        urlPublication:
          typeof body.urlPublication === "string"
            ? body.urlPublication.trim() || null
            : collab.lienPublication,
        datePublication:
          datePublication && !Number.isNaN(datePublication.getTime())
            ? datePublication
            : null,
        vues,
        likes,
        commentaires,
        partages,
        saves,
        notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
        saisiParId: session.user.id,
        saisiAt: new Date(),
      },
      include: {
        screenshots: { orderBy: { position: "asc" } },
        saisiPar: { select: { id: true, prenom: true, nom: true } },
      },
    });

    return NextResponse.json({ publication }, { status: 201 });
  } catch (error) {
    console.error("POST /api/collaborations/[id]/stats:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
