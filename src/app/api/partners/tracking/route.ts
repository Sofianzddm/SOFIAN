import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_ACTIONS = ["view", "talent_click", "cta_click", "filter", "excel_download"] as const;
type Action = (typeof VALID_ACTIONS)[number];

// POST /api/partners/tracking
// Body: { partnerId, action, visitorId, talentClicked?, talentName?, duration?, metadata? }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      partnerId,
      action,
      visitorId,
      talentClicked,
      talentName,
      duration,
      metadata,
    } = body as {
      partnerId?: string;
      action?: Action | string;
      visitorId?: string;
      talentClicked?: string | null;
      talentName?: string | null;
      duration?: number | null;
      metadata?: unknown;
    };

    if (!partnerId || !action || !visitorId) {
      return NextResponse.json(
        { error: "partnerId, action et visitorId sont requis" },
        { status: 400 }
      );
    }

    if (!VALID_ACTIONS.includes(action as Action)) {
      return NextResponse.json(
        { error: "Action invalide" },
        { status: 400 }
      );
    }

    // Vérifier l'existence du partner pour éviter une erreur de clé étrangère
    const partnerExists = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true },
    });

    if (!partnerExists) {
      return NextResponse.json(
        { error: "Partenaire introuvable" },
        { status: 404 }
      );
    }

    const userAgent = request.headers.get("user-agent") || undefined;
    const referrer =
      request.headers.get("referer") ||
      request.headers.get("referrer") ||
      undefined;

    await prisma.partnerView.create({
      data: {
        partnerId,
        visitorId,
        action: action as string,
        talentClicked: talentClicked || null,
        talentName: talentName || null,
        duration: typeof duration === "number" ? duration : null,
        metadata: metadata as any,
        userAgent,
        referrer,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur POST /api/partners/tracking:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement du tracking partenaire" },
      { status: 500 }
    );
  }
}

