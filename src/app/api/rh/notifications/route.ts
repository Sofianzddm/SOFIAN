import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";

/** Notifications plateforme liées au user RH (cloche). */
export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const items = await prisma.notification.findMany({
    where: { userId: session.employee.userId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return NextResponse.json({
    items: items.map((n) => ({
      id: n.id,
      titre: n.titre,
      message: n.message,
      lien: n.lien,
      lu: n.lu,
      createdAt: n.createdAt.toISOString(),
    })),
    unread: items.filter((n) => !n.lu).length,
  });
}

export async function POST(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  if (body.action === "markAllRead") {
    await prisma.notification.updateMany({
      where: { userId: session.employee.userId, lu: false },
      data: { lu: true },
    });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "markRead" && typeof body.id === "string") {
    await prisma.notification.updateMany({
      where: { id: body.id, userId: session.employee.userId },
      data: { lu: true },
    });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
}
