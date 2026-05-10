import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Coiffeur Cannes 2026 · Glow Up",
  description: "Réservation d’un créneau coiffeur (sans compte).",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false, noarchive: true },
  },
};

export default function CannesCoiffeurLayout({ children }: { children: React.ReactNode }) {
  return children;
}
