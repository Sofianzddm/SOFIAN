import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  approveDedupeSuggestion,
  rejectDedupeSuggestion,
} from "@/lib/marque-ai-dedupe";

const ALLOWED = ["ADMIN", "HEAD_OF", "HEAD_OF_SALES", "HEAD_OF_INFLUENCE"];

/**
 * POST /api/marques/dedupe-suggestions/[id]
 * Body: { action: "approve" | "reject" }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const role = (session.user as { role?: string }).role ?? "";
    if (!ALLOWED.includes(role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await req.json()) as { action?: string };
    const action = body.action;
    const userId = (session.user as { id?: string }).id ?? session.user?.email ?? "admin";

    if (action === "approve") {
      await approveDedupeSuggestion(id, userId);
      return NextResponse.json({ ok: true, action: "approved" });
    }
    if (action === "reject") {
      await rejectDedupeSuggestion(id, userId);
      return NextResponse.json({ ok: true, action: "rejected" });
    }

    return NextResponse.json({ error: "action invalide (approve|reject)" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/marques/dedupe-suggestions/[id]:", error);
    const message = error instanceof Error ? error.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
