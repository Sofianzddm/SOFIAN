import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isProjetsOutreachRole } from "@/lib/projets-outreach";
import { ProjetsOutreachListClient } from "./ProjetsOutreachListClient";

export default async function ProjetsOutreachPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role = (session.user as { role?: string }).role ?? "";
  if (!isProjetsOutreachRole(role)) redirect("/dashboard");

  return <ProjetsOutreachListClient />;
}
