import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import {
  listPendingNomCampagne,
  NOM_MARQUE_LOCK_COOKIE,
} from "@/lib/nom-campagne-gate";
import { NOM_CAMPAGNE_GATE_ROLES } from "@/lib/nom-campagne-gate-paths";

function withLockCookie(res: NextResponse, locked: boolean): NextResponse {
  if (locked) {
    res.cookies.set(NOM_MARQUE_LOCK_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  } else {
    res.cookies.set(NOM_MARQUE_LOCK_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
  return res;
}

/**
 * GET — Collabs dont le nom de marque doit encore être corrigé.
 * Pose / retire le cookie de verrou CRM (anti-bypass middleware).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const role = session.user.role || "";
    const isGateRole = NOM_CAMPAGNE_GATE_ROLES.includes(
      role as (typeof NOM_CAMPAGNE_GATE_ROLES)[number]
    );
    const canSee =
      isGateRole ||
      ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE"].includes(role);
    if (!canSee) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const items = await listPendingNomCampagne({
      id: session.user.id,
      role,
    });

    const locked = isGateRole && items.length > 0;
    const res = NextResponse.json({
      count: items.length,
      items,
      firstId: items[0]?.id ?? null,
      locked,
    });

    if (isGateRole) {
      return withLockCookie(res, locked);
    }
    return res;
  } catch (error) {
    console.error("pending-nom-campagne:", error);
    // Fail-closed pour les rôles gated : on ne déverrouille pas sur erreur.
    const res = NextResponse.json({ error: "Erreur" }, { status: 500 });
    return res;
  }
}
