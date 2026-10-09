"use client";

import { useSession, signOut } from "next-auth/react";
import { LogOut, Bell, UserX, Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SearchBar } from "@/components/SearchBar";
import { GlowUpLogo } from "@/components/ui/logo";
import { useSidebarNavOptional } from "@/components/layout/sidebar-nav-context";

interface AuthMe {
  id: string;
  name: string;
  email: string;
  role: string;
  impersonating?: boolean;
  realUser?: { id: string; name?: string; email?: string; role?: string };
}

interface NotificationItem {
  id: string;
  type: string;
  titre: string;
  message: string;
  lien: string | null;
  lu: boolean;
  luAt: string | null;
  createdAt: string;
}

export function Header() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const sidebarNav = useSidebarNavOptional();
  const [countNonLues, setCountNonLues] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [authMe, setAuthMe] = useState<AuthMe | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setAuthMe(data))
      .catch(() => setAuthMe(null));
  }, []);

  const handleLogout = () => {
    signOut({ callbackUrl: "/login" });
  };

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count");
      if (res.ok) {
        const data = await res.json();
        setCountNonLues(data.count ?? 0);
      }
    } catch (error) {
      console.error("Erreur fetch unread count:", error);
    }
  }, []);

  useEffect(() => {
    if (session?.user) {
      fetchUnreadCount();
      const interval = setInterval(fetchUnreadCount, 30000);
      return () => clearInterval(interval);
    }
  }, [session, fetchUnreadCount]);

  const openDropdown = useCallback(() => {
    setDropdownOpen((prev) => {
      if (!prev) {
        setLoadingNotifs(true);
        fetch("/api/notifications")
          .then((r) => r.ok && r.json())
          .then((data) => {
            setNotifications(data.notifications || []);
          })
          .catch(() => setNotifications([]))
          .finally(() => setLoadingNotifs(false));
      }
      return !prev;
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [dropdownOpen]);

  const markAsRead = useCallback(
    async (id: string, link: string | null) => {
      try {
        await fetch(`/api/notifications/${id}`, { method: "PATCH" });
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, lu: true } : n))
        );
        setCountNonLues((c) => Math.max(0, c - 1));
        setDropdownOpen(false);
        if (link) router.push(link);
      } catch (e) {
        if (link) router.push(link);
      }
    },
    [router]
  );

  const markAllRead = useCallback(async () => {
    try {
      await fetch("/api/notifications/read-all", { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => ({ ...n, lu: true })));
      setCountNonLues(0);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const formatRelative = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const diffJ = Math.floor(diffMs / 86400000);
    if (diffMin < 1) return "à l'instant";
    if (diffMin < 60) return `il y a ${diffMin}min`;
    if (diffH < 24) return `il y a ${diffH}h`;
    if (diffJ < 7) return `il y a ${diffJ}j`;
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  };

  const list = notifications.slice(0, 8);
  const isImpersonating = authMe?.impersonating === true;

  const stopImpersonate = useCallback(async () => {
    try {
      await fetch("/api/auth/stop-impersonate", { method: "POST" });
      // Nettoyer aussi le token NextAuth (fin d'impersonation)
      await update?.({ stopImpersonation: true } as any);
      window.location.href = "/users";
    } catch (e) {
      console.error(e);
    }
  }, [update]);

  return (
    <>
      {isImpersonating && (
        <div className="flex h-auto min-h-9 flex-wrap items-center justify-center gap-2 bg-violet-100 px-3 py-2 text-center text-xs text-violet-800 sm:gap-3 sm:text-sm">
          <UserX className="h-4 w-4 shrink-0" />
          <span>
            Connecté en tant que <strong>{authMe?.name}</strong>
            {authMe?.realUser?.name && (
              <span className="ml-1 text-violet-600">
                (admin : {authMe.realUser.name})
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={stopImpersonate}
            className="font-medium underline hover:no-underline"
          >
            Arrêter l&apos;impersonation
          </button>
        </div>
      )}
    <header className="flex h-14 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 sm:h-16 sm:gap-3 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {sidebarNav ? (
          <button
            type="button"
            onClick={sidebarNav.toggleMobile}
            className="shrink-0 rounded-lg p-2 text-gray-600 transition-colors hover:bg-glowup-rose/10 hover:text-glowup-rose lg:hidden"
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1 max-w-xl">
          {session?.user?.role === "TALENT" ? (
            <GlowUpLogo className="h-7 lg:hidden" />
          ) : (
            <SearchBar />
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={openDropdown}
            className="relative p-2 text-gray-500 hover:text-glowup-rose hover:bg-glowup-rose/10 rounded-lg transition-colors"
            aria-expanded={dropdownOpen}
            aria-haspopup="true"
          >
            <Bell className="w-5 h-5" />
            {countNonLues > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold px-1">
                {countNonLues > 9 ? "9+" : countNonLues}
              </span>
            )}
          </button>

          {dropdownOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white shadow-xl z-50"
              role="dialog"
              aria-label="Notifications"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="font-semibold text-gray-900">
                  Notifications
                </span>
                {countNonLues > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="text-xs font-medium text-glowup-rose hover:underline"
                  >
                    Tout marquer lu
                  </button>
                )}
              </div>
              <div className="max-h-[360px] overflow-y-auto">
                {loadingNotifs ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-500">
                    Chargement...
                  </div>
                ) : list.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-500">
                    Aucune notification
                  </div>
                ) : (
                  list.map((notif) => (
                    <button
                      key={notif.id}
                      type="button"
                      onClick={() => markAsRead(notif.id, notif.lien)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 transition-colors hover:bg-gray-50/80 ${
                        !notif.lu ? "bg-blue-50/30" : "bg-white"
                      }`}
                    >
                      <div className="flex gap-3">
                        {!notif.lu && (
                          <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                        )}
                        <div
                          className={`flex-1 min-w-0 ${!notif.lu ? "" : "pl-5"}`}
                        >
                          <p
                            className={`text-sm font-medium ${
                              notif.lu ? "text-gray-600" : "text-gray-900"
                            }`}
                          >
                            {notif.titre}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {notif.message}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {formatRelative(notif.createdAt)}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
              {list.length > 0 && (
                <div className="border-t border-gray-100 px-4 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      router.push("/notifications");
                    }}
                    className="w-full text-center text-sm font-medium text-glowup-rose hover:underline"
                  >
                    Voir toutes →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-l border-gray-200 pl-2 sm:gap-3 sm:pl-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-glowup-rose to-glowup-rose-dark text-sm font-semibold text-white sm:h-9 sm:w-9">
            {(authMe?.name ?? session?.user?.name)?.charAt(0) || "U"}
          </div>
          <div className="hidden min-w-0 md:block">
            <p className="truncate text-sm font-medium text-glowup-licorice">
              {authMe?.name ?? session?.user?.name}
            </p>
            <p className="truncate text-xs text-gray-500">
              {authMe?.role ?? (session?.user as { role?: string })?.role}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-glowup-rose/10 hover:text-glowup-rose"
            title="Déconnexion"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
    </>
  );
}
