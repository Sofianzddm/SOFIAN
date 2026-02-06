"use client";

import { useSession, signOut } from "next-auth/react";
import { LogOut, Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SearchBar } from "@/components/SearchBar";

export function Header() {
  const { data: session } = useSession();
  const router = useRouter();
  const [countNonLues, setCountNonLues] = useState(0);

  const handleLogout = () => {
    signOut({ callbackUrl: "/login" });
  };

  // Récupérer le nombre de notifications non lues
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await fetch("/api/notifications?nonLues=true");
        if (res.ok) {
          const data = await res.json();
          setCountNonLues(data.countNonLues);
        }
      } catch (error) {
        console.error("Erreur fetch notifications:", error);
      }
    };

    if (session?.user) {
      fetchCount();
      // Rafraîchir toutes les 30 secondes
      const interval = setInterval(fetchCount, 30000);
      return () => clearInterval(interval);
    }
  }, [session]);

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      {/* Search Bar with Cmd+K */}
      <div className="flex-1 max-w-xl">
        <SearchBar />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button 
          onClick={() => router.push("/notifications")}
          className="relative p-2 text-gray-500 hover:text-glowup-rose hover:bg-glowup-rose/10 rounded-lg transition-colors"
        >
          <Bell className="w-5 h-5" />
          {countNonLues > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-glowup-rose rounded-full flex items-center justify-center text-white text-xs font-bold px-1">
              {countNonLues > 9 ? "9+" : countNonLues}
            </span>
          )}
        </button>

        {/* User */}
        <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-glowup-rose to-glowup-rose-dark flex items-center justify-center text-white font-semibold text-sm">
            {session?.user?.name?.charAt(0) || "U"}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-glowup-licorice">
              {session?.user?.name}
            </p>
            <p className="text-xs text-gray-500">{session?.user?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-gray-400 hover:text-glowup-rose hover:bg-glowup-rose/10 rounded-lg transition-colors"
            title="Déconnexion"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
