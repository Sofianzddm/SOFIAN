import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveProspectionActor } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";
import { executeMailSend } from "@/lib/admin-mailer";

/**
 * Rédacteur de mails admin.
 *  GET  → liste des mails rédigés par l'admin (avec relances)
 *  POST → crée un mail : brouillon, programmé, ou envoyé immédiatement
 */

const FollowupInput = z.object({
  delayBusinessDays: z.coerce.number().int().min(1).max(60).default(3),
  subject: z.string().trim().max(500).optional().nullable(),
  bodyHtml: z.string().trim().min(1, "Corps de relance requis"),
});

const CreateMailInput = z.object({
  fromEmail: z.string().trim().email("Boîte expéditrice invalide"),
  toEmail: z.string().trim().email("Adresse destinataire invalide"),
  toName: z.string().trim().max(200).optional().nullable(),
  subject: z.string().trim().min(1, "Sujet requis").max(500),
  bodyHtml: z.string().trim().min(1, "Corps requis"),
  action: z.enum(["draft", "schedule", "send"]).default("draft"),
  scheduledAt: z.string().datetime().optional().nullable(),
  stopOnReply: z.boolean().default(true),
  followups: z.array(FollowupInput).max(5).default([]),
});

export async function GET(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Accès réservé à l'admin." }, { status: 403 });
  }

  const mails = await prisma.adminMail.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { followups: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json({ mails });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Accès réservé à l'admin." }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = CreateMailInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Données invalides." },
      { status: 400 }
    );
  }
  const data = parsed.data;

  // La boîte expéditrice doit être une boîte Gmail connectée.
  const box = await prisma.gmailToken.findUnique({
    where: { email: data.fromEmail.toLowerCase() },
    select: { email: true },
  });
  if (!box) {
    return NextResponse.json(
      { error: "Cette boîte n'est pas connectée. Connecte-la d'abord." },
      { status: 400 }
    );
  }

  let scheduledAt: Date | null = null;
  if (data.action === "schedule") {
    if (!data.scheduledAt) {
      return NextResponse.json(
        { error: "Date d'envoi requise pour programmer." },
        { status: 400 }
      );
    }
    scheduledAt = new Date(data.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() - 60_000) {
      return NextResponse.json(
        { error: "La date d'envoi doit être dans le futur." },
        { status: 400 }
      );
    }
  }

  const status =
    data.action === "schedule" ? "SCHEDULED" : data.action === "send" ? "DRAFT" : "DRAFT";

  const { userId } = await resolveProspectionActor(session);

  const created = await prisma.adminMail.create({
    data: {
      fromEmail: box.email,
      toEmail: data.toEmail.toLowerCase(),
      toName: data.toName?.trim() || null,
      subject: data.subject,
      bodyHtml: data.bodyHtml,
      status,
      scheduledAt,
      stopOnReply: data.stopOnReply,
      createdById: userId,
      followups: {
        create: data.followups.map((f, i) => ({
          order: i + 1,
          delayBusinessDays: f.delayBusinessDays,
          subject: f.subject?.trim() || null,
          bodyHtml: f.bodyHtml,
        })),
      },
    },
    include: { followups: { orderBy: { order: "asc" } } },
  });

  // Envoi immédiat demandé : on déclenche tout de suite.
  if (data.action === "send") {
    const result = await executeMailSend(created.id);
    const refreshed = await prisma.adminMail.findUnique({
      where: { id: created.id },
      include: { followups: { orderBy: { order: "asc" } } },
    });
    if (result.held) {
      return NextResponse.json({
        mail: refreshed,
        held: true,
        message: result.error,
      });
    }
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Échec de l'envoi.", mail: refreshed },
        { status: 422 }
      );
    }
    return NextResponse.json({ mail: refreshed });
  }

  return NextResponse.json({ mail: created });
}
