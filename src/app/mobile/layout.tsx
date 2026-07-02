import type { Metadata, Viewport } from "next";

/**
 * PWA « GlowUp Dépenses » — version mobile installable (Ajouter à l'écran
 * d'accueil). Même session NextAuth que le reste de la plateforme.
 */

export const metadata: Metadata = {
  title: "GlowUp Dépenses",
  description: "Justifier les dépenses : photographiez vos reçus",
  manifest: "/mobile/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Dépenses",
  },
  icons: {
    apple: "/mobile/icon-180.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#B06F70",
};

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-slate-50">{children}</div>;
}
