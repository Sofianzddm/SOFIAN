import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canAccessBrandSimulator } from "@/lib/brand-simulator-access";
import { BrandSimulatorClient } from "./BrandSimulatorClient";

export default async function BrandSimulatorPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role = (session.user as { role?: string }).role ?? "";
  const email = session.user.email;
  if (!canAccessBrandSimulator(role, email)) {
    redirect("/dashboard");
  }

  return <BrandSimulatorClient />;
}
