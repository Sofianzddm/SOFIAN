import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * Endpoint publique : authentifie le client avec le mot de passe et renvoie
 * le rapport (talents + screenshots). Retourne aussi un mode "metadata" via
 * GET (sans body) pour afficher uniquement le nom de l'activation avant saisie.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const report = await prisma.activationReport.findUnique({
    where: { clientAccessToken: token },
    select: { id: true, name: true },
  });
  if (!report) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }
  return NextResponse.json({ name: report.name });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { password?: string };
  const password = (body.password || "").trim();

  if (!password) {
    return NextResponse.json({ error: "Mot de passe requis" }, { status: 400 });
  }

  const report = await prisma.activationReport.findUnique({
    where: { clientAccessToken: token },
    include: {
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

  if (!report) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }

  const ok = await bcrypt.compare(password, report.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Mot de passe incorrect" }, { status: 401 });
  }

  return NextResponse.json({
    report: {
      id: report.id,
      name: report.name,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      talents: report.talents
        .filter((t) => t.screenshots.length > 0)
        .map((t) => ({
          id: t.id,
          prenom: t.talent.prenom,
          nom: t.talent.nom,
          photo: t.talent.photo,
          instagram: t.talent.instagram,
          screenshots: t.screenshots.map((s) => ({
            id: s.id,
            imageUrl: s.imageUrl,
            label: s.label,
          })),
        })),
    },
  });
}
