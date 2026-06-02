import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { backfillMarqueContacts } from "@/lib/marque-contacts-backfill";

const ALLOWED = ["ADMIN", "HEAD_OF"];

/**
 * POST /api/admin/marques/backfill-contacts
 *
 * Reconstruit MarqueContact à partir de toutes les sources (inbound, négos,
 * demandes entrantes, missions, opportunités). Idempotent.
 *
 * Body : { dryRun?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const role = (session.user as { role?: string }).role ?? "";
    if (!ALLOWED.includes(role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean };
    const result = await backfillMarqueContacts({ dryRun: body.dryRun === true });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("POST /api/admin/marques/backfill-contacts:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur" },
      { status: 500 }
    );
  }
}
