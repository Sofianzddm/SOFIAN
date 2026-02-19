"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Film } from "lucide-react";

export default function PartnersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isProjects = pathname?.startsWith("/partners/projects");

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
