import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

const ALLOWED_ROLES = ["CASTING_MANAGER", "HEAD_OF_SALES", "ADMIN"] as const;
const DEFAULT_WINDOW_DAYS = 20;

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
    const url = new URL(req.url);
    const windowDaysRaw = Number.parseInt(url.searchParams.get("days") || "", 10);
    const windowDays =
      Number.isFinite(windowDaysRaw) && windowDaysRaw > 0 && windowDaysRaw <= 365
        ? windowDaysRaw
        : DEFAULT_WINDOW_DAYS;

    const opportunity = await prisma.inboundOpportunity.findUnique({
      where: { id },
      select: { id: true, senderEmail: true, senderDomain: true },
    });
    if (!opportunity) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const senderEmail = (opportunity.senderEmail || "").toLowerCase().trim();
    const senderDomain = (opportunity.senderDomain || "").toLowerCase().trim();

    const sentOpportunities = await prisma.inboundOpportunity.findMany({
      where: {
        id: { not: id },
        sentAt: { gte: since, not: null },
        OR: [
          senderEmail ? { senderEmail: { equals: senderEmail, mode: "insensitive" } } : { id: "__never__" },
          senderDomain ? { senderDomain: { equals: senderDomain, mode: "insensitive" } } : { id: "__never__" },
        ],
      },
      select: {
        id: true,
        sentAt: true,
        subject: true,
        senderEmail: true,
        senderName: true,
        senderDomain: true,
        extractedBrand: true,
        talentName: true,
      },
      orderBy: { sentAt: "desc" },
      take: 20,
    });

    const sameEmail = sentOpportunities.filter(
      (o) => (o.senderEmail || "").toLowerCase().trim() === senderEmail
    );
    const sameDomainOnly = sentOpportunities.filter(
      (o) =>
        (o.senderEmail || "").toLowerCase().trim() !== senderEmail &&
        (o.senderDomain || "").toLowerCase().trim() === senderDomain
    );

    return NextResponse.json({
      windowDays,
      senderEmail,
      senderDomain,
      sameEmail,
      sameDomain: sameDomainOnly,
    });
  } catch (error) {
    console.error("GET /api/inbound/opportunities/[id]/recent-sends error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
