import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

type SessionUser = {
  id: string;
  role?: string;
};

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
