import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { StrategyVillaCannesClient } from "./strategy-villa-cannes-client";

export default async function StrategyVillaCannesPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "STRATEGY_PLANNER" && role !== "ADMIN") {
    redirect("/dashboard");
  }

  return <StrategyVillaCannesClient />;
}
