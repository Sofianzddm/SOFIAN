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
