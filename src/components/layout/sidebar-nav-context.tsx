"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type SidebarNavContextValue = {
  collapsed: boolean;
  setCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  toggleMobile: () => void;
};

const SidebarNavContext = createContext<SidebarNavContextValue | null>(null);

export function SidebarNavProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setMobileOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const toggleMobile = useCallback(() => {
    setMobileOpen((v) => !v);
  }, []);

  return (
    <SidebarNavContext.Provider
      value={{
        collapsed,
        setCollapsed,
        mobileOpen,
        setMobileOpen,
        toggleMobile,
      }}
    >
      {children}
    </SidebarNavContext.Provider>
  );
}

export function useSidebarNav() {
  const ctx = useContext(SidebarNavContext);
  if (!ctx) {
    throw new Error("useSidebarNav must be used within SidebarNavProvider");
  }
  return ctx;
}

export function useSidebarNavOptional() {
  return useContext(SidebarNavContext);
}
