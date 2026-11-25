import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canAccessCannesPartenaires } from "@/lib/cannes-partenaires/constants";
import { CannesPartenairesClient } from "./CannesPartenairesClient";

export default async function CannesPartenairesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!canAccessCannesPartenaires(session.user.role)) redirect("/dashboard");

  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Chargement…</div>}>
      <CannesPartenairesClient />
    </Suspense>
  );
}
