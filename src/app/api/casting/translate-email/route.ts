import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { translateEmail, TranslateEmailError } from "@/lib/translate-email";

export const maxDuration = 60;

const ALLOWED_ROLES = [
  "CASTING_MANAGER",
  "HEAD_OF_SALES",
  "STRATEGY_PLANNER",
  "HEAD_OF",
  "HEAD_OF_INFLUENCE",
  "ADMIN",
] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

interface TranslateEmailBody {
  subject?: string;
  bodyHtml?: string;
  targetLanguage?: "fr" | "en";
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isAllowed(session.user.role)) {
      return NextResponse.json(
        { error: "Accès refusé pour ce rôle." },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => null)) as
      | Partial<TranslateEmailBody>
      | null;

    try {
      const result = await translateEmail({
        subject: String(body?.subject ?? ""),
        bodyHtml: String(body?.bodyHtml ?? ""),
        targetLanguage: body?.targetLanguage === "fr" ? "fr" : "en",
      });
      return NextResponse.json(result);
    } catch (e) {
      if (e instanceof TranslateEmailError) {
        return NextResponse.json({ error: e.message }, { status: 502 });
      }
      throw e;
    }
  } catch (e) {
    console.error("POST /api/casting/translate-email:", e);
    return NextResponse.json(
      { error: "Erreur serveur lors de la traduction." },
      { status: 500 }
    );
  }
}
