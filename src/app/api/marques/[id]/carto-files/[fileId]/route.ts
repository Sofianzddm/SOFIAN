import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/** GET → télécharge le fichier de cartographie original tel qu'importé. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id, fileId } = await params;
    const file = await prisma.marqueCartoFile.findFirst({
      where: { id: fileId, marqueId: id },
    });
    if (!file) {
      return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
    }

    // Feuille AO : réservée aux admins
    if (file.kind === "AO" && (session.user.role || "") !== "ADMIN") {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
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
    console.error("GET carto-file:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** DELETE → retire un fichier de carto / AO de la fiche (Admin). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if ((session.user.role || "") !== "ADMIN") {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id, fileId } = await params;
    await prisma.marqueCartoFile.deleteMany({ where: { id: fileId, marqueId: id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE carto-file:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
