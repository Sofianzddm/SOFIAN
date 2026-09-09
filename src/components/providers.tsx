"use client";

import { SessionProvider } from "next-auth/react";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  // Pas de refetch au focus : chaque GET /api/auth/session re-encode le JWT
  // et, en cas d’erreur, NextAuth efface le cookie → déconnexion.
  // Intervalle long : renouvelle la session sans risque à chaque changement d’onglet.
  return (
    <SessionProvider refetchInterval={24 * 60 * 60} refetchOnWindowFocus={false}>
      {children}
    </SessionProvider>
  );
}
