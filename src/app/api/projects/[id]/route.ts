import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PROJECT_ROLES = [
  "ADMIN",
  "HEAD_OF",
  "HEAD_OF_INFLUENCE",
  "HEAD_OF_SALES",
] as const;

type ProjectRole = (typeof PROJECT_ROLES)[number] | string;

function hasProjectAccess(role: ProjectRole) {
  return PROJECT_ROLES.includes(role as any);
}

// GET /api/projects/[id] - détail projet
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const role = (session.user as { role?: ProjectRole }).role || "TALENT";
    if (!hasProjectAccess(role)) {
      return NextResponse.json(
        { error: "Accès refusé" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const project = await prisma.agencyProject.findUnique({
      where: { id },
      include: {
        talents: {
          include: {
            talent: {
              select: {
                id: true,
                prenom: true,
                nom: true,
                photo: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const formatted = {
      id: project.id,
      title: project.title,
      slug: project.slug,
      description: project.description,
      coverImage: project.coverImage,
      images: project.images,
      links: project.links,
      videoUrl: project.videoUrl,
      category: project.category,
      date: project.date,
      location: project.location,
      isActive: project.isActive,
      order: project.order,
      talents: project.talents
        .filter((pt) => pt.talent !== null)
        .map((pt) => ({
          id: pt.talent.id,
          prenom: pt.talent.prenom,
          nom: pt.talent.nom,
          photo: pt.talent.photo,
          role: pt.role,
        })),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("Erreur GET /api/projects/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération du projet" },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[id] - mettre à jour un projet
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const role = (session.user as { role?: ProjectRole }).role || "TALENT";
    if (!hasProjectAccess(role)) {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs / Head Of" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const {
      title,
      description,
      coverImage,
      images,
      links,
      videoUrl,
      category,
      date,
      location,
      talentIds,
      isActive,
      order,
    } = body as {
      title?: string;
      description?: string | null;
      coverImage?: string | null;
      images?: string[] | null;
      links?: Array<{ label: string; url: string }> | null;
      videoUrl?: string | null;
      category?: string | null;
      date?: string | null;
      location?: string | null;
      talentIds?: string[];
      isActive?: boolean;
      order?: number;
    };

    const existing = await prisma.agencyProject.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Mettre à jour le projet
      const project = await tx.agencyProject.update({
        where: { id },
        data: {
          title: title ?? existing.title,
          description: description ?? existing.description,
          coverImage: coverImage ?? existing.coverImage,
          images: (images !== undefined ? (images && images.length > 0 ? images : undefined) : existing.images) as any,
          links: (links !== undefined ? (links && links.length > 0 ? links : undefined) : existing.links) as any,
          videoUrl: videoUrl ?? existing.videoUrl,
          category: category ?? existing.category,
          date: date !== undefined ? (date ? new Date(date) : null) : existing.date,
          location: location ?? existing.location,
          isActive: typeof isActive === "boolean" ? isActive : existing.isActive,
          order: typeof order === "number" ? order : existing.order,
        },
      });

      // Mettre à jour les talents associés si talentIds fourni
      if (talentIds) {
        await tx.agencyProjectTalent.deleteMany({
          where: { projectId: id },
        });

        if (talentIds.length > 0) {
          await tx.agencyProjectTalent.createMany({
            data: talentIds.map((talentId) => ({
              projectId: id,
              talentId,
            })),
          });
        }
      }

      return tx.agencyProject.findUnique({
        where: { id },
        include: {
          talents: {
            include: {
              talent: {
                select: {
                  id: true,
                  prenom: true,
                  nom: true,
                  photo: true,
                },
              },
            },
          },
        },
      });
    });

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: updated.id,
      title: updated.title,
      slug: updated.slug,
      description: updated.description,
      coverImage: updated.coverImage,
      images: updated.images,
      links: updated.links,
      videoUrl: updated.videoUrl,
      category: updated.category,
      date: updated.date,
      location: updated.location,
      isActive: updated.isActive,
      order: updated.order,
    });
  } catch (error) {
    console.error("Erreur PUT /api/projects/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du projet" },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id] - supprimer un projet
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const role = (session.user as { role?: ProjectRole }).role || "TALENT";
    if (!hasProjectAccess(role)) {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs / Head Of" },
        { status: 403 }
      );
    }

    const { id } = await params;

    await prisma.agencyProject.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur DELETE /api/projects/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression du projet" },
      { status: 500 }
    );
  }
}

