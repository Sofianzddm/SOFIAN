import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

type SessionUser = {
  id: string;
  role?: string;
};

const CANNES_EDITOR_ROLES = new Set([
  "ADMIN",
  "STRATEGY_PLANNER",
  "HEAD_OF_INFLUENCE",
  "HEAD_OF_SALES",
]);

/** Coiffeur Cannes (back-office dans /cannes-2026) : admins agence, heads, comptes coiffeur. */
const CANNES_COIFFEUR_STAFF_ROLES = new Set([
  "ADMIN",
  "HEAD_OF_INFLUENCE",
  "HEAD_OF_SALES",
  "COIFFEUR",
]);

/** Check-list logistique Cannes : même périmètre que les heads (pas réservé ADMIN seul). */
const CANNES_LOGISTICS_ADMIN_ROLES = new Set([
  "ADMIN",
  "HEAD_OF_INFLUENCE",
  "HEAD_OF_SALES",
]);

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return {
      error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }),
    };
  }
  return { session };
}

export async function requireAdmin() {
  const { session, error } = await requireSession();
  if (error) return { error };

  const user = session!.user as SessionUser;
  if (user.role !== "ADMIN") {
    return {
      error: NextResponse.json(
        { error: "Accès refusé - ADMIN uniquement" },
        { status: 403 }
      ),
    };
  }

  return { session };
}

export async function requireCannesEditor() {
  const { session, error } = await requireSession();
  if (error) return { error };

  const user = session!.user as SessionUser;
  if (!CANNES_EDITOR_ROLES.has(user.role || "")) {
    return {
      error: NextResponse.json(
        { error: "Accès refusé - edition Cannes 2026 reservee aux roles autorises" },
        { status: 403 }
      ),
    };
  }

  return { session };
}

/** Réservation coiffeur Cannes : admin agence, heads influence/ventes, ou compte coiffeur. */
export async function requireCannesCoiffeurStaff() {
  const { session, error } = await requireSession();
  if (error) return { error };

  const user = session!.user as SessionUser;
  if (!CANNES_COIFFEUR_STAFF_ROLES.has(user.role || "")) {
    return {
      error: NextResponse.json(
        {
          error:
            "Accès refusé - module coiffeur réservé aux administrateurs, Head of Influence / Head of Sales et coiffeurs",
        },
        { status: 403 }
      ),
    };
  }

  return { session };
}

export async function requireCannesLogisticsAdmin() {
  const { session, error } = await requireSession();
  if (error) return { error };

  const user = session!.user as SessionUser;
  if (!CANNES_LOGISTICS_ADMIN_ROLES.has(user.role || "")) {
    return {
      error: NextResponse.json(
        { error: "Accès refusé - logistique Cannes réservée aux administrateurs et heads" },
        { status: 403 }
      ),
    };
  }

  return { session };
}
