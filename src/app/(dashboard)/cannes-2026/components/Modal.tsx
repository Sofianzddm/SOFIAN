"use client";

import { useEffect, useRef } from "react";

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

export default function Modal({ open, title, onClose, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 pt-[max(12px,env(safe-area-inset-top,0px))] pb-[max(12px,env(safe-area-inset-bottom,0px))] pl-[max(12px,env(safe-area-inset-left,0px))] pr-[max(12px,env(safe-area-inset-right,0px))] sm:p-6 sm:pt-[max(1.5rem,env(safe-area-inset-top,0px))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
      onMouseDown={(e) => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="max-h-[min(90vh,calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1.5rem))] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-xl border border-[#E5E0D8] bg-white p-4 shadow-lg sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="min-w-0 flex-1 font-[Spectral] text-xl leading-snug text-[#1A1110] sm:text-2xl">{title}</h3>
          <button type="button" onClick={onClose} className="shrink-0 pt-0.5 text-sm text-[#1A1110]/60 hover:text-[#1A1110]">
            Fermer
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
