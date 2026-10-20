import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";
import { verifyFileAccessToken } from "@/lib/rh/onlyoffice";
import { canAccessRhTask } from "@/lib/rh/tasks";

type Ctx = { params: Promise<{ id: string; attachmentId: string }> };

/**
 * Proxy fichier pour OnlyOffice (token query) ou session RH.
 * OnlyOffice Document Server fetch cette URL sans cookies.
 */
export async function GET(request: NextRequest, ctx: Ctx) {
  const { id: taskId, attachmentId } = await ctx.params;
  const token = request.nextUrl.searchParams.get("token");

  let allowed = false;
  if (token) {
    const payload = verifyFileAccessToken(token);
    allowed =
      !!payload &&
      payload.taskId === taskId &&
      payload.attachmentId === attachmentId;
  } else {
    const session = await requireRhSessionFromRequest(request);
    if (session) {
      const att = await prisma.rhTaskAttachment.findFirst({
        where: { id: attachmentId, taskId },
        include: { task: true },
      });
      if (att && (await canAccessRhTask(session.employee, att.task))) {
        allowed = true;
      }
    }
  }

  if (!allowed) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const att = await prisma.rhTaskAttachment.findFirst({
    where: { id: attachmentId, taskId },
  });
  if (!att?.fileUrl) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  try {
    const upstream = await fetch(att.fileUrl, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: "Fichier inaccessible" },
        { status: 502 }
      );
    }
    const headers = new Headers();
    headers.set(
      "Content-Type",
      att.mimeType ||
        upstream.headers.get("content-type") ||
        "application/octet-stream"
    );
    headers.set(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(att.fileName)}"`
    );
    const len = upstream.headers.get("content-length");
    if (len) headers.set("Content-Length", len);
    headers.set("Cache-Control", "private, no-store");

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (e) {
    console.error("[rh.office] file proxy", e);
    return NextResponse.json({ error: "Proxy impossible" }, { status: 500 });
  }
}
