import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CastingMissionsClient } from "./CastingMissionsClient";

export default async function CastingMissionsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "CASTING_MANAGER" && role !== "ADMIN") {
    redirect("/dashboard");
  }

  return <CastingMissionsClient />;
}
