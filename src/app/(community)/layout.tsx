"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Loader2, LogOut, Sparkles, Users } from "lucide-react";
import { GlowUpLogo } from "@/components/ui/logo";

const NAV = [
  { label: "Collaborations", href: "/community", icon: Sparkles },
  { label: "Talents", href: "/community/talents", icon: Users },
];

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1A1110]" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "COMMUNITY_MANAGER" && role !== "ADMIN") {
    router.replace("/dashboard");
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      <header className="shrink-0 border-b border-gray-200 bg-white">
        <div className="h-14 px-4 flex items-center justify-between">
          <Link href="/community" className="flex items-center gap-2 text-[#1A1110]">
            <GlowUpLogo className="h-7 w-auto" />
            <span className="text-sm font-semibold">Espace Community</span>
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </div>
        <nav className="flex items-center gap-1 px-4">
          {NAV.map((item) => {
            const active =
              item.href === "/community"
                ? pathname === "/community"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-[#1A1110] text-[#1A1110]"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="flex-1 min-h-0">{children}</main>
    </div>
  );
}
