import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFwAccess } from "../../../../_auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const auth = await requireFwAccess(request);
    if (!auth.ok) return auth.error;
    if (!auth.isAdmin) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id, fileId } = await params;
    const file = await prisma.fwCartoFile.findFirst({
      where: { id: fileId, clientId: id },
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
    console.error("GET fw carto-file:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
