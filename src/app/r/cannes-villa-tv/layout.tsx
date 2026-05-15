import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Briefing · Montée des marches (présentation)",
  description:
    "Talent briefing Glow Up — dress code, tapis rouge, communication et checklist pour la montée des marches.",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false, noarchive: true },
  },
};

export default function CannesVillaTvLayout({ children }: { children: React.ReactNode }) {
  return children;
}
