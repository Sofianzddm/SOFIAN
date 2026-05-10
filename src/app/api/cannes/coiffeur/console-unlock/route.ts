import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import {
  COIFFEUR_CONSOLE_UNLOCK_COOKIE,
  isConsolePasswordConfigured,
  mintUnlockToken,
  verifyConsolePasswordInput,
  consoleUnlockSecretConfigured,
} from "@/lib/cannes-coiffeur/consoleUnlockCookie";

export const dynamic = "force-dynamic";

function forbidden() {
  return NextResponse.json({ error: "Non autorise" }, { status: 403 });
}

/** Déverrouille la console salon après mot de passe (cookie HttpOnly pour mémoriser sur cet appareil). */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return forbidden();
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "ADMIN" && role !== "COIFFEUR") return forbidden();

  if (!isConsolePasswordConfigured()) {
    return NextResponse.json({ error: "Mot de passe salon non configure" }, { status: 503 });
  }
  if (!consoleUnlockSecretConfigured()) {
    return NextResponse.json(
      { error: "Configure NEXTAUTH_SECRET (ou CANNES_COIFFEUR_CONSOLE_COOKIE_SECRET) pour le cookie salon" },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const pwd = typeof body.password === "string" ? body.password : "";
  const expected = process.env.CANNES_COIFFEUR_CONSOLE_PASSWORD!.trim();
  if (!verifyConsolePasswordInput(pwd, expected)) {
    return NextResponse.json({ error: "Mot de passe incorrect" }, { status: 401 });
  }

  const userId = session.user.id as string;
  const { token, maxAgeSec } = mintUnlockToken(userId);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COIFFEUR_CONSOLE_UNLOCK_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: maxAgeSec,
  });
  return res;
}

/** Supprime le cookie : le mot de passe sera redemandé au prochain accès. */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return forbidden();
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "ADMIN" && role !== "COIFFEUR") return forbidden();

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COIFFEUR_CONSOLE_UNLOCK_COOKIE, "", {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
  });
  return res;
}
