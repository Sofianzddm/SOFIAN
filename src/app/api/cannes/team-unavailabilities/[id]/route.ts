import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/cannes/auth";

type RouteCtx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await ctx.params;
  try {
    await prisma.cannesTeamUnavailability.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Indisponibilité introuvable" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
