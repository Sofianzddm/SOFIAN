import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PatronHubApp } from "@/components/rh/tasks/PatronHubApp";

/** Hub tâches — layout dashboard, ADMIN uniquement. */
export default async function HubPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  if ((session.user as { role?: string }).role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-sm text-gray-500">
          Chargement du hub…
        </div>
      }
    >
      <PatronHubApp variant="embedded" />
    </Suspense>
  );
}
