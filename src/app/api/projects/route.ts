import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Slug helpers (similaires à ceux utilisés pour Partner)
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 60);
}

async function generateUniqueProjectSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await prisma.agencyProject.findUnique({
      where: { slug },
    });
    if (!existing) return slug;
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}

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

// GET /api/projects - liste des projets (admin)
export async function GET() {
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

    const projects = await prisma.agencyProject.findMany({
      orderBy: [
        { order: "asc" },
        { date: "desc" },
        { createdAt: "desc" },
      ],
      include: {
        talents: {
          include: {
            talent: {
              select: {
                id: true,
                prenom: true,
                nom: true,
                photo: true,
                stats: {
                  select: {
                    igFollowers: true,
                    ttFollowers: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const formatted = projects.map((project) => ({
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
          stats: pt.talent.stats
            ? {
                igFollowers: Number(pt.talent.stats.igFollowers || 0),
                ttFollowers: Number(pt.talent.stats.ttFollowers || 0),
              }
            : null,
        })),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("Erreur GET /api/projects:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des projets" },
      { status: 500 }
    );
  }
}

// POST /api/projects - créer un projet (admin)
export async function POST(request: NextRequest) {
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

    if (!title) {
      return NextResponse.json(
        { error: "Le titre du projet est requis" },
        { status: 400 }
      );
    }

    const baseSlug = slugify(title);
    const slug = await generateUniqueProjectSlug(baseSlug || "projet");

    const project = await prisma.agencyProject.create({
      data: {
        title,
        slug,
        description: description || null,
        coverImage: coverImage || null,
        images: images && images.length > 0 ? images : undefined,
        links: links && links.length > 0 ? links : undefined,
        videoUrl: videoUrl || null,
        category: category || null,
        date: date ? new Date(date) : null,
        location: location || null,
        isActive: typeof isActive === "boolean" ? isActive : true,
        order: typeof order === "number" ? order : 0,
        talents:
          talentIds && talentIds.length > 0
            ? {
                create: talentIds.map((talentId) => ({
                  talentId,
                })),
              }
            : undefined,
      },
      include: {
        talents: {
          include: {
            talent: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
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
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erreur POST /api/projects:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création du projet" },
      { status: 500 }
    );
  }
}

