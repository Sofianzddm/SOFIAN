import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFwAccess } from "../../../_auth";
import { buildFwCartoExcelBuffer } from "@/lib/fw-carto-excel";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireFwAccess(request);
    if (!auth.ok) return auth.error;
    if (!auth.isAdmin) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await params;
    const client = await prisma.fwClient.findUnique({
      where: { id },
      include: { contacts: { orderBy: { createdAt: "asc" } } },
    });
    if (!client) {
      return NextResponse.json({ error: "Client introuvable." }, { status: 404 });
    }
    if (client.contacts.length === 0) {
      return NextResponse.json({ error: "Aucun contact à exporter." }, { status: 400 });
    }

    const buffer = await buildFwCartoExcelBuffer(client.nom, client.contacts);
    const fileName = `carto-fw-${client.nom.replace(/[^\w\-]+/g, "_")}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch (error) {
    console.error("GET fw export-carto:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
