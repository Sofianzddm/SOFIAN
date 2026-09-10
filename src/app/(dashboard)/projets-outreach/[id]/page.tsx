import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isProjetsOutreachRole } from "@/lib/projets-outreach";
import { ProjetOutreachWorkspace } from "./ProjetOutreachWorkspace";

export default async function ProjetOutreachDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role = (session.user as { role?: string }).role ?? "";
  if (!isProjetsOutreachRole(role)) redirect("/dashboard");

  const { id } = await params;
  return <ProjetOutreachWorkspace campaignId={id} />;
}
