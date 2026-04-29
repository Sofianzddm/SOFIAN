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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#E5E0D8] bg-white p-6 shadow-lg"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-[Spectral] text-2xl text-[#1A1110]">{title}</h3>
          <button onClick={onClose} className="text-sm text-[#1A1110]/60 hover:text-[#1A1110]">
            Fermer
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
