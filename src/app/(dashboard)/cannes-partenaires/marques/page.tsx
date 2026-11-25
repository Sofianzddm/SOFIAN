import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canAccessCannesPartenaires } from "@/lib/cannes-partenaires/constants";
import { CannesBrandsClient } from "./CannesBrandsClient";

export default async function CannesMarquesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!canAccessCannesPartenaires(session.user.role)) redirect("/dashboard");

  return <CannesBrandsClient />;
}
