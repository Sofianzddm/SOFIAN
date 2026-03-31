import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canReadContratMarqueReview } from "@/lib/contratMarqueAccess";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };
    const { id } = await params;
    const versionId = req.nextUrl.searchParams.get("versionId");

    const collaboration = await prisma.collaboration.findUnique({
      where: { id },
      select: {
        contratMarquePdfUrl: true,
        accountManagerId: true,
        talent: { select: { managerId: true } },
      },
    });

    if (!collaboration) {
      return new Response("Not found", { status: 404 });
    }

    if (!canReadContratMarqueReview(user.id, user.role, collaboration)) {
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    let pdfUrl = "";
    if (versionId) {
      const version = await prisma.contratMarqueVersion.findFirst({
        where: { id: versionId, collaborationId: id },
      });
      pdfUrl = version?.pdfUrl ?? "";
    } else {
      pdfUrl = collaboration.contratMarquePdfUrl ?? "";
    }

    if (!pdfUrl) {
      return new Response("Not found", { status: 404 });
    }

    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      return NextResponse.json({ error: "Impossible de récupérer le PDF" }, { status: 502 });
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e) {
    console.error("proxy-pdf:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
