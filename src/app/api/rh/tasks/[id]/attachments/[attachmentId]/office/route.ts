import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  displayName,
  requireRhSessionFromRequest,
} from "@/lib/rh/auth";
import {
  appBaseUrl,
  buildDocumentKey,
  buildEditorConfig,
  isOfficeEditableFile,
  isOnlyOfficeConfigured,
  onlyOfficeScriptUrl,
  signFileAccessToken,
} from "@/lib/rh/onlyoffice";
import { canAccessRhTask } from "@/lib/rh/tasks";

type Ctx = { params: Promise<{ id: string; attachmentId: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  if (!isOnlyOfficeConfigured()) {
    return NextResponse.json(
      {
        error:
          "Éditeur Office non configuré (ONLYOFFICE_URL + ONLYOFFICE_JWT_SECRET)",
      },
      { status: 503 }
    );
  }

  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id: taskId, attachmentId } = await ctx.params;
  const att = await prisma.rhTaskAttachment.findFirst({
    where: { id: attachmentId, taskId },
    include: { task: true },
  });
  if (!att) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }
  if (!(await canAccessRhTask(session.employee, att.task))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  if (!isOfficeEditableFile(att.fileName, att.mimeType)) {
    return NextResponse.json(
      { error: "Ce fichier n’est pas éditable (Excel / Word / PowerPoint)" },
      { status: 400 }
    );
  }

  const fileToken = signFileAccessToken({ taskId, attachmentId });
  const documentUrl = `${appBaseUrl()}/api/rh/tasks/${taskId}/attachments/${attachmentId}/file?token=${fileToken}`;
  const callbackToken = signFileAccessToken({ taskId, attachmentId });
  const callbackUrl = `${appBaseUrl()}/api/rh/tasks/${taskId}/attachments/${attachmentId}/office-callback?token=${callbackToken}`;

  const versionHint = `${att.sizeBytes || 0}_${att.fileUrl.slice(-32)}`;
  const config = buildEditorConfig({
    fileName: att.fileName,
    documentKey: buildDocumentKey(att.id, versionHint),
    documentUrl,
    callbackUrl,
    user: {
      id: session.employee.id,
      name: displayName(session.employee),
    },
    mode: "edit",
  });

  return NextResponse.json({
    config,
    scriptUrl: onlyOfficeScriptUrl(),
    documentServerUrl: process.env.ONLYOFFICE_URL?.replace(/\/$/, ""),
  });
}
