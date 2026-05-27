import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

const ALLOWED_ROLES = ["HEAD_OF_SALES", "ADMIN", "CASTING_MANAGER"] as const;

export async function GET(req: NextRequest) {
  try {
    const session = await getAppSession(req);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "all";
    const talentId = searchParams.get("talentId") || "";
    const search = (searchParams.get("search") || "").trim().toLowerCase();

    const now = new Date();
    let sentAtGte: Date | undefined;
    if (period === "week") {
      sentAtGte = new Date(now);
      sentAtGte.setDate(sentAtGte.getDate() - 7);
    } else if (period === "month") {
      sentAtGte = new Date(now);
      sentAtGte.setMonth(sentAtGte.getMonth() - 1);
    }

    const where = {
      sentAt: { not: null, ...(sentAtGte ? { gte: sentAtGte } : {}) },
      ...(talentId ? { talentId } : {}),
    } as const;

    const mailsRaw = await prisma.inboundOpportunity.findMany({
      where,
      orderBy: [{ sentAt: "desc" }],
      take: 500,
      select: {
        id: true,
        talentId: true,
        talentName: true,
        talentEmail: true,
        senderEmail: true,
        senderName: true,
        senderDomain: true,
        extractedBrand: true,
        extractedBudget: true,
        subject: true,
        draftEmailSubject: true,
        draftEmailBody: true,
        sentAt: true,
        receivedAt: true,
        status: true,
        category: true,
        priority: true,
        openedAt: true,
        lastOpenAt: true,
        openCount: true,
        clickedAt: true,
        lastClickAt: true,
        lastClickUrl: true,
        clickCount: true,
        relance1SentAt: true,
        relance2SentAt: true,
        replied: true,
        talent: { select: { id: true, prenom: true, nom: true, photo: true } },
      },
    });

    const mails = search
      ? mailsRaw.filter((m) => {
          const haystack = [
            m.talentName,
            m.senderName,
            m.senderEmail,
            m.senderDomain,
            m.extractedBrand,
            m.subject,
            m.draftEmailSubject,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(search);
        })
      : mailsRaw;

    const startOfWeek = new Date(now);
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    const startOfMonth = new Date(now);
    startOfMonth.setMonth(startOfMonth.getMonth() - 1);

    const [totalAll, totalWeek, totalMonth, uniqueTalents] = await Promise.all([
      prisma.inboundOpportunity.count({ where: { sentAt: { not: null } } }),
      prisma.inboundOpportunity.count({
        where: { sentAt: { not: null, gte: startOfWeek } },
      }),
      prisma.inboundOpportunity.count({
        where: { sentAt: { not: null, gte: startOfMonth } },
      }),
      prisma.inboundOpportunity.findMany({
        where: { sentAt: { not: null }, talentId: { not: null } },
        select: { talentId: true, talentName: true },
        distinct: ["talentId"],
      }),
    ]);

    const talentOptions = uniqueTalents
      .flatMap((t) =>
        t.talentId ? [{ id: t.talentId, name: t.talentName }] : []
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      mails,
      stats: { total: totalAll, week: totalWeek, month: totalMonth },
      talentOptions,
    });
  } catch (error) {
    console.error("GET /api/casting-mails-sent error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
