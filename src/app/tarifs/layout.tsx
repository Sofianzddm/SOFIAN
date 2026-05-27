import type { Metadata } from "next";

/**
 * Layout serveur pour /tarifs/[slug].
 *
 * Page Grille Tarifaire publique : accessible uniquement à qui possède le
 * lien, jamais indexée. Le middleware (src/middleware.ts) bloque déjà les
 * crawlers et envoie X-Robots-Tag, mais on pose en plus les meta tags HTML
 * dans le <head> au cas où un bot ignorerait les headers HTTP.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      "max-video-preview": -1,
      "max-image-preview": "none",
      "max-snippet": -1,
    },
  },
};

export default function TarifsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
