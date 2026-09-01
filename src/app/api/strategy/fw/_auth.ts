import { NextRequest, NextResponse } from "next/server";
import { getAppSession, type AppSession } from "@/lib/getAppSession";
import { canAccessFashionWeek } from "@/lib/fw-access";

export type FwAuth =
  | { ok: false; error: NextResponse }
  | { ok: true; session: AppSession; role: string; isAdmin: boolean; userId: string };

export async function requireFwAccess(request: NextRequest): Promise<FwAuth> {
  const session = await getAppSession(request);
  if (!session?.user) {
    return { ok: false, error: NextResponse.json({ error: "Non autorisé" }, { status: 401 }) };
  }
  const role = session.user.role || "";
  if (!canAccessFashionWeek(role, session.user.email)) {
    return { ok: false, error: NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 }) };
  }
  return {
    ok: true,
    session,
    role,
    isAdmin: role === "ADMIN",
    userId: session.user.id,
  };
}
