import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import CoiffeurConsolePasswordGate from "./CoiffeurConsolePasswordGate";
import CoiffeurSalonConsole from "./CoiffeurSalonConsole";
import { authOptions } from "@/lib/auth";
import {
  COIFFEUR_CONSOLE_UNLOCK_COOKIE,
  consoleUnlockSecretConfigured,
  isConsolePasswordConfigured,
  unlockCookieMaxAgeSec,
  verifyUnlockToken,
} from "@/lib/cannes-coiffeur/consoleUnlockCookie";

export const dynamic = "force-dynamic";

export default async function CoiffeurConsolePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?callbackUrl=/r/cannes-coiffeur/console");

  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "ADMIN" && role !== "COIFFEUR") redirect("/cannes-2026");

  const u = session.user as { name?: string | null; email?: string | null; id: string };
  const raw = u.name?.trim() || u.email?.trim() || "toi";
  const displayName = raw.includes("@") ? raw.split("@")[0]! : raw.split(/\s+/)[0] || "toi";
  const userId = u.id;

  const passwordGate = isConsolePasswordConfigured();
  if (passwordGate && !consoleUnlockSecretConfigured()) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-login px-6 text-center text-glowup-lace">
        <p className="max-w-md text-sm text-glowup-lace/85">
          Mot de passe salon activé : configure <code className="text-glowup-rose-light">NEXTAUTH_SECRET</code> ou{" "}
          <code className="text-glowup-rose-light">CANNES_COIFFEUR_CONSOLE_COOKIE_SECRET</code> sur ce déploiement pour
          signer le cookie de mémorisation.
        </p>
      </div>
    );
  }

  if (passwordGate) {
    const cookieStore = await cookies();
    const token = cookieStore.get(COIFFEUR_CONSOLE_UNLOCK_COOKIE)?.value;
    if (!verifyUnlockToken(token, userId)) {
      const rememberDays = Math.max(1, Math.round(unlockCookieMaxAgeSec() / (60 * 60 * 24)));
      return <CoiffeurConsolePasswordGate displayName={displayName} rememberDays={rememberDays} />;
    }
  }

  return <CoiffeurSalonConsole displayName={displayName} salonPasswordActive={passwordGate} />;
}
