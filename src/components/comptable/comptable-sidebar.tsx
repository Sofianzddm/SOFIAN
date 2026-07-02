"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { GlowUpLogo, GlowUpIcon } from "@/components/ui/logo";
import {
  LayoutDashboard,
  Receipt,
  Banknote,
  Download,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Calculator,
  BookOpen,
  Scale,
  ShieldCheck,
  CreditCard,
} from "lucide-react";
import { useState } from "react";

const menu: Array<{
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
}> = [
  { label: "Tableau de bord", href: "/comptable", icon: LayoutDashboard },
  { label: "Journal des ventes", href: "/comptable/ventes", icon: Receipt },
  { label: "Journal de banque", href: "/comptable/banque", icon: Banknote },
  // Dépenses : réservé aux ADMIN (masqué pour le rôle COMPTABLE)
  { label: "Dépenses", href: "/comptable/depenses", icon: CreditCard, adminOnly: true },
  { label: "Grand livre", href: "/comptable/grand-livre", icon: BookOpen },
  { label: "Balance générale", href: "/comptable/balance", icon: Scale },
  { label: "Contrôles", href: "/comptable/controles", icon: ShieldCheck },
  { label: "Exports comptables", href: "/comptable/exports", icon: Download },
];

export function ComptableSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);

  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";
  const visibleMenu = menu.filter((item) => !item.adminOnly || isAdmin);

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-gray-200 bg-white transition-all duration-300 ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-100 px-4">
        {collapsed ? (
          <GlowUpIcon className="mx-auto h-8 w-auto" variant="dark" />
        ) : (
          <GlowUpLogo className="h-8 w-auto" variant="dark" />
        )}
      </div>

      {!collapsed && (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-xl bg-glowup-lace px-3 py-2">
          <Calculator className="h-4 w-4 text-glowup-rose" />
          <span className="text-xs font-semibold uppercase tracking-wide text-glowup-licorice">
            Espace Expert-Comptable
          </span>
        </div>
      )}

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
        {visibleMenu.map((item) => {
          const isActive =
            item.href === "/comptable"
              ? pathname === "/comptable"
              : pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 ${
                isActive
                  ? "bg-glowup-rose text-white"
                  : "text-gray-600 hover:bg-glowup-lace hover:text-glowup-licorice"
              }`}
            >
              <Icon
                className={`h-5 w-5 flex-shrink-0 ${
                  isActive ? "text-white" : "text-gray-400 group-hover:text-glowup-rose"
                }`}
              />
              {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="relative flex-shrink-0 border-t border-gray-100 pb-12">
        {!collapsed && (
          <div className="px-4 pt-3">
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-glowup-licorice"
            >
              <LogOut className="h-4 w-4" />
              Déconnexion
            </button>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute bottom-4 right-0 translate-x-1/2 rounded-full border border-gray-200 bg-white p-1.5 shadow-sm transition-colors hover:bg-glowup-lace"
          aria-label={collapsed ? "Déplier le menu" : "Replier le menu"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-gray-600" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          )}
        </button>
      </div>
    </aside>
  );
}
