"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Film, Lock } from "lucide-react";

export default function PartnersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isProjects = pathname?.startsWith("/partners/projects");

  const [userRole, setUserRole] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setUserRole(data.role ?? null);
        } else {
          setUserRole(null);
        }
      } catch {
        setUserRole(null);
      } finally {
        setLoadingRole(false);
      }
    };

    fetchRole();
  }, []);

  const canAccess =
    userRole === "ADMIN" || userRole === "HEAD_OF_SALES";

  if (loadingRole) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Chargement des permissions...
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
            <Lock className="w-6 h-6 text-gray-500" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900">
            Accès réservé
          </h1>
          <p className="text-sm text-gray-500">
            Seuls les administrateurs et la Head of Sales peuvent accéder au module partenaires.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Sous-onglets Partenaires | Projets */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1" aria-label="Sous-navigation">
            <Link
              href="/partners"
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                !isProjects
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Building2 className="w-4 h-4" />
              Partenaires
            </Link>
            <Link
              href="/partners/projects"
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                isProjects
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Film className="w-4 h-4" />
              Projets
            </Link>
          </nav>
        </div>
      </div>

      {children}
    </div>
  );
}
