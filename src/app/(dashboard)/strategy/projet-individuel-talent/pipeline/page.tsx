import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ProspectingPipelineClient } from "./ProspectingPipelineClient";

export default async function ProspectingPipelinePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role = (session.user as { role?: string }).role ?? "";
  if (
    ![
      "STRATEGY_PLANNER",
      "CASTING_MANAGER",
      "HEAD_OF_SALES",
      "BUSINESS_DEVELOPER",
      "HEAD_OF",
      "ADMIN",
    ].includes(role)
  ) {
    redirect("/dashboard");
  }

  return <ProspectingPipelineClient />;
}
