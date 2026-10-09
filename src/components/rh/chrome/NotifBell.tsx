"use client";

import { Bell } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Notif = {
  id: string;
  titre: string;
  message: string;
  lien: string | null;
  lu: boolean;
  createdAt: string;
};

export function NotifBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch("/api/rh/notifications", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.items || []);
    setUnread(data.unread || 0);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  async function markAll() {
    await fetch("/api/rh/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markAllRead" }),
    });
    await load();
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
        className="relative grid place-items-center border-0 cursor-pointer"
        style={{
          width: 36,
          height: 36,
          borderRadius: 11,
          background: "var(--rh-surface-control)",
          border: "1px solid var(--rh-border-control)",
        }}
        aria-label="Notifications"
      >
        <Bell size={16} style={{ color: "var(--rh-text-secondary)" }} />
        {unread > 0 ? (
          <span
            className="absolute top-1.5 right-1.5 rounded-full"
            style={{ width: 7, height: 7, background: "#F2874E" }}
          />
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 border-0 bg-transparent cursor-default"
            aria-label="Fermer"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 top-[44px] z-50 w-[320px] overflow-hidden"
            style={{
              background: "var(--rh-surface)",
              border: "1px solid var(--rh-border-strong)",
              borderRadius: 14,
            }}
          >
            <div
              className="flex items-center justify-between px-3.5 py-3"
              style={{ borderBottom: "1px solid var(--rh-border-subtle)" }}
            >
              <span className="text-[13px] font-semibold">Notifications</span>
              {unread > 0 ? (
                <button
                  type="button"
                  className="border-0 bg-transparent cursor-pointer text-[12px] font-medium"
                  style={{ color: "var(--rh-accent)" }}
                  onClick={() => void markAll()}
                >
                  Tout lu
                </button>
              ) : null}
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {items.length === 0 ? (
                <div
                  className="px-4 py-8 text-[13px] text-center"
                  style={{ color: "var(--rh-text-muted)" }}
                >
                  Rien de nouveau
                </div>
              ) : (
                items.map((n) => (
                  <a
                    key={n.id}
                    href={n.lien || "/rh/espace"}
                    className="block px-3.5 py-3 no-underline"
                    style={{
                      borderBottom: "1px solid var(--rh-border-subtle)",
                      background: n.lu
                        ? "transparent"
                        : "rgba(229,242,181,.04)",
                    }}
                    onClick={() => setOpen(false)}
                  >
                    <div
                      className="text-[13px] font-semibold"
                      style={{ color: "var(--rh-text)" }}
                    >
                      {n.titre}
                    </div>
                    <div
                      className="mt-0.5 text-[12.5px] leading-[1.4]"
                      style={{ color: "var(--rh-text-muted)" }}
                    >
                      {n.message}
                    </div>
                  </a>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
