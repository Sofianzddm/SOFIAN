import { Metadata } from "next";
import ActivationStatsClientPortal from "./ActivationStatsClientPortal";

export const metadata: Metadata = {
  title: "Stats activation · Glow Up Agence",
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ActivationStatsClientPortal token={token} />;
}
