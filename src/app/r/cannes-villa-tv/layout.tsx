import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Villa · Agenda Cannes 2026",
  description:
    "Brunchs, dîners, soirées et tout l’agenda Cannes sur deux prochains jours (Europe/Paris).",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false, noarchive: true },
  },
};

export default function CannesVillaTvLayout({ children }: { children: React.ReactNode }) {
  return children;
}
