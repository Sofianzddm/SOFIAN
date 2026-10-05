import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { BrandSimulatorClient } from "./BrandSimulatorClient";

export default async function BrandSimulatorPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "ADMIN") {
    redirect("/dashboard");
  }

  return <BrandSimulatorClient />;
}
