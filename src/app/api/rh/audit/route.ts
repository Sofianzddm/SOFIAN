import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { displayName, requireRhHr } from "@/lib/rh/auth";

/** Timeline audit RH (actions à impact). HR only. */
export async function GET(request: NextRequest) {
  const session = await requireRhHr(request);
  if (!session) {
    return NextResponse.json({ error: "Accès RH requis" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const targetId = searchParams.get("targetId") || undefined;
  const action = searchParams.get("action") || undefined;
  const take = Math.min(200, Math.max(1, Number(searchParams.get("take")) || 80));

  const logs = await prisma.rhAuditLog.findMany({
    where: {
      ...(targetId ? { targetId } : {}),
      ...(action ? { action: { contains: action } } : {}),
    },
    include: {
      actor: {
        include: { user: { select: { prenom: true, nom: true, email: true } } },
      },
      target: {
        include: { user: { select: { prenom: true, nom: true, email: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  return NextResponse.json({
    items: logs.map((l) => ({
      id: l.id,
      action: l.action,
      detail: l.detail,
      createdAt: l.createdAt.toISOString(),
      actor: l.actor ? displayName(l.actor.user) : "Système",
      actorEmail: l.actor?.user.email ?? null,
      target: l.target ? displayName(l.target.user) : null,
      targetId: l.targetId,
    })),
  });
}
