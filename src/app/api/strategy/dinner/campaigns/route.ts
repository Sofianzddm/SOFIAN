import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessDinnerStrategy, parseCampaignStatus } from "@/app/api/strategy/dinner/_utils";
import { randomUUID } from "crypto";

function normalizeLogoUrl(value?: string | null): string | null {
  const raw = (value || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, "")}`;
}

function normalizeEventPhotos(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .map((url) => (/^https?:\/\//i.test(url) ? url : `https://${url.replace(/^\/+/, "")}`));
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    const role = String(session.user.role || "");
    if (!canAccessDinnerStrategy(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const projetSlug = (searchParams.get("projetSlug") || "villa-cannes").trim();

    const campaigns = await prisma.dinnerCampaign.findMany({
      where: { projetSlug },
      include: {
        _count: { select: { candidates: true } },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    return NextResponse.json({
      campaigns: campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        clientName: c.clientName,
        logoUrl: c.logoUrl,
        city: c.city,
        eventDate: c.eventDate,
        status: c.status.toLowerCase(),
        clientAccessToken: c.clientAccessToken,
        clientUrl: `/dinner-client/${c.clientAccessToken}`,
        candidateCount: c._count.candidates,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Erreur GET /api/strategy/dinner/campaigns:", error);
    return NextResponse.json({ error: "Erreur lors du chargement des campagnes diner" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    const role = String(session.user.role || "");
    if (!canAccessDinnerStrategy(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json()) as {
      projetSlug?: string;
      name?: string;
      clientName?: string;
      logoUrl?: string | null;
      city?: string | null;
      eventDate?: string | null;
      budgetMin?: number | null;
      budgetMax?: number | null;
      eventPhotos?: string[];
      reportingSummary?: string | null;
      reportingKpis?: Record<string, unknown> | null;
      status?: string;
    };

    const name = (body.name || "").trim();
    const clientName = (body.clientName || "").trim();
    if (!name) return NextResponse.json({ error: "name requis" }, { status: 400 });
    if (!clientName) return NextResponse.json({ error: "clientName requis" }, { status: 400 });

    const campaign = await prisma.dinnerCampaign.create({
      data: {
        projetSlug: (body.projetSlug || "villa-cannes").trim() || "villa-cannes",
        name,
        clientName,
        clientAccessToken: randomUUID(),
        logoUrl: normalizeLogoUrl(body.logoUrl),
        city: body.city?.trim() || null,
        eventDate: body.eventDate ? new Date(body.eventDate) : null,
        budgetMin: body.budgetMin ?? null,
        budgetMax: body.budgetMax ?? null,
        eventPhotos: normalizeEventPhotos(body.eventPhotos),
        reportingSummary: body.reportingSummary?.trim() || null,
        reportingKpis: body.reportingKpis
          ? (body.reportingKpis as Prisma.InputJsonValue)
          : undefined,
        status: parseCampaignStatus(body.status) ?? "DRAFT",
        createdById: session.user.id,
      },
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error("Erreur POST /api/strategy/dinner/campaigns:", error);
    return NextResponse.json({ error: "Erreur lors de la creation de la campagne diner" }, { status: 500 });
  }
}

