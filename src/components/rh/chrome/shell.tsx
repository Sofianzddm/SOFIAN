"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { RhAvatar, RhBadge } from "@/components/rh/ui/primitives";
import { NotifBell } from "@/components/rh/chrome/NotifBell";

export type RhLang = "fr" | "en";
export type RhRole = "collab" | "manager" | "rh";

/** Conservé pour le login (FR only pour l’instant). */
export function LangSwitch({
  lang,
  onChange,
}: {
  lang: RhLang;
  onChange: (l: RhLang) => void;
}) {
  return (
    <div
      className="flex rounded-full p-[3px]"
      style={{ background: "var(--rh-surface-control)", border: "1px solid var(--rh-border-control)" }}
    >
      {(["fr", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          className="border-0 cursor-pointer rounded-full px-3 py-1 text-[12px] font-semibold uppercase"
          style={{
            background: lang === l ? "var(--rh-chip)" : "transparent",
            color: lang === l ? "var(--rh-accent)" : "var(--rh-text-muted)",
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function RoleSwitch({
  role,
  onChange,
}: {
  role: RhRole;
  onChange: (r: RhRole) => void;
}) {
  const opts: { id: RhRole; label: string; short: string }[] = [
    { id: "collab", label: "Collaborateur", short: "Collab" },
    { id: "manager", label: "Manager", short: "Mgr" },
    { id: "rh", label: "RH", short: "RH" },
  ];
  return (
    <div className="flex max-w-full shrink-0 items-center gap-1 overflow-x-auto sm:gap-2">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className="cursor-pointer whitespace-nowrap rounded-full border-0 px-2.5 py-1.5 text-[11.5px] font-medium sm:px-3 sm:text-[12px]"
          style={{
            background: role === o.id ? "var(--rh-chip)" : "transparent",
            color: role === o.id ? "var(--rh-accent)" : "var(--rh-text-muted)",
          }}
        >
          <span className="sm:hidden">{o.short}</span>
          <span className="hidden sm:inline">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

type TopBarProps = {
  badge: string;
  searchPlaceholder: string;
  banner?: { text: string; tone: "orange" | "warning" };
  showOrg?: boolean;
  showPayrollSync?: boolean;
  profile: {
    name: string;
    meta: string;
    initials: string;
    color: string;
    avatarUrl?: string | null;
  };
  lang?: RhLang;
  onLang?: (l: RhLang) => void;
  onOpenPalette: () => void;
  headerAction?: {
    label: string;
    onClick: () => void;
    variant?: "primary" | "ghost";
  };
};

export function RhTopBar({
  badge,
  searchPlaceholder,
  banner,
  profile,
  onOpenPalette,
  headerAction,
}: TopBarProps) {
  return (
    <header
      className="sticky top-0 z-20 flex items-center gap-2 px-3 sm:gap-3 sm:px-5"
      style={{
        height: 56,
        background: "rgba(12,14,18,.92)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--rh-border-subtle)",
      }}
    >
      <div className="flex min-w-0 shrink items-center gap-2 sm:gap-3">
        <img
          src="/rh/glowup-logo.svg"
          alt="Glow Up"
          className="shrink-0"
          style={{ height: 16, width: "auto", display: "block" }}
        />
        <div className="hidden min-w-0 leading-tight sm:block">
          <div className="truncate text-[13px] font-semibold" style={{ color: "var(--rh-text)" }}>
            {badge}
          </div>
          {banner ? (
            <div className="truncate text-[11.5px]" style={{ color: "var(--rh-text-muted)" }}>
              {banner.text}
            </div>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        className="mx-auto hidden max-w-[420px] flex-1 cursor-pointer items-center gap-2.5 text-left md:flex"
        style={{
          background: "var(--rh-surface-inset)",
          border: "1px solid var(--rh-border-control)",
          borderRadius: 12,
          padding: "10px 14px",
        }}
      >
        <Search size={15} style={{ color: "var(--rh-text-dim)" }} />
        <span className="flex-1 text-[13px]" style={{ color: "var(--rh-text-dim)" }}>
          {searchPlaceholder}
        </span>
        <kbd
          className="rounded-md px-1.5 py-0.5 text-[11px] font-medium"
          style={{
            color: "var(--rh-text-muted)",
            background: "var(--rh-chip)",
          }}
        >
          ⌘K
        </kbd>
      </button>

      <div className="flex-1 md:hidden" />

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2.5">
        <button
          type="button"
          onClick={onOpenPalette}
          className="grid h-9 w-9 place-items-center rounded-[11px] border-0 md:hidden"
          style={{
            background: "var(--rh-surface-control)",
            color: "var(--rh-text-secondary)",
            border: "1px solid var(--rh-border-control)",
          }}
          aria-label="Rechercher"
        >
          <Search size={15} />
        </button>
        {headerAction ? (
          <button
            type="button"
            onClick={headerAction.onClick}
            className="max-w-[42vw] shrink-0 cursor-pointer truncate rounded-[11px] border-0 px-2.5 py-2 text-[11.5px] font-semibold sm:max-w-none sm:px-3.5 sm:py-2.5 sm:text-[12.5px]"
            style={
              headerAction.variant === "ghost"
                ? {
                    background: "transparent",
                    color: "var(--rh-text-secondary)",
                    border: "1px solid var(--rh-border-control)",
                  }
                : {
                    background: "var(--rh-accent)",
                    color: "var(--rh-accent-fg)",
                  }
            }
          >
            {headerAction.label}
          </button>
        ) : null}

        <NotifBell />

        <div
          className="flex items-center gap-2.5 rounded-[12px] pl-1.5 pr-3 py-1.5"
          style={{
            background: "var(--rh-surface-control)",
            border: "1px solid var(--rh-border-control)",
          }}
        >
          <RhAvatar
            initials={profile.initials}
            color={profile.color}
            size={32}
            radius={10}
            src={profile.avatarUrl}
          />
          <div className="hidden sm:block leading-tight">
            <div className="text-[12.5px] font-semibold">{profile.name}</div>
            <div className="text-[11px]" style={{ color: "var(--rh-text-muted)" }}>
              {profile.meta}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export type RhTab = {
  id: string;
  label: string;
  count?: number;
  icon?: ReactNode;
};

export function RhTabBar({
  tabs,
  active,
  onChange,
  right,
}: {
  tabs: RhTab[];
  active: string;
  onChange: (id: string) => void;
  right?: ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const act = root.querySelector(
      `[data-tab="${active}"]`
    ) as HTMLElement | null;
    act?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [active]);

  return (
    <nav
      data-rh-tabbar
      className="sticky top-[56px] z-[19] flex items-center gap-2 px-3 sm:gap-3 sm:px-5"
      style={{
        minHeight: 52,
        background: "rgba(12,14,18,.92)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--rh-border-subtle)",
      }}
    >
      <div
        ref={listRef}
        className="flex flex-1 min-w-0 overflow-x-auto gap-1 py-2"
        style={{ scrollbarWidth: "none" }}
      >
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              data-tab={t.id}
              onClick={() => onChange(t.id)}
              className="flex items-center gap-2 border-0 cursor-pointer whitespace-nowrap"
              style={{
                padding: "9px 14px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: on ? 650 : 500,
                color: on ? "var(--rh-accent-fg)" : "var(--rh-text-secondary)",
                background: on ? "var(--rh-accent)" : "transparent",
                transition: "background .15s, color .15s",
              }}
            >
              {t.icon}
              {t.label}
              {t.count != null && t.count > 0 ? (
                <RhBadge
                  bg={on ? "rgba(10,12,15,.18)" : "#F2874E"}
                  fg={on ? "var(--rh-accent-fg)" : "#0A0C0F"}
                >
                  {t.count}
                </RhBadge>
              ) : null}
            </button>
          );
        })}
      </div>
      {right}
    </nav>
  );
}

export type PaletteItem = {
  key: string;
  label: string;
  code: string;
  active?: boolean;
};

export function CommandPalette({
  open,
  onClose,
  sections,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  sections: { title: string; items: PaletteItem[] }[];
  onSelect?: (item: PaletteItem) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-center"
      style={{
        background: "rgba(6,8,10,.72)",
        backdropFilter: "blur(6px)",
        paddingTop: "12vh",
        animation: "rh-fade .16s ease both",
      }}
      onClick={onClose}
    >
      <div
        className="rh-rise w-[min(520px,92vw)] overflow-hidden"
        style={{
          background: "var(--rh-surface)",
          border: "1px solid var(--rh-border-strong)",
          borderRadius: 18,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-3 px-4"
          style={{ borderBottom: "1px solid var(--rh-border-subtle)", height: 56 }}
        >
          <Search size={16} style={{ color: "var(--rh-text-muted)" }} />
          <input
            autoFocus
            placeholder="Où veux-tu aller ?"
            className="flex-1 border-0 bg-transparent text-[15px]"
            style={{ outline: "none" }}
          />
          <button
            type="button"
            onClick={onClose}
            className="border-0 bg-transparent cursor-pointer p-1.5 rounded-lg"
            style={{ color: "var(--rh-text-muted)" }}
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-2.5 max-h-[50vh] overflow-y-auto">
          {sections.map((sec) => (
            <div key={sec.title} className="mb-2">
              <div
                className="px-3 py-2 text-[11.5px] font-semibold"
                style={{ color: "var(--rh-text-dim)" }}
              >
                {sec.title}
              </div>
              {sec.items.map((it) => (
                <button
                  key={it.code}
                  type="button"
                  className="flex w-full items-center gap-3 border-0 cursor-pointer text-left rounded-[12px]"
                  style={{
                    padding: "12px 12px",
                    background: "transparent",
                    color: "var(--rh-text)",
                  }}
                  onClick={() => {
                    onSelect?.(it);
                    onClose();
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--rh-surface-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span
                    className="grid place-items-center text-[12px] font-bold rounded-lg"
                    style={{
                      width: 28,
                      height: 28,
                      background: "var(--rh-chip)",
                      color: "var(--rh-accent)",
                    }}
                  >
                    {it.key}
                  </span>
                  <span className="text-[14px] font-medium">{it.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
