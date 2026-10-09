"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ComptableSidebar } from "@/components/comptable/comptable-sidebar";
import {
  SidebarNavProvider,
  useSidebarNav,
} from "@/components/layout/sidebar-nav-context";
import { Loader2, Menu } from "lucide-react";
import { GlowUpLogo } from "@/components/ui/logo";

const ALLOWED = ["COMPTABLE", "ADMIN"];

function ComptableShell({ children }: { children: React.ReactNode }) {
  const { collapsed, toggleMobile } = useSidebarNav();

  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-50">
      <ComptableSidebar />
      <div
        className={`min-w-0 transition-all duration-300 ${
          collapsed ? "lg:pl-20" : "lg:pl-64"
        }`}
      >
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-3 lg:hidden">
          <button
            type="button"
            onClick={toggleMobile}
            className="rounded-lg p-2 text-gray-600 hover:bg-glowup-rose/10 hover:text-glowup-rose"
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <GlowUpLogo className="h-7 w-auto" variant="dark" />
          <span className="text-sm font-medium text-gray-700">Comptabilité</span>
        </header>
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

export default function ComptableLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();

  const role = (session?.user as { role?: string })?.role;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated" && role && !ALLOWED.includes(role)) {
      router.push("/dashboard");
    }
  }, [status, role, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-glowup-lace">
        <Loader2 className="h-8 w-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  if (status === "unauthenticated" || (role && !ALLOWED.includes(role))) {
    return null;
  }

  return (
    <SidebarNavProvider>
      <ComptableShell>{children}</ComptableShell>
    </SidebarNavProvider>
  );
}
