"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import type { DcCapability } from "@/lib/decision-center/capabilities";
import type { DcRole } from "@/lib/decision-center/constants";
import { hasCapability } from "@/lib/decision-center/capabilities";

const ITEMS: { href: string; label: string; cap: DcCapability }[] = [
  { href: "/decision-center", label: "Vue d’ensemble", cap: "view_overview" },
  { href: "/decision-center/droits", label: "Mes droits", cap: "view_my_rights" },
  { href: "/decision-center/qui-decide", label: "Qui décide ?", cap: "search_rules" },
  { href: "/decision-center/demander", label: "Demander une décision", cap: "create_request" },
  { href: "/decision-center/matrice", label: "Matrice", cap: "view_matrix" },
  { href: "/decision-center/historique", label: "Historique", cap: "view_own_requests" },
  { href: "/decision-center/queue", label: "CEO Queue", cap: "view_ceo_dashboard" },
  { href: "/decision-center/digest", label: "Digest CEO", cap: "view_digest" },
  { href: "/decision-center/abonnements", label: "Abonnements", cap: "manage_subscriptions" },
  { href: "/decision-center/administration", label: "Administration", cap: "edit_policy" },
];

export function DcSubNav({
  role,
  capabilities,
}: {
  role: DcRole;
  capabilities: readonly DcCapability[];
}) {
  const pathname = usePathname();
  void capabilities;
  const items = ITEMS.filter((i) => hasCapability(role, i.cap));

  return (
    <nav
      className="-mx-2 mb-6 flex gap-1 overflow-x-auto pb-1"
      aria-label="Decision Center"
    >
      <Toaster richColors position="top-right" />
      {items.map((item) => {
        const active =
          item.href === "/decision-center"
            ? pathname === "/decision-center"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-glowup-rose text-white"
                : "text-gray-600 hover:bg-glowup-lace hover:text-glowup-licorice"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
