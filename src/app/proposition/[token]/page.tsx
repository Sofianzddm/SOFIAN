import type { Metadata } from "next";
import { ProposalDeck } from "./proposal-deck";

export const metadata: Metadata = {
  title: "Proposition de partenariat — Glow Up",
  robots: { index: false, follow: false },
};

export default async function PropositionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ProposalDeck token={token} />;
}
