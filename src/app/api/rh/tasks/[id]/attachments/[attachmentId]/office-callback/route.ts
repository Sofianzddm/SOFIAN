import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import prisma from "@/lib/prisma";
import {
  isOnlyOfficeConfigured,
  verifyFileAccessToken,
  verifyOfficeToken,
} from "@/lib/rh/onlyoffice";

type Ctx = { params: Promise<{ id: string; attachmentId: string }> };

/**
 * Callback OnlyOffice Document Server.
 * status 2 = prêt à sauver, 6 = forcesave.
 * @see https://api.onlyoffice.com/editors/callback
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  if (!isOnlyOfficeConfigured()) {
    return NextResponse.json({ error: 1 });
  }

  const { id: taskId, attachmentId } = await ctx.params;

  // Token signé dans l’URL (émis à l’ouverture de l’éditeur)
  const urlToken = request.nextUrl.searchParams.get("token");
  const urlOk = urlToken
    ? verifyFileAccessToken(urlToken)
    : null;
  if (
    !urlOk ||
    urlOk.taskId !== taskId ||
    urlOk.attachmentId !== attachmentId
  ) {
    console.error("[rh.office] callback token URL invalide");
    return NextResponse.json({ error: 1 });
  }

  // JWT OnlyOffice optionnel (header / body) — best effort
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const jwtToken = bearer || "";

  // Body peut être JWT string ou JSON
  let body: {
    status?: number;
    url?: string;
    key?: string;
    token?: string;
  };

  const rawText = await request.text();
  try {
    const parsed = JSON.parse(rawText) as typeof body;
    if (parsed.token && !jwtToken) {
      const decoded = verifyOfficeToken<typeof body>(parsed.token);
      body = decoded || parsed;
    } else if (jwtToken) {
      const decoded = verifyOfficeToken<typeof body>(jwtToken);
      body = decoded || parsed;
    } else {
      body = parsed;
    }
  } catch {
    if (jwtToken) {
      const decoded = verifyOfficeToken<typeof body>(jwtToken);
      if (!decoded) {
        console.error("[rh.office] callback JWT invalide");
        return NextResponse.json({ error: 1 });
      }
      body = decoded;
    } else {
      console.error("[rh.office] callback body invalide");
      return NextResponse.json({ error: 1 });
    }
  }

  const status = Number(body.status);
  // 1 editing, 4 closed no changes — rien à faire
  if (status === 1 || status === 4) {
    return NextResponse.json({ error: 0 });
  }

  // 3 save error, 7 forcesave error
  if (status === 3 || status === 7) {
    console.error("[rh.office] callback error status", status, body);
    return NextResponse.json({ error: 0 });
  }

  // 2 = must save, 6 = forcesave
  if (status !== 2 && status !== 6) {
    return NextResponse.json({ error: 0 });
  }

  const downloadUrl = body.url;
  if (!downloadUrl) {
    console.error("[rh.office] callback sans url", body);
    return NextResponse.json({ error: 1 });
  }

  const att = await prisma.rhTaskAttachment.findFirst({
    where: { id: attachmentId, taskId },
  });
  if (!att) {
    console.error("[rh.office] attachment introuvable", attachmentId);
    return NextResponse.json({ error: 1 });
  }

  try {
    const fileRes = await fetch(downloadUrl, { cache: "no-store" });
    if (!fileRes.ok) {
      console.error("[rh.office] download failed", fileRes.status);
      return NextResponse.json({ error: 1 });
    }
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    const mime =
      att.mimeType ||
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const base64 = `data:${mime};base64,${buffer.toString("base64")}`;

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    const safeName = att.fileName
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 80);
    const uploaded = await cloudinary.uploader.upload(base64, {
      folder: "glowup-rh-tasks",
      public_id: `task-${taskId}-edit-${Date.now()}-${safeName}`,
      resource_type: "raw",
    });

    await prisma.rhTaskAttachment.update({
      where: { id: attachmentId },
      data: {
        fileUrl: uploaded.secure_url,
        sizeBytes: buffer.length,
      },
    });

    await prisma.rhTaskEvent.create({
      data: {
        taskId,
        actorId: null,
        kind: "ATTACHMENT_EDITED",
        detail: {
          attachmentId,
          fileName: att.fileName,
          sizeBytes: buffer.length,
          via: "onlyoffice",
        },
      },
    });

    return NextResponse.json({ error: 0 });
  } catch (e) {
    console.error("[rh.office] save failed", e);
    return NextResponse.json({ error: 1 });
  }
}
