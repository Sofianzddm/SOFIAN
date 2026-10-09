"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { GlowUpLogo } from "@/components/ui/logo";

export default function JuristeLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

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
  if (role !== "JURISTE") {
    router.replace("/dashboard");
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-[#fafafa]">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-3 sm:px-4">
        <Link href="/juriste" className="flex min-w-0 items-center gap-2 text-[#1A1110]">
          <GlowUpLogo className="h-7 w-auto shrink-0" />
          <span className="truncate text-sm font-semibold">Contrats à relire</span>
        </Link>
      </header>
      <main className="min-h-0 min-w-0 flex-1">{children}</main>
    </div>
  );
}
