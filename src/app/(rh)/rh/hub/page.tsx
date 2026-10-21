import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/** Ancienne URL discrète → hub dans le layout ADMIN. */
export default async function RhHubRedirectPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  if ((session.user as { role?: string }).role !== "ADMIN") {
    redirect("/dashboard");
  }
  redirect("/hub");
}
