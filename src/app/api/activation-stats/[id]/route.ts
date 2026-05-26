import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

async function loadReportOr404(id: string) {
  return prisma.activationReport.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, prenom: true, nom: true } },
      talents: {
        orderBy: { position: "asc" },
        include: {
          talent: {
            select: { id: true, prenom: true, nom: true, photo: true, instagram: true },
          },
          screenshots: { orderBy: { position: "asc" } },
        },
      },
    },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAppSession(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }
  const { id } = await context.params;
  const report = await loadReportOr404(id);
  if (!report) {
    return NextResponse.json({ error: "Rapport introuvable" }, { status: 404 });
  }

  return NextResponse.json({
    report: {
      id: report.id,
      name: report.name,
      clientAccessToken: report.clientAccessToken,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      createdBy: report.createdBy,
      talents: report.talents.map((t) => ({
        id: t.id,
        talentId: t.talent.id,
        prenom: t.talent.prenom,
        nom: t.talent.nom,
        photo: t.talent.photo,
        instagram: t.talent.instagram,
        position: t.position,
        screenshots: t.screenshots.map((s) => ({
          id: s.id,
          imageUrl: s.imageUrl,
          label: s.label,
          position: s.position,
        })),
      })),
    },
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAppSession(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }
  const { id } = await context.params;
  const report = await prisma.activationReport.findUnique({ where: { id } });
  if (!report) {
    return NextResponse.json({ error: "Rapport introuvable" }, { status: 404 });
  }

  const body = (await request.json()) as {
    name?: string;
    password?: string;
    talentIds?: string[];
  };

  const data: { name?: string; passwordHash?: string } = {};
  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (!n) {
      return NextResponse.json({ error: "Le nom est requis" }, { status: 400 });
    }
    data.name = n;
  }
  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < 4) {
      return NextResponse.json(
        { error: "Le mot de passe doit faire au moins 4 caracteres" },
        { status: 400 }
      );
    }
    data.passwordHash = await bcrypt.hash(body.password, 10);
  }

  // Mise a jour de la liste des talents (ajout / suppression) - on conserve les
  // anciens pour ne pas perdre les screenshots deja uploades.
  if (Array.isArray(body.talentIds)) {
    const requested = new Set(body.talentIds);
    const existing = await prisma.activationReportTalent.findMany({
      where: { reportId: id },
      select: { id: true, talentId: true, position: true },
    });
    const existingIds = new Set(existing.map((e) => e.talentId));

    const toAdd = body.talentIds.filter((t) => !existingIds.has(t));
    const toRemove = existing.filter((e) => !requested.has(e.talentId)).map((e) => e.id);

    // Recalcule des positions selon l'ordre fourni
    await prisma.$transaction(async (tx) => {
      if (toRemove.length) {
        await tx.activationReportTalent.deleteMany({ where: { id: { in: toRemove } } });
      }
      // Determine talents valides parmi ceux a ajouter
      const validNew = toAdd.length
        ? await tx.talent.findMany({
            where: { id: { in: toAdd }, isArchived: false },
            select: { id: true },
          })
        : [];
      for (const t of validNew) {
        await tx.activationReportTalent.create({
          data: { reportId: id, talentId: t.id, position: 0 },
        });
      }
      // Reassigne les positions dans l'ordre demande
      for (let i = 0; i < body.talentIds!.length; i++) {
        const talentId = body.talentIds![i];
        await tx.activationReportTalent.updateMany({
          where: { reportId: id, talentId },
          data: { position: i },
        });
      }
    });
  }

  if (Object.keys(data).length > 0) {
    await prisma.activationReport.update({ where: { id }, data });
  }

  const fresh = await loadReportOr404(id);
  return NextResponse.json({
    report: {
      id: fresh!.id,
      name: fresh!.name,
      clientAccessToken: fresh!.clientAccessToken,
      talents: fresh!.talents.map((t) => ({
        id: t.id,
        talentId: t.talent.id,
        prenom: t.talent.prenom,
        nom: t.talent.nom,
        photo: t.talent.photo,
        position: t.position,
      })),
    },
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAppSession(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }
  const { id } = await context.params;
  const report = await prisma.activationReport.findUnique({ where: { id } });
  if (!report) {
    return NextResponse.json({ error: "Rapport introuvable" }, { status: 404 });
  }
  await prisma.activationReport.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
