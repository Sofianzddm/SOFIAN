import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";
import {
  ACTIVITY_LOG_RETENTION_DAYS,
  addParisDays,
  canViewActivityPulse,
  isPulseRangeDays,
  parisDayBounds,
  todayParisYmd,
} from "@/lib/user-activity-log";

type StaffRow = {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  role: string;
};

/** Journal d'activité — Sofian uniquement (404 pour tous les autres). */
export async function GET(request: NextRequest) {
  const session = await getAppSession(request);
  if (!session?.user?.email || !canViewActivityPulse(session.user.email)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId")?.trim() || "";
  let day = searchParams.get("day")?.trim() || "";
  const rangeRaw = Number(searchParams.get("range") || "");
  const range = isPulseRangeDays(rangeRaw) ? rangeRaw : null;
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 500), 1), 1500);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    day = todayParisYmd();
  }

  const staff = await prisma.user.findMany({
    where: {
      actif: true,
      role: { notIn: ["TALENT"] },
    },
    select: { id: true, prenom: true, nom: true, email: true, role: true },
    orderBy: [{ prenom: "asc" }, { nom: "asc" }],
  });

  if (range) {
    return NextResponse.json(
      await loadRangeSummary({ day, range, userId, staff })
    );
  }

  return NextResponse.json(
    await loadDayDetail({ day, userId, limit, staff })
  );
}

async function loadDayDetail(input: {
  day: string;
  userId: string;
  limit: number;
  staff: StaffRow[];
}) {
  const { day, userId, limit, staff } = input;
  const { from, to } = parisDayBounds(day);
  const dayWhere = { createdAt: { gte: from, lt: to } };
  const where = {
    ...dayWhere,
    ...(userId ? { userId } : {}),
  };

  type MinuteAggRow = {
    minute: string;
    count: number;
    users: number;
  };
  type UserMinuteAggRow = {
    userId: string;
    minutes: number;
    count: number;
    firstAt: Date;
    lastAt: Date;
  };

  const byMinutePromise: Promise<MinuteAggRow[]> = userId
    ? prisma.$queryRaw<MinuteAggRow[]>`
        SELECT
          to_char(("createdAt" AT TIME ZONE 'Europe/Paris'), 'HH24:MI') AS minute,
          COUNT(*)::int AS count,
          COUNT(DISTINCT "userId")::int AS users
        FROM user_activity_logs
        WHERE "createdAt" >= ${from}
          AND "createdAt" < ${to}
          AND "userId" = ${userId}
        GROUP BY 1
        ORDER BY 1
      `
    : prisma.$queryRaw<MinuteAggRow[]>`
        SELECT
          to_char(("createdAt" AT TIME ZONE 'Europe/Paris'), 'HH24:MI') AS minute,
          COUNT(*)::int AS count,
          COUNT(DISTINCT "userId")::int AS users
        FROM user_activity_logs
        WHERE "createdAt" >= ${from}
          AND "createdAt" < ${to}
        GROUP BY 1
        ORDER BY 1
      `;

  const [
    logs,
    usersActive,
    byAction,
    byModule,
    totalDay,
    byMinuteRaw,
    userMinuteRaw,
  ] = await Promise.all([
    prisma.userActivityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            email: true,
            role: true,
          },
        },
      },
    }),
    prisma.userActivityLog.groupBy({
      by: ["userId"],
      where: dayWhere,
      _count: true,
      _max: { createdAt: true },
      _min: { createdAt: true },
    }),
    prisma.userActivityLog.groupBy({
      by: ["action"],
      where,
      _count: true,
      orderBy: { _count: { action: "desc" } },
    }),
    prisma.userActivityLog.groupBy({
      by: ["module"],
      where,
      _count: true,
      orderBy: { _count: { module: "desc" } },
    }),
    prisma.userActivityLog.count({ where: dayWhere }),
    byMinutePromise,
    prisma.$queryRaw<UserMinuteAggRow[]>`
      SELECT
        "userId",
        COUNT(DISTINCT to_char(("createdAt" AT TIME ZONE 'Europe/Paris'), 'HH24:MI'))::int AS minutes,
        COUNT(*)::int AS count,
        MIN("createdAt") AS "firstAt",
        MAX("createdAt") AS "lastAt"
      FROM user_activity_logs
      WHERE "createdAt" >= ${from}
        AND "createdAt" < ${to}
      GROUP BY 1
    `,
  ]);

  const minuteMap = new Map(
    userMinuteRaw.map((r) => [r.userId, Number(r.minutes)])
  );

  const byUser = usersActive
    .map((u) => {
      const user = staff.find((s) => s.id === u.userId);
      const distinctMinutes = minuteMap.get(u.userId);
      const spanMs =
        u._max.createdAt && u._min.createdAt
          ? u._max.createdAt.getTime() - u._min.createdAt.getTime()
          : 0;
      return {
        userId: u.userId,
        count: u._count,
        firstAt: u._min.createdAt,
        lastAt: u._max.createdAt,
        activeMinutes:
          distinctMinutes ?? Math.max(1, Math.round(spanMs / 60_000)),
        user: user || null,
      };
    })
    .sort((a, b) => b.count - a.count);

  const byMinute = byMinuteRaw.map((m) => ({
    minute: String(m.minute),
    count: Number(m.count),
    users: Number(m.users),
  }));

  // Gaps = trous ≥ 5 min entre minutes actives (filtre courant)
  const gaps: { from: string; to: string; minutes: number }[] = [];
  for (let i = 1; i < byMinute.length; i++) {
    const prev = byMinute[i - 1]!.minute;
    const cur = byMinute[i]!.minute;
    const [ph, pm] = prev.split(":").map(Number);
    const [ch, cm] = cur.split(":").map(Number);
    const prevIdx = (ph ?? 0) * 60 + (pm ?? 0);
    const curIdx = (ch ?? 0) * 60 + (cm ?? 0);
    const delta = curIdx - prevIdx;
    if (delta > 5) {
      gaps.push({ from: prev, to: cur, minutes: delta - 1 });
    }
  }

  const activeIds = new Set(byUser.map((u) => u.userId));
  const inactiveToday = staff
    .filter((s) => !activeIds.has(s.id))
    .map((s) => ({
      userId: s.id,
      user: s,
      count: 0,
    }));

  return {
    mode: "day" as const,
    from: from.toISOString(),
    to: to.toISOString(),
    day,
    range: null,
    retentionDays: ACTIVITY_LOG_RETENTION_DAYS,
    totalDay,
    logs,
    byUser,
    byUserDay: [],
    byMinute,
    gaps,
    activeMinuteCount: byMinute.length,
    byAction: byAction.map((a) => ({ action: a.action, count: a._count })),
    byModule: byModule.map((m) => ({ module: m.module, count: m._count })),
    inactiveToday,
    staff,
  };
}

async function loadRangeSummary(input: {
  day: string;
  range: number;
  userId: string;
  staff: StaffRow[];
}) {
  const { day, range, userId, staff } = input;
  const startDay = addParisDays(day, -(range - 1));
  const { from } = parisDayBounds(startDay);
  const { to } = parisDayBounds(day);

  const rangeWhere = {
    createdAt: { gte: from, lt: to },
    ...(userId ? { userId } : {}),
  };

  type DayAggRow = {
    userId: string;
    day: Date;
    count: number;
    firstAt: Date;
    lastAt: Date;
  };

  const byUserDayPromise: Promise<DayAggRow[]> = userId
    ? prisma.$queryRaw<DayAggRow[]>`
        SELECT
          "userId",
          (("createdAt" AT TIME ZONE 'Europe/Paris')::date) AS day,
          COUNT(*)::int AS count,
          MIN("createdAt") AS "firstAt",
          MAX("createdAt") AS "lastAt"
        FROM user_activity_logs
        WHERE "createdAt" >= ${from}
          AND "createdAt" < ${to}
          AND "userId" = ${userId}
        GROUP BY 1, 2
        ORDER BY 2 DESC, 3 DESC
      `
    : prisma.$queryRaw<DayAggRow[]>`
        SELECT
          "userId",
          (("createdAt" AT TIME ZONE 'Europe/Paris')::date) AS day,
          COUNT(*)::int AS count,
          MIN("createdAt") AS "firstAt",
          MAX("createdAt") AS "lastAt"
        FROM user_activity_logs
        WHERE "createdAt" >= ${from}
          AND "createdAt" < ${to}
        GROUP BY 1, 2
        ORDER BY 2 DESC, 3 DESC
      `;

  const [byUserDayRaw, usersActive, byAction, byModule, totalDay] =
    await Promise.all([
      byUserDayPromise,
      prisma.userActivityLog.groupBy({
        by: ["userId"],
        where: { createdAt: { gte: from, lt: to } },
        _count: true,
        _max: { createdAt: true },
        _min: { createdAt: true },
      }),
      prisma.userActivityLog.groupBy({
        by: ["action"],
        where: rangeWhere,
        _count: true,
        orderBy: { _count: { action: "desc" } },
      }),
      prisma.userActivityLog.groupBy({
        by: ["module"],
        where: rangeWhere,
        _count: true,
        orderBy: { _count: { module: "desc" } },
      }),
      prisma.userActivityLog.count({
        where: { createdAt: { gte: from, lt: to } },
      }),
    ]);

  const byUserDay = byUserDayRaw.map((row) => {
    const user = staff.find((s) => s.id === row.userId) || null;
    const spanMs =
      row.lastAt && row.firstAt
        ? new Date(row.lastAt).getTime() - new Date(row.firstAt).getTime()
        : 0;
    const dayYmd =
      row.day instanceof Date
        ? row.day.toLocaleDateString("en-CA", { timeZone: "UTC" })
        : String(row.day).slice(0, 10);
    return {
      userId: row.userId,
      day: dayYmd,
      count: Number(row.count),
      firstAt: row.firstAt,
      lastAt: row.lastAt,
      activeMinutes: Math.max(1, Math.round(spanMs / 60_000)),
      user,
    };
  });

  const byUser = usersActive
    .map((u) => {
      const user = staff.find((s) => s.id === u.userId);
      const spanMs =
        u._max.createdAt && u._min.createdAt
          ? u._max.createdAt.getTime() - u._min.createdAt.getTime()
          : 0;
      return {
        userId: u.userId,
        count: u._count,
        firstAt: u._min.createdAt,
        lastAt: u._max.createdAt,
        activeMinutes: Math.max(1, Math.round(spanMs / 60_000)),
        user: user || null,
      };
    })
    .filter((u) => !userId || u.userId === userId)
    .sort((a, b) => b.count - a.count);

  const activeIds = new Set(byUser.map((u) => u.userId));
  const inactiveToday = staff
    .filter((s) => !activeIds.has(s.id))
    .map((s) => ({
      userId: s.id,
      user: s,
      count: 0,
    }));

  return {
    mode: "range" as const,
    from: from.toISOString(),
    to: to.toISOString(),
    day,
    range,
    retentionDays: ACTIVITY_LOG_RETENTION_DAYS,
    totalDay,
    logs: [],
    byUser,
    byUserDay,
    byMinute: [],
    gaps: [],
    activeMinuteCount: 0,
    byAction: byAction.map((a) => ({ action: a.action, count: a._count })),
    byModule: byModule.map((m) => ({ module: m.module, count: m._count })),
    inactiveToday,
    staff,
  };
}
