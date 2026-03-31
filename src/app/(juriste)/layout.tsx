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
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      <header className="shrink-0 h-14 border-b border-gray-200 bg-white px-4 flex items-center justify-between">
        <Link href="/juriste" className="flex items-center gap-2 text-[#1A1110]">
          <GlowUpLogo className="h-7 w-auto" />
          <span className="text-sm font-semibold">Contrats à relire</span>
        </Link>
      </header>
      <main className="flex-1 min-h-0">{children}</main>
    </div>
  );
}
