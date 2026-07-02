import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { buildCastingSendPreview } from "@/lib/casting-auto-send";

/**
 * Apercu EXACT de l'envoi d'une mission de prospection : renvoie, pour chaque
 * contact client, le mail tel qu'il partira reellement (variables remplacees,
 * liens talents mis a niveau, HTML normalise Gmail, traduction auto selon la
 * langue de la fiche client). Ne declenche AUCUN envoi et n'ecrit rien.
 *
 * Le body accepte des overrides pour previsualiser le brouillon en cours de
 * redaction dans le composer (pas encore sauvegarde) :
 *   { subject?: string, bodyHtml?: string, language?: "fr" | "en" }
 */
const ALLOWED_ROLES = [
  "CASTING_MANAGER",
  "STRATEGY_PLANNER",
  "HEAD_OF_SALES",
  "ADMIN",
  "HEAD_OF",
] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const overrides: {
      subject?: string;
      bodyHtml?: string;
      sourceLanguage?: "fr" | "en";
    } = {};
    if (typeof body?.subject === "string") overrides.subject = body.subject;
    if (typeof body?.bodyHtml === "string") overrides.bodyHtml = body.bodyHtml;
    if (body?.language === "fr" || body?.language === "en") {
      overrides.sourceLanguage = body.language;
    }

    const preview = await buildCastingSendPreview(id, overrides);
    return NextResponse.json({ preview });
  } catch (error) {
    console.error("POST /api/strategy/contact-missions/[id]/preview-send:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
