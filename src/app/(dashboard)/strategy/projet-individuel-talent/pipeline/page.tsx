import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ProspectingPipelineClient } from "./ProspectingPipelineClient";

export default async function ProspectingPipelinePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role = (session.user as { role?: string }).role ?? "";
  if (
    role !== "STRATEGY_PLANNER" &&
    role !== "CASTING_MANAGER" &&
    role !== "HEAD_OF_SALES" &&
    role !== "HEAD_OF" &&
    role !== "ADMIN"
  ) {
    redirect("/dashboard");
  }

  return <ProspectingPipelineClient />;
}
