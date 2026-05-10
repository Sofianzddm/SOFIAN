import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Salon coiffeur · Cannes 2026 · Glow Up",
  description: "Agenda et gestion coiffeur — réservé aux comptes coiffeur et admin.",
};

/** Encoches Dynamic Island / barre d’accueil : `env(safe-area-inset-*)` fiable en plein écran. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function CoiffeurConsoleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
