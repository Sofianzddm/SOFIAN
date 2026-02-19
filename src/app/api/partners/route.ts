import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Fonction pour créer un slug à partir d'un nom
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Supprimer les accents
    .replace(/[^a-z0-9]+/g, "-") // Remplacer les caractères spéciaux par des tirets
    .replace(/^-+|-+$/g, "") // Supprimer les tirets en début/fin
    .substring(0, 50); // Limiter la longueur
}

// Fonction pour générer un slug unique
async function generateUniqueSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let counter = 1;
  
  while (true) {
    const existing = await prisma.partner.findUnique({
      where: { slug },
    });
    
    if (!existing) {
      return slug;
    }
    
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}

const LIST_ROLES = [
  "ADMIN",
  "HEAD_OF",
  "HEAD_OF_INFLUENCE",
  "HEAD_OF_SALES",
  "CM",
] as const;

const MANAGE_ROLES = ["ADMIN", "HEAD_OF"] as const;

type Role = (typeof LIST_ROLES)[number] | (typeof MANAGE_ROLES)[number] | string;

function hasListAccess(role: Role) {
  return LIST_ROLES.includes(role as any);
}

function hasManageAccess(role: Role) {
  return MANAGE_ROLES.includes(role as any);
}

// GET /api/partners - liste des partenaires avec stats résumées
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const role = (session.user as { role?: Role }).role || "TALENT";
    if (!hasListAccess(role)) {
      return NextResponse.json(
        { error: "Accès refusé" },
        { status: 403 }
      );
    }

    const partners = await prisma.partner.findMany({
      include: {
        talents: {
          include: {
            talent: {
              include: {
                stats: true,
              },
            },
          },
          orderBy: { order: "asc" },
        },
        _count: {
          select: {
            views: true,
            talents: true,
          },
        },
        views: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = partners.map((partner) => {
      const lastView = partner.views[0] || null;
      return {
        id: partner.id,
        name: partner.name,
        slug: partner.slug,
        logo: partner.logo,
        isActive: partner.isActive,
        description: partner.description,
        message: partner.message,
        talentsCount: partner._count.talents,
        totalViews: partner._count.views,
        lastVisit: lastView?.createdAt ?? null,
        // on expose aussi les talents associés pour la liste si besoin
        talents: partner.talents.map((pt) => ({
          id: pt.talent.id,
          talentId: pt.talentId,
          order: pt.order,
          prenom: pt.talent.prenom,
          nom: pt.talent.nom,
          photo: pt.talent.photo,
          niches: pt.talent.niches,
          stats: pt.talent.stats
            ? {
                igFollowers: pt.talent.stats.igFollowers,
                ttFollowers: pt.talent.stats.ttFollowers,
                ytAbonnes: pt.talent.stats.ytAbonnes,
              }
            : null,
        })),
        createdAt: partner.createdAt,
        updatedAt: partner.updatedAt,
      };
    });

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("Erreur GET /api/partners:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des partenaires" },
      { status: 500 }
    );
  }
}

// POST /api/partners - créer un partenaire (ADMIN / HEAD_OF)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const role = (session.user as { role?: Role }).role || "TALENT";
    if (!hasManageAccess(role)) {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs / Head Of" },
        { status: 403 }
      );
    }

    const userId = (session.user as { id?: string }).id;

    const body = await request.json();
    const {
      name,
      logo,
      contactName,
      contactEmail,
      message,
      description,
      talentIds,
    } = body as {
      name?: string;
      logo?: string | null;
      contactName?: string | null;
      contactEmail?: string | null;
      message?: string | null;
      description?: string | null;
      talentIds?: string[];
    };

    if (!name) {
      return NextResponse.json(
        { error: "Le nom du partenaire est requis" },
        { status: 400 }
      );
    }

    // Générer un slug basé sur le nom
    const baseSlug = slugify(name);
    const slug = await generateUniqueSlug(baseSlug);

    const partner = await prisma.partner.create({
      data: {
        name,
        slug,
        logo: logo || null,
        contactName: contactName || null,
        contactEmail: contactEmail || null,
        message: message || null,
        description: description || null,
        createdBy: userId || null,
        talents: talentIds && talentIds.length > 0
          ? {
              create: talentIds.map((talentId, index) => ({
                talentId,
                order: index,
              })),
            }
          : undefined,
      },
      include: {
        talents: {
          include: {
            talent: true,
          },
          orderBy: { order: "asc" },
        },
      },
    });

    return NextResponse.json(
      {
        id: partner.id,
        name: partner.name,
        slug: partner.slug,
        logo: partner.logo,
        isActive: partner.isActive,
        description: partner.description,
        message: partner.message,
        talents: partner.talents.map((pt) => ({
          id: pt.talent.id,
          talentId: pt.talentId,
          order: pt.order,
          prenom: pt.talent.prenom,
          nom: pt.talent.nom,
          photo: pt.talent.photo,
        })),
        createdAt: partner.createdAt,
        updatedAt: partner.updatedAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erreur POST /api/partners:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création du partenaire" },
      { status: 500 }
    );
  }
}

