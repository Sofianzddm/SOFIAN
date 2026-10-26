import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import prisma from "@/lib/prisma";
import { canAccessPrivateCollab } from "@/lib/collab-private-access";
import { canWriteCollabStats } from "@/lib/collab-viewer-access";
import {
  isCollabStatType,
  parseOptionalInt,
} from "@/lib/collab-stats";

async function loadPublication(collaborationId: string, publicationId: string) {
  return prisma.collabStatPublication.findFirst({
    where: { id: publicationId, collaborationId },
    include: {
      collaboration: {
        select: {
          id: true,
          isPrivate: true,
          createdById: true,
          accountManagerId: true,
          contratMarquePdfUrl: true,
          createdBy: { select: { email: true } },
        },
      },
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; publicationId: string }> }
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

    const { id, publicationId } = await params;
    const existing = await loadPublication(id, publicationId);
    if (!existing) {
      return NextResponse.json({ error: "Publication introuvable" }, { status: 404 });
    }

    if (
      !canAccessPrivateCollab(existing.collaboration, {
        id: session.user.id,
        role,
        email: session.user.email,
      })
    ) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {
      saisiParId: session.user.id,
      saisiAt: new Date(),
    };

    if (body.typeContenu !== undefined) {
      if (!isCollabStatType(body.typeContenu)) {
        return NextResponse.json({ error: "typeContenu invalide" }, { status: 400 });
      }
      data.typeContenu = body.typeContenu;
    }
    if (body.label !== undefined) {
      data.label =
        typeof body.label === "string" ? body.label.trim() || null : null;
    }
    if (body.urlPublication !== undefined) {
      data.urlPublication =
        typeof body.urlPublication === "string"
          ? body.urlPublication.trim() || null
          : null;
    }
    if (body.datePublication !== undefined) {
      if (body.datePublication === null || body.datePublication === "") {
        data.datePublication = null;
      } else {
        const d = new Date(body.datePublication);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: "datePublication invalide" }, { status: 400 });
        }
        data.datePublication = d;
      }
    }
    if (body.notes !== undefined) {
      data.notes =
        typeof body.notes === "string" ? body.notes.trim() || null : null;
    }

    for (const key of ["vues", "likes", "commentaires", "partages", "saves"] as const) {
      if (body[key] !== undefined) {
        const parsed = parseOptionalInt(body[key]);
        if (parsed === undefined) {
          return NextResponse.json(
            { error: `Métrique ${key} invalide` },
            { status: 400 }
          );
        }
        data[key] = parsed;
      }
    }

    const publication = await prisma.collabStatPublication.update({
      where: { id: publicationId },
      data,
      include: {
        screenshots: { orderBy: { position: "asc" } },
        saisiPar: { select: { id: true, prenom: true, nom: true } },
      },
    });

    return NextResponse.json({ publication });
  } catch (error) {
    console.error("PATCH /api/collaborations/[id]/stats/[publicationId]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; publicationId: string }> }
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

    const { id, publicationId } = await params;
    const existing = await loadPublication(id, publicationId);
    if (!existing) {
      return NextResponse.json({ error: "Publication introuvable" }, { status: 404 });
    }

    if (
      !canAccessPrivateCollab(existing.collaboration, {
        id: session.user.id,
        role,
        email: session.user.email,
      })
    ) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    await prisma.collabStatPublication.delete({ where: { id: publicationId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/collaborations/[id]/stats/[publicationId]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
