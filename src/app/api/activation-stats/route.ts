import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

const ALLOWED_ROLES = new Set([
  "ADMIN",
  "HEAD_OF",
  "HEAD_OF_INFLUENCE",
  "HEAD_OF_SALES",
  "TM",
  "CM",
]);

export async function GET(request: NextRequest) {
  const session = await getAppSession(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }

  const reports = await prisma.activationReport.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, prenom: true, nom: true } },
      talents: {
        select: {
          id: true,
          talent: { select: { id: true, prenom: true, nom: true, photo: true } },
          _count: { select: { screenshots: true } },
        },
      },
    },
  });

  return NextResponse.json({
    reports: reports.map((r) => ({
      id: r.id,
      name: r.name,
      clientAccessToken: r.clientAccessToken,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      createdBy: r.createdBy,
      talentsCount: r.talents.length,
      screenshotsCount: r.talents.reduce((sum, t) => sum + t._count.screenshots, 0),
      talents: r.talents.map((t) => ({
        id: t.id,
        talentId: t.talent.id,
        prenom: t.talent.prenom,
        nom: t.talent.nom,
        photo: t.talent.photo,
      })),
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await getAppSession(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }
  if (!ALLOWED_ROLES.has(session.user.role || "")) {
    return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name?: string;
    password?: string;
    talentIds?: string[];
  };

  const name = (body.name || "").trim();
  const password = (body.password || "").trim();
  const talentIds = Array.isArray(body.talentIds) ? body.talentIds : [];

  if (!name) {
    return NextResponse.json({ error: "Le nom de l'activation est requis" }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json(
      { error: "Le mot de passe doit faire au moins 4 caracteres" },
      { status: 400 }
    );
  }

  const validTalents = talentIds.length
    ? await prisma.talent.findMany({
        where: { id: { in: talentIds }, isArchived: false },
        select: { id: true },
      })
    : [];

  const passwordHash = await bcrypt.hash(password, 10);
  const clientAccessToken = nanoid(24);

  const report = await prisma.activationReport.create({
    data: {
      name,
      passwordHash,
      clientAccessToken,
      createdById: session.user.id,
      talents: {
        create: validTalents.map((t, idx) => ({
          talentId: t.id,
          position: idx,
        })),
      },
    },
    select: { id: true, clientAccessToken: true },
  });

  return NextResponse.json({ report }, { status: 201 });
}
