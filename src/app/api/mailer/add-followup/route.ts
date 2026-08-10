import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/requireAdmin";
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
  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Accès réservé à l'admin." }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = Input.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Données invalides." },
      { status: 400 }
    );
  }

  const result = await addFollowupToMails(parsed.data);

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
