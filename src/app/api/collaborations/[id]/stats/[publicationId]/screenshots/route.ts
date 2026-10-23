import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import prisma from "@/lib/prisma";
import { canAccessPrivateCollab } from "@/lib/collab-private-access";
import { isCollabViewOnly } from "@/lib/collab-viewer-access";
import {
  COLLAB_STAT_WRITE_ROLES,
  isAllowedCollabStatScreenshotUrl,
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; publicationId: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const role = session.user.role || "";
    if (isCollabViewOnly(role, session.user.email)) {
      return NextResponse.json({ error: "Lecture seule" }, { status: 403 });
    }
    if (!(COLLAB_STAT_WRITE_ROLES as readonly string[]).includes(role)) {
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
    const urls = Array.isArray(body.urls)
      ? body.urls.filter(
          (u: unknown): u is string =>
            typeof u === "string" && isAllowedCollabStatScreenshotUrl(u)
        )
      : [];

    if (urls.length === 0) {
      return NextResponse.json(
        { error: "Aucune URL Cloudinary valide reçue" },
        { status: 400 }
      );
    }

    const last = await prisma.collabStatScreenshot.findFirst({
      where: { publicationId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    let position = (last?.position ?? -1) + 1;
    const created = await prisma.$transaction(
      urls.map((imageUrl: string) => {
        const pos = position++;
        return prisma.collabStatScreenshot.create({
          data: {
            publicationId,
            imageUrl,
            label:
              typeof body.label === "string" ? body.label.trim() || null : null,
            position: pos,
          },
        });
      })
    );

    await prisma.collabStatPublication.update({
      where: { id: publicationId },
      data: { saisiParId: session.user.id, saisiAt: new Date() },
    });

    return NextResponse.json({ screenshots: created }, { status: 201 });
  } catch (error) {
    console.error(
      "POST /api/collaborations/[id]/stats/[publicationId]/screenshots:",
      error
    );
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
    if (isCollabViewOnly(role, session.user.email)) {
      return NextResponse.json({ error: "Lecture seule" }, { status: 403 });
    }
    if (!(COLLAB_STAT_WRITE_ROLES as readonly string[]).includes(role)) {
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

    const body = await request.json().catch(() => ({}));
    const screenshotId =
      typeof body.screenshotId === "string" ? body.screenshotId : null;
    if (!screenshotId) {
      return NextResponse.json({ error: "screenshotId requis" }, { status: 400 });
    }

    const screenshot = await prisma.collabStatScreenshot.findFirst({
      where: { id: screenshotId, publicationId },
    });
    if (!screenshot) {
      return NextResponse.json({ error: "Screenshot introuvable" }, { status: 404 });
    }

    await prisma.collabStatScreenshot.delete({ where: { id: screenshotId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      "DELETE /api/collaborations/[id]/stats/[publicationId]/screenshots:",
      error
    );
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
