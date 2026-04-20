import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DinnerSelectionClient } from "./DinnerSelectionClient";

export default async function DinnerSelectionPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role ?? "";
  if (
    role !== "STRATEGY_PLANNER" &&
    role !== "ADMIN" &&
    role !== "HEAD_OF" &&
    role !== "HEAD_OF_SALES"
  ) {
    redirect("/dashboard");
  }

  return <DinnerSelectionClient />;
}

