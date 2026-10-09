"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Gift, Handshake, LayoutDashboard, Lock, Mail } from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/account-manager", icon: LayoutDashboard, exact: true },
  { label: "Rédacteur de mails", href: "/account-manager/mailer", icon: Mail },
  { label: "Gifts", href: "/gifts", icon: Gift },
  { label: "Collaborations", href: "/collaborations", icon: Handshake },
];

export default function AccountManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const canAccess = role === "CM" || role === "ADMIN";

  if (status === "loading") {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-sm text-gray-500">
        Chargement…
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
            <Lock className="w-6 h-6 text-gray-500" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900">Accès réservé</h1>
          <p className="text-sm text-gray-500">
            Cette zone est réservée aux Account Managers.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="-mx-4 -mt-4 border-b border-gray-200 bg-white px-4 sm:-mx-6 sm:-mt-6 sm:px-6">
        <nav
          className="flex gap-1 overflow-x-auto"
          style={{ scrollbarWidth: "none" }}
          aria-label="Navigation Account Manager"
        >
          {navItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname?.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors sm:px-4 ${
                  isActive
                    ? "border-glowup-rose text-glowup-rose"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
