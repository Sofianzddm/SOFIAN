import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canViewActivityPulse } from "@/lib/user-activity-log";
import { PulseClient } from "./PulseClient";

export const dynamic = "force-dynamic";

/** Page secrète — absente du menu. 404 pour tout le monde sauf Sofian. */
export default async function OpsPulsePage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!canViewActivityPulse(email)) {
    notFound();
  }

  return <PulseClient />;
}
