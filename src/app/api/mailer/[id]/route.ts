import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/prisma";

/**
 * Détail / édition / suppression d'un mail admin.
 *  GET    → détail (avec relances)
 *  PATCH  → modifie un brouillon ou un mail programmé (sujet, corps, relances…)
 *  DELETE → supprime le mail (et ses relances en cascade)
 *
 * Un mail déjà envoyé (SENT) n'est plus éditable (corps figé) ; seules ses
 * relances PENDING peuvent être ajustées via PATCH (sujet/corps/délai).
 */

const FollowupInput = z.object({
  delayBusinessDays: z.coerce.number().int().min(1).max(60).default(3),
  subject: z.string().trim().max(500).optional().nullable(),
  bodyHtml: z.string().trim().min(1, "Corps de relance requis"),
});

const UpdateMailInput = z.object({
  fromEmail: z.string().trim().email().optional(),
  toEmail: z.string().trim().email().optional(),
  toName: z.string().trim().max(200).optional().nullable(),
  subject: z.string().trim().min(1).max(500).optional(),
  bodyHtml: z.string().trim().min(1).optional(),
  stopOnReply: z.boolean().optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
  followups: z.array(FollowupInput).max(5).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Accès réservé à l'admin." }, { status: 403 });
  }
  const { id } = await params;
  const mail = await prisma.adminMail.findUnique({
    where: { id },
    include: { followups: { orderBy: { order: "asc" } } },
  });
  if (!mail) {
    return NextResponse.json({ error: "Mail introuvable." }, { status: 404 });
  }
  return NextResponse.json({ mail });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Accès réservé à l'admin." }, { status: 403 });
  }
  const { id } = await params;

  const existing = await prisma.adminMail.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Mail introuvable." }, { status: 404 });
  }

  const json = await request.json().catch(() => null);
  const parsed = UpdateMailInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Données invalides." },
      { status: 400 }
    );
  }
  const data = parsed.data;
  const isSent = existing.status === "SENT";

  // Le corps/destinataire d'un mail envoyé est figé.
  if (isSent && (data.bodyHtml || data.toEmail || data.fromEmail || data.subject)) {
    return NextResponse.json(
      { error: "Un mail déjà envoyé n'est plus modifiable (hors relances)." },
      { status: 409 }
    );
  }

  const update: Record<string, unknown> = {};
  if (!isSent) {
    if (data.fromEmail !== undefined) update.fromEmail = data.fromEmail.toLowerCase();
    if (data.toEmail !== undefined) update.toEmail = data.toEmail.toLowerCase();
    if (data.toName !== undefined) update.toName = data.toName?.trim() || null;
    if (data.subject !== undefined) update.subject = data.subject;
    if (data.bodyHtml !== undefined) update.bodyHtml = data.bodyHtml;
    if (data.scheduledAt !== undefined) {
      if (data.scheduledAt === null) {
        update.scheduledAt = null;
        if (existing.status === "SCHEDULED") update.status = "DRAFT";
      } else {
        const when = new Date(data.scheduledAt);
        if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) {
          return NextResponse.json(
            { error: "La date d'envoi doit être dans le futur." },
            { status: 400 }
          );
        }
        update.scheduledAt = when;
        update.status = "SCHEDULED";
      }
    }
  }
  if (data.stopOnReply !== undefined) update.stopOnReply = data.stopOnReply;

  // Remplacement complet des relances en attente (les relances déjà envoyées
  // sont conservées telles quelles).
  if (data.followups !== undefined) {
    await prisma.adminMailFollowup.deleteMany({
      where: { mailId: id, status: { in: ["PENDING", "CANCELLED"] } },
    });
    const sentCount = await prisma.adminMailFollowup.count({
      where: { mailId: id, status: { notIn: ["PENDING", "CANCELLED"] } },
    });
    await prisma.adminMailFollowup.createMany({
      data: data.followups.map((f, i) => ({
        mailId: id,
        order: sentCount + i + 1,
        delayBusinessDays: f.delayBusinessDays,
        subject: f.subject?.trim() || null,
        bodyHtml: f.bodyHtml,
      })),
    });
  }

  if (Object.keys(update).length > 0) {
    await prisma.adminMail.update({ where: { id }, data: update });
  }

  const mail = await prisma.adminMail.findUnique({
    where: { id },
    include: { followups: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json({ mail });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Accès réservé à l'admin." }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.adminMail.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Mail introuvable." }, { status: 404 });
  }
  await prisma.adminMail.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
