import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canWriteMarqueCrm } from "@/lib/marque-crm-access";
import { mergeMarques } from "@/lib/marque-merge";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canWriteMarqueCrm(session.user.role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const { id: targetMarqueId } = await params;
    const body = (await request.json()) as { sourceMarqueId?: string };
    const sourceMarqueId = String(body.sourceMarqueId || "").trim();
    if (!sourceMarqueId) {
      return NextResponse.json({ error: "sourceMarqueId requis" }, { status: 400 });
    }

    const result = await mergeMarques(targetMarqueId, sourceMarqueId);
    return NextResponse.json({
      ok: true,
      targetMarqueId,
      mergedFrom: sourceMarqueId,
      ...result,
    });
  } catch (error) {
    console.error("POST /api/marques/[id]/merge:", error);
    const message = error instanceof Error ? error.message : "Erreur fusion";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
