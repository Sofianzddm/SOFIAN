import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { getLeynaExchangeContext } from "@/lib/leyna-exchange-context";

export const maxDuration = 180;

const ALLOWED_ROLES = [
  "CASTING_MANAGER",
  "STRATEGY_PLANNER",
  "HEAD_OF_SALES",
  "ADMIN",
] as const;

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (
      !ALLOWED_ROLES.includes(
        session.user.role as (typeof ALLOWED_ROLES)[number]
      )
    ) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const recipientEmails = Array.isArray(body?.recipientEmails)
      ? body.recipientEmails.map((e: unknown) => String(e || "").trim()).filter(Boolean)
      : [];
    const brandName =
      typeof body?.brandName === "string" ? body.brandName.trim() : "";
    const talentNames = Array.isArray(body?.talentNames)
      ? body.talentNames.map((n: unknown) => String(n || "").trim()).filter(Boolean)
      : [];

    const context = await getLeynaExchangeContext({
      recipientEmails,
      brandName,
      talentNames,
    });

    return NextResponse.json({ context });
  } catch (e) {
    console.error("POST /api/casting/leyna-exchange-context:", e);
    return NextResponse.json(
      {
        context: {
          hasExchange: false,
          tone: null,
          contacts: [],
          bannerLabel: null,
          promptBlockFr: "",
          promptBlockEn: "",
        },
      },
      { status: 200 }
    );
  }
}
