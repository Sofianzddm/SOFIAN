import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

const ALLOWED_ROLES = [
  "HEAD_OF_SALES",
  "ADMIN",
  "HEAD_OF",
  "CASTING_MANAGER",
  "STRATEGY_PLANNER",
] as const;

const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;

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

    const where: Record<string, unknown> = {
      sentAt: { not: null, ...(sentAtGte ? { gte: sentAtGte } : {}) },
    };
    if (talentId) where.talentId = talentId;

    const missionsRaw = await contactMissionModel.findMany({
      where,
      orderBy: [{ sentAt: "desc" }],
      take: 500,
      include: {
        talent: { select: { id: true, prenom: true, nom: true, photo: true } },
        campaign: { select: { id: true, title: true } },
      },
    });

    type Mission = (typeof missionsRaw)[number];

    const mails = missionsRaw
      .map((m: Mission) => {
        const talentName =
          m.talent?.prenom && m.talent?.nom
            ? `${m.talent.prenom} ${m.talent.nom}`.trim()
            : m.creatorName || "—";
        const contacts =
          Array.isArray(m.clientContacts)
            ? (m.clientContacts as Array<{
                firstname?: string;
                lastname?: string;
                email?: string;
                role?: string;
              }>)
            : [];
        const recipients = contacts
          .map((c) => ({
            firstname: String(c?.firstname || "").trim(),
            lastname: String(c?.lastname || "").trim(),
            email: String(c?.email || "").trim(),
            role: String(c?.role || "").trim(),
          }))
          .filter((c) => c.email);
        const sentMessageIds =
          m.sentMessageIds && typeof m.sentMessageIds === "object"
            ? (m.sentMessageIds as Record<string, { messageId?: string; threadId?: string; error?: string }>)
            : {};

        return {
          id: m.id,
          talentId: m.talentId,
          talentName,
          talentPhoto: m.talent?.photo ?? null,
          creatorName: m.creatorName,
          targetBrand: m.targetBrand,
          campaignTitle: m.campaign?.title ?? null,
          priority: m.priority,
          stage: m.stage,
          status: m.status,
          subject: m.draftEmailSubject ?? null,
          body: m.draftEmailBody ?? null,
          clientLanguage: m.clientLanguage ?? null,
          recipients,
          recipientEmails: Object.keys(sentMessageIds).filter(
            (k) => !sentMessageIds[k]?.error
          ),
          failedEmails: Object.entries(sentMessageIds)
            .filter(([, v]) => v?.error)
            .map(([k, v]) => ({ email: k, error: v?.error || "" })),
          sentAt: m.sentAt ? m.sentAt.toISOString() : null,
          sendError: m.sendError ?? null,
          openedAt: m.openedAt ? m.openedAt.toISOString() : null,
          lastOpenAt: m.lastOpenAt ? m.lastOpenAt.toISOString() : null,
          openCount: m.openCount ?? 0,
          clickedAt: m.clickedAt ? m.clickedAt.toISOString() : null,
          lastClickAt: m.lastClickAt ? m.lastClickAt.toISOString() : null,
          lastClickUrl: m.lastClickUrl ?? null,
          clickCount: m.clickCount ?? 0,
          relanceSentAt: m.relanceSentAt ? m.relanceSentAt.toISOString() : null,
          relanceError: m.relanceError ?? null,
          replied: m.replied ?? false,
        };
      })
      .filter((m: { talentName: string; creatorName: string; targetBrand: string; campaignTitle: string | null; subject: string | null; recipients: { firstname: string; lastname: string; email: string }[] }) => {
        if (!search) return true;
        const haystack = [
          m.talentName,
          m.creatorName,
          m.targetBrand,
          m.campaignTitle ?? "",
          m.subject ?? "",
          ...m.recipients.map(
            (r: { firstname: string; lastname: string; email: string }) =>
              `${r.firstname} ${r.lastname} ${r.email}`
          ),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      });

    const totalsWhere = { sentAt: { not: null } } as const;
    const weekDate = new Date();
    weekDate.setDate(weekDate.getDate() - 7);
    const monthDate = new Date();
    monthDate.setMonth(monthDate.getMonth() - 1);

    const [total, week, month] = await Promise.all([
      contactMissionModel.count({ where: totalsWhere }),
      contactMissionModel.count({
        where: { sentAt: { not: null, gte: weekDate } },
      }),
      contactMissionModel.count({
        where: { sentAt: { not: null, gte: monthDate } },
      }),
    ]);

    const allTalents = await contactMissionModel.findMany({
      where: { sentAt: { not: null }, talentId: { not: null } },
      distinct: ["talentId"],
      select: {
        talent: { select: { id: true, prenom: true, nom: true } },
      },
      take: 200,
    });
    const talentOptions = (allTalents as Array<{ talent: { id: string; prenom: string; nom: string } | null }>)
      .map((row) => row.talent)
      .filter((t): t is { id: string; prenom: string; nom: string } => Boolean(t))
      .map((t) => ({ id: t.id, name: `${t.prenom} ${t.nom}`.trim() }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));

    return NextResponse.json({
      mails,
      stats: { total, week, month },
      talentOptions,
    });
  } catch (error) {
    console.error("GET /api/strategy/contact-missions/sent:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
