"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { resolvePostLoginPath } from "@/lib/auth-redirect";

/**
 * Entrée du domaine : si session active → espace métier, sinon → login.
 * (Avant : toujours /login, même connecté — d’où l’impression de « jamais rester connecté ».)
 */
export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return;

    if (status === "authenticated") {
      const role = (session?.user as { role?: string } | undefined)?.role;
      router.replace(resolvePostLoginPath(role, null));
      return;
    }

    router.replace("/login");
  }, [status, session, router]);

  return null;
}
