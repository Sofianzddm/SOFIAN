import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canAccessCannesPartenaires } from "@/lib/cannes-partenaires/constants";
import { CannesCrmFicheClient } from "./CannesCrmFicheClient";

export default async function CannesCrmFichePage({
  params,
}: {
  params: Promise<{ opportuniteId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!canAccessCannesPartenaires(session.user.role)) redirect("/dashboard");

  const { opportuniteId } = await params;
  return <CannesCrmFicheClient opportuniteId={opportuniteId} />;
}
