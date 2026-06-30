import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";

/**
 * Modèles de mails partagés.
 *  - scope "mailer" : rédacteur admin
 *  - scope "agency" : prospection agences
 *
 *  GET    → liste des modèles (filtrés par ?scope=)
 *  POST   → crée un modèle (sujet + corps + relances)
 *  PATCH  → met à jour un modèle (par body.id)
 *  DELETE → supprime un modèle (par ?id=)
 *
 * Accessible aux rôles ADMIN et HEAD_OF_SALES (mêmes rôles que la
 * prospection agences), afin que les deux modules partagent les modèles.
 */

const ALLOWED_ROLES = ["ADMIN", "HEAD_OF_SALES"] as const;

function hasAccess(role: string | undefined | null): boolean {
  return ALLOWED_ROLES.includes((role || "") as (typeof ALLOWED_ROLES)[number]);
}

async function guard(
  request: NextRequest
): Promise<{ error: NextResponse; userId: null } | { error: null; userId: string }> {
  const session = await getAppSession(request);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Non autorisé" }, { status: 401 }), userId: null };
  }
  if (!hasAccess(session.user.role)) {
    return {
      error: NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 }),
      userId: null,
    };
  }
  return { error: null, userId: session.user.id as string };
}

const FollowupTpl = z.object({
  delayBusinessDays: z.coerce.number().int().min(1).max(60).default(3),
  subject: z.string().trim().max(500).optional().nullable(),
  bodyHtml: z.string().trim().min(1),
});

const SCOPES = ["mailer", "agency"] as const;

const CreateTpl = z.object({
  scope: z.enum(SCOPES).default("mailer"),
  name: z.string().trim().min(1, "Nom requis").max(120),
  subject: z.string().trim().max(500).default(""),
  bodyHtml: z.string().trim().min(1, "Corps requis"),
  stopOnReply: z.boolean().default(true),
  followups: z.array(FollowupTpl).max(5).default([]),
});

const UpdateTpl = CreateTpl.partial().extend({
  id: z.string().trim().min(1),
});

export async function GET(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  const scopeParam = (request.nextUrl.searchParams.get("scope") || "mailer").trim();
  const scope = (SCOPES as readonly string[]).includes(scopeParam) ? scopeParam : "mailer";
  const templates = await prisma.mailTemplate.findMany({
    where: { scope },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ templates });
}

export async function POST(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  const json = await request.json().catch(() => null);
  const parsed = CreateTpl.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Données invalides." },
      { status: 400 }
    );
  }
  const data = parsed.data;
  const userId = auth.userId;

  const template = await prisma.mailTemplate.create({
    data: {
      scope: data.scope,
      name: data.name,
      subject: data.subject,
      bodyHtml: data.bodyHtml,
      stopOnReply: data.stopOnReply,
      followups: data.followups.map((f) => ({
        delayBusinessDays: f.delayBusinessDays,
        subject: f.subject?.trim() || null,
        bodyHtml: f.bodyHtml,
      })),
      createdById: userId,
    },
  });
  return NextResponse.json({ template });
}

export async function PATCH(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  const json = await request.json().catch(() => null);
  const parsed = UpdateTpl.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Données invalides." },
      { status: 400 }
    );
  }
  const { id, followups, ...rest } = parsed.data;
  const existing = await prisma.mailTemplate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });
  }
  const template = await prisma.mailTemplate.update({
    where: { id },
    data: {
      ...rest,
      ...(followups !== undefined
        ? {
            followups: followups.map((f) => ({
              delayBusinessDays: f.delayBusinessDays,
              subject: f.subject?.trim() || null,
              bodyHtml: f.bodyHtml,
            })),
          }
        : {}),
    },
  });
  return NextResponse.json({ template });
}

export async function DELETE(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  const id = (request.nextUrl.searchParams.get("id") || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Id requis." }, { status: 400 });
  }
  const existing = await prisma.mailTemplate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });
  }
  await prisma.mailTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
