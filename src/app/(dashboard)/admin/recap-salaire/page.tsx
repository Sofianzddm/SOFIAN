"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";

export default function AdminRecapSalairePage() {
  const { status, data: session } = useSession();
  const [effectiveRole, setEffectiveRole] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => setEffectiveRole(typeof m?.role === "string" ? m.role : null))
      .catch(() => setEffectiveRole((session?.user as { role?: string } | undefined)?.role ?? null));
  }, [status, session?.user]);

  if (status === "loading" || !effectiveRole) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: OLD_ROSE }} />
      </div>
    );
  }

  if (effectiveRole !== "ADMIN") {
    return <div className="p-6 text-sm">Accès refusé.</div>;
  }

  return (
    <div className="space-y-3" style={{ fontFamily: "Switzer, sans-serif" }}>
      <h1 className="text-3xl font-semibold" style={{ color: LICORICE, fontFamily: "Spectral, serif" }}>
        Récap salaire
      </h1>
      <p className="text-sm" style={{ color: OLD_ROSE }}>
        Module en préparation.
      </p>
    </div>
  );
}

