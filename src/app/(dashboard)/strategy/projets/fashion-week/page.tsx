import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { FashionWeekClient } from "./fashion-week-client";
import { canAccessFashionWeek } from "@/lib/fw-access";

export default async function FashionWeekPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role ?? "";
  const email = (session.user as { email?: string }).email ?? "";
  if (!canAccessFashionWeek(role, email)) {
    redirect("/dashboard");
  }

  return <FashionWeekClient />;
}
