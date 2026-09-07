import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDcApi, forbidIfMissing } from "@/lib/decision-center/access";
import { serializeRequest } from "@/lib/decision-center/serialize";
import { canViewRequest } from "@/lib/decision-center/visibility";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const auth = await requireDcApi(request);
  if (!auth.ok) return auth.response;
  const denied = forbidIfMissing(auth.ctx, "comment");
  if (denied) return denied;

  const { id } = await ctx.params;
  const body = z.object({ body: z.string().min(1).max(4000) }).safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Commentaire vide" }, { status: 400 });
  }

  const row = await prisma.dcRequest.findUnique({
    where: { id },
    include: { policy: { select: { visibilityScope: true } } },
  });
  if (!row) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (
    !canViewRequest({
      role: auth.ctx.dcRole,
      requesterId: row.requesterId,
      userId: auth.ctx.userId,
      scope: (row.policy?.visibilityScope ?? "ALL_DECISION_CENTER_USERS") as never,
      domain: row.domain,
    })
  ) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  await prisma.dcRequestComment.create({
    data: { requestId: id, authorId: auth.ctx.userId, body: body.data.body },
  });

  const full = await prisma.dcRequest.findUnique({
    where: { id },
    include: {
      requester: { select: { prenom: true, nom: true, email: true } },
      policy: { select: { code: true, title: true, level: true } },
      comments: {
        include: { author: { select: { prenom: true, nom: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return NextResponse.json({ request: serializeRequest(full!) });
}
