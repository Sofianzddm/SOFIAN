import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";

function requireAdmin(session: Awaited<ReturnType<typeof getAppSession>>) {
  const role = (session?.user as { role?: string })?.role;
  const rolesAutorises = ["ADMIN", "HEAD_OF_INFLUENCE"];
  if (!role || !rolesAutorises.includes(role)) {
    return NextResponse.json({ error: "Accès réservé à l'admin" }, { status: 403 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    const authError = requireAdmin(session);
    if (authError) return authError;

    const url = new URL(request.url);
    const actifParam = url.searchParams.get("actif");

    const where: any = {};
    if (actifParam === "true") where.actif = true;
    if (actifParam === "false") where.actif = false;

    const delegations = await prisma.delegationTM.findMany({
      where,
      include: {
        talent: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            photo: true,
          },
        },
        tmOrigine: {
          select: {
            id: true,
            prenom: true,
            nom: true,
          },
        },
        tmRelai: {
          select: {
            id: true,
            prenom: true,
            nom: true,
          },
        },
      },
      orderBy: [
        { actif: "desc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json(delegations);
  } catch (error) {
    console.error("Erreur GET /api/admin/delegations:", error);
    return NextResponse.json(
      { error: "Erreur lors du chargement des délégations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    const authError = requireAdmin(session);
    if (authError) return authError;

    const body = await request.json();
    const { talentId, tmRelaiId } = body as {
      talentId?: string;
      tmRelaiId?: string;
    };

    if (!talentId || !tmRelaiId) {
      return NextResponse.json(
        { error: "talentId et tmRelaiId sont requis" },
        { status: 400 }
      );
    }

    const talent = await prisma.talent.findUnique({
      where: { id: talentId },
      select: { managerId: true },
    });
    if (!talent?.managerId) {
      return NextResponse.json(
        { error: "Le talent n'a pas de TM d'origine défini" },
        { status: 400 }
      );
    }

    const delegation = await prisma.delegationTM.upsert({
      where: {
        talentId_tmRelaiId: {
          talentId,
          tmRelaiId,
        },
      } as any,
      update: {
        tmOrigineId: talent.managerId,
        actif: true,
      },
      create: {
        talentId,
        tmOrigineId: talent.managerId,
        tmRelaiId,
        actif: true,
      },
      include: {
        talent: {
          select: { id: true, prenom: true, nom: true, photo: true },
        },
        tmOrigine: {
          select: { id: true, prenom: true, nom: true },
        },
        tmRelai: {
          select: { id: true, prenom: true, nom: true },
        },
      },
    });

    return NextResponse.json(delegation, { status: 201 });
  } catch (error) {
    console.error("Erreur POST /api/admin/delegations:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création de la délégation" },
      { status: 500 }
    );
  }
}

