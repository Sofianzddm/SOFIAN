import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  canAccessPrestataireCrm,
  canWritePrestataireCrm,
} from "@/lib/prestataire-crm-access";

type RouteContext = { params: Promise<{ id: string; fileId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canAccessPrestataireCrm(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id, fileId } = await context.params;
    const file = await prisma.prestataireCartoFile.findFirst({
      where: { id: fileId, prestataireId: id },
    });
    if (!file) {
      return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.size),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch (error) {
    console.error("GET prestataire carto-file:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canWritePrestataireCrm(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id, fileId } = await context.params;
    await prisma.prestataireCartoFile.deleteMany({
      where: { id: fileId, prestataireId: id },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE prestataire carto-file:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
