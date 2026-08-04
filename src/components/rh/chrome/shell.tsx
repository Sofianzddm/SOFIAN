"use client";

import { Bell, Search, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { RhAvatar, RhBadge } from "@/components/rh/ui/primitives";

export type RhLang = "fr" | "en";
export type RhRole = "collab" | "manager" | "rh";

export function LangSwitch({
  lang,
  onChange,
}: {
  lang: RhLang;
  onChange: (l: RhLang) => void;
}) {
  return (
    <div
      className="flex rounded-[7px] p-[2px]"
      style={{ background: "#12161C", border: "1px solid #232932" }}
    >
      {(["fr", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          className="rh-mono border-0 cursor-pointer rounded-[5px] px-[9px] py-[4px] text-[10px] font-bold uppercase"
          style={{
            background: lang === l ? "#1D2530" : "transparent",
            color: lang === l ? "#E5F2B5" : "#7E8998",
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
  const opts: { id: RhRole; label: string }[] = [
    { id: "collab", label: "Collaborateur" },
    { id: "manager", label: "Manager" },
    { id: "rh", label: "RH" },
  ];
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="rh-micro" style={{ color: "#5F6978" }}>
        RÔLE
      </span>
      <div
        className="flex rounded-[7px] p-[2px]"
        style={{ background: "#12161C", border: "1px solid #232932" }}
      >
        {opts.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className="border-0 cursor-pointer rounded-[5px] px-[9px] py-[4px] text-[11.5px] font-medium"
            style={{
              background: role === o.id ? "#1D2530" : "transparent",
              color: role === o.id ? "#E5F2B5" : "#7E8998",
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type TopBarProps = {
  badge: string;
  searchPlaceholder: string;
  banner?: { text: string; tone: "orange" | "warning" };
  showOrg?: boolean;
  showPayrollSync?: boolean;
  profile: { name: string; meta: string; initials: string; color: string };
  lang: RhLang;
  onLang: (l: RhLang) => void;
  onOpenPalette: () => void;
  /** CTA bien visible (ex. bascule People / espace salarié) */
  headerAction?: {
    label: string;
    onClick: () => void;
    /** primary = lime ; ghost = discret (évite le double-clic retour) */
    variant?: "primary" | "ghost";
  };
};

export function RhTopBar({
  badge,
  searchPlaceholder,
  banner,
  showOrg,
  showPayrollSync,
  profile,
  lang,
  onLang,
  onOpenPalette,
  headerAction,
}: TopBarProps) {
  const bannerBg =
    banner?.tone === "orange"
      ? "rgba(242,135,78,.1)"
      : "rgba(240,194,78,.1)";
  const bannerFg = banner?.tone === "orange" ? "#F2874E" : "#F0C24E";
  const bannerBorder =
    banner?.tone === "orange"
      ? "rgba(242,135,78,.28)"
      : "rgba(240,194,78,.28)";

  return (
    <header
      className="sticky top-0 z-20 flex items-center gap-[13px] px-[18px]"
      style={{
        height: 54,
        background: "rgba(10,12,15,.9)",
        backdropFilter: "blur(14px)",
        borderBottom: "1px solid #1B212A",
      }}
    >
      <img
        src="/rh/glowup-logo.svg"
        alt="Glow Up"
        style={{ height: 15, width: "auto", display: "block" }}
      />
      <span
        className="rh-mono text-[9.5px] font-bold tracking-[0.1em]"
        style={{
          border: "1px solid #232932",
          borderRadius: 4,
          padding: "2px 5px",
          color: "#8B95A5",
        }}
      >
        {badge}
      </span>

      {showOrg ? (
        <button
          type="button"
          className="flex items-center gap-2 border-0 bg-transparent cursor-pointer shrink-0"
        >
          <span
            className="grid place-items-center rh-mono text-[9px] font-bold"
            style={{
              width: 16,
              height: 16,
              borderRadius: 4,
              background: "#7C8CF8",
              color: "#0A0C0F",
            }}
          >
            G
          </span>
          <span className="text-[12.5px] font-medium">Glow Up Agency</span>
          <span style={{ color: "#5F6978", fontSize: 10 }}>▾</span>
        </button>
      ) : null}

      <button
        type="button"
        onClick={onOpenPalette}
        className="flex flex-1 items-center gap-2 max-w-[360px] cursor-pointer text-left"
        style={{
          background: "#0E1116",
          border: "1px solid #232932",
          borderRadius: 8,
          padding: "7px 10px",
        }}
      >
        <Search size={12} style={{ color: "#5F6978" }} />
        <span className="flex-1 text-[12px]" style={{ color: "#5F6978" }}>
          {searchPlaceholder}
        </span>
        <span
          className="rh-mono text-[9px] font-bold"
          style={{ color: "#5F6978" }}
        >
          ⌘K
        </span>
      </button>

      {headerAction ? (
        <button
          type="button"
          onClick={headerAction.onClick}
          className="rh-mono shrink-0 border-0 cursor-pointer rounded-[8px] px-3.5 py-2 text-[11px] font-bold tracking-[0.06em]"
          style={
            headerAction.variant === "ghost"
              ? {
                  background: "transparent",
                  color: "#8B95A5",
                  border: "1px solid #232932",
                }
              : { background: "#E5F2B5", color: "#0A0C0F" }
          }
        >
          {headerAction.label}
        </button>
      ) : banner ? (
        <span
          className="rh-micro hidden lg:inline-flex"
          style={{
            background: bannerBg,
            color: bannerFg,
            border: `1px solid ${bannerBorder}`,
            borderRadius: 4,
            padding: "3px 7px",
          }}
        >
          {banner.text}
        </span>
      ) : null}

      {showPayrollSync ? (
        <span className="hidden md:inline-flex items-center gap-2 shrink-0">
          <span
            className="rh-pulse block rounded-full"
            style={{ width: 6, height: 6, background: "#46D6C0" }}
          />
          <span className="rh-mono text-[9.5px]" style={{ color: "#8B95A5" }}>
            PAIE 25/08
          </span>
        </span>
      ) : null}

      <LangSwitch lang={lang} onChange={onLang} />

      <button
        type="button"
        className="relative grid place-items-center border-0 cursor-pointer"
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: "#12161C",
          border: "1px solid #232932",
        }}
      >
        <Bell size={14} style={{ color: "#8B95A5" }} />
        <span
          className="absolute top-[5px] right-[6px] rounded-full"
          style={{ width: 6, height: 6, background: "#F2874E" }}
        />
      </button>

      <div className="flex items-center gap-2 shrink-0">
        <RhAvatar
          initials={profile.initials}
          color={profile.color}
          size={28}
        />
        <div className="hidden sm:block leading-tight">
          <div className="text-[11.5px] font-semibold">{profile.name}</div>
          <div className="rh-mono text-[9px]" style={{ color: "#7E8998" }}>
            {profile.meta}
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
  right?: React.ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const indRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = listRef.current;
    const ind = indRef.current;
    if (!root || !ind) return;
    const act = root.querySelector(
      `[data-tab="${active}"]`
    ) as HTMLElement | null;
    if (!act) return;
    ind.style.transform = `translateX(${act.offsetLeft}px)`;
    ind.style.width = `${act.offsetWidth}px`;
  }, [active, tabs]);

  return (
    <nav
      className="sticky top-[54px] z-[19] flex items-center gap-3 px-[18px]"
      style={{
        height: 42,
        background: "rgba(10,12,15,.9)",
        backdropFilter: "blur(14px)",
        borderBottom: "1px solid #1B212A",
      }}
    >
      <div
        ref={listRef}
        className="relative flex flex-1 min-w-0 overflow-x-auto gap-[2px]"
      >
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              data-tab={t.id}
              onClick={() => onChange(t.id)}
              className="flex items-center gap-1.5 border-0 cursor-pointer whitespace-nowrap"
              style={{
                padding: "7px 11px",
                borderRadius: 7,
                fontSize: 12.5,
                fontWeight: 500,
                color: on ? "#EAF0F5" : "#7E8998",
                background: on ? "rgba(229,242,181,.06)" : "transparent",
              }}
            >
              {t.label}
              {t.count != null ? (
                <RhBadge bg="#F2874E" fg="#0A0C0F">
                  {t.count}
                </RhBadge>
              ) : null}
            </button>
          );
        })}
        <div
          ref={indRef}
          className="absolute bottom-0 h-[2px] rounded-[2px] pointer-events-none"
          style={{
            background: "#E5F2B5",
            transition: "transform .28s cubic-bezier(.3,1.1,.4,1), width .28s cubic-bezier(.3,1.1,.4,1)",
            width: 0,
          }}
        />
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
}: {
  open: boolean;
  onClose: () => void;
  sections: { title: string; items: PaletteItem[] }[];
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
        background: "rgba(6,8,10,.7)",
        backdropFilter: "blur(4px)",
        paddingTop: "11vh",
        animation: "rh-fade .16s ease both",
      }}
      onClick={onClose}
    >
      <div
        className="rh-rise w-[min(640px,92vw)] overflow-hidden"
        style={{
          background: "#0E1116",
          border: "1px solid #2B333F",
          borderRadius: 14,
          boxShadow: "0 40px 90px -30px rgba(0,0,0,.9)",
          animation: "rh-rise .2s cubic-bezier(.2,.9,.3,1) both",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-2 px-4"
          style={{ borderBottom: "1px solid #1B212A", height: 52 }}
        >
          <span className="rh-mono" style={{ color: "#E5F2B5" }}>
            &gt;
          </span>
          <input
            autoFocus
            placeholder="poser 5 jours en août / qui est absent / export paie"
            className="flex-1 border-0 bg-transparent text-[14.5px]"
          />
          <RhBadge bg="#1D2530" fg="#8B95A5">
            ESC
          </RhBadge>
          <button
            type="button"
            onClick={onClose}
            className="border-0 bg-transparent cursor-pointer p-1"
            style={{ color: "#7E8998" }}
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-2 max-h-[50vh] overflow-y-auto">
          {sections.map((sec) => (
            <div key={sec.title} className="mb-2">
              <div
                className="rh-micro px-[10px] py-2"
                style={{ color: "#5F6978" }}
              >
                {sec.title}
              </div>
              {sec.items.map((it) => (
                <button
                  key={it.code}
                  type="button"
                  className="flex w-full items-center gap-3 border-0 cursor-pointer text-left rounded-[8px]"
                  style={{
                    padding: "9px 10px",
                    background: it.active
                      ? "rgba(229,242,181,.07)"
                      : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#151A21";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = it.active
                      ? "rgba(229,242,181,.07)"
                      : "transparent";
                  }}
                >
                  <span
                    className="rh-mono w-[22px] text-[10px] font-bold"
                    style={{ color: it.active ? "#E5F2B5" : "#7E8998" }}
                  >
                    {it.key}
                  </span>
                  <span className="flex-1 text-[13px]">{it.label}</span>
                  <span
                    className="rh-mono text-[10px]"
                    style={{ color: "#5F6978" }}
                  >
                    {it.code}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
