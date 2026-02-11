"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { GlowUpLogo, GlowUpIcon } from "@/components/ui/logo";
import {
  LayoutDashboard,
  Users,
  Building2,
  Handshake,
  FileText,
  Settings,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Bell,
  DollarSign,
  Banknote,
  UserCog,
  Gift,
} from "lucide-react";
import { useState } from "react";

// Définition des accès par rôle
const menuItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES", "TM", "CM", "TALENT"],
  },
  {
    label: "Notifications",
    href: "/notifications",
    icon: Bell,
    roles: ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES", "TM", "CM", "TALENT"],
  },
  {
    label: "Talents",
    href: "/talents",
    icon: Users,
    roles: ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "TM", "CM"],
  },
  {
    label: "Utilisateurs",
    href: "/users",
    icon: UserCog,
    roles: ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES"],
  },
  {
    label: "Marques",
    href: "/marques",
    icon: Building2,
    roles: ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES", "TM"],
  },
  {
    label: "Collaborations",
    href: "/collaborations",
    icon: Handshake,
    roles: ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "TM", "TALENT"],
  },
  {
    label: "Négociations",
    href: "/negociations",
    icon: TrendingUp,
    roles: ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "TM"],
  },
  {
    label: "Gifts",
    href: "/gifts",
    icon: Gift,
    roles: ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "TM", "CM"],
  },
  {
    label: "Account Manager",
    href: "/account-manager",
    icon: UserCog,
    roles: ["CM", "ADMIN"],
  },
  {
    label: "Factures",
    href: "/factures",
    icon: FileText,
    roles: ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE"], // HEAD_OF en lecture seule
  },
  {
    label: "Finance",
    href: "/finance",
    icon: DollarSign,
    roles: ["ADMIN"], // ADMIN uniquement
  },
  {
    label: "Réconciliation",
    href: "/reconciliation",
    icon: Banknote,
    roles: ["ADMIN"], // ADMIN uniquement - Qonto
  },
  {
    label: "Dossiers",
    href: "/dossiers",
    icon: FileText,
    roles: ["ADMIN"], // ADMIN uniquement
  },
  {
    label: "Press Kit Dashboard",
    href: "/presskit-dashboard",
    icon: FileText,
    roles: ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE"], // BizDev
  },
  {
    label: "Paramètres",
    href: "/settings",
    icon: Settings,
    roles: ["ADMIN"],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);

  // Récupérer le rôle de l'utilisateur
  const userRole = (session?.user as { role?: string })?.role || "TALENT";

  // Filtrer les menus selon le rôle
  const filteredMenuItems = menuItems.filter((item) => 
    item.roles.includes(userRole)
  );

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-white border-r border-gray-200 transition-all duration-300 z-40 ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100">
        {collapsed ? (
          <GlowUpIcon className="h-8 w-auto mx-auto" variant="dark" />
        ) : (
          <GlowUpLogo className="h-8 w-auto" variant="dark" />
        )}
      </div>

      {/* Menu */}
      <nav className="p-4 space-y-1">
        {filteredMenuItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                isActive
                  ? "bg-glowup-rose text-white"
                  : "text-gray-600 hover:bg-glowup-lace hover:text-glowup-licorice"
              }`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? "text-white" : "text-gray-400 group-hover:text-glowup-rose"}`} />
              {!collapsed && (
                <span className="font-medium text-sm">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Indicateur de rôle (petit badge en bas) */}
      {!collapsed && (
        <div className="absolute bottom-16 left-4 right-4">
          <div className="px-3 py-2 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">Connecté en tant que</p>
            <p className="text-sm font-medium text-glowup-licorice">{getRoleName(userRole)}</p>
          </div>
        </div>
      )}

      {/* Collapse button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute bottom-4 right-0 translate-x-1/2 bg-white border border-gray-200 rounded-full p-1.5 shadow-sm hover:bg-glowup-lace transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="w-4 h-4 text-gray-600" />
        ) : (
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        )}
      </button>
    </aside>
  );
}

// Helper pour afficher le nom du rôle
function getRoleName(role: string): string {
  const roleNames: Record<string, string> = {
    ADMIN: "Administrateur",
    HEAD_OF: "Head of Influence",
    HEAD_OF_INFLUENCE: "Head of Influence",
    HEAD_OF_SALES: "Head of Sales",
    TM: "Talent Manager",
    CM: "Community Manager",
    TALENT: "Talent",
  };
  return roleNames[role] || role;
}