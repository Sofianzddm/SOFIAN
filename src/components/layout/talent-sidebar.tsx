"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { GlowUpLogo } from "@/components/ui/logo";
import {
  LayoutDashboard,
  Handshake,
  FileText,
  User,
  BarChart3,
  Heart,
} from "lucide-react";

const menuItems = [
  {
    label: "Dashboard",
    href: "/talent/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Mes Collaborations",
    href: "/talent/collaborations",
    icon: Handshake,
  },
  {
    label: "Mes Factures",
    href: "/talent/factures",
    icon: FileText,
  },
  {
    label: "Mes Statistiques",
    href: "/talent/stats",
    icon: BarChart3,
  },
  {
    label: "Mon Profil",
    href: "/talent/profil",
    icon: User,
  },
];

export function TalentSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center justify-center border-b border-gray-200 px-6">
        <Link href="/talent/dashboard" className="flex items-center gap-2">
          <GlowUpLogo className="h-8" />
        </Link>
      </div>

      {/* User Badge */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-glowup-rose to-purple-600 flex items-center justify-center text-white font-bold text-lg">
            {session?.user?.name?.charAt(0) || "T"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-glowup-licorice truncate">
              {session?.user?.name}
            </p>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Heart className="w-3 h-3 fill-glowup-rose text-glowup-rose" />
              <span>Talent</span>
            </div>
          </div>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-gradient-to-r from-glowup-rose to-purple-600 text-white shadow-lg shadow-pink-200"
                  : "text-gray-600 hover:bg-glowup-rose/10 hover:text-glowup-rose"
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <div className="bg-gradient-to-br from-pink-50 to-purple-50 rounded-xl p-4">
          <p className="text-xs font-semibold text-glowup-licorice mb-1">
            💡 Besoin d'aide ?
          </p>
          <p className="text-xs text-gray-600 mb-2">
            Contactez votre Talent Manager
          </p>
          <a
            href="mailto:contact@glowupagence.fr"
            className="text-xs text-glowup-rose hover:underline font-medium"
          >
            contact@glowupagence.fr
          </a>
        </div>
      </div>
    </aside>
  );
}
