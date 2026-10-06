import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMailerAccess } from "@/lib/requireMailerAccess";
import { resolveProspectionActor } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";
import { addFollowupToMails } from "@/lib/admin-mailer";

/**
 * POST → ajoute une relance à une sélection de mails déjà envoyés
 * (même s'ils ont déjà une ou plusieurs relances).
 *
 * Body : {
 *   mailIds: string[],
 *   bodyHtml: string,
 *   subject?: string | null,
 *   delayBusinessDays?: number,  // défaut 3 (ignoré si sendNow)
 *   sendNow?: boolean            // true = envoi immédiat
 * }
 */

const Input = z.object({
  mailIds: z.array(z.string().min(1)).min(1).max(100),
  bodyHtml: z.string().trim().min(1, "Corps de relance requis"),
  subject: z.string().trim().max(500).optional().nullable(),
  delayBusinessDays: z.coerce.number().int().min(1).max(60).default(3),
  sendNow: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  const session = await requireMailerAccess(request);
  if (!session) {
    return NextResponse.json({ error: "Accès non autorisé." }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = Input.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Données invalides." },
      { status: 400 }
    );
  }

  const { userId, role } = await resolveProspectionActor(session);
  let mailIds = parsed.data.mailIds;
  if (role !== "ADMIN") {
    const owned = await prisma.adminMail.findMany({
      where: { id: { in: mailIds }, createdById: userId },
      select: { id: true },
    });
    mailIds = owned.map((m) => m.id);
    if (mailIds.length === 0) {
      return NextResponse.json({ error: "Aucun mail accessible." }, { status: 403 });
    }
  }

  const result = await addFollowupToMails({ ...parsed.data, mailIds });

  if (result.ok === 0) {
    return NextResponse.json(
      {
        error:
          result.failed[0]?.error ||
          "Aucune relance n'a pu être ajoutée.",
        ...result,
      },
      { status: 422 }
    );
  }

  return NextResponse.json(result);
}
