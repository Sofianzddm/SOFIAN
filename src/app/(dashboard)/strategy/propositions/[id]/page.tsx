import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ProposalBuilder } from "../../projets/_components/propositions-tab";

export default async function PropositionBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "STRATEGY_PLANNER" && role !== "ADMIN") {
    redirect("/dashboard");
  }

  const { id } = await params;
  return <ProposalBuilder proposalId={id} />;
}
