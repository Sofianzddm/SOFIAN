import type { Metadata } from "next";

/**
 * Layout serveur pour /kit/[slug].
 *
 * Garantit que la page Kit Media n'est jamais indexée par les moteurs de
 * recherche, même si quelqu'un partage le lien public. Le middleware
 * (src/middleware.ts) bloque déjà les crawlers et envoie X-Robots-Tag,
 * mais ce metadata pose en plus les meta tags HTML dans le <head> en cas
 * de cache CDN ou de bot qui ignorerait les headers HTTP.
 *
 * Le lien reste 100 % accessible à toute personne qui le possède.
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

export default function KitLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
