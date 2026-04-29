import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

const ALLOWED_ROLES = ["CASTING_MANAGER", "HEAD_OF_SALES", "ADMIN"] as const;
const ALLOWED_CATEGORIES = new Set(["COLLAB_PAID", "PRESS_KIT", "EVENT_INVITE", "OTHER"]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(req);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
    }

    const { id } = await params;
    const opportunity = await prisma.inboundOpportunity.findUnique({
      where: { id },
      include: {
        talent: { select: { id: true, prenom: true, nom: true, photo: true } },
        convertedBy: { select: { id: true, prenom: true, nom: true } },
        archivedBy: { select: { id: true, prenom: true, nom: true } },
      },
    });

    if (!opportunity) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const normalizedOpportunity = {
      ...opportunity,
      category: ALLOWED_CATEGORIES.has(opportunity.category) ? opportunity.category : "OTHER",
    };

    return NextResponse.json({ opportunity: normalizedOpportunity });
  } catch (error) {
    console.error("GET /api/inbound/opportunities/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(req);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const draftEmailSubject =
      typeof body.draftEmailSubject === "string" ? body.draftEmailSubject.trim() : "";
    const draftEmailBody =
      typeof body.draftEmailBody === "string" ? body.draftEmailBody : "";

    const { id } = await params;
    const updated = await prisma.inboundOpportunity.update({
      where: { id },
      data: {
        draftEmailSubject: draftEmailSubject || null,
        draftEmailBody: draftEmailBody || null,
        status: "IN_REVIEW",
      },
      include: {
        talent: { select: { id: true, prenom: true, nom: true, photo: true } },
        convertedBy: { select: { id: true, prenom: true, nom: true } },
        archivedBy: { select: { id: true, prenom: true, nom: true } },
      },
    });

    const normalizedOpportunity = {
      ...updated,
      category: ALLOWED_CATEGORIES.has(updated.category) ? updated.category : "OTHER",
    };

    return NextResponse.json({ opportunity: normalizedOpportunity });
  } catch (error) {
    console.error("PATCH /api/inbound/opportunities/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(req);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.inboundOpportunity.findUnique({
      where: { id },
      select: { id: true, status: true, convertedToProspectionId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (existing.status === "CONVERTED" || existing.convertedToProspectionId) {
      return NextResponse.json(
        { error: "Impossible de supprimer une opportunite deja convertie." },
        { status: 409 }
      );
    }

    await prisma.inboundOpportunity.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/inbound/opportunities/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
