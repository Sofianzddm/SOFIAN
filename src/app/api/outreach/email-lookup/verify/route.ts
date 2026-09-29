import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { verifyEmailAddress } from "@/lib/enrichment/verify-email";
import {
  isAllegrowConfigured,
  verifyWithAllegrow,
} from "@/lib/enrichment/allegrow";

/**
 * POST → teste un email.
 * Priorité : Allegrow (si ALLEGROW_API_KEY) → sinon MX/SMTP local.
 * Si Allegrow renvoie 401/403 (plan non activé), fallback local.
 * Body: { email: string }
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email) {
      return NextResponse.json({ error: "Email requis" }, { status: 400 });
    }

    if (isAllegrowConfigured()) {
      const allegrow = await verifyWithAllegrow(email);
      if (allegrow && !allegrow.allegrowAuthDenied) {
        return NextResponse.json(allegrow);
      }

      // Plan / clé refusée → on continue en local pour ne pas bloquer Tester.
      const local = await verifyEmailAddress(email);
      const allegrowHint =
        allegrow?.detail ||
        "Allegrow 403 — API non autorisée sur ce compte (contacter support@allegrow.co)";
      return NextResponse.json({
        ...local,
        provider: "local" as const,
        detail: local.detail
          ? `${local.detail} · (Allegrow indisponible : ${allegrowHint})`
          : `Allegrow indisponible : ${allegrowHint}`,
        label:
          local.status === "unknown"
            ? `${local.label} · Allegrow off`
            : local.label,
      });
    }

    const result = await verifyEmailAddress(email);
    return NextResponse.json({ ...result, provider: "local" as const });
  } catch (error) {
    console.error("POST /api/outreach/email-lookup/verify:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
