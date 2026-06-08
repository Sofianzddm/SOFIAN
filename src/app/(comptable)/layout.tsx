"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ComptableSidebar } from "@/components/comptable/comptable-sidebar";
import { Loader2 } from "lucide-react";

const ALLOWED = ["COMPTABLE", "ADMIN"];

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
    <div className="min-h-screen bg-gray-50">
      <ComptableSidebar />
      <div className="pl-64 transition-all duration-300">
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
