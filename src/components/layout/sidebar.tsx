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
  Lock,
  Target,
  UserCheck,
  Scale,
  Briefcase,
  Mail,
} from "lucide-react";
import { useState, useEffect } from "react";

// Définition des accès par rôle
const menuItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: [
      "ADMIN",
      "HEAD_OF",
      "HEAD_OF_INFLUENCE",
      "HEAD_OF_SALES",
      "TM",
      "CM",
      "TALENT",
      "CASTING_MANAGER",
    ],
  },
  {
    label: "Casting Outreach",
    href: "/casting-outreach",
    icon: Mail,
    roles: ["CASTING_MANAGER", "ADMIN"],
  },
  {
    label: "Demandes Entrantes",
    href: "/demandes-entrantes",
    icon: Mail,
    roles: ["CASTING_MANAGER", "ADMIN"],
  },
  {
    label: "Notifications",
    href: "/notifications",
    icon: Bell,
    roles: ["ADMIN", "HEAD_OF", "HEAD_OF_SALES", "TM", "CM", "TALENT"],
  },
  {
    label: "Talents",
    href: "/talents",
    icon: Users,
    roles: ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "TM", "CM", "CASTING_MANAGER"],
  },
  {
    label: "Utilisateurs",
    href: "/users",
    icon: UserCog,
    roles: ["ADMIN", "HEAD_OF", "HEAD_OF_SALES"],
  },
  {
    label: "Marques",
    href: "/marques",
    icon: Building2,
    roles: ["ADMIN", "HEAD_OF", "HEAD_OF_SALES"],
  },
  {
    label: "Partenaires",
    href: "/partners",
    icon: Building2,
    roles: ["ADMIN", "HEAD_OF", "HEAD_OF_SALES", "CM"],
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
    label: "Prospection",
    href: "/prospection",
    icon: Target,
    roles: ["ADMIN", "HEAD_OF_INFLUENCE", "TM"],
  },
  {
    label: "Gifts",
    href: "/gifts",
    icon: Gift,
    roles: ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES", "TM", "CM"],
  },
  {
    label: "Account Manager",
    href: "/account-manager",
    icon: UserCog,
    roles: ["CM", "ADMIN"],
  },
  {
    label: "Factures & Devis",
    href: "/factures",
    icon: FileText,
    roles: ["ADMIN", "HEAD_OF", "HEAD_OF_SALES"],
  },
  {
    label: "Finance",
    href: "/finance",
    icon: DollarSign,
    roles: ["ADMIN"],
  },
  {
    label: "Objectifs",
    href: "/objectifs",
    icon: Target,
    roles: ["ADMIN"],
  },
  {
    label: "Délégations",
    href: "/admin/delegations",
    icon: UserCheck,
    roles: ["ADMIN", "HEAD_OF_INFLUENCE"],
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
    label: "HubSpot",
    href: "/presskit-dashboard",
    icon: FileText,
    roles: ["ADMIN", "HEAD_OF", "HEAD_OF_SALES"],
  },
  {
    label: "Paramètres",
    href: "/settings",
    icon: Settings,
    roles: ["ADMIN"],
  },
];

function daysSince(dateStr: string): number {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [effectiveRole, setEffectiveRole] = useState<string | null>(null);
  const [hasAbsence, setHasAbsence] = useState(false);
  const [hasMissingDelegations, setHasMissingDelegations] = useState(false);
  const [delegationsRecues, setDelegationsRecues] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.role && setEffectiveRole(data.role))
      .catch(() => {});
  }, []);

  // Rôle effectif (prise en compte de l'impersonation admin)
  const userRole = effectiveRole ?? (session?.user as { role?: string })?.role ?? "TALENT";

  // Délégations reçues pour indicateur "Mode Relai"
  useEffect(() => {
    if (userRole !== "TM" && userRole !== "HEAD_OF_INFLUENCE") return;
    const fetchDelegationsRecues = async () => {
      try {
        const res = await fetch("/api/delegations/mes-delegations-recues");
        if (!res.ok) {
          setDelegationsRecues([]);
          return;
        }
        const json = await res.json();
        setDelegationsRecues(json.delegations || []);
      } catch {
        setDelegationsRecues([]);
      }
    };
    fetchDelegationsRecues();
  }, [userRole]);

  useEffect(() => {
    if (userRole !== "TM" && userRole !== "HEAD_OF_INFLUENCE") return;
    const fetchDelegations = async () => {
      try {
        const [delegRes, talentsRes] = await Promise.all([
          fetch("/api/delegations/mes-delegations-emises"),
          fetch("/api/talents"),
        ]);
        if (!delegRes.ok) {
          setHasAbsence(false);
          setHasMissingDelegations(false);
          return;
        }
        const dJson = await delegRes.json();
        const delegations = (dJson.delegations || []) as any[];
        const hasAny = delegations.some((d: any) => {
          if (d.actif) return true;
          if (!d.updatedAt) return false;
          return daysSince(d.updatedAt) <= 7;
        });
        setHasAbsence(hasAny);

        if (!talentsRes.ok || !session?.user) {
          setHasMissingDelegations(false);
          return;
        }
        const tJson = await talentsRes.json();
        const meId = (session.user as { id?: string }).id;
        const talents = (Array.isArray(tJson) ? tJson : tJson.talents || []) as any[];
        const talentsPropres = talents.filter(
          (t) => t.managerId === meId && !t.isArchived
        );
        const delegTalentIds = new Set(delegations.map((d) => d.talent.id));
        const nonDelegues = talentsPropres.filter(
          (t: any) => !delegTalentIds.has(t.id)
        );
        setHasMissingDelegations(nonDelegues.length > 0);
      } catch {
        setHasAbsence(false);
        setHasMissingDelegations(false);
      }
    };
    fetchDelegations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole]);

  // Espace juriste : menu réduit
  if (userRole === "JURISTE") {
    return (
      <aside
        className={`fixed left-0 top-0 h-screen bg-white border-r border-gray-200 transition-all duration-300 z-40 ${
          collapsed ? "w-20" : "w-64"
        }`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100">
          {collapsed ? (
            <GlowUpIcon className="h-8 w-auto mx-auto" variant="dark" />
          ) : (
            <GlowUpLogo className="h-8 w-auto" variant="dark" />
          )}
        </div>
        <nav className="p-4 space-y-1">
          <Link
            href="/juriste"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
              pathname === "/juriste" || pathname?.startsWith("/juriste/")
                ? "bg-glowup-rose text-white"
                : "text-gray-600 hover:bg-glowup-lace hover:text-glowup-licorice"
            }`}
          >
            <Scale
              className={`w-5 h-5 flex-shrink-0 ${
                pathname === "/juriste" || pathname?.startsWith("/juriste/")
                  ? "text-white"
                  : "text-gray-400 group-hover:text-glowup-rose"
              }`}
            />
            {!collapsed && <span className="font-medium text-sm">Contrats à relire</span>}
          </Link>
        </nav>
        {!collapsed && (
          <div className="absolute bottom-16 left-4 right-4">
            <div className="px-3 py-2 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Connecté en tant que</p>
              <p className="text-sm font-medium text-glowup-licorice">{getRoleName(userRole)}</p>
            </div>
          </div>
        )}
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

  // Filtrer les menus selon le rôle
  const filteredMenuItems =
    userRole === "STRATEGY_PLANNER"
      ? [
          {
            label: "Villa Cannes 2026",
            href: "/strategy/projets/villa-cannes",
            icon: Briefcase,
            roles: ["STRATEGY_PLANNER", "ADMIN"],
          } as (typeof menuItems)[number],
        ]
      : menuItems
          .filter((item) => item.roles.includes(userRole))
          .concat(
            (userRole === "TM" || userRole === "HEAD_OF_INFLUENCE") && hasAbsence
              ? [
                  {
                    label: "Mon absence",
                    href: "/mon-absence",
                    icon: UserCog,
                    roles: ["TM", "HEAD_OF_INFLUENCE"],
                  } as (typeof menuItems)[number],
                ]
              : []
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

      {/* Indicateur permanent Mode Relai */}
      {(userRole === "TM" || userRole === "HEAD_OF_INFLUENCE") &&
        delegationsRecues.length > 0 && !collapsed && (
          <div
            className="mx-3 mt-3 mb-1 rounded-xl px-3 py-2.5"
            style={{
              background: "rgba(200,242,133,0.1)",
              border: "1px solid rgba(200,242,133,0.2)",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span
                  className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ background: "#C8F285" }}
                />
                <span
                  className="relative inline-flex rounded-full h-2 w-2"
                  style={{ background: "#C8F285" }}
                />
              </span>
              <span
                className="text-xs font-medium"
                style={{ color: "#C8F285", fontFamily: "Switzer, sans-serif" }}
              >
                Mode Relai · {delegationsRecues.length} talent
                {delegationsRecues.length > 1 ? "s" : ""}
              </span>
            </div>
          </div>
        )}

      {/* Menu */}
      <nav className="p-4 space-y-1">
        {userRole === "STRATEGY_PLANNER" && !collapsed && (
          <div className="px-3 pt-1 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Projet
            </p>
          </div>
        )}
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
              } ${userRole === "STRATEGY_PLANNER" && !collapsed ? "ml-3" : ""}`}
            >
              <Icon
                className={`w-5 h-5 flex-shrink-0 ${
                  isActive ? "text-white" : "text-gray-400 group-hover:text-glowup-rose"
                }`}
              />
              {!collapsed && (
                <span className="font-medium text-sm flex items-center gap-2">
                  {item.label}
                  {item.href === "/mon-absence" && hasMissingDelegations && (
                    <span className="inline-flex h-2 w-2 rounded-full bg-orange-400" />
                  )}
                </span>
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
    JURISTE: "Juriste",
    STRATEGY_PLANNER: "Strategy Planner",
    CASTING_MANAGER: "Casting Manager",
  };
  return roleNames[role] || role;
}