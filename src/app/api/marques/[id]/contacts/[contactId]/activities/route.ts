import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canWriteMarqueCrm } from "@/lib/marque-crm-access";
import { MarqueContactActivityType } from "@prisma/client";

type RouteContext = { params: Promise<{ id: string; contactId: string }> };

const CALL_OUTCOMES = new Set(["CONNECTED", "NO_ANSWER", "VOICEMAIL", "BUSY"]);

async function assertContactOnMarque(marqueId: string, contactId: string) {
  return prisma.marqueContact.findFirst({
    where: { id: contactId, marqueId },
    select: {
      id: true,
      prenom: true,
      nom: true,
      marqueId: true,
    },
  });
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id: marqueId, contactId } = await params;
    const contact = await assertContactOnMarque(marqueId, contactId);
    if (!contact) {
      return NextResponse.json({ error: "Contact introuvable" }, { status: 404 });
    }

    const activities = await prisma.marqueContactActivity.findMany({
      where: { contactId },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 100,
    });

    return NextResponse.json({ activities });
  } catch (error) {
    console.error("GET contact activities:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canWriteMarqueCrm(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id: marqueId, contactId } = await params;
    const contact = await assertContactOnMarque(marqueId, contactId);
    if (!contact) {
      return NextResponse.json({ error: "Contact introuvable" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      type?: string;
      body?: string;
      callOutcome?: string | null;
      occurredAt?: string | null;
    };

    const typeRaw = String(body.type || "").toUpperCase();
    if (typeRaw !== "NOTE" && typeRaw !== "CALL") {
      return NextResponse.json(
        { error: "Type requis : NOTE ou CALL" },
        { status: 400 }
      );
    }
    const type = typeRaw as MarqueContactActivityType;

    const text = String(body.body || "").trim();
    if (!text) {
      return NextResponse.json(
        {
          error:
            type === "CALL"
              ? "Indique ce qui s’est dit (ou le motif de non-jointure)."
              : "Le contenu de la note est requis.",
        },
        { status: 400 }
      );
    }
    if (text.length > 8000) {
      return NextResponse.json({ error: "Texte trop long (max 8000)." }, { status: 400 });
    }

    let callOutcome: string | null = null;
    if (type === "CALL") {
      const outcome = String(body.callOutcome || "CONNECTED").toUpperCase();
      if (!CALL_OUTCOMES.has(outcome)) {
        return NextResponse.json(
          { error: "Issue d’appel invalide." },
          { status: 400 }
        );
      }
      callOutcome = outcome;
    }

    let occurredAt = new Date();
    if (body.occurredAt) {
      const parsed = new Date(body.occurredAt);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Date invalide." }, { status: 400 });
      }
      occurredAt = parsed;
    }

    const createdByName =
      session.user.name?.trim() || session.user.email || null;

    const activity = await prisma.marqueContactActivity.create({
      data: {
        contactId,
        type,
        body: text,
        callOutcome,
        occurredAt,
        createdById: session.user.id || null,
        createdByName,
      },
    });

    return NextResponse.json({ activity }, { status: 201 });
  } catch (error) {
    console.error("POST contact activities:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canWriteMarqueCrm(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id: marqueId, contactId } = await params;
    const contact = await assertContactOnMarque(marqueId, contactId);
    if (!contact) {
      return NextResponse.json({ error: "Contact introuvable" }, { status: 404 });
    }

    const activityId =
      request.nextUrl.searchParams.get("activityId") ||
      ((await request.json().catch(() => ({}))) as { activityId?: string }).activityId;

    if (!activityId) {
      return NextResponse.json({ error: "activityId requis" }, { status: 400 });
    }

    const existing = await prisma.marqueContactActivity.findFirst({
      where: { id: activityId, contactId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Activité introuvable" }, { status: 404 });
    }

    await prisma.marqueContactActivity.delete({ where: { id: activityId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE contact activities:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
