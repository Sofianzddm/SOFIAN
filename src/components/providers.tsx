"use client";

import { SessionProvider } from "next-auth/react";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  // refetchInterval : garde la session vivante (déclenche le renouvellement JWT via updateAge)
  return (
    <SessionProvider refetchInterval={60 * 60} refetchOnWindowFocus>
      {children}
    </SessionProvider>
  );
}
