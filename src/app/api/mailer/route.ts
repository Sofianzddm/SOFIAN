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

const RecipientInput = z.object({
  email: z.string().trim().email("Adresse destinataire invalide"),
  name: z.string().trim().max(200).optional().nullable(),
});

const CreateMailInput = z.object({
  fromEmail: z.string().trim().email("Boîte expéditrice invalide"),
  /** Nouveau format : plusieurs destinataires. */
  recipients: z.array(RecipientInput).min(1).max(50).optional(),
  /** "solo" = un mail séparé par destinataire ; "group" = un seul mail commun. */
  sendMode: z.enum(["solo", "group"]).default("solo"),
  /** Ancien format (compat) : un seul destinataire. */
  toEmail: z.string().trim().email("Adresse destinataire invalide").optional(),
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

  // Normalise les destinataires : nouveau format `recipients[]`, sinon
  // l'ancien couple toEmail/toName (compat).
  const rawRecipients =
    data.recipients && data.recipients.length > 0
      ? data.recipients
      : data.toEmail
        ? [{ email: data.toEmail, name: data.toName ?? null }]
        : [];
  const seen = new Set<string>();
  const recipients = rawRecipients.filter((r) => {
    const key = r.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "Au moins un destinataire est requis." },
      { status: 400 }
    );
  }

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

  // En mode groupé : un seul AdminMail dont toEmail contient tous les
  // destinataires (séparés par des virgules). En mode solo : un AdminMail par
  // destinataire, chacun avec son nom (pour le jeton {{prenom}}).
  const mailRows: { toEmail: string; toName: string | null }[] =
    data.sendMode === "group" && recipients.length > 1
      ? [
          {
            toEmail: recipients.map((r) => r.email.toLowerCase()).join(", "),
            toName: null,
          },
        ]
      : recipients.map((r) => ({
          toEmail: r.email.toLowerCase(),
          toName: r.name?.trim() || null,
        }));

  const createdIds: string[] = [];
  for (const row of mailRows) {
    const created = await prisma.adminMail.create({
      data: {
        fromEmail: box.email,
        toEmail: row.toEmail,
        toName: row.toName,
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
      select: { id: true },
    });
    createdIds.push(created.id);
  }

  // Envoi immédiat demandé : on déclenche tout de suite, mail par mail.
  if (data.action === "send") {
    let sent = 0;
    let held = 0;
    const errors: string[] = [];
    let heldMessage: string | null = null;
    for (const id of createdIds) {
      const result = await executeMailSend(id);
      if (result.held) {
        held += 1;
        heldMessage = heldMessage || result.error || null;
      } else if (result.ok) {
        sent += 1;
      } else if (result.error) {
        errors.push(result.error);
      }
    }
    const mails = await prisma.adminMail.findMany({
      where: { id: { in: createdIds } },
      include: { followups: { orderBy: { order: "asc" } } },
    });
    if (errors.length > 0 && sent === 0 && held === 0) {
      return NextResponse.json(
        { error: errors[0] || "Échec de l'envoi.", mails },
        { status: 422 }
      );
    }
    if (held > 0) {
      const message =
        createdIds.length === 1
          ? heldMessage
          : `${sent} mail(s) envoyé(s), ${held} reporté(s) (contact récent de Leyna)${errors.length ? `, ${errors.length} échec(s)` : ""}.`;
      return NextResponse.json({ mails, held: true, message });
    }
    if (errors.length > 0) {
      return NextResponse.json(
        {
          error: `${sent} mail(s) envoyé(s), ${errors.length} échec(s) : ${errors[0]}`,
          mails,
        },
        { status: 422 }
      );
    }
    return NextResponse.json({ mails, sent });
  }

  const mails = await prisma.adminMail.findMany({
    where: { id: { in: createdIds } },
    include: { followups: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json({ mails });
}
