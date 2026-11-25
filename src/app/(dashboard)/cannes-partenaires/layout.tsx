import type { ReactNode } from "react";

/** Pas de Full Route Cache / CDN stale sur Cannes Partenaires. */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function CannesPartenairesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
