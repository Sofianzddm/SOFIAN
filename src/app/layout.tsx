import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Glow Up Agence - Plateforme de Gestion",
  description: "Plateforme de gestion interne Glow Up Agence",
  icons: {
    icon: "/favicon.ico",
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    noarchive: true,
    nosnippet: true,
    noimageindex: true,
    googleBot: {
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
      noimageindex: true,
      "max-video-preview": -1,
      "max-image-preview": "none",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}