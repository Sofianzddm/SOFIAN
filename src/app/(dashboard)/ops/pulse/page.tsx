import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { authOptions } from "@/lib/auth";
import { canViewActivityPulse } from "@/lib/user-activity-log";
import { PulseClient } from "./PulseClient";

export const dynamic = "force-dynamic";

/** Hyper secret : absent du menu, noindex, 404 pour tout le monde sauf Sofian. */
export const metadata: Metadata = {
  title: "Not Found",
  robots: { index: false, follow: false, nocache: true },
};

export default async function OpsPulsePage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!canViewActivityPulse(email)) {
    notFound();
  }

  return <PulseClient />;
}
