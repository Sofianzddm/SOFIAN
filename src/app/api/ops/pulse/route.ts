import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";
import { canViewActivityPulse } from "@/lib/user-activity-log";

/** Journal d'activité — accessible uniquement à Sofian (404 pour tous les autres). */
export async function GET(request: NextRequest) {
  const session = await getAppSession(request);
  if (!session?.user?.email || !canViewActivityPulse(session.user.email)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId")?.trim() || "";
  let day = searchParams.get("day")?.trim() || "";
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 500), 1), 1500);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    day = new Date().toLocaleString("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  let from = new Date(`${day}T00:00:00+02:00`);
  if (from.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }) !== day) {
    from = new Date(`${day}T00:00:00+01:00`);
  }
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);

  const dayWhere = { createdAt: { gte: from, lt: to } };
  const where = {
    ...dayWhere,
    ...(userId ? { userId } : {}),
  };

  const [logs, usersActive, byAction, byModule, staff, totalDay] =
    await Promise.all([
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
      prisma.user.findMany({
        where: {
          actif: true,
          role: { notIn: ["TALENT"] },
        },
        select: { id: true, prenom: true, nom: true, email: true, role: true },
        orderBy: [{ prenom: "asc" }, { nom: "asc" }],
      }),
      prisma.userActivityLog.count({ where: dayWhere }),
    ]);

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
    .sort((a, b) => b.count - a.count);

  // Qui n'a RIEN fait aujourd'hui (staff actif hors talents)
  const activeIds = new Set(byUser.map((u) => u.userId));
  const inactiveToday = staff
    .filter((s) => !activeIds.has(s.id))
    .map((s) => ({
      userId: s.id,
      user: s,
      count: 0,
    }));

  return NextResponse.json({
    from: from.toISOString(),
    to: to.toISOString(),
    day,
    totalDay,
    logs,
    byUser,
    byAction: byAction.map((a) => ({ action: a.action, count: a._count })),
    byModule: byModule.map((m) => ({ module: m.module, count: m._count })),
    inactiveToday,
    staff,
  });
}
