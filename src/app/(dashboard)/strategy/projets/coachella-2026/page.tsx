import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { StrategyProjectClient } from "../_components/strategy-project-client";

export default async function StrategyCoachella2026Page() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "STRATEGY_PLANNER" && role !== "ADMIN") {
    redirect("/dashboard");
  }

  return <StrategyProjectClient projetSlug="coachella-2026" projetNom="Coachella 2026" />;
}
