"use client";

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import {
  SidebarNavProvider,
  useSidebarNav,
} from "@/components/layout/sidebar-nav-context";
import { Loader2 } from "lucide-react";
import {
  NomCampagneGateProvider,
  useNomCampagneGate,
} from "@/components/nom-campagne-gate-provider";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { locked, loading: gateLoading, count } = useNomCampagneGate();
  const { collapsed } = useSidebarNav();

  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-50">
      <Sidebar crmLocked={locked} pendingNomCampagne={count} />

      <div
        className={`min-w-0 transition-all duration-300 ${
          collapsed ? "lg:pl-20" : "lg:pl-64"
        }`}
      >
        <Header />
        {locked && !gateLoading && (
          <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:mx-6">
            CRM verrouillé : {count} nom{count > 1 ? "s" : ""} de marque à
            confirmer (saisie en double). Tu peux uniquement ouvrir les fiches
            collab concernées.
          </div>
        )}
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    // Compte désactivé côté JWT → session sans user → déconnexion propre
    if (status === "authenticated" && !session?.user?.id) {
      void signOut({ callbackUrl: "/login" });
      return;
    }
    if (status === "authenticated" && session?.user?.role === "TALENT") {
      router.push("/talent/dashboard");
    }
    if (status === "authenticated" && session?.user?.role === "COMPTABLE") {
      router.push("/comptable");
    }
    if (status === "authenticated" && session?.user?.role === "JURISTE") {
      const p = typeof window !== "undefined" ? window.location.pathname : "";
      if (p && !p.startsWith("/juriste")) {
        router.replace("/juriste");
      }
    }
  }, [status, session, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-glowup-lace flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <NomCampagneGateProvider>
      <SidebarNavProvider>
        <DashboardShell>{children}</DashboardShell>
      </SidebarNavProvider>
    </NomCampagneGateProvider>
  );
}
